#!/usr/bin/env bash
# PostToolUseFailure: Bash
# Starts a new solve session when a test or build command fails during implementation.
# Only fires when the current solve state is "resolved" (actively implementing).
# The event firing already means the command failed — no exit code check needed.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
[ -z "$SESSION" ] && exit 0

SOLVE_ID=$(node -e "const fs=require('fs');try{const r=JSON.parse(fs.readFileSync(process.env.CLAUDE_PLUGIN_DATA+'/solve_sessions.json','utf8'));const m=r.filter(s=>s.session_id===process.argv[1]).pop();if(m)process.stdout.write(m.solve_id);}catch{}" "$SESSION" 2>/dev/null)
[ -z "$SOLVE_ID" ] && exit 0
TREE_FILE="${PWD}/.claude/solve_tree_${SOLVE_ID}.json"
[ ! -f "$TREE_FILE" ] && exit 0

STATUS=$(jq -r '.status // ""' "$TREE_FILE" 2>/dev/null)
[ "$STATUS" != "resolved" ] && exit 0

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Only trigger on test/build/lint commands
echo "$COMMAND" | grep -qiE '(test|phpunit|jest|pytest|make|build|artisan test|npm test|yarn test|cargo test|go test|rspec|mocha|phpstan|eslint|tsc |composer|sail test)' || exit 0

TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)
bash "${CLAUDE_PLUGIN_ROOT}/scripts/solve-init.sh" "$SESSION" "$TRANSCRIPT" >/dev/null 2>&1
printf '{"additionalContext":"A test/build failure was detected. A new solve tree has been automatically started. Work through it now — declare solutions, investigate, and resolve before making further edits."}'
