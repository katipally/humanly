<div align="center">

# humanly

**Make every AI agent write like a human: clean, lean, honest.**

One [Agent Skill](https://agentskills.io) that loads right before your agent drafts or edits text, then strips the giveaways that mark writing as AI.

[![npm version](https://img.shields.io/npm/v/humanly?color=cb3837&logo=npm)](https://www.npmjs.com/package/humanly)
[![npm downloads](https://img.shields.io/npm/dm/humanly?color=cb3837&logo=npm)](https://www.npmjs.com/package/humanly)
[![license](https://img.shields.io/npm/l/humanly?color=blue)](LICENSE)
[![node](https://img.shields.io/node/v/humanly?color=339933&logo=node.js)](package.json)

```bash
npx humanly
```

</div>

---

## The problem

AI writing has tells. Em dashes everywhere. "It's not just X, it's Y." Words like *delve*, *leverage*, *robust*, *seamless*. Walls of bold. Three-item lists for everything. A paragraph of preamble before the actual answer.

It reads like a robot, and it burns tokens you pay for.

`humanly` fixes that at the source. Instead of editing the output after the fact, it teaches the agent the rules before it writes a word.

## What you get

One ruleset, three pillars:

- **Clean** strips the artifacts that flag text as AI: em dashes, false contrast, rule-of-three padding, AI-vocab, over-bolding.
- **Lean** answers first, cuts filler and hedging, says it in the fewest tokens that stay correct. Less bloat, lower cost.
- **Truth** allows no invented facts, numbers, or sources. The agent says "unsure" instead of guessing with confidence.

## Quick start

```bash
npx humanly
```

That opens a short wizard: pick scope (this project or your whole machine), pick agents from the catalog (start typing to search, detected ones are pre-checked), preview, confirm. Zero dependencies, nothing to download.

## How it works

`SKILL.md` is an open standard read by Claude Code, Codex, Cursor, Goose, OpenHands, and more. The agent surfaces the skill by name and pulls the full ruleset into focus the moment a task involves writing or editing prose. That is a far stronger signal than a buried instruction line, and one file installs the same way everywhere.

Earlier versions (0.2.x) appended the ruleset as text into each agent's instruction file (`CLAUDE.md`, `AGENTS.md`). That works, but the block sits low-salience among everything else, so models drift back to their defaults. As of 0.3.0 `humanly` installs a real skill instead. Upgrading from 0.2.x? `init` and `remove` also strip the old injected `<!-- humanly:start -->` block, so you never end up with the rules twice.

## Usage

```bash
npx humanly                      # wizard: pick project or global scope, then the agents
npx humanly init --all           # every supported tool, non-interactive
npx humanly init --only claude,agents,cursor
npx humanly init --global        # machine-wide (~/.claude/skills, ~/.agents/skills, ...)
npx humanly init --local         # force project scope (current folder)
npx humanly list                 # show the catalog and what's detected
npx humanly remove               # delete only humanly's skill folder, nothing else
```

Scope is asked per run; `--global` / `--local` set it for scripts. Re-running is idempotent. `remove` deletes only our own `humanly/` folder (verified by its frontmatter) and never touches your other skills.

### Copy the rules by hand

For an agent that doesn't read skills, paste the ruleset into its system prompt:

```bash
npx humanly rules --copy         # to clipboard
npx humanly rules                # print to stdout
npx humanly rules --out STYLE.md
```

## Supported tools

Verified paths, June 2026. The `.agents/skills` entry is the cross-tool open standard, read by Codex, Goose, OpenHands and others in one shot.

| Tool | Project | Global |
|------|---------|--------|
| `.agents/skills` (Codex, Goose, OpenHands, standard) | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Gemini CLI | `.gemini/skills/` | `~/.gemini/skills/` |
| GitHub Copilot / VS Code | `.github/skills/` | `~/.copilot/skills/` |
| Cursor | `.cursor/skills/` | `~/.cursor/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` |
| Cline | `.cline/skills/` | `~/.cline/skills/` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` |
| JetBrains Junie | `.junie/skills/` | `~/.junie/skills/` |
| Amp | `.agents/skills/` | `~/.config/agents/skills/` |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` |
| TRAE | `.trae/skills/` | n/a (project only) |
| Tabnine | `.tabnine/agent/skills/` | `~/.tabnine/agent/skills/` |
| Factory (Droid) | `.factory/skills/` | `~/.factory/skills/` |

### Manual install (no npx)

Clone or download this repo and copy the skill folder into any directory from the table:

```bash
cp -r src/skill/humanly ~/.claude/skills/        # or any path above
```

That's the whole skill: `src/skill/humanly/SKILL.md`. Edit it freely.

## Honest note on "100%"

A skill loads with high salience, so this gives the strongest adherence a prompt-based approach allows. It is not a hard guarantee that a model never slips. Only a tool-side hook (which every agent implements differently, so it isn't portable) can enforce a rule deterministically. `humanly` keeps the ruleset tight and lets each agent load it as a skill. Overselling would be the exact thing this tool removes.

## Develop

```bash
npm test
```

Checks that the skill loads with all three pillars, `init` writes one `SKILL.md` per tool without duplicating, the legacy block is migrated, and `remove` deletes only our folder while leaving sibling skills intact.

## License

[MIT](LICENSE)
