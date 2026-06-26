#!/usr/bin/env node
'use strict';

// Smoke tests. Pure logic + non-interactive CLI paths + one stream-driven checklist.
// Zero deps. The arrow-key UI itself is verified manually in a real terminal.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { execFileSync } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'humanly.js');
const RULES = path.join(ROOT, 'src', 'rules.md');
const api = require(CLI);

let passed = 0;
function ok(name) { console.log('  ok  ' + name); passed++; }
function run(args, cwd) { return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

// 1. ruleset loads with all three pillars
const rules = fs.readFileSync(RULES, 'utf8');
assert(/No em dash/i.test(rules) && /LEAN/.test(rules) && /TRUTH/.test(rules), 'pillars missing');
ok('ruleset loads with Clean/Lean/Truth pillars');

// 2. HUMANLY.md mirrors the source
assert.strictEqual(fs.readFileSync(path.join(ROOT, 'HUMANLY.md'), 'utf8').trim(), rules.trim(), 'HUMANLY.md drifted');
ok('HUMANLY.md matches src/rules.md');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humanly-test-'));
const orig = process.cwd();
try {
  // 3. init --all + custom --add writes blocks and a manifest
  process.chdir(dir);
  run(['init', '--all', '--add', './extra.md:fm', '--yes'], dir);
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert(/humanly:start/.test(agents) && /No em dash/.test(agents), 'AGENTS.md not written');
  const extra = fs.readFileSync('extra.md', 'utf8');
  assert(/alwaysApply: true/.test(extra) && /humanly:start/.test(extra), 'custom --add:fm missing frontmatter/block');
  const man = JSON.parse(fs.readFileSync('.humanly.json', 'utf8'));
  assert(man.targets.some(t => t.file === './extra.md'), 'manifest missing custom target');
  ok('init --all --add writes blocks + manifest');

  // 4. idempotent
  run(['init', '--all', '--yes'], dir);
  assert.strictEqual((fs.readFileSync('AGENTS.md', 'utf8').match(/humanly:start/g) || []).length, 1, 'duplicate block');
  ok('init is idempotent');

  // 5. surgical: existing user content preserved, byte-identical after remove
  const userContent = '# My rules\n\nAlways use tabs.\n';
  fs.writeFileSync('CLAUDE.md', userContent);
  run(['init', '--only', 'claude', '--yes'], dir);
  assert(/Always use tabs/.test(fs.readFileSync('CLAUDE.md', 'utf8')), 'user content lost on install');
  ok('install preserves existing user content');

  // 6. planAction reports create/append/update correctly
  assert.strictEqual(api.planAction(path.join(dir, 'CLAUDE.md')), 'update', 'should be update');
  assert.strictEqual(api.planAction(path.join(dir, 'does-not-exist.md')), 'create', 'should be create');
  ok('planAction classifies create/append/update');

  // 7. remove --all: strips ONLY our block; never deletes any user file or dir.
  assert(fs.existsSync(path.join(dir, '.cursor', 'rules', 'humanly.mdc')), 'cursor file should exist pre-remove');
  run(['remove', '--all', '--yes'], dir);
  assert(fs.existsSync('AGENTS.md'), 'a file we created must NOT be deleted on remove');
  assert(!/humanly:start/.test(fs.readFileSync('AGENTS.md', 'utf8')), 'our block should be stripped from AGENTS.md');
  assert(fs.existsSync(path.join(dir, '.cursor', 'rules')), 'a dir we created must NOT be pruned');
  assert(!/humanly:start/.test(fs.readFileSync(path.join(dir, '.cursor', 'rules', 'humanly.mdc'), 'utf8')), 'block stripped from cursor file');
  assert.strictEqual(fs.readFileSync('CLAUDE.md', 'utf8'), userContent, 'user file not byte-identical after remove');
  assert(!fs.existsSync('.humanly.json'), 'manifest (our own bookkeeping file) should be cleared');
  ok('remove is surgical: strips only our block, never deletes files or dirs, user content intact');

  // 8. stream-driven checklist: toggle item 2 off, confirm with enter
  const input = new PassThrough();
  const output = new PassThrough();
  const items = [{ label: 'A', checked: true }, { label: 'B', checked: true }, { label: 'C', checked: false }];
  const p = api.checklist({ message: 'pick', items, input, output, interactive: true });
  // move down to B, space to uncheck, enter
  setImmediate(() => { input.write('\x1b[B'); input.write(' '); input.write('\r'); });
  p.then(sel => {
    assert.deepStrictEqual(sel.map(s => s.label), ['A'], 'checklist selection wrong: ' + sel.map(s => s.label));
    process.chdir(orig);
    fs.rmSync(dir, { recursive: true, force: true });
    ok('stream-driven checklist toggles + confirms');
    console.log(`\n${passed} checks passed.`);
  }).catch(e => { console.error('checklist test failed:', e); process.exit(1); });
} catch (e) {
  process.chdir(orig);
  fs.rmSync(dir, { recursive: true, force: true });
  throw e;
}
