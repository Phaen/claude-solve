#!/usr/bin/env bash
# UserPromptSubmit: initialise solve state and start the visualisation server when /solve is invoked.

INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null)

[ -z "$SESSION" ] && exit 0
echo "$PROMPT" | grep -qE '^\s*/(claude-solve:)?solve(\s|$)' || exit 0

URL=$(bash "${CLAUDE_PLUGIN_ROOT}/scripts/solve-init.sh" "$SESSION" "$TRANSCRIPT")
printf '{"additionalContext":"Solve session started. Visualisation at %s"}' "$URL"
