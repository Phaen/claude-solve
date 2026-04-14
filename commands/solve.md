# Solve

Structured problem-solving with an explicit solution tree. Required before implementing any non-trivial fix. Self-invoked when a test, build, or tool failure occurs during implementation.

## Problem

$ARGUMENTS

If no arguments given, derive the problem from the current conversation context. Read relevant files before articulating it — do not assume.

```
<problem>
What is failing or needs to change.
Current behaviour vs expected behaviour.
What you confirmed by reading.
</problem>
```

---

## Solutions and Investigation

IDs encode the hierarchy:

- `1`, `2` — top-level solutions to the root problem
- `1.1` — sub-problem discovered while investigating solution `1`
- `1.1.1`, `1.1.2` — solutions to sub-problem `1.1`

The loop for every solution is: **declare → investigate → outcome**. Strictly in that order.

### 1. Declare a solution

```
<solution id="N">
Brief description of the approach.
</solution>
```

Before investigating, declare **all reasonable solutions you can think of** — even ones that seem unlikely. Every option deserves a slot. You will get the chance to cull weak ones after investigation, but a solution you never declared can never be selected.

### 2. Investigate

Every `<investigate>` block must contain at least one tool call. Nothing else goes inside — no sub-problems, no verdicts.

```
<investigate id="N">
[tool calls — Read, Grep, Glob, Bash]
Findings.
</investigate>
```

### 3. Outcome — declared after `</investigate>` closes

Exactly two possibilities:

**Blockers found → declare sub-problems and recurse:**

```
<problem id="N.M">
Description of the blocker.
</problem>
```

Apply the same loop for each sub-solution `N.M.1`, `N.M.2`, etc. Once all sub-problems under a solution are worked through, declare the verdict on the parent:

- All sub-problems resolved → `<resolved id="N">`
- Any sub-problem unsolvable → `<cull id="N"/>` — one fatal blocker is enough, stop there

A sub-problem is unsolvable when investigation yields no viable solutions, or all proposed solutions were themselves culled.

**No blockers found → resolve immediately:**

```
<resolved id="N">
What was confirmed and how it works.
</resolved>
```

Every `<solution>` must end up as either `<cull>` or `<resolved>`.

---

## Select

**All top-level solutions culled:**

```
<blocked>
Why no solution is viable. What must change before this can proceed.
</blocked>
```

Stop. Do not edit anything. Report to the user.

**One top-level solution resolved:** proceed directly to implementation.

**Multiple top-level solutions resolved:**

```
<compare>
- [id]: why this loses to N
- [id]: why this loses to N
</compare>

<selected id="N"/>
```

---

## Implementation

Only after stopping with a complete tree may you use Edit or Write tools. The stop hook validates and unlocks automatically.

---

## Self-trigger

If during implementation you hit a test failure, build failure, or blocker that invalidates the selected solution — stop immediately. Do not attempt an inline fix. Re-run `/solve` with the new problem. The edit gate re-locks until resolved.
