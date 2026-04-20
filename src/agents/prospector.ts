import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { gatherCreatorsFromHashtag, hasRealCredentials } from "../tools/tiktok.js";
import { initSchema, saveLead, rejectLead, logRun, countLeads, getDb } from "../tools/db.js";
import type { TikTokCreator } from "../types.js";

const MODEL = "claude-sonnet-4-6";
const SYSTEM_PROMPT = readFileSync(
  new URL("../prompts/prospector.md", import.meta.url),
  "utf8",
);

const DEFAULT_HASHTAGS = ["newmusic", "newartist", "indieartist", "newsong", "unsignedartist"];
const HOURS_AGO = Number(process.env.PROSPECTOR_HOURS_AGO ?? 72);
const MAX_PAGES = Number(process.env.PROSPECTOR_MAX_PAGES ?? 20);

const tools: Anthropic.Tool[] = [
  {
    name: "save_lead",
    description: "Save a qualified lead to the leads table. Score must be >=50.",
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
      required: ["tiktok_handle", "display_name", "followers", "score", "score_breakdown", "needs_review"],
    },
  },
  {
    name: "reject_lead",
    description: "Record a lead that did not qualify (score <50 or failed rules).",
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
    description: "Call exactly once when all candidates have been processed.",
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

// Strip bulky fields and pre-existing handles before handing to the model.
function toCandidate(c: TikTokCreator) {
  const topPost = c.videos.sort((a, b) => b.create_time - a.create_time)[0];
  return {
    username: c.username,
    nickname: c.nickname,
    verified: c.verified,
    follower_count: c.follower_count,
    following_count: c.following_count,
    total_likes_account: c.heart_count,
    total_videos_account: c.total_videos,
    videos_in_window: c.video_count_in_window,
    total_plays_in_window: c.total_plays_in_window,
    total_likes_in_window: c.total_likes_in_window,
    engagement_rate_window:
      c.total_plays_in_window > 0
        ? +(c.total_likes_in_window / c.total_plays_in_window).toFixed(4)
        : 0,
    latest_post: topPost
      ? {
          url: `https://www.tiktok.com/@${c.username}/video/${topPost.video_id}`,
          caption: topPost.title,
          posted_at: topPost.create_date,
          plays: topPost.play_count,
          likes: topPost.like_count,
          duration_sec: topPost.duration,
        }
      : null,
  };
}

function existingHandles(): Set<string> {
  const s = getDb();
  return new Set([
    ...s.leads.map((l) => l.tiktok_handle),
    ...s.rejected_leads.map((r) => r.tiktok_handle),
  ]);
}

async function runProspector() {
  if (!hasRealCredentials()) {
    console.error("Missing RAPIDAPI_KEY in .env — aborting.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY in .env — aborting.");
    process.exit(1);
  }

  initSchema();

  const hashtagsArg = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const hashtags = hashtagsArg.length > 0 ? hashtagsArg : DEFAULT_HASHTAGS;
  console.log(`[prospector] hashtags: ${hashtags.join(", ")}`);
  console.log(`[prospector] window: ${HOURS_AGO}h, max pages/hashtag: ${MAX_PAGES}`);

  const seen = existingHandles();
  const dedup = new Map<string, TikTokCreator>();

  for (const tag of hashtags) {
    const creators = await gatherCreatorsFromHashtag({
      hashtag: tag,
      hoursAgo: HOURS_AGO,
      maxPages: MAX_PAGES,
      onProgress: (m) => console.log(`  [${tag}] ${m}`),
    });
    for (const c of creators) {
      if (seen.has(c.username)) continue;
      const prev = dedup.get(c.username);
      if (!prev || c.video_count_in_window > prev.video_count_in_window) {
        dedup.set(c.username, c);
      }
    }
  }

  // Prefilter: drop obvious non-fits before spending tokens.
  const candidates = Array.from(dedup.values()).filter((c) => {
    if (c.follower_count < 1_000 || c.follower_count > 500_000) return false;
    if (c.videos.length === 0) return false;
    return true;
  });

  console.log(`[prospector] ${dedup.size} unique new creators, ${candidates.length} pass prefilter`);

  if (candidates.length === 0) {
    console.log("[prospector] nothing to score — done.");
    logRun("prospector", { scraped: 0, qualified: 0, rejected: 0, flagged_for_review: 0 });
    return;
  }

  const BATCH_SIZE = Number(process.env.PROSPECTOR_BATCH_SIZE ?? 25);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let totalSaved = 0;
  let totalRejected = 0;

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE).map(toCandidate);
    console.log(
      `\n[prospector] batch ${Math.floor(start / BATCH_SIZE) + 1}/${Math.ceil(candidates.length / BATCH_SIZE)} — ${batch.length} candidates`,
    );

    const userMessage = `Score these ${batch.length} TikTok creators. Save qualifying (score >= 50) with save_lead, reject the rest with reject_lead, and call finish_run when done.\n\n${JSON.stringify(batch, null, 2)}`;

    let messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    let done = false;
    let loops = 0;
    const MAX_LOOPS = 20;

    while (!done && loops < MAX_LOOPS) {
      loops++;
      process.stdout.write(`  loop ${loops} → Claude... `);
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          tools,
          messages,
        });
      } catch (err) {
        console.error(`\n[prospector] Claude error on loop ${loops}:`, (err as Error).message);
        throw err;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      console.log(`${toolUses.length} tool calls, stop=${response.stop_reason}`);

      if (toolUses.length === 0) {
        console.log("  no more tool calls — ending batch");
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
        const handler = handlers[tu.name];
        const output = handler ? handler(tu.input) : JSON.stringify({ error: `unknown tool ${tu.name}` });
        const inp = tu.input as any;
        if (tu.name === "save_lead") {
          totalSaved++;
          console.log(`    ✅ save_lead @${inp.tiktok_handle} score=${inp.score}${inp.needs_review ? " [REVIEW]" : ""}`);
        } else if (tu.name === "reject_lead") {
          totalRejected++;
          console.log(`    ❌ reject @${inp.tiktok_handle} (${inp.reason})`);
        } else if (tu.name === "finish_run") {
          console.log(`    🏁 finish_run`, inp);
          done = true;
        }
        return { type: "tool_result", tool_use_id: tu.id, content: output };
      });

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ];

      if (response.stop_reason === "end_turn" && !done) break;
    }
  }

  console.log(`\n[prospector] done. saved=${totalSaved} rejected=${totalRejected} total leads in DB: ${countLeads()}`);
}

runProspector().catch((err) => {
  console.error("[prospector] fatal:", err);
  process.exit(1);
});
