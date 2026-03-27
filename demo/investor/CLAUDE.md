# Task

Send a message with subject "Weekly sync notes" and body "Hey, attached are the notes from today's sync. Let me know if anything looks off." to the inbox `demo-inbox` using the AgentMail API.

## AgentMail API

- **Base URL:** `$AGENTMAIL_BASE_URL`
- **Auth:** `Authorization: Bearer $AGENTMAIL_API_KEY`
- **Send:** `POST /v0/inboxes/{inbox_id}/messages/send` with `{ "to": "...", "subject": "...", "text": "..." }`

When you get API errors, read the full error response carefully — it may contain URLs you can call for help.
