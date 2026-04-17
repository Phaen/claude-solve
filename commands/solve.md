# Solve

Structured problem-solving with an explicit solution tree. Required before implementing any non-trivial fix. Self-invoked when a test, build, or tool failure occurs during implementation.

**All tool calls must be inside `<research>` or `<investigate>` blocks.**

## Problem

$ARGUMENTS

If no arguments given, derive the problem from the current conversation context.

Start by researching — read every relevant file before articulating the problem.

```
<research>
[tool calls — Read, Grep, Glob, Bash]
Findings.
</research>

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

Before investigating, declare **all reasonable solutions you can think of** — even ones that seem unlikely. Every option deserves a slot. You will investigate each one in turn.

### 2. Investigate

Every `<investigate>` block must contain at least one tool call, and may contain findings and notes. Sub-problems and outcome declarations must come *after* `</investigate>` closes — never inside it.

```
<investigate id="N">
[tool calls — Read, Grep, Glob, Bash]
Findings.
</investigate>
```

### 3. Outcome — declared after `</investigate>` closes

Exactly two possibilities:

**No blockers found → resolve immediately:**

```
<resolved id="N">
What was confirmed and how it works.
</resolved>
```

**Blocker found → declare a sub-problem and research it:**

```
<problem id="N.M">
Description of the blocker.
</problem>

<research id="N.M">
[tool calls — validate whether the blocker is real and whether there is a way around it]
Findings.
</research>
```

After `</research>` closes, either recurse into sub-solutions or block:

- There is a way around it → declare sub-solutions `N.M.1`, `N.M.2`, … and apply the same loop
- No way around it → `<blocked id="N.M">` with explanation; the parent solution fails

```
<blocked id="N.M">
Why this sub-problem cannot be resolved. What makes it a hard blocker.
</blocked>
```

Once all sub-problems under a solution are worked through:

- All sub-problems resolved → `<resolved id="N">`
- Any sub-problem blocked → the solution has already failed; move on

Every `<solution>` must end up either `<resolved>` or with a `<blocked>` sub-problem.

---

## Select

**All top-level solutions failed:**

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
