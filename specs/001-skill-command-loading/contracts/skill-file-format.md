# Contract: Skill File Format

This is the file-level contract a `SKILL.md` must satisfy to be recognized as a skill by
`ii`. It is intentionally a subset of the format already used by this repo's
`.claude/skills/*/SKILL.md` files, so any existing Claude Code skill already satisfies it
without modification (User Story 2).

## Location

A skill is a file at:

```
<skills-dir>/<name>/SKILL.md
```

where `<skills-dir>` is one of the two `SkillSource.baseDir` values (`.ii/skills` or
`.claude/skills`, resolved relative to the current working directory), and `<name>` is the
directory name — this directory name is the invocation keyword (data-model.md, `Skill.name`).

## Required shape

```
---
name: "<skill-name>"
description: "<one-line description>"
<...any other frontmatter fields — ignored...>
---

<skill body — plain markdown/instructions, may reference $ARGUMENTS>
```

- The file MUST start with a line consisting of exactly `---`.
- The frontmatter MUST include a `name:` line with a non-empty value.
- The frontmatter MUST include a `description:` line with a non-empty value.
- The frontmatter MUST be closed by a second line consisting of exactly `---`.
- Any other frontmatter field (`argument-hint`, `compatibility`, `metadata:` and its
  sub-keys, `user-invocable`, `disable-model-invocation`, etc.) is permitted but ignored —
  this feature does not enforce or interpret them.
- Everything after the closing `---` line is the skill's `body`, used verbatim (after
  argument substitution below).

A file that does not satisfy the required shape above is **not** a valid skill: it MUST be
skipped with a warning, not treated as an error that stops discovery of other skills
(FR-009).

## Argument substitution

Wherever the literal token `$ARGUMENTS` appears in the body, it MUST be replaced with the
text the user typed after the skill name at invocation time (FR-006). If the user typed no
trailing text, `$ARGUMENTS` MUST be replaced with an empty string, not left as literal
text (FR-007).

No other placeholder tokens are defined by this contract.

## Compatibility note

This contract is a strict subset of the frontmatter shape already used in
`.claude/skills/*/SKILL.md` in this repository — every field beyond `name`/`description`
that those files already contain is explicitly in the "permitted but ignored" category
above. No existing skill file needs to change for `ii` to load it.
