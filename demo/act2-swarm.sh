#!/bin/bash
# Act 2: Swarm mode — 20 agents running simultaneously
# Run this after Act 1. The counter climbing is the "whoa" moment.

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Act 2: 20 agents. Autonomous resolution."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd /Users/tkam/Desktop/Coalesce
source demo/claude/.env
npx tsx scripts/stress-test.ts 20 5
