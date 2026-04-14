#!/usr/bin/env bash
# UserPromptSubmit: initialise solve state and start the visualisation server when /solve is invoked.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

[ -z "$SESSION" ] && exit 0
echo "$PROMPT" | grep -qE '^\s*/(claude-solve:)?solve(\s|$)' || exit 0

mkdir -p "${PWD}/.claude"

# Unique ID per solve invocation (session + timestamp)
SOLVE_ID="${SESSION}_$(date +%s)"

# Snapshot transcript length so stop hook only reads this solve's entries
TRANSCRIPT_LINE=0
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  TRANSCRIPT_LINE=$(wc -l < "$TRANSCRIPT")
fi

# Initialise fresh tree state
node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-update.js" init "$SOLVE_ID" "$PWD" "$TRANSCRIPT_LINE"

# Register in shared registry
REGISTRY="${CLAUDE_PLUGIN_DATA}/solve_sessions.json"
node - "$SOLVE_ID" "$SESSION" "$PWD" "$REGISTRY" << 'JSEOF'
const [,, solveId, session, cwd, registry] = process.argv;
const fs   = require('fs');
const path = require('path');
let sessions = [];
try { sessions = JSON.parse(fs.readFileSync(registry, 'utf8')); } catch {}
sessions.push({ solve_id: solveId, session_id: session, project_path: cwd, project_name: path.basename(cwd), started_at: Date.now() / 1000 });
sessions = sessions.slice(-50);
fs.mkdirSync(path.dirname(registry), { recursive: true });
fs.writeFileSync(registry, JSON.stringify(sessions, null, 2));
JSEOF

# Start persistent server if not already listening on the port
if curl -sf http://localhost:7337/state >/dev/null 2>&1; then
  echo "http://localhost:7337"
  exit 0
fi

node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-server.js" "${CLAUDE_PLUGIN_DATA}" </dev/null >/dev/null 2>&1 &
echo "http://localhost:7337"
