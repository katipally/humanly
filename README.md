# humanly

Make every AI agent write **humanly**: clean (no AI tells), lean (fewer tokens), honest. It's one [Agent Skill](https://agentskills.io) (a `SKILL.md`) that loads right before the agent drafts or edits text, then strips the giveaways: em dashes, AI-vocab, false contrast, padding, preamble, invented facts.

```bash
npx humanly
```

That opens a short wizard: pick scope (this project or your whole machine), pick agents from the catalog (start typing to search, detected ones are pre-checked), preview, confirm. Zero dependencies, nothing to download.

## Why

AI writing has tells. Em dashes everywhere, "it's not just X, it's Y", "delve", "leverage", walls of bold, three-item lists for everything, a paragraph of preamble before the actual answer. It reads like a robot and it burns tokens.

humanly ships one ruleset built around three pillars:

- **Clean** strips the artifacts that flag text as AI (em dash, false contrast, rule-of-three, AI-vocab, over-bolding).
- **Lean** answers first, cuts filler and hedging, says it in the fewest tokens that stay correct. Less bloat means lower cost.
- **Truth** allows no invented facts, numbers, or sources. Say "unsure" instead of guessing confidently.

## How it works

Earlier versions appended the ruleset as text into each agent's instruction file (`CLAUDE.md`, `AGENTS.md`). That works, but the block sits low-salience among everything else, so models drift back to their defaults. As of 0.3.0 humanly installs a real **skill** instead.

`SKILL.md` is an open standard read by Claude Code, Codex, Cursor, Goose, OpenHands, and more. The agent surfaces the skill by name and pulls the full ruleset into focus the moment a task involves writing or editing prose, which is a much stronger signal than a buried instruction line. One file installs the same way everywhere.

Upgrading from 0.2.x? `init` and `remove` also strip the old injected `<!-- humanly:start -->` block from your instruction files, so you don't end up with the rules twice.

## Install

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

## Copy the rules by hand

For an agent that doesn't read skills, paste the ruleset into its system prompt:

```bash
npx humanly rules --copy         # to clipboard
npx humanly rules                # print to stdout
npx humanly rules --out STYLE.md
```

## Supported tools (verified paths, Jun 2026)

The `.agents/skills` entry is the cross-tool open standard, read by Codex, Goose, OpenHands and others in one shot.

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

## Manual install (no npx)

Clone or download this repo and copy the skill folder into your agent's skills directory from the table above:

```bash
cp -r src/skill/humanly ~/.claude/skills/        # or any path above
```

That's the whole skill: `src/skill/humanly/SKILL.md`. Edit it freely.

## Honest note on "100%"

A skill loads with high salience, so this gives the strongest adherence a prompt-based approach allows. It is not a hard guarantee that a model never slips. Only a tool-side hook (which every agent implements differently, so it isn't portable) can enforce a rule deterministically. humanly keeps the ruleset tight and lets each agent load it as a skill. Overselling would be the exact thing this tool removes.

## Develop

```bash
npm test
```

Checks that the skill loads with all three pillars, `init` writes one `SKILL.md` per tool without duplicating, the legacy block is migrated, and `remove` deletes only our folder while leaving sibling skills intact.

## License

MIT
