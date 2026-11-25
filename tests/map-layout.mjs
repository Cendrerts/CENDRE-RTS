import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';

import { cellAt, shortestPath as pathBetween } from './helpers/map-path.mjs';
function reachable(start, blocked = () => false) {
  const visited = new Set([cellAt(start.x, start.y)]);
  const queue = [...visited];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor];
    const column = cell % Sim.COLS;
    const row = Math.floor(cell / Sim.COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = column + dx;
      const y = row + dy;
      const next = y * Sim.COLS + x;
      if (x < 0 || y < 0 || x >= Sim.COLS || y >= Sim.ROWS) continue;
      if (!Sim.walk[next] || visited.has(next) || blocked(x * Sim.CELL + Sim.CELL / 2, y * Sim.CELL + Sim.CELL / 2)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}
function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point.x - a[0]) * dx + (point.y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a[0] - t * dx, point.y - a[1] - t * dy);
}
function section(x, y, dx, dy) {
  let width = 0;
  for (const direction of [-1, 1]) {
    for (let offset = 10; offset < 1500; offset += 20) {
      const px = x + direction * dx * offset;
      const py = y + direction * dy * offset;
      if (px < 0 || py < 0 || px >= Sim.W || py >= Sim.H || !Sim.walk[cellAt(px, py)]) break;
      width += 20;
    }
  }
  return width;
}
const state = Sim.create();
assert.equal(state.mines.length, 9);
assert.equal(Sim.reservedSites.length, 8);
for (let cell = 0; cell < Sim.walk.length; cell++) {
  assert.equal(Sim.walk[cell], Sim.walk[Sim.walk.length - cell - 1], 'Rotation de 180°');
}
const forest = 1 - Sim.walk.reduce((sum, cell) => sum + cell, 0) / Sim.walk.length;
assert(forest <= 0.45, `Forêt : ${forest * 100}%`);
for (const team of [0, 1]) {
  const base = state.bases[team];
  const rotate = (x, y) => team ? [Sim.W - x, Sim.H - y] : [x, y];
  const all = reachable(base);
  for (const site of [...state.mines, ...state.mines.flatMap((mine) => mine.site ? [mine.site] : []), ...Sim.reservedSites]) {
    assert(all.has(cellAt(site.x, site.y)), `${team} peut atteindre ${site.name || 'le dépôt'}`);
  }
  const closedBase = reachable(base, (x, y) => {
    [x, y] = rotate(x, y);
    return x >= 720 && x < 740 && y >= 1660 && y < 1840;
  });
  assert(!closedBase.has(cellAt(state.mines[2 + team].x, state.mines[2 + team].y)), 'Le goulet est la seule entrée');
  assert(closedBase.size < 1000, 'Aucune fuite de la chambre');
  const closedNatural = reachable(base, (x, y) => {
    [x, y] = rotate(x, y);
    return x >= 1060 && x < 1080 && y >= 1380 && y < 1720;
  });
  assert(closedNatural.has(cellAt(state.mines[2 + team].x, state.mines[2 + team].y)));
  assert(closedNatural.size < 1400, 'La naturelle a une seule sortie');
  const widths = [
    [730, 1750, 0, 1, 140, 180],
    [1070, 1550, 0, 1, 260, 320],
    [1000, 450, 0, 1, 160, 200],
    [650, 650, 1, 0, 160, 200],
    [1800, 600, 1, 0, 120, 160],
    [760, 850, 0, 1, 120, 160],
    [1500, 850, 0, 1, 420, Infinity],
    [1580, 580, 0, 1, 420, Infinity],
  ];
  for (const [x, y, dx, dy, min, max] of widths) {
    const [px, py] = rotate(x, y);
    const width = section(px, py, dx, dy);
    assert(width >= min && width <= max, `${team}: section ${x},${y} = ${width} px (${min}–${max})`);
  }
}
for (let y = 850; y < 1350; y += 20) {
  for (let x = 1650; x < 2350; x += 20) {
    assert(Sim.walk[cellAt(x, y)], 'Clairière centrale de 700 × 500');
  }
}
// Cut the four connectors at their narrow sections. At the map's midline,
// retain only the selected approach; the base/natural accesses stay shared.
const passagesBlocked = (x, y) =>
  (x >= 740 && x < 780 && y >= 780 && y < 920) ||
  (x >= 3220 && x < 3260 && y >= 1280 && y < 1420) ||
  (x >= 1720 && x < 1880 && y >= 580 && y < 620) ||
  (x >= 2120 && x < 2280 && y >= 1580 && y < 1620);
const shortestPath = (blocked) => pathBetween(...state.bases, blocked);
const centre = shortestPath((x, y) => passagesBlocked(x, y) ||
  (x >= 1980 && x < 2020 && (y < 840 || y >= 1360)));
const flanks = [0, 1].map((south) => shortestPath((x, y) => passagesBlocked(x, y) ||
  (x >= 1980 && x < 2020 && (south ? y < 1360 : y >= 840))));
const lengths = [centre.length, ...flanks.map((path) => path.length)];
for (const flank of flanks) {
  assert(flank.length <= centre.length * 0.9, `Flanc ${flank.length} ≤ 90 % du centre ${centre.length}`);
}
const free = shortestPath();
assert(free.length <= Math.min(...flanks.map((path) => path.length)) + 1e-6);
const crossings = free.points.filter((cell) => cell % Sim.COLS === 100);
assert(crossings.length > 0);
assert(crossings.every((cell) => {
  const y = Math.floor(cell / Sim.COLS) * Sim.CELL + Sim.CELL / 2;
  return y < 840 || y >= 1360;
}), 'Le plus court chemin libre emprunte un flanc');
const directOrder = Sim.route(state.bases[0].x, state.bases[0].y, state.bases[1].x, state.bases[1].y);
const orderCrossings = directOrder.filter((point) => Math.floor(point.x / Sim.CELL) === 100);
assert(orderCrossings.length > 0);
assert(orderCrossings.every((point) => point.y < 840 || point.y >= 1360),
  'Un ordre direct utilisant route emprunte aussi un flanc');
for (const lane of Sim.lanes) {
  for (let index = 1; index < lane.points.length; index++) {
    const a = lane.points[index - 1];
    const b = lane.points[index];
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5);
    for (let step = 0; step <= steps; step++) {
      const x = a[0] + (b[0] - a[0]) * step / steps;
      const y = a[1] + (b[1] - a[1]) * step / steps;
      assert(Sim.walk[cellAt(x, y)], `${lane.name} suit le terrain praticable`);
    }
  }
}
for (const site of Sim.reservedSites.filter((site) => site.name.startsWith('camp-'))) {
  for (const lane of Sim.lanes) {
    for (let index = 1; index < lane.points.length; index++) {
      assert(distanceToSegment(site, lane.points[index - 1], lane.points[index]) >= 150, `${site.name} hors agression du chemin`);
    }
  }
}
assert.equal(Sim.passages.length, 4);
assert.deepEqual(state.camps.map(({ name, x, y }) => ({ name, x, y })), Sim.reservedSites.filter((site) => site.name.startsWith('camp-')));
console.log(`PASS disposition : forêt ${(forest * 100).toFixed(1)} %, trajets ${lengths.map(Math.round).join('/')} px, goulets, passages, camps, symétrie et accès.`);
