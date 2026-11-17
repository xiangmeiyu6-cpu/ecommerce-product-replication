import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialize } from '../skill/scripts/init_feishu_base.mjs';
const templateRoot = fileURLToPath(new URL('../skill/assets/feishu-base-template-v2/', import.meta.url));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read(path.join(templateRoot, 'template-manifest.json'));
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'epr-feishu-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'manager with spaces', 'config.local.json');
  const bases = new Map(), calls = [];
  let user = 'user-alice', available = true, broken = null;
  function base(token) { const value = bases.get(token); assert.ok(value, `Unexpected Base access: ${token}`); return value; }
  function table(args) { return base(value(args, '--base-token')).tables.find(t => t.id === value(args, '--table-id')); }
  function value(args, name) { return args[args.indexOf(name) + 1]; }
  function spawn(exe, args) {
    // Exercise the actual Windows shim selection too. No shell parsing is used.
    if (exe === 'where.exe') return { status: 0, stdout: path.join(directory, 'lark-cli.cmd') + '\n' };
    if (exe === process.execPath) args = args.slice(1);
    calls.push(args);
    if (broken && broken(args)) return { status: 4, stderr: JSON.stringify({ ok: false, error: { type: 'authorization', message: 'permission_denied' } }) };
    let data;
    const action = args[1];
    if (args[0] === 'whoami') return { status: 0, stdout: JSON.stringify({ identity: value(args, '--as'), available, profile: 'test-profile', brand: 'feishu', appId: 'test-app', onBehalfOf: { openId: user } }) };
    if (action === '+base-create') {
      const token = `OWNED_${bases.size + 1}`;
      const first = { id: 'tbl0', name: value(args, '--table-name'), fields: JSON.parse(value(args, '--fields')), views: [{ id: 'vew0', name: '表格', type: 'grid' }] };
      bases.set(token, { owner: user, tables: [first] }); data = { base_token: token };
    } else if (action === '+table-create') {
      const tables = base(value(args, '--base-token')).tables;
      tables.push({ id: `tbl${tables.length}`, name: value(args, '--name'), fields: JSON.parse(value(args, '--fields')), views: [{ id: 'vew0', name: '表格', type: 'grid' }] }); data = {};
    } else if (action === '+table-list') data = { tables: base(value(args, '--base-token')).tables.map(({ id, name }) => ({ id, name })) };
    else if (action === '+field-list') data = { fields: table(args).fields };
    else if (action === '+view-list') data = { views: table(args).views };
    else if (action === '+view-create') {
      const views = table(args).views, config = JSON.parse(value(args, '--json'));
      const view = { ...config, id: `vew${views.length}` }; views.push(view); data = { view };
    } else if (action.startsWith('+view-set-')) {
      Object.assign(table(args).views.find(v => v.id === value(args, '--view-id')), JSON.parse(value(args, '--json'))); data = {};
    } else if (action === '+view-get-visible-fields') data = { visible_fields: table(args).fields.map(f => f.name) };
    else assert.fail(`Unexpected CLI request: ${args.join(' ')}`); // Includes title searches and business writes.
    return { status: 0, stdout: JSON.stringify({ ok: true, identity: 'user', data }) };
  }
  fs.mkdirSync(path.join(directory, 'node_modules/@larksuite/cli/scripts'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'node_modules/@larksuite/cli/scripts/run.js'), '');
  const invoke = (args = []) => initialize(['ensure', '--config', config, ...args], { spawnSync: spawn });
  const writes = () => calls.filter(a => /create|set-/.test(a[1])).length;
  return { config, bases, calls, invoke, writes, setUser: v => { user = v; }, setAvailable: v => { available = v; }, breakWhen: v => { broken = v; } };
}
test('first use creates the exact seven-table template and persists an account binding', t => {
  const f = fixture(t), result = f.invoke();
  assert.equal(result.created, true); assert.equal(result.validation.compatible, true);
  const live = f.bases.get(result.base_token);
  assert.deepEqual(live.tables.map(t => t.name), manifest.tables.map(t => t.name));
  for (const [i, table] of live.tables.entries()) assert.deepEqual(table.fields, read(path.join(templateRoot, manifest.tables[i].schema)));
  for (const view of manifest.views) {
    const liveView = live.tables.find(t => t.name === view.table).views.find(v => v.name === view.name);
    const layout = read(path.join(templateRoot, view.layout));
    assert.deepEqual(liveView.visible_fields, layout.visible_fields);
    assert.deepEqual(liveView.sort_config, layout.sort_config ?? []);
    for (const [key, value] of Object.entries(read(path.join(templateRoot, view.filter)))) assert.deepEqual(liveView[key], value);
  }
  assert.equal(Object.keys(read(f.config).feishu_bindings).length, 1);
  assert.equal(f.calls.some(a => a[1] === '+title-resolve'), false);
});
test('repeat runs reuse the same account library without any create or schema writes', t => {
  const f = fixture(t), first = f.invoke(), before = f.writes(), second = f.invoke();
  assert.equal(second.base_token, first.base_token); assert.equal(second.created, false); assert.equal(f.writes(), before);
});
test('copied legacy author base_token is ignored and unrelated configuration is preserved', t => {
  const f = fixture(t); fs.mkdirSync(path.dirname(f.config), { recursive: true });
  fs.writeFileSync(f.config, JSON.stringify({ base_token: 'AUTHORS_SHARED_LIBRARY', auto_update: false, work_directory: 'keep-business' }));
  const result = f.invoke(); assert.equal(result.legacy_unbound_target_ignored, true); assert.notEqual(result.base_token, 'AUTHORS_SHARED_LIBRARY');
  assert.equal(read(f.config).base_token, 'AUTHORS_SHARED_LIBRARY'); assert.equal(read(f.config).auto_update, false); assert.equal(read(f.config).work_directory, 'keep-business');
  assert.equal(f.calls.some(a => a.includes('AUTHORS_SHARED_LIBRARY')), false);
});
test('switching user creates an independent library; switching back restores the first binding', t => {
  const f = fixture(t), alice = f.invoke(); f.setUser('user-bob'); const bob = f.invoke();
  assert.notEqual(alice.base_token, bob.base_token); f.setUser('user-alice'); assert.equal(f.invoke().base_token, alice.base_token);
  assert.equal(f.bases.size, 2); assert.equal(Object.keys(read(f.config).feishu_bindings).length, 2);
});
test('copied identity-bound configuration never reuses the other user library', t => {
  const f = fixture(t), author = f.invoke(); f.setUser('another-student'); const student = f.invoke();
  assert.notEqual(author.base_token, student.base_token); assert.equal(f.bases.get(student.base_token).owner, 'another-student');
});
test('unauthenticated identity stops before writing configuration or creating anything', t => {
  const f = fixture(t); f.setAvailable(false); assert.throws(() => f.invoke(), /Authorize/); assert.equal(f.writes(), 0); assert.equal(fs.existsSync(f.config), false);
});
test('explicitly selected compatible team library is bound to this account only', t => {
  const f = fixture(t), team = f.invoke(); f.setUser('team-member'); const before = f.writes();
  assert.equal(f.invoke(['--base-token', team.base_token]).base_token, team.base_token); assert.equal(f.writes(), before);
  assert.equal(f.invoke().base_token, team.base_token);
});
test('incompatible explicit library is rejected without altering it or persisting a binding', t => {
  const f = fixture(t); f.bases.set('BAD_BASE', { tables: [] });
  assert.throws(() => f.invoke(['--base-token', 'BAD_BASE']), /incompatible/); assert.equal(f.writes(), 0); assert.equal(fs.existsSync(f.config), false);
});
test('lost base-create response is not retried on the next ensure', t => {
  const f = fixture(t); f.breakWhen(a => a[1] === '+base-create'); assert.throws(() => f.invoke(), /lark-cli failed/);
  f.breakWhen(null); assert.throws(() => f.invoke(), /unresolved/); assert.equal(f.calls.filter(a => a[1] === '+base-create').length, 1);
});
test('interrupted table initialization resumes the same Base without duplicate creation', t => {
  const f = fixture(t); let failed = false;
  f.breakWhen(a => { if (!failed && a[1] === '+table-list') { failed = true; return true; } return false; });
  assert.throws(() => f.invoke(), /lark-cli failed/); f.breakWhen(null);
  const result = f.invoke(); assert.equal(result.resumed, true); assert.equal(result.validation.compatible, true); assert.equal(f.bases.size, 1);
  assert.equal(f.calls.filter(a => a[1] === '+base-create').length, 1);
});
test('interrupted view configuration resumes the same seven tables and views', t => {
  const f = fixture(t); f.breakWhen(a => a[1] === '+view-set-filter'); assert.throws(() => f.invoke(), /lark-cli failed/);
  f.breakWhen(null); f.invoke(); assert.equal(f.bases.size, 1);
  for (const table of f.bases.values().next().value.tables) assert.equal(table.views.length, 2);
});
test('bound Base access errors stop; do not fall back to creating another library', t => {
  const f = fixture(t); f.invoke(); f.breakWhen(a => a[1] === '+table-list'); assert.throws(() => f.invoke(), /lark-cli failed/);
  assert.equal(f.calls.filter(a => a[1] === '+base-create').length, 1);
});
test('dry run and plan do not create a library or modify configuration', t => {
  const f = fixture(t); f.invoke(['--dry-run']); assert.equal(f.writes(), 0); assert.equal(fs.existsSync(f.config), false);
  assert.equal(initialize(['plan']).tables.length, 7);
});
test('concurrent initialization is rejected before any remote writes', t => {
  const f = fixture(t); fs.mkdirSync(`${f.config}.feishu-init-lock`, { recursive: true });
  assert.throws(() => f.invoke(), /Another Feishu initializer/); assert.equal(f.writes(), 0);
});
