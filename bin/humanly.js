#!/usr/bin/env node
'use strict';

// humanly — install one clean/lean/honest writing ruleset into every AI agent's
// instruction file. Surgical (append-only, marker-scoped), vendor-neutral, npx-only,
// zero dependencies.

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
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

// Project-level catalog. `pre` = pre-checked in the wizard. `detect` flips pre on
// when the agent's footprint is found. AGENTS.md is the hub many tools read.
const TARGETS = [
  { id: 'agents',   label: 'AGENTS.md hub (Codex, OpenCode, Amp, Zed, Kilo, Trae, Jules)', file: 'AGENTS.md', pre: true, detect: () => true },
  { id: 'claude',   label: 'Claude Code', file: 'CLAUDE.md', pre: true, detect: () => true },
  { id: 'cursor',   label: 'Cursor', file: '.cursor/rules/humanly.mdc', prefix: CURSOR_PREFIX, detect: () => exists('.cursor') || exists('.cursorrules') },
  { id: 'copilot',  label: 'GitHub Copilot', file: '.github/copilot-instructions.md', detect: () => exists('.github') },
  { id: 'gemini',   label: 'Gemini CLI', file: 'GEMINI.md', detect: () => exists('GEMINI.md') || exists('.gemini') },
  { id: 'windsurf', label: 'Windsurf', file: '.windsurf/rules/humanly.md', detect: () => exists('.windsurf') || exists('.windsurfrules') },
  { id: 'cline',    label: 'Cline', file: '.clinerules', detect: () => exists('.clinerules') },
  { id: 'roo',      label: 'Roo Code (legacy)', file: '.roo/rules/humanly.md', detect: () => exists('.roo') || exists('.roorules') },
];

// User-level targets for --global / wizard "machine-wide".
const GLOBAL_TARGETS = [
  { id: 'claude',   label: 'Claude Code (global)',   file: path.join(os.homedir(), '.claude', 'CLAUDE.md'), pre: true },
  { id: 'codex',    label: 'Codex (global)',         file: path.join(os.homedir(), '.codex', 'AGENTS.md'), pre: true },
  { id: 'opencode', label: 'OpenCode (global)',      file: path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md'), pre: true },
  { id: 'gemini',   label: 'Gemini CLI (global)',    file: path.join(os.homedir(), '.gemini', 'GEMINI.md') },
  { id: 'roo',      label: 'Roo Code (global, legacy)', file: path.join(os.homedir(), '.roo', 'rules', 'humanly.md') },
];

class CancelError extends Error {}

// ---------- core: rules + surgical edits ----------

function exists(rel) {
  try { fs.accessSync(path.resolve(process.cwd(), rel)); return true; } catch { return false; }
}

function loadRules() {
  return fs.readFileSync(RULES_PATH, 'utf8').trim();
}

function makeBlock(body) {
  return `${START}\n${NOTE}\n${body.trim()}\n${END}`;
}

// Action a target would take, without writing. 'create' | 'append' | 'update'.
function planAction(absPath) {
  if (!fs.existsSync(absPath)) return 'create';
  const content = fs.readFileSync(absPath, 'utf8');
  if (BLOCK_RE.test(content)) return 'update';
  return content.trim() ? 'append' : 'create';
}

// Insert or replace the humanly block. Never touches content outside the markers.
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

// Strip ONLY our block. Never delete the file or its directory, even if the file
// is now empty — the user may have other content there or want to reuse it. We
// only ever remove our own information, never the file itself.
function removeFrom(absPath) {
  if (!fs.existsSync(absPath)) return null;
  const content = fs.readFileSync(absPath, 'utf8');
  if (!BLOCK_RE.test(content)) return null;

  const next = content
    .replace(BLOCK_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');
  fs.writeFileSync(absPath, next ? next + '\n' : '');
  return 'removed';
}

// ---------- manifest (bookkeeping for exact removal + reproducible re-init) ----------

function manifestPath(scope) {
  return scope === 'global'
    ? path.join(os.homedir(), '.config', 'humanly', 'manifest.json')
    : path.join(process.cwd(), '.humanly.json');
}

function readManifest(scope) {
  try { return JSON.parse(fs.readFileSync(manifestPath(scope), 'utf8')); } catch { return null; }
}

function writeManifest(scope, targets) {
  const mp = manifestPath(scope);
  const data = {
    version: VERSION,
    scope,
    targets: targets.map(t => ({ id: t.id, file: t.file, frontmatter: !!t.prefix })),
  };
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(data, null, 2) + '\n');
}

function clearManifest(scope) {
  try { fs.unlinkSync(manifestPath(scope)); } catch {}
}

// ---------- target resolution ----------

function absOf(file) {
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function customTarget(file, frontmatter) {
  return { id: 'custom', label: 'custom: ' + file, file, prefix: frontmatter ? CURSOR_PREFIX : undefined, custom: true };
}

function displayPath(file) {
  return path.isAbsolute(file) ? file.replace(os.homedir(), '~') : file;
}

// ---------- apply / undo ----------

function applyInstall(scope, targets, styled = false) {
  const rules = loadRules();
  const results = [];
  for (const t of targets) {
    const action = injectInto(absOf(t.file), rules, t.prefix);
    results.push({ action, file: t.file });
  }
  // merge with anything already in the manifest so re-runs don't forget prior targets
  const prev = readManifest(scope);
  const merged = dedupeByFile([...(prev ? prev.targets : []), ...targets.map(t => ({ id: t.id, file: t.file, frontmatter: !!t.prefix }))]);
  writeManifest(scope, merged.map(m => ({ id: m.id, file: m.file, prefix: m.frontmatter ? CURSOR_PREFIX : undefined })));

  if (styled) {
    for (const r of results) gline(`${c.green(S.tick)} ${c.gray(r.action.padEnd(8))} ${displayPath(r.file)}`);
    return;
  }
  console.log(`humanly v${VERSION} — installed clean+lean+honest rules into:`);
  for (const r of results) console.log(`  ${r.action.padEnd(8)} ${displayPath(r.file)}`);
  console.log('\nDone. Open a new agent session to pick up the rules.');
  console.log('Undo anytime with: npx humanly remove');
}

function dedupeByFile(arr) {
  const seen = new Map();
  for (const x of arr) seen.set(absOf(x.file), x);
  return [...seen.values()];
}

// Every place humanly might live, for a given scope: catalog + manifest, that
// actually contain our block right now.
function findInstalled(scope) {
  const catalog = scope === 'global' ? GLOBAL_TARGETS : TARGETS;
  const man = readManifest(scope);
  const candidates = dedupeByFile([
    ...catalog.map(t => ({ id: t.id, file: t.file })),
    ...(man ? man.targets.map(t => ({ id: t.id, file: t.file })) : []),
  ]);
  return candidates.filter(c => {
    const abs = absOf(c.file);
    try { return BLOCK_RE.test(fs.readFileSync(abs, 'utf8')); } catch { return false; }
  });
}

function applyRemove(scope, targets, styled = false) {
  const removed = [];
  for (const t of targets) {
    if (removeFrom(absOf(t.file))) removed.push(displayPath(t.file));
  }
  // update manifest: drop removed entries; clear it if nothing humanly-managed remains
  if (findInstalled(scope).length === 0) clearManifest(scope);
  else {
    const man = readManifest(scope);
    if (man) {
      const goneAbs = new Set(targets.map(t => absOf(t.file)));
      writeManifest(scope, man.targets.filter(t => !goneAbs.has(absOf(t.file)))
        .map(t => ({ id: t.id, file: t.file, prefix: t.frontmatter ? CURSOR_PREFIX : undefined })));
    }
  }
  if (styled) {
    for (const f of removed) gline(`${c.green(S.tick)} ${c.gray('stripped')} ${f}`);
    return;
  }
  if (removed.length) {
    console.log('humanly — removed the rules block from:');
    for (const f of removed) console.log('  ' + f);
  } else {
    console.log('humanly — nothing to remove (no managed block found).');
  }
}

// ---------- zero-dep clack-style UI (TTY arrow-keys, numbered fallback) ----------

const useColor = out => (out || process.stdout).isTTY && !process.env.NO_COLOR;
const paint = (s, code, out) => useColor(out) ? `\x1b[${code}m${s}\x1b[0m` : s;
const c = {
  gray:  (s, o) => paint(s, 90, o),
  cyan:  (s, o) => paint(s, 36, o),
  green: (s, o) => paint(s, 32, o),
  red:   (s, o) => paint(s, 31, o),
  yellow:(s, o) => paint(s, 33, o),
  bold:  (s, o) => paint(s, 1, o),
  dim:   (s, o) => paint(s, 2, o),
};
const S = { top: '┌', bar: '│', end: '└', step: '◇', on: '◉', off: '◯', radioOn: '●', radioOff: '○', ptr: '❯', tick: '✓' };

function intro(title, output = process.stdout) { output.write(`${c.gray(S.top, output)}  ${c.bold(title, output)}\n${c.gray(S.bar, output)}\n`); }
function outro(text, output = process.stdout) { output.write(`${c.gray(S.bar, output)}\n${c.gray(S.end, output)}  ${text}\n`); }
function gline(text = '', output = process.stdout) { output.write(c.gray(S.bar, output) + (text ? '  ' + text : '') + '\n'); }

function rawOn(input) { readline.emitKeypressEvents(input); if (input.isTTY && input.setRawMode) input.setRawMode(true); }
function rawOff(input, onKey) { input.removeListener('keypress', onKey); if (input.isTTY && input.setRawMode) input.setRawMode(false); }

function checklist({ message, items, input = process.stdin, output = process.stdout, interactive = input.isTTY }) {
  if (!interactive) return numberedChecklist({ message, items, input, output });
  return new Promise((resolve, reject) => {
    let idx = 0;
    const state = items.map(it => !!it.checked);
    let lines = 0;
    rawOn(input);

    const render = () => {
      if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
      let out = `${c.cyan(S.step, output)}  ${c.bold(message, output)}  ${c.gray('↑↓ move · space pick · a all · enter ok', output)}\n`;
      items.forEach((it, i) => {
        const active = i === idx;
        const ptr = active ? c.cyan(S.ptr, output) : ' ';
        const box = state[i] ? c.green(S.on, output) : c.gray(S.off, output);
        const hint = it.hint ? '  ' + c.gray('·' + it.hint + '·', output) : '';
        const label = active ? it.label : (state[i] ? it.label : c.dim(it.label, output));
        out += `${c.gray(S.bar, output)}  ${ptr} ${box} ${label}${hint}\n`;
      });
      output.write(out);
      lines = out.split('\n').length - 1;
    };
    const done = () => {
      rawOff(input, onKey);
      if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
      const chosen = items.filter((_, i) => state[i]);
      const names = chosen.map(x => (x.shortLabel || x.label)).join(', ') || 'none';
      output.write(`${c.green(S.step, output)}  ${c.bold(message, output)}  ${c.gray('· ' + names, output)}\n`);
      resolve(chosen);
    };
    const onKey = (str, key) => {
      key = key || {};
      if (key.name === 'up' || key.name === 'k') idx = (idx - 1 + items.length) % items.length;
      else if (key.name === 'down' || key.name === 'j') idx = (idx + 1) % items.length;
      else if (key.name === 'space') state[idx] = !state[idx];
      else if (key.name === 'a') { const all = state.every(Boolean); state.fill(!all); }
      else if (key.name === 'return' || key.name === 'enter') return done();
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { rawOff(input, onKey); return reject(new CancelError()); }
      else return;
      render();
    };
    render();
    input.on('keypress', onKey);
  });
}

function numberedChecklist({ message, items, input, output }) {
  const pre = items.map((it, i) => it.checked ? i + 1 : null).filter(Boolean).join(',');
  gline(c.bold(message, output), output);
  items.forEach((it, i) => gline(`${i + 1}) ${it.label}${it.checked ? '  ' + c.gray('·detected·', output) : ''}`, output));
  return question(`${c.gray(S.bar, output)}  numbers (comma-separated, enter = ${pre || 'none'}): `, input, output)
    .then(ans => {
      const picked = ans.trim() ? ans.split(/[\s,]+/).map(n => parseInt(n, 10) - 1) : items.map((it, i) => it.checked ? i : -1);
      return items.filter((_, i) => picked.includes(i));
    });
}

function select({ message, items, input = process.stdin, output = process.stdout }) {
  if (!input.isTTY) {
    gline(c.bold(message, output), output);
    items.forEach((it, i) => gline(`${i + 1}) ${it.label}`, output));
    return question(`${c.gray(S.bar, output)}  choose (enter = 1): `, input, output).then(a => items[(parseInt(a, 10) || 1) - 1]);
  }
  return new Promise((resolve, reject) => {
    let idx = 0, lines = 0;
    rawOn(input);
    const render = () => {
      if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
      let out = `${c.cyan(S.step, output)}  ${c.bold(message, output)}  ${c.gray('↑↓ move · enter select', output)}\n`;
      items.forEach((it, i) => {
        const active = i === idx;
        const dot = active ? c.green(S.radioOn, output) : c.gray(S.radioOff, output);
        const label = active ? it.label : c.dim(it.label, output);
        out += `${c.gray(S.bar, output)}  ${active ? c.cyan(S.ptr, output) : ' '} ${dot} ${label}\n`;
      });
      output.write(out); lines = out.split('\n').length - 1;
    };
    const onKey = (s, key) => {
      key = key || {};
      if (key.name === 'up' || key.name === 'k') idx = (idx - 1 + items.length) % items.length;
      else if (key.name === 'down' || key.name === 'j') idx = (idx + 1) % items.length;
      else if (key.name === 'return' || key.name === 'enter') {
        rawOff(input, onKey);
        if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
        output.write(`${c.green(S.step, output)}  ${c.bold(message, output)}  ${c.gray('· ' + items[idx].label, output)}\n`);
        return resolve(items[idx]);
      }
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { rawOff(input, onKey); return reject(new CancelError()); }
      else return;
      render();
    };
    render(); input.on('keypress', onKey);
  });
}

function confirm({ message, def = true, input = process.stdin, output = process.stdout }) {
  if (!input.isTTY) return Promise.resolve(def);
  return new Promise(resolve => {
    rawOn(input);
    output.write(`${c.cyan(S.step, output)}  ${c.bold(message, output)} ${c.gray(def ? '(Y/n)' : '(y/N)', output)} `);
    const onKey = (s, key) => {
      key = key || {};
      let v;
      if (key.name === 'y') v = true;
      else if (key.name === 'n') v = false;
      else if (key.name === 'return' || key.name === 'enter') v = def;
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { rawOff(input, onKey); output.write('\n'); return resolve(def); }
      else return;
      rawOff(input, onKey);
      output.write(c.gray(v ? 'yes' : 'no', output) + '\n');
      resolve(v);
    };
    input.on('keypress', onKey);
  });
}

function text({ message, input = process.stdin, output = process.stdout }) {
  output.write(`${c.cyan(S.step, output)}  ${c.bold(message, output)}\n`);
  return question(`${c.gray(S.bar, output)}  `, input, output).then(a => a.trim());
}

function question(q, input, output) {
  const rl = readline.createInterface({ input, output });
  return new Promise(res => rl.question(q, ans => { rl.close(); res(ans); }));
}

// ---------- wizards ----------

async function runInstallWizard(opts) {
  intro(`humanly  ${c.gray('v' + VERSION)}`);
  let scope = opts.global ? 'global' : null;
  if (!scope) {
    const pick = await select({ message: 'Install humanly for', items: [
      { id: 'project', label: 'This project (current folder)' },
      { id: 'global', label: 'Globally (your whole machine)' },
    ] });
    scope = pick.id;
  }

  const catalog = scope === 'global' ? GLOBAL_TARGETS : TARGETS;
  const items = catalog.map(t => ({
    ...t,
    checked: scope === 'global' ? (t.pre || homeExists(t.file)) : (t.pre || t.detect()),
    hint: scope === 'global' ? null : (t.detect() && !t.pre ? 'detected' : (t.id === 'roo' ? 'legacy' : null)),
  }));
  // "Add another agent" is itself a selectable option in the list.
  items.push({ id: '__add__', label: '➕ Add another agent / file not listed…', addMore: true, checked: false });

  const selected = await checklist({ message: `Select agents (${scope})`, items });
  let chosen = selected.filter(s => !s.addMore);

  // selecting the add option opens the custom-file loop
  if (selected.some(s => s.addMore)) {
    while (true) {
      const file = await text({ message: 'Custom file path (relative or absolute)' });
      if (!file) break;
      const fm = await confirm({ message: 'Needs Cursor-style frontmatter?', def: false });
      chosen.push(customTarget(file, fm));
      if (!(await confirm({ message: 'Add another file?', def: false }))) break;
    }
  }

  chosen = dedupeByFile(chosen);
  if (!chosen.length) { outro(c.yellow('Nothing selected. Nothing changed.')); return; }

  // preview
  gline(c.bold('Planned changes'));
  for (const t of chosen) {
    const a = planAction(absOf(t.file));
    const tag = a === 'create' ? c.green('create ') : a === 'update' ? c.cyan('update ') : c.yellow('append ');
    gline(`${tag} ${displayPath(t.file)}`);
  }
  gline();
  if (!(await confirm({ message: 'Proceed?', def: true }))) { outro(c.yellow('Cancelled. Nothing changed.')); return; }

  applyInstall(scope, chosen, true);
  outro(`${c.green('Done.')} Open a new agent session to pick up the rules. Undo: ${c.cyan('npx humanly remove')}`);
}

async function runRemoveWizard(opts) {
  intro(`humanly remove  ${c.gray('v' + VERSION)}`);
  const scopes = opts.global ? ['global'] : ['project', 'global'];
  let found = [];
  for (const s of scopes) found.push(...findInstalled(s).map(t => ({ ...t, scope: s })));
  if (!found.length) { outro('Nothing installed to remove.'); return; }

  const items = found.map(t => ({ ...t, checked: true, label: `${displayPath(t.file)}  ${c.gray('(' + t.scope + ')')}`, shortLabel: displayPath(t.file) }));
  const chosen = await checklist({ message: 'Remove humanly from', items });
  if (!chosen.length) { outro(c.yellow('Nothing selected. Nothing changed.')); return; }
  if (!(await confirm({ message: `Remove from ${chosen.length} file(s)? (only our block; files are kept)`, def: true }))) { outro(c.yellow('Cancelled. Nothing changed.')); return; }

  for (const s of scopes) {
    const forScope = chosen.filter(c2 => c2.scope === s);
    if (forScope.length) applyRemove(s, forScope, true);
  }
  outro(`${c.green('Removed.')} Your files are intact, only humanly's block was stripped.`);
}

function homeExists(file) {
  try { fs.accessSync(file); return true; } catch { return false; }
}

// ---------- commands ----------

function nonInteractiveTargets(opts) {
  const scope = opts.global ? 'global' : 'project';
  const catalog = scope === 'global' ? GLOBAL_TARGETS : TARGETS;
  let known;
  if (opts.only) known = catalog.filter(t => opts.only.includes(t.id));
  else if (opts.all) known = catalog.slice();
  else known = catalog.filter(t => (scope === 'global' ? (t.pre || homeExists(t.file)) : (t.pre || t.detect())));
  const customs = (opts.add || []).map(a => customTarget(a.file, a.fm));
  return { scope, targets: dedupeByFile([...known, ...customs]) };
}

async function cmdInit(opts) {
  const wizard = process.stdin.isTTY && !opts.all && !opts.only && !opts.add && !opts.yes;
  if (wizard) {
    try { await runInstallWizard(opts); }
    catch (e) { if (e instanceof CancelError) console.log('\nCancelled. Nothing changed.'); else throw e; }
    return;
  }
  const { scope, targets } = nonInteractiveTargets(opts);
  if (!process.stdin.isTTY && !opts.all && !opts.only && !opts.add)
    console.log('(no interactive terminal — installing detected defaults; use --all/--only to choose)');
  applyInstall(scope, targets);
}

async function cmdRemove(opts) {
  const wizard = process.stdin.isTTY && !opts.all && !opts.only && !opts.yes;
  if (wizard) {
    try { await runRemoveWizard(opts); }
    catch (e) { if (e instanceof CancelError) console.log('\nCancelled. Nothing changed.'); else throw e; }
    return;
  }
  const scope = opts.global ? 'global' : 'project';
  let targets = findInstalled(scope);
  if (opts.only) targets = targets.filter(t => opts.only.includes(t.id));
  applyRemove(scope, targets);
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
  console.log(`humanly v${VERSION} — agent catalog (project scope):`);
  for (const t of TARGETS) {
    const on = t.pre || t.detect();
    console.log(`  [${on ? 'x' : ' '}] ${t.id.padEnd(9)} ${t.file}${t.detect() && !t.pre ? '  (detected)' : ''}`);
  }
  console.log('\n[x] = pre-selected on a bare `init`. Run `npx humanly` for the wizard,');
  console.log('`init --all` for everything, `init --global` for machine-wide, `init --add <path>` for custom.');
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

function parse(argv) {
  const opts = { _: [], add: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--global' || a === '-g') opts.global = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--copy' || a === '-c') opts.copy = true;
    else if (a === '--out' || a === '-o') opts.out = argv[++i];
    else if (a === '--only') opts.only = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--add') { let v = argv[++i] || ''; const fm = /:fm$/.test(v); if (fm) v = v.replace(/:fm$/, ''); if (v) opts.add.push({ file: v, fm }); }
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--version' || a === '-v') opts.version = true;
    else opts._.push(a);
  }
  if (!opts.add.length) delete opts.add;
  return opts;
}

const HELP = `humanly v${VERSION} — make every AI agent write clean, lean, honest.

  npx humanly                 Interactive wizard: pick scope + agents, then install
  npx humanly init            Same wizard (auto-detects your agents)
  npx humanly init --all      Non-interactive: install into every catalog file
  npx humanly init --only ids Install into specific ones (e.g. --only agents,cursor)
  npx humanly init --global   Machine-wide files (~/.claude, ~/.codex, ~/.config/opencode, ...)
  npx humanly init --add p[:fm]  Add a custom file (':fm' = Cursor-style frontmatter)
  npx humanly remove          Interactive: pick which installs to surgically remove
  npx humanly remove --all    Remove every humanly block it can find
  npx humanly rules [--copy|--out F]  Print/copy/save the raw ruleset
  npx humanly list            Show the agent catalog and what's detected

Surgical: installs append a marked block (never replace your files); remove strips
only that block. AGENTS.md is read by Codex, OpenCode, Amp, Zed, Kilo, Trae and
Claude Code (fallback); the rest get their native file.`;

async function main() {
  const opts = parse(process.argv.slice(2));
  if (opts.version) return console.log(VERSION);
  const cmd = opts._[0];
  if (opts.help) return console.log(HELP);
  if (!cmd) return cmdInit(opts);           // bare `npx humanly` → wizard
  switch (cmd) {
    case 'init': return cmdInit(opts);
    case 'remove': case 'uninstall': return cmdRemove(opts);
    case 'rules': return cmdRules(opts);
    case 'list': return cmdList(opts);
    case 'help': return console.log(HELP);
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

module.exports = { injectInto, removeFrom, planAction, findInstalled, nonInteractiveTargets, checklist, BLOCK_RE, manifestPath, makeBlock };

if (require.main === module) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
