# Product Requirements Document
<!-- Load this file when refining product direction, roadmap, or feature strategy. -->
<!-- Load the relevant docs/plans/*.md file when executing implementation work. -->

## Vision

**Product name:** Coalesce AI

**One-liner:** The customer support platform where agents are the customer, not the human.

We flip the Pylon/Plain model: agents are the primary customer, humans are the escalation layer. The platform ingests structured error reports from agent systems, triages them autonomously, resolves them through configurable workflows, and feeds structured outcomes back to the requesting agent.

The long-term defensible position is the **Resolution Knowledge Graph** — a cross-vendor dataset of `{issue_context, resolution_action, outcome, vendor, timestamp}` tuples that no single vendor or agent can replicate independently.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| Customer Agent | An AI agent that encounters a problem and needs resolution. The primary "customer" of this platform. |
| Vendor | The API company (Stripe, Twilio, etc.) whose product the agent is using. |
| Ticket | A structured support request with machine-readable context. |
| Resolution | A machine-readable action that closes the ticket. |
| Resolution Tuple | `{issue_context, resolution_action, outcome, vendor, timestamp}` — atomic unit of the Knowledge Graph. |

---

## Differentiation

| Capability | Pylon / Plain | Us |
|-----------|--------------|-----|
| Primary customer | Human | Agent |
| Issue format | Unstructured text | Structured `{endpoint, request, response, error}` |
| Resolution format | Human-language reply | Machine-readable action |
| Cross-vendor intelligence | Single-company silo | Resolution Knowledge Graph |
| Vendor marketplace | None | Vendors register support agents + knowledge |
| Predictive resolution | None | Pattern detection from aggregated data |
| A2A native | None | Built on Google A2A protocol |

---

## A2A Design Principles
> **Last updated:** 2026-03-01 — Added after recognizing the current Slack-first design partially contradicts the agent-native thesis.

The move toward agent-as-customer changes the fundamental contract of support:

1. **Agents don't tolerate ambiguity.** Every resolution must be machine-readable and actionable. "Try logging in again" is not a resolution. `{ action: "retry", delay_ms: 5000, endpoint: "/v1/charges" }` is.

2. **Structured input should bypass LLM triage.** When an agent sends `{ category: "ses_suppression", email: "..." }`, LLM classification is waste. Reserve LLM triage for unstructured or novel inputs. Design the SDK to encourage structured payloads.

3. **Idempotency is not optional.** Agents retry aggressively. Every ticket creation path must accept and honor idempotency keys. Duplicate tickets are not a UX bug — they are a correctness bug that breaks the Knowledge Graph.

4. **The Slack channel is a human interface, not an agent interface.** Slack as an input channel is appropriate for human operators interacting with the platform, and as an MVP convenience for dogfooding. It should not be the primary channel for production agent traffic. The SDK + A2A protocol are the agent-native channels.

5. **Resolution feedback closes the loop.** After a resolution is sent, the platform doesn't know if it worked. Agents should report outcomes back (`POST /api/tickets/{id}/feedback`). This feedback data is what makes the Knowledge Graph valuable and what enables predictive resolution.

6. **SLA is a machine contract.** Agents need a deterministic answer to "when will this be resolved?" The platform should commit to SLA windows and notify proactively if a ticket will breach — not as a human notification but as a machine-readable webhook.

7. **A2A protocol is the endgame architecture.** Google's A2A protocol defines Agent Cards (`.well-known/agent.json`), task lifecycle (submitted → working → completed/failed), and structured message passing. The platform should itself be an A2A agent: publish an Agent Card, implement the task lifecycle, and allow vendor support agents to register as A2A endpoints. Phase 3 is not a feature addition — it's a refactor of the core interaction model.

---

## Roadmap

### MVP — Month 1-2 (Two Workflows)
**Goal:** Prove the core loop end-to-end. Platform triage is the bottleneck to optimize.

**Abhinit — Core Platform (Plan: `docs/plans/2026-03-01-mvp-core-platform.md`)**
- Workflow 1: Slack @mention → LLM triage → Fern docs update → thread reply
- Ticket data model, API routes, operator dashboard (tickets list + detail + analytics)

**Tanishq — SDK + SES (Plan: `docs/plans/2026-03-01-mvp-sdk-ses-workflow.md`)**
- TypeScript SDK with `capture()`, batching, retry, idempotency keys
- Event ingestion pipeline (`POST /api/events/ingest`, API key auth)
- Workflow 2: SDK event → SES suppression removal → webhook callback

**Shared decisions (finalized):**
- Schema: `Ticket`, `Event`, `Resolution` models. `Workflow` model deferred (YAGNI).
- New fields added vs. original spec: `idempotencyKey` on Ticket, `webhookUrl` on Ticket, `slackWorkspaceId` on Team.
- Migration name: `add_ticket_event_resolution_workflow`

---

### Phase 2 — Month 3-4 (Platform Expansion)
- Omnichannel: email ingestion, chat widget, Discord/X monitoring
- Vendor knowledge integration: doc crawling, RAG-powered triage
- Configurable workflow builder (JSON-based, no UI yet)
- SLA management with machine-readable breach notifications
- Human escalation queue with full structured context
- `POST /api/tickets/{id}/feedback` — agent outcome reporting (feeds Knowledge Graph)
- Linear/Jira output for bug escalations

---

### Phase 3 — Month 5+ (A2A + Marketplace)
- Publish Agent Card at `.well-known/agent.json`
- Implement A2A task lifecycle (submitted → working → completed/failed)
- Vendor marketplace: vendors register support agents + knowledge bases
- Resolution Knowledge Graph: cross-vendor pattern detection, resolution caching
- Predictive alerts: detect emerging outages from error pattern spikes
- Agent reputation scoring, bad actor detection
- Billing: per-resolution pricing engine

---

## Open Decisions

| # | Question | Status |
|---|----------|--------|
| 1 | Product name | Decided — **Coalesce AI** |
| 2 | Primary A2A protocol version to target (Google A2A v0.2?) | Open |
| 3 | LLM model for triage — cost vs. accuracy tradeoff at scale | Open — using claude-sonnet-4-6 for MVP |
| 4 | SDK language priority: TypeScript only, or Python in parallel? | Open — TypeScript first |
| 5 | Resolution feedback mechanism — polling vs. webhook vs. A2A response | Open — webhook in MVP |
| 6 | Fern vs. Mintlify for docs integration | Decided — Fern for dogfooding in MVP |
| 7 | Multi-tenant Slack routing — workspace ID config vs. OAuth flow | Decided — env var for MVP, OAuth in Phase 2 |

---

## Success Metrics

| Metric | MVP Target | Phase 2 |
|--------|-----------|---------|
| Ticket auto-classification accuracy | 80% | 90% |
| Workflow 1 autonomous resolution rate | 60% | 80% |
| Workflow 2 autonomous resolution rate | 90% | 95% |
| Mean time to resolution (autonomous) | < 5 min | < 1 min |
| SDK event ingest latency (p99) | < 500ms | < 200ms |
| Duplicate ticket rate (idempotency failures) | 0% | 0% |

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-03-01 | Initial PRD created from product brief | Claude |
| 2026-03-01 | Product renamed from Perception to **Coalesce AI** | Abhinit |
| 2026-03-01 | A2A design principles added; Slack repositioned as human channel not agent channel | Claude |
| 2026-03-01 | Schema finalized: removed Workflow model, added idempotencyKey + webhookUrl + slackWorkspaceId | Claude |
