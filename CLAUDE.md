# CLAUDE.md

This file provides guidance to Claude Code when working with the Coalesce Hono API server.

## Commands

```bash
npm run dev          # Start dev server with tsx (localhost:3000)
npm run build        # Compile to dist/ with tsup
npm run start        # Run compiled dist/index.js
npm run typecheck    # tsc --noEmit (no build artifacts)
npm run test         # vitest run --reporter=verbose
```

## Architecture

**Stack:** Hono HTTP framework, TypeScript (strict), ESM modules, Zod validation, Anthropic SDK, vitest.

**Module format:** ESM (`"type": "module"`). All imports must use `.js` extension (TypeScript resolves to `.ts`, Node resolves to `.js`).

**Entry point:** `src/index.ts` — imports dotenv, creates Hono app, wires routes, starts `@hono/node-server`.

## Project Structure

```
src/
  index.ts              # Server entrypoint, global error handler
  routes/
    health.ts           # GET /health — returns { status: "ok", uptime: N }
    support.ts          # POST /support — Zod validation, calls diagnosis engine
  services/
    docs-loader.ts      # Load + strip MDX + OpenAPI at startup (Plan 02)
    diagnosis.ts        # Claude API call with structured output (Plan 03)
  schemas/
    request.ts          # SupportRequestSchema (Zod)
    response.ts         # DiagnosisResponseSchema, ErrorResponseSchema (Zod)
  types/
    index.ts            # Re-exports inferred types
tests/
  health.test.ts        # GET /health tests
  support.test.ts       # POST /support tests
  schemas.test.ts       # Schema unit tests
```

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude calls
- `PORT` — Server port (default: 3000)

Optional (Plan 02):
- `DOCS_DIR` — Path to AgentMail MDX docs directory
- `OPENAPI_PATH` — Path to AgentMail OpenAPI JSON spec

## Key Conventions

- Use `.js` extension in all imports (ESM TypeScript standard)
- Zod schemas live in `src/schemas/` — never inline in route handlers
- All API errors return `{ error: string, code: string }` JSON (never HTML)
- The global `app.onError()` in `src/index.ts` catches all unhandled errors
- Tests use Hono's `app.request()` for in-process testing — no real HTTP server started
- `SupportRequestSchema.safeParse()` is used explicitly in route handlers (not middleware magic)

## Response Format

All `/support` responses use a discriminated union on `status`:
- `resolved` — includes `diagnosis`, `fix`, `references[]`
- `needs_info` — includes `question`
- `unknown` — includes `explanation`
- `error` — includes `message`, `code`

Error responses (4xx/5xx) always use: `{ error: string, code: string }`
