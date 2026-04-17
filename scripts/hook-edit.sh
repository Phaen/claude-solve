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
    RESULT=$(echo "$INPUT" | node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-tree.js" tool "$SOLVE_ID" "$PWD" 2>&1)
    if [ $? -ne 0 ] || [ "$RESULT" != "OK" ]; then
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"EDIT BLOCKED: %s"}}' "$RESULT"
      exit 0
    fi
    NEW_STATUS=$(jq -r '.status // ""' "$TREE_FILE" 2>/dev/null)
    if [ "$NEW_STATUS" = "solving" ]; then
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"EDIT BLOCKED: Solve tree is incomplete. Continue working through the tree — declare, investigate, and resolve or cull all remaining solutions."}}'
    fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
