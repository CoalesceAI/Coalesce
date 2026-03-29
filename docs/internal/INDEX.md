# docs/internal — Context Index

Strategic and product context for Apoyo. Read these when you need the "why" behind decisions — CLAUDE.md covers commands and conventions, these docs cover product thinking and history.

**Update rule:** When you edit a doc here, update the corresponding bullets in CLAUDE.md's "## Context Docs" section.

## Documents


| Doc                                                        | Purpose                                                                                                                | When to Read                                                                     | Status                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [product-direction.md](product-direction.md)               | Moat thesis, competitive positioning, key decisions log, what's NOT being built                                        | Anytime you're making an architecture or priority decision                       | Current                                                                      |
| [apoyo-clarity.md](apoyo-clarity.md)                 | Full product clarity: what Apoyo is, three-act vision, agent behavior patterns, timing thesis, next steps           | When you need the full picture of where this is going                            | Current — supersedes v2-architecture.md                                      |
| [agent-behavior-findings.md](agent-behavior-findings.md)   | Blind test results: agents ignore support URLs, what works (support_hint), what blocked it (auth), signed URL solution | When building anything agent-facing or related to support URL discovery          | Current                                                                      |
| [apoyo-prd.md](apoyo-prd.md)                         | Full PRD: problem statement, demand evidence, market signal, what validated, what's next                               | Investor conversations, scope decisions, "does this feature fit?"                | Current                                                                      |
| [apoyo-demo-strategy.md](apoyo-demo-strategy.md)     | Demo strategy for Afore VCs and AgentMail cofounder: structural argument, video structure, cold email template         | Building demos, preparing investor pitches, converting the AgentMail cofounder   | Current                                                                      |
| [apoyo-v2-architecture.md](apoyo-v2-architecture.md) | Architecture simplification: what was removed and why (no caching, no S3, no pods, no usage tracking)                  | When someone proposes adding complexity — use this to explain why we stripped it | Reference — superseded by apoyo-clarity.md, kept for "rejected" rationale |


## Key Decisions (quick lookup)

- **No caching:** Data is <200KB, query is fast, complexity not worth it at current scale
- **No S3:** Docs live in Postgres (Neon). No processing pipeline.
- **No pods:** One org = one set of docs. No customer has asked for separation.
- **No usage tracking:** Add back when billing matters.
- **Organizations not tenants:** Matches Clerk naming, cleaner convention.
- **Signed URLs for auth:** Agents can't manage a separate API key — embed token in the URL itself.
- **support_hint required:** Without `support_hint` in error responses, agents treat the support URL as metadata for humans, not a callable endpoint.

