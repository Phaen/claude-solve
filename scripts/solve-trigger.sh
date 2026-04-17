#!/usr/bin/env bash
# UserPromptSubmit: initialise solve state and start the visualisation server when /solve is invoked.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

[ -z "$SESSION" ] && exit 0
echo "$PROMPT" | grep -qE '^\s*/(claude-solve:)?solve(\s|$)' || exit 0

# Block if the most recent solve for this session is still active
SOLVE_ID=$(node -e "const fs=require('fs');try{const r=JSON.parse(fs.readFileSync(process.env.CLAUDE_PLUGIN_DATA+'/solve_sessions.json','utf8'));const m=r.filter(s=>s.session_id===process.argv[1]).pop();if(m)process.stdout.write(m.solve_id);}catch{}" "$SESSION" 2>/dev/null)
if [ -n "$SOLVE_ID" ]; then
  TREE_FILE="${PWD}/.claude/solve_tree_${SOLVE_ID}.json"
  STATUS=$(jq -r '.status // ""' "$TREE_FILE" 2>/dev/null)
  if [ "$STATUS" = "solving" ]; then
    if ! curl -sf http://localhost:7337/state >/dev/null 2>&1; then
      node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-server.js" "${CLAUDE_PLUGIN_DATA}" </dev/null >/dev/null 2>&1 &
    fi
    printf '{"additionalContext":"Resuming existing solve session. Visualisation at http://localhost:7337"}'
    exit 0
  fi
fi

URL=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/solve-init.sh" "$SESSION" "$TRANSCRIPT")
printf '{"additionalContext":"Solve session started. Visualisation at %s"}' "$URL"
