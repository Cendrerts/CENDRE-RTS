import assert from 'node:assert/strict';
import { drawMinimap, exploredCamps } from '../public/game/minimap.js';
import { CendreSim as Sim } from '../public/game/sim.js';

const state = Sim.create();
assert.deepEqual(exploredCamps(state, 0), [], 'Aucun camp dans la zone de départ de l’équipe 0.');

const camp = state.camps[0];
const cellIndex = Math.floor(camp.y / Sim.CELL) * Sim.COLS + Math.floor(camp.x / Sim.CELL);
state.explored[0][cellIndex] = 1;
state.visible[0].fill(0);
assert.deepEqual(exploredCamps(state, 0), [{ x: camp.x, y: camp.y, espece: 'sanglier' }]);

state.explored[0].fill(1);
const allCamps = exploredCamps(state, 0);
assert.equal(allCamps.length, 11);
assert.equal(allCamps.filter(({ espece }) => espece === 'veine').length, 1);
assert.ok(allCamps.every((marker) => Object.keys(marker).sort().join(',') === 'espece,x,y'));

const calls = [];
let path;
const ctx = {
  canvas: { width: 200, height: 110 },
  save() {},
  restore() {},
  fillRect() {},
  strokeRect() {},
  drawImage() {},
  beginPath() {
    path = [];
  },
  moveTo(x, y) {
    path.push([x, y]);
  },
  lineTo(x, y) {
    path.push([x, y]);
  },
  closePath() {
    path.push('close');
  },
  stroke() {
    calls.push(['stroke', this.strokeStyle, this.lineWidth, path]);
  },
  fill() {
    calls.push(['fill', this.fillStyle, path]);
  },
};

const options = {
  terrain: {},
  fog: {},
  units: [],
  mines: [{ x: 2000, y: 1100 }],
  camera: { x: 0, y: 0, width: 400, height: 200 },
  player: 0,
  worldWidth: 4000,
  worldHeight: 2200,
};

drawMinimap(ctx, {
  ...options,
  camps: [
    { x: 400, y: 400, espece: 'sanglier' },
    { x: 800, y: 800, espece: 'lezard' },
    { x: 2000, y: 1100, espece: 'veine' },
  ],
});

const mine = ['fill', '#ffd477', [[100, 52], [103, 55], [100, 58], [97, 55], 'close']];
assert.deepEqual(calls, [
  ['stroke', '#c0604a', 1, [[20, 17.5], [22.5, 20], [20, 22.5], [17.5, 20], 'close']],
  ['stroke', '#ff9a3c', 1, [[40, 37.5], [42.5, 40], [40, 42.5], [37.5, 40], 'close']],
  ['stroke', '#ffd477', 1, [[108, 51.5], [111.5, 55], [108, 58.5], [104.5, 55], 'close']],
  mine,
]);

calls.length = 0;
drawMinimap(ctx, options);
assert.deepEqual(calls, [mine]);

console.log('Mini-carte : camps explorés, contours distincts et mines au premier plan.');
