# humanly

Make every AI agent write **humanly**: clean (no AI tells), lean (fewer tokens), honest.

One tight ruleset, installed into every agent's instruction file with a single command. No plugin, no vendor lock-in, no Claude bias. Works in Claude Code, Codex, OpenCode, Cursor, Copilot, Gemini CLI, Windsurf, Cline, and anything that reads `AGENTS.md`.

```bash
npx humanly init
```

## Why

AI writing has tells. Em dashes everywhere, "it's not just X, it's Y", "delve", "leverage", walls of bold, three-item lists for everything, a paragraph of preamble before the actual answer. It reads like a robot and it burns tokens.

`humanly` ships one ruleset built around three pillars:

- **Clean** — strip the artifacts that flag text as AI (em dash, false contrast, rule-of-three, AI-vocab, over-bolding).
- **Lean** — answer first, cut filler and hedging, say it in the fewest tokens that stay correct. Less bloat means lower cost.
- **Truth** — no invented facts, numbers, or sources. Say "unsure" instead of guessing confidently.

It doesn't run the model or rewrite output. It puts the rules where the agent already looks: its instruction file, loaded every turn.

## Use it

**1. Install into this project**

```bash
npx humanly init
```

Writes the rules into `AGENTS.md` and `CLAUDE.md`, plus any other agent files it detects (`.cursor/`, `.github/`, `.windsurf/`, `.clinerules`, `GEMINI.md`). Open a new agent session and it writes clean from the first token.

```bash
npx humanly init --all       # every known agent file, detected or not
npx humanly init --global    # user-level: ~/.claude, ~/.codex, ~/.config/opencode, ~/.gemini
npx humanly init --only cursor
npx humanly list             # dry run: show what init would write
```

**2. Copy the rules by hand (any agent, even unsupported ones)**

```bash
npx humanly rules --copy     # to clipboard, paste into the tool's system prompt
npx humanly rules            # print to stdout
npx humanly rules --out HUMANLY.md
```

Or just open [`HUMANLY.md`](./HUMANLY.md) and paste it anywhere.

**3. Undo**

```bash
npx humanly remove
```

Strips only the managed block (between `<!-- humanly:start -->` and `<!-- humanly:end -->`). Your own content stays.

## Where it writes

`AGENTS.md` is the hub. Most agents read it natively, and Claude Code falls back to it. A few tools want their own file, so `humanly` writes those too.

| Agent | File |
|---|---|
| Codex, OpenCode, Amp, Zed, VS Code, Jules | `AGENTS.md` |
| Claude Code | `CLAUDE.md` (also reads `AGENTS.md`) |
| OpenCode (global) | `~/.config/opencode/AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/humanly.mdc` |
| Windsurf | `.windsurf/rules/humanly.md` |
| Cline | `.clinerules` |

Installs are idempotent. Re-running `init` updates the block in place, never duplicates it.

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
