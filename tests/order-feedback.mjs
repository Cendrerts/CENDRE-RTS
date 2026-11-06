import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { orderFeedback, drawOrderFeedback, vibrateOrder } from '../public/game/order-feedback.js';

for (const [kind, shape, color] of [
  ['move', 'circle', '#65e88b'],
  ['attackMove', 'chevron', '#ffa347'],
  ['attack', 'flash', '#ff354f'],
  ['gather', 'ruby', '#ed3260'],
]) {
  const action = Object.freeze({ kind });
  assert.deepEqual(orderFeedback(action), { shape, color, duration: 0.4 });
}
assert.equal(orderFeedback({ kind: 'select' }), null);
const vibrations = [];
vibrateOrder(true, { vibrate: (duration) => vibrations.push(duration) });
vibrateOrder(false, { vibrate: () => assert.fail('disabled vibration') });
vibrateOrder(true, {});
vibrateOrder(true, { vibrate: () => { throw new Error('unsupported'); } });
assert.deepEqual(vibrations, [8]);

// Execute the real tap handler and feedback function with a server response held pending.
const source = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const show = source.slice(source.indexOf('function showOrderFeedback('), source.indexOf('let radial = null,'));
const handle = source.slice(source.indexOf('function handleFieldTap('), source.indexOf("mini.addEventListener('pointerdown'"));
for (const kind of ['move', 'attackMove', 'attack', 'gather']) {
  let respond;
  let serverReplied = false;
  const response = new Promise((resolve) => { respond = resolve; });
  const point = { x: 100, y: 200 };
  const target = { id: 8, x: 120, y: 220 };
  const context = vm.createContext({
    orderFeedback, scale: 1, performance: { now: () => 10 },
    world: () => point, radial: null, buildGhost: null, isEmptyTap: () => false,
    attackMoveArmed: kind === 'attackMove', selected: new Set([1]),
    resolveTap: () => ({ kind, target: kind === 'attack' ? target : undefined, ids: [1], index: 0 }),
    state: { units: [], mines: [point] }, player: 0, marker: null,
    selectionVoice: () => null, vibrateOrder, settings: { vibration: false },
    net: true, sendCommand: () => {
      assert(context.marker, 'marker exists before dispatch');
      return response.then(() => { serverReplied = true; });
    },
    notify() {}, updateUI() {}, $: () => ({ setAttribute() {} }),
  });
  vm.runInContext(show + handle + '\nhandleFieldTap({}, 10);', context);
  assert.equal(serverReplied, false);
  assert.equal(context.marker.shape, orderFeedback({ kind }).shape);
  let strokes = 0;
  const ctx = new Proxy({}, { get: (_, key) => () => { if (key === 'stroke' || key === 'fill') strokes++; }, set: () => true });
  drawOrderFeedback(ctx, context.marker, 0.016);
  assert(strokes > 0, 'next frame renders while server is still pending');
  respond();
  await response;
}
console.log('PASS: four pure descriptors, next-frame feedback before server response, optional vibration.');

const radii = [];
let flashes = 0;
const drawing = new Proxy({}, {
  get: (_, key) => (...args) => {
    if (key === 'arc') radii.push(args[2]);
    if (key === 'fill') flashes++;
  },
  set: () => true,
});
const circle = { ...orderFeedback({ kind: 'move' }), x: 0, y: 0 };
drawOrderFeedback(drawing, circle, 0);
drawOrderFeedback(drawing, circle, 0.2);
drawOrderFeedback(drawing, circle, 0.4);
assert.equal(radii.length, 2);
assert(radii[1] < radii[0]);
const flash = { ...orderFeedback({ kind: 'attack' }), x: 0, y: 0 };
for (const elapsed of [0, 0.1, 0.2, 0.31, 0.4]) {
  drawOrderFeedback(drawing, flash, elapsed);
}
assert.equal(flashes, 2);
