import assert from 'node:assert/strict';
import { createGestures } from '../public/game/gestures.js';

const gestures = createGestures();
const send = (type, id, x, y, time = 0) => gestures.update({ type, id, x, y, time });
send('down', 1, 10, 20);
assert.deepEqual(send('move', 1, 30, 50), {
  kind: 'select-box', start: { x: 10, y: 20 }, end: { x: 30, y: 50 }, final: false,
});
assert.equal(send('up', 1, 30, 50).final, true);
send('down', 1, 0, 0, 100);
assert.equal(send('move', 1, 4, 5), null);
assert.deepEqual(send('up', 1, 4, 5, 150), { kind: 'tap', x: 4, y: 5, duration: 50 });
send('down', 1, 0, 0);
assert.equal(send('move', 1, 8, 0).kind, 'select-box');
// Returning to the start must not turn a drag into a tap.
assert.equal(send('up', 1, 0, 0).kind, 'select-box');
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
send('down', 1, 0, 0);
assert.equal(send('move', 1, 20, 0).kind, 'select-box');
assert.equal(send('down', 2, 40, 0).kind, 'camera');
assert.equal(send('cancel', 2, 40, 0).kind, 'camera');
assert.equal(send('up', 1, 20, 0), null);
send('down', 3, 0, 0);
assert.equal(send('up', 3, 0, 0).kind, 'tap');
send('down', 1, 0, 0);
gestures.reset();
assert.equal(send('up', 1, 0, 0), null);
console.log('PASS: selection drag, 8px threshold, micro-movement tap, pinch, pan, partial release, cancellation and reset.');
