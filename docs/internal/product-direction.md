
## What Coalesce is

Self-healing support infrastructure for B2A (Business-to-Agent) companies. When an agent hits an API error, the error response includes a support URL. The agent calls it. Coalesce resolves the issue using the API company's documentation and multi-turn conversation. The agent self-heals and continues.

## The moat thesis

The support endpoint is the data collection mechanism, not the product. The real value emerges from:
1. Observing how agents fail at APIs (agent cognition patterns)
2. What fixes work (resolution patterns)
3. What this reveals about the API itself (product insights)

This is "Agent-Led Growth" — helping B2A companies optimize their APIs for agent success.

## Competitive positioning

- **Plain.com:** Serves humans who manage agents. Coalesce serves agents directly. Different buyer.
- **Pylon:** B2B human support. No agent-native features.
- **Kapa.ai/Inkeep:** Developer docs search. Human-facing widgets.
- Nobody does inline, structured, real-time agent error resolution.

## Key decisions made

- Organizations (not tenants, not orgs/pods) — matches Clerk naming
- Postgres for everything (Neon) — no S3, no caching, no usage tracking for now
- Resource-oriented code design (domain/, repositories/, services/, routes/)
- Support URL with `support_hint` field gets agents to actually use it
- Signed URLs for zero-friction auth (agent doesn't need a separate API key)
- AgentMail is first customer, deployed on Railway
- Stress test: 2,601 calls, 928 resolved, 462 self-heals over 3 hours

## What's NOT being built (yet)

- Pods (add when a customer needs multiple products)
- S3 storage, caching, usage tracking
- URL crawler, Notion/GitHub integrations
- Analytics dashboard
- Billing

## The assignment

Talk to 10 B2A companies. Get 3-5 using Coalesce by end of April. Apply to YC May deadline if validated.

**How to apply:** When making architecture decisions, optimize for speed to customer adoption over technical completeness. The product is done enough to sell.
