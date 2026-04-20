import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Lead } from "../types.js";

const DB_PATH = process.env.DB_PATH ?? "./data/leads.json";

type Store = {
  leads: (Lead & { created_at: string })[];
  rejected_leads: { tiktok_handle: string; reason: string; score: number | null; rejected_at: string }[];
  dm_drafts: {
    id: number;
    tiktok_handle: string;
    message_1: string;
    message_2: string;
    hook_reference: string;
    status: "needs_approval" | "approved" | "sent";
    created_at: string;
  }[];
  runs: { id: number; agent: string; summary: unknown; started_at: string }[];
};

const EMPTY: Store = { leads: [], rejected_leads: [], dm_drafts: [], runs: [] };

let _store: Store | null = null;

function load(): Store {
  if (_store) return _store;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  if (!existsSync(DB_PATH)) {
    _store = structuredClone(EMPTY);
    flush();
    return _store;
  }
  const raw = readFileSync(DB_PATH, "utf8");
  _store = { ...EMPTY, ...JSON.parse(raw) };
  return _store!;
}

function flush(): void {
  if (!_store) return;
  writeFileSync(DB_PATH, JSON.stringify(_store, null, 2));
}

export function initSchema(): void {
  load();
  flush();
  console.log(`[db] store ready at ${DB_PATH}`);
}

export function getDb() {
  return load();
}

export function saveLead(lead: Lead): { inserted: boolean } {
  const s = load();
  if (s.leads.some((l) => l.tiktok_handle === lead.tiktok_handle)) {
    return { inserted: false };
  }
  s.leads.push({ ...lead, created_at: new Date().toISOString() });
  flush();
  return { inserted: true };
}

export function rejectLead(handle: string, reason: string, score: number | null): void {
  const s = load();
  const existing = s.rejected_leads.findIndex((r) => r.tiktok_handle === handle);
  const entry = {
    tiktok_handle: handle,
    reason,
    score,
    rejected_at: new Date().toISOString(),
  };
  if (existing >= 0) s.rejected_leads[existing] = entry;
  else s.rejected_leads.push(entry);
  flush();
}

export function logRun(agent: string, summary: object): void {
  const s = load();
  s.runs.push({
    id: s.runs.length + 1,
    agent,
    summary,
    started_at: new Date().toISOString(),
  });
  flush();
}

export function countLeads(filter?: (l: Lead) => boolean): number {
  const s = load();
  return filter ? s.leads.filter(filter).length : s.leads.length;
}

// CLI entry: `npm run db:init`
if (process.argv.includes("--init")) {
  initSchema();
}
