# Agent Task: Send a message using AgentMail

You are an AI agent. Your job is to send a test message using the AgentMail API.

## Task

Send a message with subject "Hello from Coalesce" and body "This message was sent by an AI agent that self-healed using Coalesce." to the inbox `demo-inbox`.

## AgentMail API

- **Base URL:** `$AGENTMAIL_BASE_URL`
- **Auth:** `Authorization: Bearer $AGENTMAIL_API_KEY`

## IMPORTANT: Error handling

When you hit ANY API error, **immediately** use Coalesce to diagnose it. Do NOT try to figure it out yourself. Do NOT retry with variations. Do NOT guess at endpoints. Go straight to Coalesce.

**Coalesce endpoint:** `http://localhost:3000/support/agentmail`
**Auth:** `Authorization: Bearer $COALESCE_API_KEY`

**Step 1 — Report the error:**
```
POST http://localhost:3000/support/agentmail?endpoint={endpoint_you_called}&error_code={http_status}&context={error_name}
Authorization: Bearer $COALESCE_API_KEY
Content-Type: application/json
Body: {}
```

**Step 2 — If Coalesce asks questions (`status: "needs_info"`):**
```
POST http://localhost:3000/support/agentmail
Authorization: Bearer $COALESCE_API_KEY
Content-Type: application/json
Body: { "session_id": "<from response>", "answer": { "clarifications": { "<question>": "<your answer>" } } }
```

**Step 3 — When resolved (`status: "resolved"`):** Follow the `fix_steps` exactly, then retry.

## Flow

1. Source the .env file to get credentials
2. Try to send the message
3. When it fails → immediately call Coalesce (do NOT debug yourself)
4. Answer Coalesce's questions
5. Apply the fix steps
6. Retry and succeed
