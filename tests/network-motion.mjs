import assert from 'node:assert/strict';
import { NetworkMotion, pollDelay } from '../public/game/network-motion.js';
const m = new NetworkMotion(),
  u = { id: 1, x: 0, y: 0 };
m.receive([u], 0);
m.receive([{ ...u, x: 20 }], 200);
const before = m.position(u, 300);
assert.equal(before.x, 10);
m.receive([{ ...u, x: 40 }], 300);
assert.deepEqual(m.position(u, 300), before);
assert(m.position(u, 380).x > before.x);
assert.equal(m.position(u, 2000).x, 40);
m.receive([], 2100);
assert.equal(m.entries.size, 0);
m.receive([{ ...u, x: 100 }], 2200);
assert.equal(m.position(u, 2200).x, 100);
m.clear();
assert.equal(m.entries.size, 0);
assert.equal(pollDelay(80, 0, false, false), 120);
assert.equal(pollDelay(350, 0, false, false), 0);
assert.equal(pollDelay(80, 2, false, false), 0);
assert.equal(pollDelay(80, 2, true, false), 750);
console.log(
  'PASS: continuous interpolation, jitter, no extrapolation, hidden-unit removal, immediate pending dispatch and error backoff.',
);
