# Quickstart: Validating Skill Command Loading

These are runnable, manual validation steps proving the feature works end-to-end, mapped
to the spec's acceptance scenarios and success criteria. This project has no automated
test runner (research.md, Decision 6), so this is the verification path — treat it as an
extension of AGENTS.md's existing manual testing checklist.

## Prerequisites

```bash
npm install
npm run build
```

Run all scenarios below from the repository root, using `npm run dev` (or `npm start`
after building) to start `ii`.

## Scenario A — Invoke a discovered skill with arguments (US1, AC1)

This repo already has `.claude/skills/speckit-specify/SKILL.md`. With no other setup:

```
ii> /speckit-specify add a login page
```

**Expected**: `ii` follows the skill's instructions (asks about the feature, creates a
spec directory, etc.) — it does not reply as if you'd asked a literal question containing
the word "speckit-specify".

## Scenario B — Invoke a skill with no arguments (US1, AC2)

```
ii> /speckit-analyze
```

**Expected**: the skill still runs; nowhere in its behavior does the literal text
`$ARGUMENTS` leak through unresolved.

## Scenario C — Unmatched slash command (US1, AC3 / Edge Case)

```
ii> /this-skill-does-not-exist hello
```

**Expected**: no crash, no error message about a missing skill — the line is sent through
as an ordinary prompt, exactly like today's `ii` would handle it.

## Scenario D — Claude Code compatibility (US2)

Confirm no `.ii/skills/` directory exists yet (`ls .ii/skills 2>&1` should fail), then:

```
ii> /speckit-tasks
```

**Expected**: runs using the unmodified `.claude/skills/speckit-tasks/SKILL.md` file —
nothing about that file needed to change.

## Scenario E — Zero skills present (US2 edge case, SC-002)

In a fresh directory with neither `.ii/skills/` nor `.claude/skills/`:

```bash
mkdir /tmp/ii-empty-test && cd /tmp/ii-empty-test
ii
```

**Expected**: starts and behaves exactly as `ii` did before this feature — no extra
startup output, no warnings, no errors.

## Scenario F — `ii`-native precedence (US3, AC2, SC-003)

```bash
mkdir -p .ii/skills/ping .claude/skills/ping
cat > .ii/skills/ping/SKILL.md <<'EOF'
---
name: "ping"
description: "ii-native ping"
---
Reply with exactly: PONG-FROM-II
EOF
cat > .claude/skills/ping/SKILL.md <<'EOF'
---
name: "ping"
description: "claude-compatible ping"
---
Reply with exactly: PONG-FROM-CLAUDE
EOF
```

```
ii> /ping
```

**Expected**: replies `PONG-FROM-II` — the `.ii/skills/` version wins, every time.
Clean up both directories afterward.

## Scenario G — Built-in collision (Edge Case, FR-005a)

```bash
mkdir -p .ii/skills/clear
cat > .ii/skills/clear/SKILL.md <<'EOF'
---
name: "clear"
description: "a skill that happens to be named clear"
---
Reply with exactly: SKILL-NAMED-CLEAR-RAN
EOF
```

```
ii> /clear
```

**Expected**: prints "History cleared." (the built-in ran, not the skill).

```
ii> /skill:clear
```

**Expected**: replies `SKILL-NAMED-CLEAR-RAN` — the colliding skill is still reachable
under the namespaced form. Clean up `.ii/skills/clear` afterward.

## Scenario H — Malformed skill file doesn't break anything (Edge Case, SC-004)

```bash
mkdir -p .ii/skills/broken
echo "not a valid skill file, no frontmatter at all" > .ii/skills/broken/SKILL.md
```

```
ii> /speckit-specify test
```

**Expected**: `ii` still starts (check its startup output for a warning about the broken
skill) and this unrelated skill still runs normally. Clean up `.ii/skills/broken`
afterward.

## Scenario I — Discoverability (FR-008, SC-005)

Start `ii` in this repository (which has ten `.claude/skills/speckit-*` entries) and
confirm you can tell which skills are available without opening a file browser or running
`ls` yourself — e.g. a startup message listing discovered skill names, mirroring the
existing "Loaded N custom tool(s) from ..." message style for `II_TOOLS_DIR`.
