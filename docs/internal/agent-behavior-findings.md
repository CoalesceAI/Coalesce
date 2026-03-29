
## Key Finding: Agents don't naturally use support URLs

Blind tested Haiku agents hitting AgentMail errors with a `support` field. Without any instruction about Apoyo, agents:
- See the support URL in the error response
- Ignore it completely
- Try to self-debug by guessing endpoint variations (8-15 attempts)
- Eventually give up and ask the human

**Why:** The agent said: "I treated the support URL as metadata about the error rather than as part of the error resolution strategy. The word 'support' made me think it was for human users to click on."

## What works: `support_hint` field

Adding `"support_hint": "POST to the support URL with an empty JSON body {} to receive structured diagnosis and fix steps for this error."` caused the agent to actually try calling the URL on its second attempt.

## What blocked it: auth

The agent tried to call the Apoyo support URL but used the AgentMail API key (the only key it had). Got 401. Gave up.

**Solution decided:** Signed URLs — Apoyo gives each org a pre-authenticated base URL. The URL itself contains a token. No separate auth needed. Zero friction for the agent.

**How to apply:** The support URL in error responses must be callable with zero additional credentials. Any auth should be embedded in the URL itself.
