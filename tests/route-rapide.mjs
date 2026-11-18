import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CendreSim as Sim } from '../public/game/sim.js';

const { W, H, CELL, COLS, ROWS, walk } = Sim;

// Algorithmes de référence recopiés depuis main (119bd81).
function nearest(x, y) {
  let best = -1,
    d = Infinity;
  for (let i = 0; i < walk.length; i++)
    if (walk[i]) {
      let dx = (i % COLS) * CELL + 10 - x,
        dy = Math.floor(i / COLS) * CELL + 10 - y,
        dd = dx * dx + dy * dy;
      if (dd < d) {
        d = dd;
        best = i;
      }
    }
  return best;
}
function route(x, y, tx, ty) {
  let a = nearest(x, y),
    b = nearest(tx, ty);
  if (a === b) return [];
  let queue = [a],
    head = 0,
    prev = new Int32Array(walk.length).fill(-1);
  prev[a] = a;
  while (head < queue.length && prev[b] === -1) {
    let i = queue[head++],
      ix = i % COLS,
      iy = Math.floor(i / COLS);
    for (let [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      let nx = ix + dx,
        ny = iy + dy,
        n = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || !walk[n] || prev[n] !== -1) continue;
      if (dx && dy && (!walk[i + dx] || !walk[i + dy * COLS])) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  if (prev[b] === -1) return [];
  let out = [];
  for (let n = b; n !== a; n = prev[n])
    out.push({ x: (n % COLS) * CELL + 10, y: Math.floor(n / COLS) * CELL + 10 });
  return out.reverse();
}

let seed = 216;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
}

for (let index = 0; index < 2000; index++) {
  const points = [W, H, W, H].map((limit) => {
    const coordinate = random() * limit;
    return index % 5 === 0 ? Math.round(coordinate / CELL) * CELL : coordinate;
  });
  assert.equal(JSON.stringify(Sim.route(...points)), JSON.stringify(route(...points)),
    `Chemin différent pour la paire ${index + 1} (${points.join(', ')})`);
}
console.log('route-rapide : 2 000 chemins identiques, dont 400 paires sur des bords de case');

const state = Sim.create();
const ids = [];
for (let index = 0; index < 60; index++) {
  Sim.spawn(state, 'knight', 0);
  ids.push(state.units.at(-1).id);
}

const durations = [];
for (let index = 0; index < 12; index++) {
  const start = performance.now();
  Sim.order(state, ids, 3400, 700);
  durations.push(performance.now() - start);
}
durations.sort((first, second) => first - second);
const median = (durations[5] + durations[6]) / 2;
console.log(`route-rapide : médiane de 12 ordres pour 60 Garde-Manger = ${median.toFixed(2)} ms`);
assert.ok(median <= 80, `Médiane de ${median.toFixed(2)} ms, seuil de 80 ms`);
