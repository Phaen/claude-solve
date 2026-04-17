#!/usr/bin/env bash
# Stop hook: validate solve tree is complete before allowing the agent to stop.
# No-ops if not in an active solve session.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[ -z "$SESSION" ] && exit 0

SOLVE_ID=$(node -e "const fs=require('fs');try{const r=JSON.parse(fs.readFileSync(process.env.CLAUDE_PLUGIN_DATA+'/solve_sessions.json','utf8'));const m=r.filter(s=>s.session_id===process.argv[1]).pop();if(m)process.stdout.write(m.solve_id);}catch{}" "$SESSION" 2>/dev/null)
[ -z "$SOLVE_ID" ] && exit 0
TREE_FILE="${PWD}/.claude/solve_tree_${SOLVE_ID}.json"
[ ! -f "$TREE_FILE" ] && exit 0

RESULT=$(echo "$INPUT" | node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-tree.js" stop "$SOLVE_ID" "$PWD" 2>&1)
if [ $? -ne 0 ]; then
  jq -n --arg msg "$RESULT" '{"decision":"block","reason":$msg}'
fi
exit 0
