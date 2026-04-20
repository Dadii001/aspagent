import "dotenv/config";
import { initSchema, countLeads } from "../tools/db.js";

// Stub: full implementation comes once Outreach is shipping DMs.
// Plan:
//   1. Pull funnel counts for last 24h and 7d rolling average:
//        scraped | qualified | dm_drafted | dm_sent | replied | clicked | checkout_started | paid
//   2. Compute rates + deltas vs 7d avg.
//   3. Agent loop with prompts/operator.md + tools:
//        - query_funnel({window}) -> counts
//        - query_dm_variants() -> top-3 by reply rate
//        - send_telegram({text})   (post-MVP)
//   4. Output report to stdout, log to runs, later: post to Telegram.

function main() {
  initSchema();
  const snapshot = {
    total_leads: countLeads(),
    drafted: countLeads((l) => l.dm_status === "drafted"),
    sent: countLeads((l) => l.dm_status === "sent"),
    replied: countLeads((l) => l.dm_status === "replied"),
  };
  console.log("[operator] funnel snapshot:", snapshot);
  console.log("[operator] report agent not wired yet — ship outreach first.");
}

main();
