import assert from 'node:assert/strict';
import { createGestures } from '../public/game/gestures.js';

const gestures = createGestures();
const send = (type, id, x, y, time = 0) => gestures.update({ type, id, x, y, time, pointerType: 'mouse' });
send('down', 1, 10, 20);
assert.deepEqual(send('move', 1, 30, 50), {
  kind: 'camera', from: { x: 10, y: 20, time: 0, distance: 0 }, to: { x: 30, y: 50, distance: 0 },
});
assert.equal(send('up', 1, 30, 50).kind, 'camera');
send('down', 1, 0, 0, 100);
assert.equal(send('move', 1, 4, 5), null);
assert.deepEqual(send('up', 1, 4, 5, 150), { kind: 'tap', x: 4, y: 5, duration: 50 });
send('down', 1, 0, 0);
assert.equal(send('move', 1, 8, 0, 250).kind, 'camera');
// Returning to the start must not turn a drag into a tap.
assert.equal(send('up', 1, 0, 0, 280).kind, 'camera');
send('down', 1, 0, 0);
assert.deepEqual(send('up', 1, 12, 0, 120), { kind: 'tap', x: 12, y: 0, duration: 120 });
send('down', 1, 0, 0);
assert.equal(send('up', 1, 12, 0, 600).kind, 'camera');
send('down', 1, 0, 0);
assert.equal(send('move', 1, 12, 0, 100), null);
assert.equal(send('up', 1, 12, 0, 120).kind, 'tap');
send('down', 1, 0, 0);
assert.equal(send('move', 1, 12, 0, 100), null);
assert.equal(gestures.tick(500), null);
assert.deepEqual(send('up', 1, 12, 0, 600), {
  kind: 'camera', from: { x: 0, y: 0, time: 0, distance: 0 }, to: { x: 12, y: 0, distance: 0 },
});
send('down', 1, 0, 0);
assert.equal(send('up', 1, 16, 0, 120).kind, 'camera');
send('down', 1, 0, 0);
assert.equal(send('up', 1, 12, 0, 250).kind, 'camera');
send('down', 1, 0, 0);
assert.equal(send('down', 2, 10, 0).kind, 'camera');
const pinch = send('move', 2, 20, 0);
assert.equal(pinch.kind, 'camera');
assert.equal(pinch.to.distance / pinch.from.distance, 2);
assert.equal(pinch.to.x - pinch.from.x, 5);
assert.equal(send('up', 1, 0, 0), null);
assert.equal(send('move', 2, 80, 0), null);
assert.equal(send('up', 2, 80, 0), null);
// Selection preview is cancelled as soon as a second finger arrives.
gestures.setSelectionMode(true);
send('down', 1, 0, 0);
assert.equal(send('move', 1, 20, 0).kind, 'select-box');
assert.equal(send('down', 2, 40, 0).kind, 'camera');
assert.equal(send('cancel', 2, 40, 0).kind, 'camera');
assert.equal(send('up', 1, 20, 0), null);
gestures.setSelectionMode(false);
send('down', 3, 0, 0);
assert.equal(send('up', 3, 0, 0).kind, 'tap');
send('down', 1, 0, 0);
gestures.reset();
assert.equal(send('up', 1, 0, 0), null);
console.log('PASS: camera drag, 8px threshold, micro-movement tap, pinch, pan, partial release, cancellation and reset.');

const touch = (type, x, time) => gestures.update({
  type,
  id: 1,
  x,
  y: 0,
  time,
  pointerType: 'touch',
});
touch('down', 0, 0);
assert.equal(touch('move', 8, 100), null);
assert.equal(touch('move', 13, 150), null);
assert.equal(touch('move', 14, 200).kind, 'camera');
assert.equal(touch('up', 14, 300).kind, 'camera');
// A quick finger release overrides the preview and issues a tap.
touch('down', 0, 0);
assert.equal(touch('move', 20, 100).kind, 'camera');
assert.deepEqual(touch('up', 23, 249), { kind: 'tap', x: 23, y: 0, duration: 249 });
// Both limits are strict.
touch('down', 0, 0);
assert.equal(touch('up', 20, 250).kind, 'camera');
touch('down', 0, 0);
assert.equal(touch('up', 24, 100).kind, 'camera');
// A fast return near the start is also a tap on touch screens.
touch('down', 0, 0);
touch('move', 30, 100);
assert.equal(touch('up', 5, 200).kind, 'tap');
console.log('PASS: touch 14px threshold, quick tap after drag preview, strict 250ms/24px limits.');

// Hold feedback advances without pointer movement and fires readiness once.
gestures.reset();
touch('down', 0, 0);
assert.equal(gestures.tick(150).progress, 0.5);
assert.equal(gestures.tick(299).ready, false);
assert.equal(gestures.tick(300).ready, true);
assert.equal(gestures.tick(301), null);
assert.equal(touch('move', 40, 320).kind, 'select-box');
assert.equal(touch('up', 40, 350).final, true);
// Camera drags never become selection after 300 ms.
touch('down', 0, 0);
assert.equal(touch('move', 40, 100).kind, 'camera');
assert.equal(touch('move', 80, 400).kind, 'camera');
touch('up', 80, 410);
let coastDistance = 0;
for (let index = 0; index < 100; index++) {
  const action = gestures.tick(420 + index * 16, 0.016);
  if (action) coastDistance += Math.hypot(action.to.x, action.to.y);
}
assert.ok(coastDistance > 0 && coastDistance <= 100);
assert.equal(gestures.tick(3000, 1), null);
gestures.setSelectionMode(true);
touch('down', 0, 0);
assert.equal(touch('move', 30, 50).kind, 'select-box');
assert.equal(touch('up', 30, 100).final, true);
touch('down', 0, 0);
assert.equal(touch('up', 20, 100).kind, 'tap');
gestures.setSelectionMode(false);
touch('down', 0, 0);
assert.equal(touch('move', 40, 50).kind, 'camera');
touch('up', 40, 60);
touch('down', 0, 70);
assert.equal(gestures.tick(70).progress, 0);
gestures.reset();
assert.equal(gestures.tick(1000), null);
console.log('PASS: hold at 300ms, selection toggle, bounded inertia and interruption.');

// Even an extreme flick coasts less than 100 CSS pixels and stops by 300ms.
gestures.reset();
touch('down', 0, 0);
touch('move', 10000, 16);
touch('up', 10000, 17);
let flickDistance = 0;
for (let index = 0; index < 6; index++) {
  const action = gestures.tick(17 + index * 50, 0.05);
  flickDistance += action.to.x;
}
assert.ok(flickDistance > 0 && flickDistance < 100);
assert.equal(gestures.tick(400, 0.05), null);
