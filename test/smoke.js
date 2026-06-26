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
const SKILL = path.join(ROOT, 'src', 'skill', 'humanly', 'SKILL.md');
const api = require(CLI);

let passed = 0;
function ok(name) { console.log('  ok  ' + name); passed++; }
function run(args, cwd) { return execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }

// 1. skill source has the right frontmatter id + all three pillars
const skill = fs.readFileSync(SKILL, 'utf8');
assert(/name:\s*humanly\b/.test(skill), 'frontmatter name missing');
assert(/No em dash/i.test(skill) && /LEAN/.test(skill) && /TRUTH/.test(skill), 'Clean/Lean/Truth pillars missing');
ok('skill source has frontmatter id + Clean/Lean/Truth pillars');

// the tool that bans em dashes must not ship one. Guard every published file
// (package.json "files": bin, src, README). test/ is not published, so it may keep the
// em dash in its detector regex and legacy fixture below.
for (const rel of ['src/skill/humanly/SKILL.md', 'bin/humanly.js', 'README.md']) {
  assert(!/—/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')), rel + ' contains an em dash');
}
ok('every published file is free of em dashes');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'humanly-test-'));
const orig = process.cwd();
try {
  // 2. init --only writes SKILL.md into each tool's native skills dir + a manifest
  process.chdir(dir);
  run(['init', '--only', 'claude,agents,copilot', '--local', '--yes'], dir);
  const claudeSkill = path.join(dir, '.claude', 'skills', 'humanly', 'SKILL.md');
  const agentsSkill = path.join(dir, '.agents', 'skills', 'humanly', 'SKILL.md');
  const copilotSkill = path.join(dir, '.github', 'skills', 'humanly', 'SKILL.md');
  assert(fs.existsSync(claudeSkill) && /name:\s*humanly/.test(fs.readFileSync(claudeSkill, 'utf8')), '.claude skill not written');
  assert(fs.existsSync(agentsSkill), '.agents skill not written');
  assert(fs.existsSync(copilotSkill), '.github skill not written');
  const man = JSON.parse(fs.readFileSync('.humanly.json', 'utf8'));
  assert(man.skills.length >= 3, 'manifest missing entries');
  ok('init --only writes SKILL.md per tool + manifest');

  // 3. installed file is byte-identical to the source
  assert.strictEqual(fs.readFileSync(claudeSkill, 'utf8'), skill, 'installed skill drifted from source');
  ok('installed SKILL.md matches the source');

  // 4. idempotent — re-run does not duplicate or error
  run(['init', '--only', 'claude', '--local', '--yes'], dir);
  assert.strictEqual(api.planAction(path.join(dir, '.claude', 'skills', 'humanly')), 'update', 'should report update');
  assert.strictEqual(api.planAction(path.join(dir, '.nope', 'skills', 'humanly')), 'create', 'should report create');
  ok('init is idempotent; planAction classifies create/update');

  // 5. legacy migration: an old injected humanly block is stripped on init
  const legacyFile = path.join(dir, 'AGENTS.md');
  const userLine = '# My project rules\n\nAlways use tabs.\n';
  fs.writeFileSync(legacyFile, userLine + '\n<!-- humanly:start v0.2.3 -->\n# humanly — write clean, lean, honest\n- No em dash.\n<!-- humanly:end -->\n');
  run(['init', '--only', 'claude', '--local', '--yes'], dir);
  const sweptAgents = fs.readFileSync(legacyFile, 'utf8');
  assert(!/humanly:start/.test(sweptAgents), 'old injected block should be stripped');
  assert(/Always use tabs/.test(sweptAgents), 'user content around the legacy block must survive');
  ok('init strips the legacy injected block, keeps user content');

  // 6. a sibling skill is left untouched by install and remove
  const sibling = path.join(dir, '.claude', 'skills', 'other', 'SKILL.md');
  fs.mkdirSync(path.dirname(sibling), { recursive: true });
  fs.writeFileSync(sibling, '---\nname: other-skill\n---\nkeep me\n');

  // 7. remove --all deletes ONLY our skill folders, never siblings or the parent dir
  run(['remove', '--all', '--yes'], dir);
  assert(!fs.existsSync(path.join(dir, '.claude', 'skills', 'humanly')), 'our skill folder should be gone');
  assert(fs.existsSync(sibling) && /keep me/.test(fs.readFileSync(sibling, 'utf8')), 'sibling skill must survive remove');
  assert(fs.existsSync(path.join(dir, '.claude', 'skills')), 'skills parent dir must not be pruned');
  assert(!fs.existsSync('.humanly.json'), 'manifest should be cleared when nothing of ours remains');
  ok('remove is surgical: deletes only our folder, keeps siblings + dirs');

  // 8. isOurs guards against deleting a foreign "humanly" folder
  const foreign = path.join(dir, '.cursor', 'skills', 'humanly');
  fs.mkdirSync(foreign, { recursive: true });
  fs.writeFileSync(path.join(foreign, 'SKILL.md'), '---\nname: someone-elses\n---\n');
  assert.strictEqual(api.isOurs(foreign), false, 'foreign folder must not be claimed as ours');
  assert.strictEqual(api.removeSkill(foreign), null, 'removeSkill must refuse a foreign folder');
  assert(fs.existsSync(foreign), 'foreign folder must survive');
  ok('isOurs/removeSkill refuse a foreign humanly folder');

  // helper: drive a checklist via a fake stream and a sequence of key writes
  const drive = (items, keys) => {
    const input = new PassThrough(), output = new PassThrough();
    const p = api.checklist({ message: 'pick', items, input, output, interactive: true });
    setImmediate(() => keys.forEach(k => input.write(k)));
    return p;
  };

  (async () => {
    // 9. checklist: move down to B, space to uncheck, enter
    const sel1 = await drive([{ label: 'A', checked: true }, { label: 'B', checked: true }, { label: 'C', checked: false }],
      ['\x1b[B', ' ', '\r']);
    assert.deepStrictEqual(sel1.map(s => s.label), ['A'], 'toggle wrong: ' + sel1.map(s => s.label));
    ok('stream-driven checklist toggles + confirms');

    // 10. search: type "gem" to filter to Gemini, space to select, enter
    const sel2 = await drive([{ label: 'Cursor' }, { label: 'Gemini CLI', keywords: 'google gemini' }, { label: 'Windsurf' }],
      [...'gem', ' ', '\r']);
    assert.deepStrictEqual(sel2.map(s => s.label), ['Gemini CLI'], 'search wrong: ' + sel2.map(s => s.label));
    ok('checklist search filters then selects');

    process.chdir(orig);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passed} checks passed.`);
  })().catch(e => { console.error('checklist test failed:', e); process.chdir(orig); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
} catch (e) {
  process.chdir(orig);
  fs.rmSync(dir, { recursive: true, force: true });
  throw e;
}
