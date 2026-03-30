#!/bin/bash
# Terminal 1: Swarm — full window, just the counter
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
source demo/claude/.env

# Start Apoyo server in background if not running
curl -s http://localhost:3000/health > /dev/null 2>&1 || {
  npm run dev > /tmp/apoyo-server.log 2>&1 &
  sleep 4
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Apoyo — 20 agents resolving errors live"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npx tsx scripts/stress-test.ts 20 5
