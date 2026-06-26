#!/usr/bin/env node
'use strict';

// Smoke tests: rules load, init writes markers, init is idempotent, remove is clean,
// and HUMANLY.md stays in sync with the source ruleset. Zero deps.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'humanly.js');
const RULES = path.join(ROOT, 'src', 'rules.md');

let passed = 0;
function ok(name) { console.log('  ok  ' + name); passed++; }
function run(args, cwd) { return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }); }

// 1. ruleset loads and carries the hard rules
const rules = fs.readFileSync(RULES, 'utf8');
assert(rules.trim().length > 0, 'rules.md is empty');
assert(/No em dash/i.test(rules), 'missing em dash rule');
assert(/false contrast/i.test(rules), 'missing false-contrast rule');
assert(/LEAN/.test(rules) && /TRUTH/.test(rules), 'missing Lean/Truth pillars');
ok('ruleset loads with Clean/Lean/Truth pillars');

// 2. HUMANLY.md mirrors the source (no drift)
const browsable = fs.readFileSync(path.join(ROOT, 'HUMANLY.md'), 'utf8');
assert.strictEqual(browsable.trim(), rules.trim(), 'HUMANLY.md drifted from src/rules.md');
ok('HUMANLY.md matches src/rules.md');

// scratch project dir
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humanly-test-'));
try {
  // 3. init --all writes a marker block into AGENTS.md and CLAUDE.md
  run(['init', '--all'], dir);
  const agents = path.join(dir, 'AGENTS.md');
  const claude = path.join(dir, 'CLAUDE.md');
  assert(fs.existsSync(agents) && fs.existsSync(claude), 'init did not create files');
  const a1 = fs.readFileSync(agents, 'utf8');
  assert(/humanly:start/.test(a1) && /humanly:end/.test(a1), 'markers missing');
  assert(/No em dash/.test(a1), 'rules not injected');
  ok('init --all writes marker block with rules');

  // 4. init is idempotent (no duplicate block)
  run(['init', '--all'], dir);
  const a2 = fs.readFileSync(agents, 'utf8');
  const count = (a2.match(/humanly:start/g) || []).length;
  assert.strictEqual(count, 1, `expected 1 block, found ${count}`);
  ok('init is idempotent (single block)');

  // 5. preserves user content outside markers
  const userLine = '# My project rules\nAlways use tabs.\n';
  fs.writeFileSync(claude, userLine);
  run(['init', '--only', 'claude'], dir);
  const c = fs.readFileSync(claude, 'utf8');
  assert(c.includes('Always use tabs.'), 'user content lost');
  assert(/humanly:start/.test(c), 'block not appended to existing file');
  ok('preserves existing user content');

  // 6. remove strips the block, keeps user content
  run(['remove', '--all'], dir);
  const cAfter = fs.readFileSync(claude, 'utf8');
  assert(!/humanly:start/.test(cAfter), 'block not removed');
  assert(cAfter.includes('Always use tabs.'), 'user content removed with block');
  ok('remove strips block, keeps user content');

  // 7. rules --out writes a standalone file
  run(['rules', '--out', 'OUT.md'], dir);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'OUT.md'), 'utf8').trim(), rules.trim(), 'rules --out mismatch');
  ok('rules --out writes the ruleset');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed.`);
