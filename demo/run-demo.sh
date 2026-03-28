#!/bin/bash
# Coalesce demo — tmux: Coalesce server (left) | Claude Code agent (right)

SESSION="coalesce-demo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

tmux kill-session -t "$SESSION" 2>/dev/null

tmux new-session -d -s "$SESSION" -x 200 -y 50 \
  "cd \"$ROOT\" && echo '🟢 Starting Coalesce server...' && npm run dev 2>&1"

tmux split-window -h -t "$SESSION" \
  "sleep 4 && cd \"$ROOT/demo/claude\" && echo '🤖 Starting Claude Code agent...' && echo '' && claude"

tmux select-pane -t "$SESSION:0.0" -T "Coalesce Server"
tmux select-pane -t "$SESSION:0.1" -T "Claude Code Agent"

tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

tmux select-pane -t "$SESSION:0.1"

tmux attach-session -t "$SESSION"
