import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
const post = async (command, data = {}) => {
  const r = await fetch('http://127.0.0.1:4310/local', {
    method: 'POST',
    body: JSON.stringify({ command, ...data }),
  });
  const d = await r.json();
  if (d.error) throw Error(d.error);
  return d;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const s = await post('bootstrap');
assert(!s.busy, 'Wait for model request to complete');
const hash = new URLSearchParams(new URL(s.phoneUrl).hash.slice(1));
const ws = new WebSocket('ws://127.0.0.1:4310/live');
await new Promise((resolve, reject) => {
  ws.once('open', () =>
    ws.send(
      JSON.stringify({ type: 'join', id: s.id, token: hash.get('token') }),
    ),
  );
  ws.on('message', (raw) => {
    if (JSON.parse(raw).type === 'joined') resolve();
  });
  ws.on('error', reject);
});
const send = (m) => ws.send(JSON.stringify(m));
await post('mode', { mode: 'canvas' });
const before = await post('inspect');
assert(before.elements?.length >= 0, 'Canvas host ready');
send({ type: 'tool', tool: 'draw' });
send({ type: 'pointer', x: 0.3, y: 0.65 });
send({ type: 'down' });
for (let i = 0; i < 20; i++) {
  send({
    type: 'pointer',
    x: 0.3 + i * 0.012,
    y: 0.65 + Math.sin(i * 0.3) * 0.04,
  });
  await pause(12);
}
send({ type: 'up' });
await pause(250);
const after = await post('inspect');
const stroke = after.elements.find(
  (e) => !before.elements.some((b) => b.id === e.id),
);
assert.equal(stroke?.type, 'freedraw');
assert(stroke.points.length > 10);
console.log(
  'PASS phone gesture creates actual editable Excalidraw freehand element',
);
send({ type: 'tool', tool: 'lasso' });
send({ type: 'pointer', x: 0.03, y: 0.2 });
send({ type: 'down' });
for (const [x, y] of [
  [0.97, 0.2],
  [0.97, 0.95],
  [0.03, 0.95],
  [0.03, 0.2],
]) {
  send({ type: 'pointer', x, y });
  await pause(30);
}
send({ type: 'up' });
await pause(200);
const selected = await post('inspect');
assert(selected.selected.length > 0);
console.log('PASS lasso selects actual canvas element IDs');
await post('undo');
await pause(200);
const undone = await post('inspect');
assert.equal(undone.elements.length, before.elements.length);
console.log('PASS phone-drawn stroke undo');
await post('mode', { mode: 'studio' });
const initial = await post('inspect');
send({ type: 'tool', tool: 'draw' });
send({ type: 'pointer', x: 0.35, y: 0.4 });
send({ type: 'down' });
for (let i = 0; i < 20; i++) {
  send({
    type: 'pointer',
    x: 0.35 + i * 0.008,
    y: 0.4 + Math.sin(i * 0.3) * 0.05,
  });
  await pause(20);
}
send({ type: 'up' });
await pause(500);
const sketch = await post('inspect');
assert.equal(sketch.objects.length, initial.objects.length + 1);
assert(
  sketch.objects.find((o) => o.name.startsWith('Sketch') && o.type === 'CURVE'),
);
console.log('PASS phone drawing creates editable Blender 3D curve');
await post('undo');
const restored = await post('inspect');
assert.equal(restored.objects.length, initial.objects.length);
console.log('PASS 3D sketch undo');
send({ type: 'tool', tool: 'orbit' });
send({ type: 'pointer', x: 0.5, y: 0.5 });
send({ type: 'down' });
await pause(50);
send({ type: 'pointer', x: 0.55, y: 0.51 });
await pause(60);
send({ type: 'up' });
await pause(200);
const rotated = await post('inspect');
assert.notDeepEqual(rotated.view.rotation, restored.view.rotation);
console.log('PASS phone orbit changes the native viewport');
send({ type: 'tool', tool: 'point' });
let point;
for (const [x, y] of [
  [0.5, 0.5],
  [0.5, 0.65],
  [0.35, 0.5],
  [0.65, 0.5],
  [0.5, 0.8],
  [0.3, 0.7],
  [0.7, 0.7],
]) {
  send({ type: 'pointer', x, y });
  await pause(80);
  point = await post('inspect');
  if (point.hover) break;
}
assert(point.hover, 'A visible pointer ray hits scene');
send({ type: 'down' });
send({ type: 'up' });
await pause(100);
point = await post('inspect');
assert(point.selected.includes(point.hover));
console.log('PASS native ray hit and object selection');
ws.close();
console.log('Gesture checks complete.');
