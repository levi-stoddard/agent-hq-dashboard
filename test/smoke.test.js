// Smoke test: starts server.js on 127.0.0.1:8765, checks a few pages and API routes, then stops it.
// Uses only Node's built-in test runner (node --test). Port 8765 must be free.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

const BASE = 'http://127.0.0.1:8765';
let child;

before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, HQ_WRITE_SESSION_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 5000);
    child.stdout.on('data', d => { if (String(d).includes('Server live')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error('server exited with code ' + code)); });
  });
});

after(() => { if (child) child.kill(); });

test('serves the 2D and 3D pages', async () => {
  for (const p of ['/', '/prototype3d.html']) {
    const r = await fetch(BASE + p);
    assert.strictEqual(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(await r.text(), /Agent HQ/);
  }
});

test('API routes return sample data', async () => {
  const agents = await (await fetch(BASE + '/api/agents')).json();
  assert.strictEqual(agents.length, 9);
  assert.ok(agents.some(a => a.id === 'ORCHESTRATOR'));
  const jobs = await (await fetch(BASE + '/api/jobs')).json();
  assert.ok(jobs.length > 0);
  const mc = await (await fetch(BASE + '/api/mission-control')).json();
  assert.strictEqual(mc.schema, 'ahq.mission_control.v0.1');
  assert.strictEqual(mc.workforce.orchestrator_bridge_agents.length, 9);
  for (const p of ['/api/worker', '/api/events', '/api/lessons', '/api/briefing', '/api/owner/preferences', '/api/state', '/api/debates']) {
    assert.strictEqual((await fetch(BASE + p)).status, 200, p);
  }
});

test('traversal guard and locked write routes', async () => {
  assert.strictEqual((await fetch(BASE + '/..%2f..%2fserver.js')).status, 403);
  const w = await fetch(BASE + '/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(w.status, 403);
  assert.strictEqual((await w.json()).error, 'UNAUTHENTICATED_WRITE_DISABLED');
  const x = await fetch(BASE + '/api/meetings/query', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://example.com' }, body: '{}' });
  assert.strictEqual(x.status, 403);
});

test('owner authorization is refused by the stub gate', async () => {
  const r = await fetch(BASE + '/api/owner/authorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: 'OWNER_A', challenge_id: 'AUTH-STUB-1' }) });
  assert.strictEqual(r.status, 403);
  assert.strictEqual((await r.json()).success, false);
});
