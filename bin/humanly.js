#!/usr/bin/env node
'use strict';

// humanly — install one clean/lean/honest writing ruleset into every AI agent's
// instruction file. No vendor bias, npx-only, idempotent.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;
const RULES_PATH = path.join(ROOT, 'src', 'rules.md');

const START = `<!-- humanly:start v${VERSION} -->`;
const NOTE = '<!-- Managed by humanly (npx humanly). Edit outside these markers; this block is overwritten. -->';
const END = '<!-- humanly:end -->';
const BLOCK_RE = /<!-- humanly:start[^>]*-->[\s\S]*?<!-- humanly:end -->/;

// Cursor's modern rule files use frontmatter to apply automatically.
const CURSOR_PREFIX = '---\ndescription: Write clean, lean, honest prose (humanly)\nalwaysApply: true\n---';

// Project-level targets. `always` ones are written on a bare `init`; the rest are
// written when detected, or with --all.
const TARGETS = [
  { id: 'agents',   file: 'AGENTS.md',                         always: true, detect: () => true },
  { id: 'claude',   file: 'CLAUDE.md',                         always: true, detect: () => true },
  { id: 'gemini',   file: 'GEMINI.md',                         detect: () => exists('GEMINI.md') },
  { id: 'copilot',  file: '.github/copilot-instructions.md',   detect: () => exists('.github') },
  { id: 'cursor',   file: '.cursor/rules/humanly.mdc', prefix: CURSOR_PREFIX, detect: () => exists('.cursor') || exists('.cursorrules') },
  { id: 'windsurf', file: '.windsurf/rules/humanly.md',        detect: () => exists('.windsurf') || exists('.windsurfrules') },
  { id: 'cline',    file: '.clinerules',                       detect: () => exists('.clinerules') },
];

// User-level targets for --global.
const GLOBAL_TARGETS = [
  { id: 'claude',   file: path.join(os.homedir(), '.claude', 'CLAUDE.md') },
  { id: 'codex',    file: path.join(os.homedir(), '.codex', 'AGENTS.md') },
  { id: 'opencode', file: path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md') },
  { id: 'gemini',   file: path.join(os.homedir(), '.gemini', 'GEMINI.md') },
];

function exists(rel) {
  try { fs.accessSync(path.resolve(process.cwd(), rel)); return true; } catch { return false; }
}

function loadRules() {
  return fs.readFileSync(RULES_PATH, 'utf8').trim();
}

function makeBlock(body) {
  return `${START}\n${NOTE}\n${body.trim()}\n${END}`;
}

// Insert or replace the humanly block in a file. Never touches content outside the markers.
function injectInto(absPath, body, prefixIfNew) {
  const block = makeBlock(body);
  const existed = fs.existsSync(absPath);
  const content = existed ? fs.readFileSync(absPath, 'utf8') : '';
  let next, action;

  if (BLOCK_RE.test(content)) {
    next = content.replace(BLOCK_RE, block);
    action = 'updated';
  } else if (content.trim()) {
    next = content.replace(/\s*$/, '') + '\n\n' + block + '\n';
    action = 'appended';
  } else {
    next = (prefixIfNew ? prefixIfNew + '\n\n' : '') + block + '\n';
    action = 'created';
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, next);
  return action;
}

function removeFrom(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const content = fs.readFileSync(absPath, 'utf8');
  if (!BLOCK_RE.test(content)) return null;
  const next = content.replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '');
  fs.writeFileSync(absPath, next.trim() ? next : '');
  return 'removed';
}

function resolveTargets(opts) {
  if (opts.global) return GLOBAL_TARGETS;
  let list = TARGETS;
  if (opts.only) list = list.filter(t => t.id === opts.only || t.file === opts.only);
  if (opts.all || opts.only) return list.map(t => ({ ...t, _write: true }));
  // bare init: always-on targets + detected ones
  return list.map(t => ({ ...t, _write: t.always || t.detect() }));
}

function absOf(t) {
  return path.isAbsolute(t.file) ? t.file : path.resolve(process.cwd(), t.file);
}

function cmdInit(opts) {
  const rules = loadRules();
  const targets = resolveTargets(opts);
  const written = [];
  const skipped = [];

  for (const t of targets) {
    if (opts.global || t._write) {
      const action = injectInto(absOf(t), rules, t.prefix);
      written.push(`  ${action.padEnd(8)} ${rel(t)}`);
    } else {
      skipped.push(`  ${t.id} (no ${t.file} or marker dir found)`);
    }
  }

  console.log(`humanly v${VERSION} — installed clean+lean+honest rules into:`);
  console.log(written.join('\n'));
  if (skipped.length && !opts.global) {
    console.log('\nSkipped (not detected, use --all to force):');
    console.log(skipped.join('\n'));
  }
  console.log('\nDone. Open a new agent session to pick up the rules.');
  console.log('Undo anytime with: npx humanly remove');
}

function cmdRemove(opts) {
  // remove from everything we know about, project + (if --global) home
  const list = (opts.global ? GLOBAL_TARGETS : TARGETS).map(t => absOf(t));
  const removed = [];
  for (const abs of list) {
    if (removeFrom(abs)) removed.push('  ' + path.relative(process.cwd(), abs));
  }
  if (removed.length) {
    console.log('humanly — removed the rules block from:');
    console.log(removed.join('\n'));
  } else {
    console.log('humanly — nothing to remove (no managed block found).');
  }
}

function cmdRules(opts) {
  const rules = loadRules();
  if (opts.out) {
    const abs = path.resolve(process.cwd(), opts.out);
    fs.writeFileSync(abs, rules + '\n');
    console.log(`Wrote ${path.relative(process.cwd(), abs)}`);
    return;
  }
  if (opts.copy) {
    if (copyToClipboard(rules)) { console.log('Copied the ruleset to your clipboard. Paste it into any agent.'); return; }
    console.error('Could not access a clipboard tool. Printing instead:\n');
  }
  process.stdout.write(rules + '\n');
}

function cmdList() {
  console.log(`humanly v${VERSION} — a bare \`init\` would write:`);
  for (const t of TARGETS) {
    const on = t.always || t.detect();
    console.log(`  [${on ? 'x' : ' '}] ${t.id.padEnd(9)} ${t.file}`);
  }
  console.log('\n[x] = written on `init`.  Use `init --all` for every target,');
  console.log('`init --global` for user-level files, `init --only <id>` for one.');
}

function copyToClipboard(text) {
  const tools = process.platform === 'darwin'
    ? [['pbcopy', []]]
    : process.platform === 'win32'
      ? [['clip', []]]
      : [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']]];
  for (const [cmd, args] of tools) {
    const r = spawnSync(cmd, args, { input: text });
    if (!r.error && r.status === 0) return true;
  }
  return false;
}

function rel(t) {
  return path.isAbsolute(t.file) ? t.file.replace(os.homedir(), '~') : t.file;
}

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--global' || a === '-g') opts.global = true;
    else if (a === '--copy' || a === '-c') opts.copy = true;
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--version' || a === '-v') opts.version = true;
    else opts._.push(a);
  }
  return opts;
}

const HELP = `humanly v${VERSION} — make every AI agent write clean, lean, honest.

Usage:
  npx humanly init            Install rules into AGENTS.md, CLAUDE.md + detected agents
  npx humanly init --all      Install into every known agent file
  npx humanly init --global   Install into user-level files (~/.claude, ~/.codex, ...)
  npx humanly init --only <id>  Install into one target (agents, claude, cursor, ...)
  npx humanly rules           Print the raw ruleset (copy/paste anywhere)
  npx humanly rules --copy    Copy the ruleset to the clipboard
  npx humanly rules --out HUMANLY.md   Save the ruleset to a file
  npx humanly list            Show what init would write (dry run)
  npx humanly remove          Remove the managed rules block from all files

The same ruleset goes everywhere. AGENTS.md is read by Codex, OpenCode, Amp, Zed,
VS Code and Claude Code (as a fallback); the rest get their native file.`;

function main() {
  const opts = parse(process.argv.slice(2));
  if (opts.version) return console.log(VERSION);
  const cmd = opts._[0];
  if (opts.help || !cmd || cmd === 'help') return console.log(HELP);
  switch (cmd) {
    case 'init': return cmdInit(opts);
    case 'remove': case 'uninstall': return cmdRemove(opts);
    case 'rules': return cmdRules(opts);
    case 'list': return cmdList(opts);
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main();
