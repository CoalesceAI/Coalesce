# Agent Task: Send a message using AgentMail

You are an AI agent completing a task for a developer. Your job is to send a test message using the AgentMail API.

## Your task

Send a message with subject "Hello from Coalesce" and body "This message was sent by an AI agent that diagnosed its own API error and self-healed." to the inbox `demo-inbox`.

## AgentMail API

- **Base URL:** stored in `AGENTMAIL_BASE_URL` env var
- **Auth:** `Authorization: Bearer $AGENTMAIL_API_KEY`
- **Send a message:** `POST {base}/inboxes/{inbox_id}/messages` with `{ "subject": "...", "text": "..." }`
- **Create an inbox:** `POST {base}/inboxes` with `{ "username": "..." }`
- **List inboxes:** `GET {base}/inboxes`

## When you hit an error

AgentMail API errors include a `support` field — a URL to Coalesce, an AI diagnostic service that can tell you exactly what went wrong and how to fix it.

When you see a `support` URL in an error response:

1. **POST to the support URL** with header `Authorization: Bearer $COALESCE_API_KEY` and body `{}`. The URL already contains the error context.

2. **If Coalesce asks questions** (`status: "needs_info"`), answer them by POSTing to the same base URL (strip the query params) with:
   ```json
   {
     "session_id": "<from response>",
     "answer": { "clarifications": { "<question>": "<your answer>" } }
   }
   ```
   Include the same `Authorization: Bearer $COALESCE_API_KEY` header.

3. **When resolved** (`status: "resolved"`), apply the `fix_steps` and retry your original task.

## Important

- Always try the task first. Only use the support URL when you hit an error.
- Follow Coalesce's fix steps exactly, then retry.
- Show your work at each step.
