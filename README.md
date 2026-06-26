# humanly

Make every AI agent write **humanly**: clean (no AI tells), lean (fewer tokens), honest.

One tight ruleset, installed into every agent's instruction file with a single command. No plugin, no vendor lock-in, no Claude bias. Works in Claude Code, Codex, OpenCode, Cursor, Copilot, Gemini CLI, Windsurf, Cline, Kilo, Trae, and anything that reads `AGENTS.md`.

```bash
npx humanly
```

That opens a short wizard: pick scope (this project or your whole machine), then pick agents from the full catalog — **start typing to search** it, detected agents are pre-checked, preview the changes, confirm. Zero dependencies, nothing to download.

## Why

AI writing has tells. Em dashes everywhere, "it's not just X, it's Y", "delve", "leverage", walls of bold, three-item lists for everything, a paragraph of preamble before the actual answer. It reads like a robot and it burns tokens.

`humanly` ships one ruleset built around three pillars:

- **Clean** — strip the artifacts that flag text as AI (em dash, false contrast, rule-of-three, AI-vocab, over-bolding).
- **Lean** — answer first, cut filler and hedging, say it in the fewest tokens that stay correct. Less bloat means lower cost.
- **Truth** — no invented facts, numbers, or sources. Say "unsure" instead of guessing confidently.

It doesn't run the model or rewrite output. It puts the rules where the agent already looks: its instruction file, loaded every turn.

## Use it

**1. The wizard (recommended)**

```bash
npx humanly
```

```
┌  humanly  v0.2.3
│
◇  Install humanly for  ↑↓ move · enter select
│  ❯ ● This project (current folder)
│    ○ Globally (your whole machine)
│
◇  Select agents (project) — type to search  (2 selected)
│  search kilo▏
│  ❯ ◯ Kilo Code
│  ↑↓ move · space pick · type to search · enter ok · esc cancel
│
└  Done. Open a new agent session to pick up the rules.
```

It lists every agent in the catalog and pre-checks the ones you already use. The list is long, so **just start typing to filter** it (by name or brand — "codex", "warp", "junie"…), `space` to pick, `enter` to confirm. It shows a preview (`create` / `append to` / `update in`) before writing anything.

**Scriptable flags** (no prompts, for CI or dotfiles):

```bash
npx humanly init --all              # every catalog file
npx humanly init --only agents,cursor
npx humanly init --global           # ~/.claude, ~/.codex, ~/.config/opencode, ~/.gemini
npx humanly init --add ./STYLE.md   # a custom file (append :fm for Cursor-style frontmatter)
npx humanly init --all --yes        # skip the confirm
npx humanly list                    # show the catalog and what's detected
```

**2. Copy the rules by hand (any agent, even unsupported ones)**

```bash
npx humanly rules --copy     # to clipboard, paste into the tool's system prompt
npx humanly rules            # print to stdout
npx humanly rules --out HUMANLY.md
```

Or just open [`HUMANLY.md`](./HUMANLY.md) and paste it anywhere.

**3. Undo (surgical)**

```bash
npx humanly remove           # wizard: lists only real installs, you pick which
npx humanly remove --all --yes
```

Remove scans everywhere humanly actually lives, then strips **only** its own block. It **never deletes your files or folders** — even a file humanly created is left in place (just emptied) for you to keep or delete. A file with your own content comes back byte-for-byte identical.

## Where it writes

`AGENTS.md` is the hub. Most agents read it natively, and Claude Code falls back to it. A few tools want their own file, so `humanly` writes those too.

| Agent | File |
|---|---|
| Codex, OpenCode, Amp, Zed, Devin, Jules, Factory, OpenHands | `AGENTS.md` (Linux-Foundation standard) |
| Claude Code | `CLAUDE.md` |
| Cursor | `.cursor/rules/humanly.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf / Devin Desktop | `.windsurf/rules/humanly.md` |
| Cline | `.clinerules` |
| Continue.dev | `.continue/rules/humanly.md` |
| Augment Code | `.augment/rules/humanly.md` |
| Kilo Code | `.kilocode/rules/humanly.md` |
| Trae | `.trae/rules/project_rules.md` |
| JetBrains Junie | `.junie/AGENTS.md` |
| Warp | `WARP.md` |
| Goose | `.goosehints` |
| Replit Agent | `replit.md` |
| Firebase Studio (ex Project IDX) | `.idx/airules.md` |
| Tabnine | `.tabnine/guidelines/humanly.md` |
| Sourcegraph Cody | `.sourcegraph/humanly.rule.md` |
| Qodo | `best_practices.md` |
| Aider | `CONVENTIONS.md` (also add it under `read:` in `.aider.conf.yml`) |
| Roo Code (legacy) | `.roo/rules/humanly.md` |
| anything else | `npx humanly init --add <path>` |

File paths verified as of June 2026. Global (`--global`) writes the user-level equivalents (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`, `~/.config/amp/AGENTS.md`, `~/.config/zed/AGENTS.md`, `~/.gemini/GEMINI.md`, and more). Installs are idempotent — re-running `init` updates the block in place, never duplicates it.

## Safe by design

humanly only ever touches its own marked block. Install **appends** (and creates a file only when one doesn't exist); it never replaces or rewrites your existing instructions, comments, or frontmatter. Remove strips only that block and **never deletes a file or folder** — your content comes back byte-identical, and a file humanly created is simply left empty for you to keep or remove. A small `.humanly.json` records what was installed so removal is precise (delete it anytime; remove still scans the catalog as a fallback).

## Honest note on "100%"

Instruction files load into context every turn, so this gives the highest adherence each tool allows. It is not a guarantee that a model never slips. `humanly` writes each agent's strongest native file and keeps the ruleset tight so it stays in context. If a tool ignores its own rules file, no installer can fix that. (Overselling would be the exact thing this tool removes.)

## How it stays cheap

The ruleset is ~30 lines, a fixed per-session cost that most agents prompt-cache after the first turn. The Lean rules cut far more output tokens than the ruleset adds, so the net token effect is positive.

## Develop

```bash
npm test
```

Checks that the ruleset loads, `init` writes and updates markers without duplicating, `remove` keeps user content, and `HUMANLY.md` stays in sync with `src/rules.md`.

## License

MIT
