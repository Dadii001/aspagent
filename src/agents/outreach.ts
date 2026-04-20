import "dotenv/config";
import { initSchema, countLeads } from "../tools/db.js";

// Stub: full implementation comes after Prospector ships real leads.
// Plan:
//   1. Read leads where dm_status='pending' AND score>=60
//   2. For each, fetch the lead's latest post via TikTok tool
//   3. Agent loop with prompts/outreach.md + tools:
//        - get_post_details(handle) -> string
//        - save_draft({message_1, message_2, hook_reference})
//        - skip_lead({handle, reason})
//   4. On save_draft: push to dm_drafts, flip lead.dm_status='drafted'

function main() {
  initSchema();
  const pending = countLeads((l) => l.dm_status === "pending");
  console.log(`[outreach] pending leads: ${pending}`);
  console.log("[outreach] agent not wired yet — run prospector first, then I'll build this.");
}

main();
