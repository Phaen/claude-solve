#!/usr/bin/env bash
# Shared init: create a new solve tree, register it, and ensure the server is running.
# Usage: solve-init.sh <session_id> <transcript_path>
# Outputs the server URL on stdout.

SESSION="$1"
TRANSCRIPT="$2"

[ -z "$SESSION" ] && exit 1

mkdir -p "${PWD}/.claude"

# Unique ID per solve invocation (session + timestamp)
SOLVE_ID="${SESSION}_$(date +%s)"

# Snapshot transcript length so stop hook only reads this solve's entries
TRANSCRIPT_LINE=0
if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
  TRANSCRIPT_LINE=$(wc -l < "$TRANSCRIPT")
fi

# Initialise fresh tree state
node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-tree.js" init "$SOLVE_ID" "$PWD" "$TRANSCRIPT_LINE"

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
if ! curl -sf http://localhost:7337/state >/dev/null 2>&1; then
  node "${CLAUDE_PLUGIN_ROOT}/scripts/solve-server.js" "${CLAUDE_PLUGIN_DATA}" </dev/null >/dev/null 2>&1 &
fi

echo "http://localhost:7337"
