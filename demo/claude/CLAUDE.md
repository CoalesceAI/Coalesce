# Agent Task: Send a message using AgentMail

You are an AI agent. Your job is to send a test message using the AgentMail API.

## Task

Send a message with subject "Hello from Apoyo" and body "This message was sent by an AI agent that self-healed using Apoyo." to the inbox `demo-inbox`.

## AgentMail API

- **Base URL:** `$AGENTMAIL_BASE_URL`
- **Auth:** `Authorization: Bearer $AGENTMAIL_API_KEY`

## IMPORTANT: Error handling

When you hit ANY API error, **immediately** use Apoyo to diagnose it. Do NOT try to figure it out yourself. Do NOT retry with variations. Do NOT guess at endpoints. Go straight to Apoyo.

**Apoyo endpoint:** `http://localhost:3000/support/agentmail`
**Auth:** `Authorization: Bearer $APOYO_API_KEY`

**Step 1 — Report the error:**
```
POST http://localhost:3000/support/agentmail?endpoint={endpoint_you_called}&error_code={http_status}&context={error_name}
Authorization: Bearer $APOYO_API_KEY
Content-Type: application/json
Body: {}
```
The JSON response includes `session_id`. **Every later call to Apoyo for this same error must reuse that `session_id`** (otherwise each POST without `session_id` creates a **new** session and you will see duplicate rows in the admin UI).

**Step 2 — If Apoyo asks questions (`status: "needs_info"`):**
```
POST http://localhost:3000/support/agentmail
Authorization: Bearer $APOYO_API_KEY
Content-Type: application/json
Body: { "session_id": "<from response>", "answer": { "clarifications": { "<question>": "<your answer>" } } }
```

**Step 3 — When resolved (`status: "resolved"`):** Follow the `fix_steps` exactly, then retry.

## Flow

1. Source the .env file to get credentials
2. Try to send the message
3. When it fails → immediately call Apoyo (do NOT debug yourself)
4. Answer Apoyo's questions
5. Apply the fix steps
6. Retry and succeed
