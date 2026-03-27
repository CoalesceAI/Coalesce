#!/bin/bash
# Terminal 1: Swarm — full window, just the counter
cd /Users/tkam/Desktop/Coalesce
source demo/claude/.env

# Start Coalesce server in background if not running
curl -s http://localhost:3000/health > /dev/null 2>&1 || {
  npm run dev > /tmp/coalesce-server.log 2>&1 &
  sleep 4
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Coalesce — 50 agents resolving errors live"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npx tsx scripts/stress-test.ts 50 30
