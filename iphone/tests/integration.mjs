import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
const local = async (command, more = {}) => {
  const r = await fetch('http://127.0.0.1:4310/local', {
    method: 'POST',
    body: JSON.stringify({ command, ...more }),
  });
  const d = await r.json();
  if (d.error) throw Error(d.error);
  return d;
};
const token = await fs.readFile('runtime/blender-token', 'utf8');
const blender = async (d) => {
  const r = await fetch('http://127.0.0.1:4311/command', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(d),
  });
  const out = await r.json();
  if (out.error) throw Error(out.error);
  return out.result;
};
const original = await blender({ action: 'inspect' });
await blender({ action: 'begin' });
try {
  let r = await blender({
    action: 'execute',
    revision: original.revision,
    code: "bpy.ops.mesh.primitive_uv_sphere_add(location=(0,0,0))\nbpy.context.object.name='Airspace_Integration_Sphere'",
    frame: true,
  });
  assert(r.scene.objects.some((o) => o.name === 'Airspace_Integration_Sphere'));
  await assert.rejects(
    blender({ action: 'execute', revision: original.revision, code: 'pass' }),
    /Scene changed/,
  );
  const revision = r.scene.revision;
  await assert.rejects(
    blender({
      action: 'execute',
      revision,
      code: "bpy.data.objects.remove(bpy.data.objects['Airspace_Integration_Sphere'],do_unlink=True)\nraise Exception('rollback probe')",
    }),
    /rollback probe/,
  );
  r = await blender({ action: 'inspect' });
  assert(r.objects.some((o) => o.name === 'Airspace_Integration_Sphere'));
  assert(r.revision > revision);
  const img = await blender({ action: 'image' });
  assert(img.image.startsWith('data:image/png;base64,'));
  console.log(
    'PASS Blender general Python, stale revision, rollback and actual viewport image',
  );
} finally {
  await blender({ action: 'undo' });
}
const restored = await blender({ action: 'inspect' });
assert.deepEqual(
  restored.objects.map((o) => o.name).sort(),
  original.objects.map((o) => o.name).sort(),
);
console.log('PASS Blender request-level undo');
const s = await local('bootstrap');
const phone = new URL(s.phoneUrl);
const params = new URLSearchParams(phone.hash.slice(1));
const ws = new WebSocket('ws://127.0.0.1:4310/live');
await new Promise((resolve, reject) => {
  ws.once('open', () =>
    ws.send(
      JSON.stringify({ type: 'join', id: s.id, token: params.get('token') }),
    ),
  );
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type === 'joined') resolve();
  });
  ws.on('error', reject);
});
const times = [];
for (let i = 0; i < 10; i++) {
  const start = performance.now();
  const pong = new Promise((resolve) => {
    const fn = (raw) => {
      if (JSON.parse(raw).type === 'pong') {
        ws.off('message', fn);
        resolve();
      }
    };
    ws.on('message', fn);
  });
  ws.send(JSON.stringify({ type: 'ping', at: start }));
  await pong;
  times.push(performance.now() - start);
}
console.log(
  'PASS authenticated phone WebSocket; local median ' +
    times.sort((a, b) => a - b)[5].toFixed(1) +
    'ms',
);
ws.close();
const unauthorized = await fetch('http://127.0.0.1:4310/local', {
  method: 'POST',
  headers: { Origin: 'https://untrusted.example' },
  body: '{}',
});
assert.equal(unauthorized.status, 403);
console.log('PASS cross-origin local access rejected');
