#!/bin/bash
# Terminal 2: Split pane — server logs | Claude Code doing the task
SESSION="coalesce-resolution"
COALESCE_DIR="/Users/tkam/Desktop/Coalesce"

tmux kill-session -t "$SESSION" 2>/dev/null

# Left pane: Coalesce server logs
tmux new-session -d -s "$SESSION" -x 220 -y 55 \
  "echo '▸ Coalesce Server Logs' && echo '' && tail -f /tmp/coalesce-server.log 2>/dev/null || (cd $COALESCE_DIR && npm run dev 2>&1)"

# Right pane: Claude Code with the investor demo task
tmux split-window -h -t "$SESSION" \
  "cd $COALESCE_DIR/demo/investor && sleep 2 && claude"

tmux select-pane -t "$SESSION:0.0" -T "Coalesce Server"
tmux select-pane -t "$SESSION:0.1" -T "Claude Code Agent"
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

tmux select-pane -t "$SESSION:0.1"
tmux attach-session -t "$SESSION"
