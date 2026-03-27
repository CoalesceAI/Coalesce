#!/bin/bash
# Act 1: Single agent hits error → Coalesce resolves → agent retries → success
# Run this in the right pane while Screen Studio records

source /Users/tkam/Desktop/Coalesce/demo/claude/.env

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Act 1: Agent hits an error"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Agent tries to send a message — fails
echo "▸ Agent: POST /inboxes/demo-inbox/messages/send"
echo ""
RESPONSE=$(curl -s -X POST "$AGENTMAIL_BASE_URL/inboxes/demo-inbox/messages/send" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"user@example.com","subject":"Hello","text":"Test"}')

echo "$RESPONSE" | python3 -m json.tool
echo ""

# Extract support URL
SUPPORT_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('support',''))" 2>/dev/null)

sleep 2

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Agent sees support URL → calls Coalesce"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "▸ Agent: POST $SUPPORT_URL"
echo ""

# Step 2: Agent calls Coalesce — gets diagnosis
DIAGNOSIS=$(curl -s -X POST "$SUPPORT_URL" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "$DIAGNOSIS" | python3 -m json.tool
echo ""

sleep 3

# Extract session_id for follow-up
SESSION_ID=$(echo "$DIAGNOSIS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('session_id',''))" 2>/dev/null)
STATUS=$(echo "$DIAGNOSIS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)

if [ "$STATUS" = "needs_info" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Coalesce asks a question → Agent answers"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  # Strip query params from support URL for follow-up
  BASE_SUPPORT=$(echo "$SUPPORT_URL" | sed 's/&endpoint=.*//')

  FOLLOW_UP=$(curl -s -X POST "$BASE_SUPPORT" \
    -H "Content-Type: application/json" \
    -d "{\"session_id\": \"$SESSION_ID\", \"answer\": {\"clarifications\": {\"What inbox_id are you using?\": \"I used demo-inbox as the inbox_id. I did not create it first.\"}}}")

  echo "$FOLLOW_UP" | python3 -m json.tool
  echo ""
  sleep 3
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Agent applies the fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Agent creates inbox (following Coalesce's fix_steps)
echo "▸ Agent: POST /inboxes (creating inbox)"
CREATE=$(curl -s -X POST "$AGENTMAIL_BASE_URL/inboxes" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo-inbox"}')

INBOX_ID=$(echo "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('inbox_id',''))" 2>/dev/null)
echo "  ✓ Created: $INBOX_ID"
echo ""

sleep 1

# Step 4: Agent retries with correct inbox_id
echo "▸ Agent: POST /inboxes/$INBOX_ID/messages/send (retry)"
RETRY=$(curl -s -X POST "$AGENTMAIL_BASE_URL/inboxes/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$INBOX_ID'))")/messages/send" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"user@example.com","subject":"Hello from Coalesce demo","text":"This message was sent by an agent that self-healed using Coalesce."}')

echo "$RETRY" | python3 -m json.tool
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Self-healed. No human involved."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
