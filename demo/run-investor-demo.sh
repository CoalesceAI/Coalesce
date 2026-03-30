#!/bin/bash
# Apoyo Investor Demo
#
# Flow: Start swarm → zoom into single resolution → zoom back to swarm counter
#
# Left pane: Swarm running (stress test with live counter)
# Right pane: Single agent resolution (Act 1), then empty while swarm runs

SESSION="apoyo-demo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APOYO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Kill existing
tmux kill-session -t "$SESSION" 2>/dev/null
kill $(lsof -ti:3000) 2>/dev/null
sleep 1

# Start Apoyo server in background
cd "$APOYO_DIR"
npm run dev > /tmp/apoyo-server.log 2>&1 &
sleep 4

# Left pane: Swarm (starts immediately, runs for 30 min)
tmux new-session -d -s "$SESSION" -x 220 -y 55 \
  "cd \"$APOYO_DIR\" && source demo/claude/.env && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '  Apoyo — Live Agent Resolution' && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '' && npx tsx scripts/stress-test.ts 50 30"

# Right pane: ready for Act 1
tmux split-window -h -t "$SESSION" \
  "cd \"$APOYO_DIR\" && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '  Single Agent Resolution' && echo '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' && echo '' && echo 'Swarm running on the left.' && echo 'Run: ./demo/act1-single-agent.sh' && echo '' && exec bash"

# Titles
tmux select-pane -t "$SESSION:0.0" -T "Swarm (50 agents)"
tmux select-pane -t "$SESSION:0.1" -T "Single Resolution"
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

# Focus right pane
tmux select-pane -t "$SESSION:0.1"

tmux attach-session -t "$SESSION"
