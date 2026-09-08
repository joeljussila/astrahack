export type Vec3 = [number, number, number];
export type Attitude = { alpha: number; beta: number; gamma: number };
export type Frame = { right: Vec3; up: Vec3; forward: Vec3 };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const bound = (n: number, lo = 0, hi = 1) =>
  Math.max(lo, Math.min(hi, n));
export function frame(v: Attitude): Frame {
  const a = (v.alpha * Math.PI) / 180,
    b = (v.beta * Math.PI) / 180,
    g = (v.gamma * Math.PI) / 180;
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cg = Math.cos(g),
    sg = Math.sin(g);
  return {
    forward: [-sa * cb, ca * cb, sb],
    right: [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg],
    up: [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg],
  };
}
export function aim(v: Attitude, base: Frame) {
  const direction = frame(v).forward,
    z = dot(direction, base.forward);
  if (z < 0.3) return null;
  return { x: dot(direction, base.right) / z, y: -dot(direction, base.up) / z };
}
export class Smooth {
  value: number | undefined;
  raw = 0;
  velocity = 0;
  time = 0;
  reset() {
    this.value = undefined;
    this.velocity = 0;
  }
  update(input: number, time: number, cutoff = 2.5) {
    if (this.value === undefined) {
      this.value = this.raw = input;
      this.time = time;
      return input;
    }
    const dt = bound((time - this.time) / 1000, 0.001, 0.1),
      alpha = (f: number) => 1 / (1 + 1 / (2 * Math.PI * f * dt));
    this.velocity += alpha(1) * ((input - this.raw) / dt - this.velocity);
    this.value +=
      alpha(cutoff + 0.18 * Math.abs(this.velocity)) * (input - this.value);
    this.raw = input;
    this.time = time;
    return this.value;
  }
}
