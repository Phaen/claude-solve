#!/usr/bin/env bash
# PreToolUse: Edit, Write, MultiEdit
# Blocks edits when a solve tree is required or in progress.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[ -z "$SESSION" ] && exit 0

SOLVE_ID=$(node -e "const fs=require('fs');try{const r=JSON.parse(fs.readFileSync(process.env.CLAUDE_PLUGIN_DATA+'/solve_sessions.json','utf8'));const m=r.filter(s=>s.session_id===process.argv[1]).pop();if(m)process.stdout.write(m.solve_id);}catch{}" "$SESSION" 2>/dev/null)
[ -z "$SOLVE_ID" ] && exit 0
TREE_FILE="${PWD}/.claude/solve_tree_${SOLVE_ID}.json"
[ ! -f "$TREE_FILE" ] && exit 0

STATUS=$(jq -r '.status // ""' "$TREE_FILE" 2>/dev/null)

case "$STATUS" in
  resolved)
    exit 0
    ;;
  solving)
    echo "EDIT BLOCKED: Solve tree is not yet complete. Finish the tree first — the edit gate unlocks automatically when you stop with a valid, complete tree." >&2
    exit 2
    ;;
  required)
    echo "EDIT BLOCKED: A failure was detected during implementation. Run /solve on the new problem before making further changes." >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
