import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { searchArtists } from "../tools/tiktok.js";
import { initSchema, saveLead, rejectLead, logRun, countLeads } from "../tools/db.js";

const MODEL = "claude-sonnet-4-6";
const SYSTEM_PROMPT = readFileSync(
  new URL("../prompts/prospector.md", import.meta.url),
  "utf8",
);

const tools: Anthropic.Tool[] = [
  {
    name: "save_lead",
    description: "Save a qualified lead to the leads table.",
    input_schema: {
      type: "object",
      properties: {
        tiktok_handle: { type: "string" },
        display_name: { type: "string" },
        followers: { type: "integer" },
        latest_track: { type: "string" },
        latest_track_url: { type: "string" },
        latest_post_at: { type: "string", description: "ISO date string" },
        score: { type: "integer", minimum: 0, maximum: 100 },
        score_breakdown: { type: "string" },
        genre_hint: { type: "string" },
        needs_review: { type: "boolean" },
      },
      required: [
        "tiktok_handle",
        "display_name",
        "followers",
        "score",
        "score_breakdown",
        "needs_review",
      ],
    },
  },
  {
    name: "reject_lead",
    description: "Record a lead that did not qualify.",
    input_schema: {
      type: "object",
      properties: {
        tiktok_handle: { type: "string" },
        reason: { type: "string" },
        score: { type: "integer" },
      },
      required: ["tiktok_handle", "reason"],
    },
  },
  {
    name: "finish_run",
    description: "Call exactly once when all accounts have been processed.",
    input_schema: {
      type: "object",
      properties: {
        scraped: { type: "integer" },
        qualified: { type: "integer" },
        rejected: { type: "integer" },
        flagged_for_review: { type: "integer" },
      },
      required: ["scraped", "qualified", "rejected", "flagged_for_review"],
    },
  },
];

type ToolHandler = (input: any) => string;

const handlers: Record<string, ToolHandler> = {
  save_lead: (input) => {
    const { inserted } = saveLead({
      tiktok_handle: input.tiktok_handle,
      display_name: input.display_name,
      followers: input.followers,
      latest_track: input.latest_track ?? null,
      latest_track_url: input.latest_track_url ?? null,
      latest_post_at: input.latest_post_at ?? null,
      score: input.score,
      score_breakdown: input.score_breakdown,
      genre_hint: input.genre_hint ?? null,
      needs_review: !!input.needs_review,
      dm_status: "pending",
    });
    return JSON.stringify({ ok: true, inserted });
  },
  reject_lead: (input) => {
    rejectLead(input.tiktok_handle, input.reason, input.score ?? null);
    return JSON.stringify({ ok: true });
  },
  finish_run: (input) => {
    logRun("prospector", input);
    return JSON.stringify({ ok: true });
  },
};

async function runProspector() {
  initSchema();

  const accounts = await searchArtists({
    query: "original music new single",
    maxResults: 30,
  });
  console.log(`[prospector] fetched ${accounts.length} accounts`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userMessage = `Here are ${accounts.length} TikTok accounts to evaluate. Score each one, save qualifying leads with save_lead, reject the rest with reject_lead, and call finish_run when done.\n\n${JSON.stringify(accounts, null, 2)}`;

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  let done = false;
  let loops = 0;
  const MAX_LOOPS = 20;

  while (!done && loops < MAX_LOOPS) {
    loops++;
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      console.log("[prospector] no more tool calls — stopping");
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      const handler = handlers[tu.name];
      const output = handler
        ? handler(tu.input)
        : JSON.stringify({ error: `unknown tool ${tu.name}` });
      if (tu.name === "finish_run") done = true;
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: output,
      };
    });

    messages = [
      ...messages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];

    if (response.stop_reason === "end_turn" && !done) break;
  }

  console.log(`[prospector] done in ${loops} loops. leads in DB: ${countLeads()}`);
}

runProspector().catch((err) => {
  console.error("[prospector] fatal:", err);
  process.exit(1);
});
