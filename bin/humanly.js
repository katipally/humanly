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

const home = (...p) => path.join(os.homedir(), ...p);

// Project-level catalog (verified file paths, Jun 2026). `pre` = pre-checked in the
// wizard. `detect` flips pre on when the agent's footprint is found. `keywords` make
// an agent findable by brand in search even when it shares a file. `tag` shows a note.
// AGENTS.md is the Linux-Foundation standard read by many tools; agents with their own
// native file get a dedicated entry instead.
const TARGETS = [
  { id: 'agents',   label: 'AGENTS.md — universal standard', file: 'AGENTS.md', pre: true, detect: () => true,
    keywords: 'codex opencode amp sourcegraph zed devin jules factory droid openhands universal standard' },
  { id: 'claude',   label: 'Claude Code', file: 'CLAUDE.md', pre: true, detect: () => true, keywords: 'anthropic claude' },
  { id: 'cursor',   label: 'Cursor', file: '.cursor/rules/humanly.mdc', prefix: CURSOR_PREFIX, keywords: 'cursor', detect: () => exists('.cursor') || exists('.cursorrules') },
  { id: 'copilot',  label: 'GitHub Copilot', file: '.github/copilot-instructions.md', keywords: 'github copilot vscode visual studio', detect: () => exists('.github') },
  { id: 'gemini',   label: 'Gemini CLI', file: 'GEMINI.md', keywords: 'google gemini', detect: () => exists('GEMINI.md') || exists('.gemini') },
  { id: 'windsurf', label: 'Windsurf / Devin Desktop', file: '.windsurf/rules/humanly.md', keywords: 'windsurf devin cascade codeium', detect: () => exists('.windsurf') || exists('.windsurfrules') || exists('.devin') },
  { id: 'cline',    label: 'Cline', file: '.clinerules', keywords: 'cline', detect: () => exists('.clinerules') },
  { id: 'continue', label: 'Continue.dev', file: '.continue/rules/humanly.md', keywords: 'continue', detect: () => exists('.continue') },
  { id: 'augment',  label: 'Augment Code', file: '.augment/rules/humanly.md', keywords: 'augment', detect: () => exists('.augment') || exists('.augment-guidelines') },
  { id: 'kilo',     label: 'Kilo Code', file: '.kilocode/rules/humanly.md', keywords: 'kilo kilocode', detect: () => exists('.kilocode') },
  { id: 'trae',     label: 'Trae', file: '.trae/rules/project_rules.md', keywords: 'trae bytedance', detect: () => exists('.trae') },
  { id: 'junie',    label: 'JetBrains Junie', file: '.junie/AGENTS.md', keywords: 'junie jetbrains intellij', detect: () => exists('.junie') },
  { id: 'warp',     label: 'Warp', file: 'WARP.md', keywords: 'warp terminal', detect: () => exists('WARP.md') },
  { id: 'goose',    label: 'Goose (Block)', file: '.goosehints', keywords: 'goose block', detect: () => exists('.goosehints') },
  { id: 'replit',   label: 'Replit Agent', file: 'replit.md', keywords: 'replit', detect: () => exists('replit.md') || exists('.replit') },
  { id: 'firebase', label: 'Firebase Studio (ex Project IDX)', file: '.idx/airules.md', keywords: 'firebase studio idx project airules google', detect: () => exists('.idx') },
  { id: 'tabnine',  label: 'Tabnine', file: '.tabnine/guidelines/humanly.md', keywords: 'tabnine', detect: () => exists('.tabnine') },
  { id: 'cody',     label: 'Sourcegraph Cody', file: '.sourcegraph/humanly.rule.md', keywords: 'sourcegraph cody', tag: 'enterprise', detect: () => exists('.sourcegraph') },
  { id: 'qodo',     label: 'Qodo (ex CodiumAI)', file: 'best_practices.md', keywords: 'qodo codium', detect: () => exists('best_practices.md') },
  { id: 'aider',    label: 'Aider', file: 'CONVENTIONS.md', keywords: 'aider', tag: 'add to .aider.conf.yml read:', detect: () => exists('.aider.conf.yml') || exists('.aider.conf.yaml') },
  { id: 'roo',      label: 'Roo Code', file: '.roo/rules/humanly.md', keywords: 'roo roocode', tag: 'legacy', detect: () => exists('.roo') || exists('.roorules') },
];

// User-level targets for --global / wizard "machine-wide" (verified home paths).
const GLOBAL_TARGETS = [
  { id: 'claude',   label: 'Claude Code (global)',   file: home('.claude', 'CLAUDE.md'), pre: true, keywords: 'anthropic claude' },
  { id: 'codex',    label: 'Codex (global)',         file: home('.codex', 'AGENTS.md'), pre: true, keywords: 'codex openai agents' },
  { id: 'opencode', label: 'OpenCode (global)',      file: home('.config', 'opencode', 'AGENTS.md'), pre: true, keywords: 'opencode agents' },
  { id: 'amp',      label: 'Amp (global)',           file: home('.config', 'amp', 'AGENTS.md'), keywords: 'amp sourcegraph agents' },
  { id: 'zed',      label: 'Zed (global)',           file: home('.config', 'zed', 'AGENTS.md'), keywords: 'zed agents' },
  { id: 'gemini',   label: 'Gemini CLI (global)',    file: home('.gemini', 'GEMINI.md'), keywords: 'google gemini' },
  { id: 'windsurf', label: 'Windsurf (global)',      file: home('.codeium', 'windsurf', 'memories', 'global_rules.md'), keywords: 'windsurf codeium devin' },
  { id: 'cline',    label: 'Cline (global)',         file: home('Documents', 'Cline', 'Rules', 'humanly.md'), keywords: 'cline' },
  { id: 'augment',  label: 'Augment (global)',       file: home('.augment', 'rules', 'humanly.md'), keywords: 'augment' },
  { id: 'goose',    label: 'Goose (global)',         file: home('.config', 'goose', '.goosehints'), keywords: 'goose block' },
  { id: 'junie',    label: 'Junie (global)',         file: home('.junie', 'AGENTS.md'), keywords: 'junie jetbrains' },
  { id: 'roo',      label: 'Roo Code (global)',      file: home('.roo', 'rules', 'humanly.md'), keywords: 'roo', tag: 'legacy' },
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

function checklist({ message, items, input = process.stdin, output = process.stdout, interactive = input.isTTY, pageSize = 12 }) {
  if (!interactive) return numberedChecklist({ message, items, input, output });
  return new Promise((resolve, reject) => {
    const selected = new Set(items.filter(it => it.checked));
    let query = '';
    let idx = 0;
    let lines = 0;
    rawOn(input);

    const filtered = () => {
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter(it => it.label.toLowerCase().includes(q) || (it.keywords || '').toLowerCase().includes(q));
    };

    const render = () => {
      if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
      const list = filtered();
      if (idx >= list.length) idx = Math.max(0, list.length - 1);
      let start = 0;
      if (list.length > pageSize) start = Math.min(Math.max(0, idx - Math.floor(pageSize / 2)), list.length - pageSize);
      const end = Math.min(list.length, start + pageSize);

      const search = query ? c.cyan(query, output) + c.cyan('▏', output) : c.gray('type to filter…', output);
      let out = `${c.cyan(S.step, output)}  ${c.bold(message, output)}  ${c.gray('(' + selected.size + ' selected)', output)}\n`;
      out += `${c.gray(S.bar, output)}  ${c.gray('search', output)} ${search}\n`;
      if (!list.length) {
        out += `${c.gray(S.bar, output)}  ${c.yellow('no matches — keep typing or ⌫ to clear', output)}\n`;
      } else {
        if (start > 0) out += `${c.gray(S.bar, output)}  ${c.gray('↑ ' + start + ' more', output)}\n`;
        for (let i = start; i < end; i++) {
          const it = list[i];
          const active = i === idx;
          const ptr = active ? c.cyan(S.ptr, output) : ' ';
          const box = selected.has(it) ? c.green(S.on, output) : c.gray(S.off, output);
          const hint = it.hint ? '  ' + c.gray('·' + it.hint + '·', output) : '';
          const label = active ? it.label : (selected.has(it) ? it.label : c.dim(it.label, output));
          out += `${c.gray(S.bar, output)}  ${ptr} ${box} ${label}${hint}\n`;
        }
        if (end < list.length) out += `${c.gray(S.bar, output)}  ${c.gray('↓ ' + (list.length - end) + ' more', output)}\n`;
      }
      out += `${c.gray(S.bar, output)}  ${c.gray('↑↓ move · space pick · type to search · enter ok · esc cancel', output)}\n`;
      output.write(out);
      lines = out.split('\n').length - 1;
    };
    const done = () => {
      rawOff(input, onKey);
      if (lines && output.isTTY) { readline.moveCursor(output, 0, -lines); readline.clearScreenDown(output); }
      const chosen = items.filter(it => selected.has(it));
      const names = chosen.length === 0 ? 'none' : chosen.length <= 4 ? chosen.map(x => x.shortLabel || x.label).join(', ') : chosen.length + ' selected';
      output.write(`${c.green(S.step, output)}  ${c.bold(message, output)}  ${c.gray('· ' + names, output)}\n`);
      resolve(chosen);
    };
    const onKey = (str, key) => {
      key = key || {};
      const list = filtered();
      if (key.name === 'return' || key.name === 'enter') return done();
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) { rawOff(input, onKey); return reject(new CancelError()); }
      else if (key.name === 'up') idx = list.length ? (idx - 1 + list.length) % list.length : 0;
      else if (key.name === 'down') idx = list.length ? (idx + 1) % list.length : 0;
      else if (key.name === 'space') { const it = list[idx]; if (it) selected.has(it) ? selected.delete(it) : selected.add(it); }
      else if (key.name === 'backspace') { query = query.slice(0, -1); idx = 0; }
      else if (str && str.length === 1 && str >= ' ' && !key.ctrl && !key.meta) { query += str; idx = 0; }
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
  const items = catalog.map(t => {
    const detected = scope === 'global' ? homeExists(t.file) : t.detect();
    return {
      ...t,
      checked: t.pre || detected,
      hint: (detected && !t.pre) ? 'detected' : (t.tag || null),
    };
  });
  const selected = await checklist({ message: `Select agents (${scope}) — type to search`, items });
  let chosen = dedupeByFile(selected);
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
