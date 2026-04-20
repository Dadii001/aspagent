# aisongpromo-agents

Three AI agents that drive sales to [aisongpromo.com](https://aisongpromo.com) via TikTok.

```
Prospector  →  Outreach Writer  →  Funnel Operator
  (finds)         (drafts DMs)       (reports $)
```

## Stack

- **Brain:** Claude (Anthropic SDK, Sonnet 4.6)
- **Storage:** SQLite (local, zero-config)
- **Scheduling:** manual for v0, n8n later
- **Source:** TikTok Official API (key plugged in via `.env`)

## Setup

```bash
npm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY and TIKTOK_API_KEY
npm run db:init
```

## Run each agent

```bash
npm run prospector   # scrape + score TikTok artists → leads table
npm run outreach     # draft DMs for new leads → drafts column
npm run operator     # daily funnel report (Telegram later)
```

## Agent roles

| Agent | Job | Status |
|---|---|---|
| 🔍 Prospector | Finds 30 qualified TikTok artist leads/day | MVP |
| 💬 Outreach | Drafts peer-to-peer DMs referencing their track | stub |
| 📊 Operator | Daily funnel report: leads → clicks → sales | stub |

See `src/prompts/*.md` for each agent's identity, mission, and rules.

## Key constraints

- **No auto-DM sending.** TikTok has no official DM API. Agent drafts → human sends.
- **Never promise chart placement.** Agent rules block this.
- **Leads >500k followers** get flagged for manual review (likely have management).

## Roadmap

1. v0 — Prospector works with real TikTok key + writes to SQLite ← you are here
2. v1 — Outreach writer drafts DMs; review queue in CLI
3. v2 — Operator daily report via Telegram
4. v3 — n8n scheduling + Stripe/analytics integration
