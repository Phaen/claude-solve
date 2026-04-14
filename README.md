# claude-solve

A Claude Code plugin that enforces structured problem-solving before any code is written.

## What it does

When you invoke `/solve`, Claude must:

1. **Declare all candidate solutions** upfront — no undeclared options
2. **Investigate each one** with real tool calls before drawing conclusions
3. **Resolve or cull** every solution with explicit reasoning
4. **Select** the winner (or report blocked if nothing works)

Only after a complete, valid tree does the edit gate unlock and Claude may touch files. If a test or build fails during implementation, the gate re-locks and a new solve is required.

A live tree visualisation runs at **http://localhost:7337** — nodes update in real-time as Claude works through the tree.

## Install

Add this repo as a marketplace source in Claude Code:

```
/plugin marketplace add https://github.com/Phaen/claude-solve
/plugin install claude-solve@Phaen
```

## Usage

```
/claude-solve:solve <problem description>
```

Or just `/claude-solve:solve` with no arguments — Claude will derive the problem from context.

## How the tree works

```
<problem>
What is failing and why.
</problem>

<solution id="1">Brief approach.</solution>
<solution id="2">Alternative approach.</solution>

<investigate id="1">
[tool calls here]
Findings.
</investigate>
<resolved id="1">What was confirmed.</resolved>

<investigate id="2">
[tool calls here]
Findings.
</investigate>
<cull id="2"/>   ← fatal blocker found

<selected id="1"/>
```

Sub-problems use dotted IDs (`1.1`, `1.1.1`) for nested investigation.

## Structure

```
claude-solve/
├── .claude-plugin/
│   └── plugin.json          # manifest + hooks wiring
├── commands/
│   └── solve.md             # /claude-solve:solve skill definition
├── scripts/
│   ├── solve-trigger.sh     # UserPromptSubmit: init tree, start server
│   ├── solve-check.sh       # Stop: validate tree, unlock edit gate
│   ├── solve-tool.sh        # PostToolUse: increment tool counts live
│   ├── edit-guard.sh        # PreToolUse: block edits until tree complete
│   ├── bash-failure.sh      # PostToolUse: re-lock gate on test failure
│   ├── solve-update.js      # Core state engine
│   └── solve-server.js      # HTTP server + SSE + web UI
└── README.md
```

## Author

Pablo Kebees — [github.com/Phaen](https://github.com/Phaen)

## License

MIT
