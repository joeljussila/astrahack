import assert from 'node:assert/strict';
import { frame, aim, Smooth } from '../lib/motion.ts';
const zero = aim(
  { alpha: 359, beta: 30, gamma: 0 },
  frame({ alpha: 359, beta: 30, gamma: 0 }),
);
assert(Math.abs(zero.x) < 1e-10 && Math.abs(zero.y) < 1e-10);
const wrap = aim(
  { alpha: 1, beta: 30, gamma: 0 },
  frame({ alpha: 359, beta: 30, gamma: 0 }),
);
assert(Math.abs(wrap.x) < 0.04);
const rolled = aim(
  { alpha: 359, beta: 30, gamma: 90 },
  frame({ alpha: 359, beta: 30, gamma: 0 }),
);
assert(Math.abs(rolled.x) < 1e-10 && Math.abs(rolled.y) < 1e-10);
assert.equal(
  aim(
    { alpha: 180, beta: 0, gamma: 0 },
    frame({ alpha: 0, beta: 0, gamma: 0 }),
  ),
  null,
);
for (let a = 0; a < 360; a += 17)
  for (let b = -80; b <= 80; b += 20) {
    const f = frame({ alpha: a, beta: b, gamma: 47 });
    for (const v of Object.values(f))
      assert(Math.abs(v.reduce((s, x) => s + x * x, 0) - 1) < 1e-10);
  }
const s = new Smooth();
assert.equal(s.update(0.5, 0), 0.5);
const p = s.update(0.8, 16);
assert(p > 0.5 && p < 0.8);
s.reset();
assert.equal(s.update(0.2, 32), 0.2);
console.log(
  'PASS calibration, angle wrap, roll invariance, backward rejection, orthonormal frames and smoothing',
);
