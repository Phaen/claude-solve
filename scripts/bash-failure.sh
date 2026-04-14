#!/usr/bin/env bash
# PostToolUse: Bash
# Re-locks the edit gate when a test or build command fails during implementation.
# Only fires when state is "resolved" (actively implementing).

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
EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_response.exit_code // empty' 2>/dev/null)
OUTPUT=$(echo "$INPUT" | jq -r '(.tool_response.output // "") | tostring' 2>/dev/null)

# Only trigger on test/build/lint commands
echo "$COMMAND" | grep -qiE '(test|phpunit|jest|pytest|make|build|artisan test|npm test|yarn test|cargo test|go test|rspec|mocha|phpstan|eslint|tsc |composer|sail test)' || exit 0

FAILED=0
[ -n "$EXIT_CODE" ] && [ "$EXIT_CODE" != "0" ] && FAILED=1
echo "$OUTPUT" | grep -qiE '(FAILED|FAIL:|Tests:.*failed|Build failed|fatal error|Compilation failed|assertion.*failed|error\[E[0-9]+\]|PHPStan.*error)' && FAILED=1

if [ "$FAILED" -eq 1 ]; then
  node -e "
const fs = require('fs');
const f = process.argv[1];
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
d.status = 'required';
d.updated_at = Date.now() / 1000;
fs.writeFileSync(f, JSON.stringify(d, null, 2));
" "$TREE_FILE" 2>/dev/null
  echo "FAILURE DETECTED: Edit gate re-locked. A new solve tree is required before further changes. Invoke /solve with the failure as input."
fi

exit 0
