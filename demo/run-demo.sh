#!/bin/bash
# Coalesce Demo — Split terminal with tmux
# Left: Coalesce server logs | Right: Claude Code agent

SESSION="coalesce-demo"

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null

# Create new session with the Coalesce server in the left pane
tmux new-session -d -s "$SESSION" -x 200 -y 50 \
  "cd /Users/tkam/Desktop/Coalesce && echo '🟢 Starting Coalesce server...' && npm run dev 2>&1"

# Split vertically — right pane for Claude Code
tmux split-window -h -t "$SESSION" \
  "sleep 4 && cd /Users/tkam/Desktop/Coalesce/demo/claude && echo '🤖 Starting Claude Code agent...' && echo '' && claude"

# Set pane titles
tmux select-pane -t "$SESSION:0.0" -T "Coalesce Server"
tmux select-pane -t "$SESSION:0.1" -T "Claude Code Agent"

# Enable pane border status to show titles
tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_title} "

# Focus on the right pane (Claude Code)
tmux select-pane -t "$SESSION:0.1"

# Attach
tmux attach-session -t "$SESSION"
