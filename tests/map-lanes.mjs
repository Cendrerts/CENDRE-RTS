import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { decodeSnapshotFog } from '../public/game/snapshot-fog.js';
import { clampCamera, minimapToWorld } from '../public/game/camera.js';

const initial = S.create();
assert.equal(S.W, 4000);
assert.equal(S.H, 2200);
assert.equal(initial.mines.length, 9);
assert.equal(S.lanes.length, 3);
assert.equal(S.reservedSites.length, 8);
assert.equal(new Set(S.reservedSites.map((site) => site.name)).size, 8);
assert.equal(initial.mines[4].x, S.W / 2);
assert.equal(initial.mines[4].y, S.H / 2);
for (let index = 0; index < S.walk.length; index++) {
  assert.equal(S.walk[index], S.walk[S.walk.length - 1 - index], 'Terrain symétrique');
}
for (const [first, second] of [[0, 1], [2, 3], [5, 6], [7, 8]]) {
  assert.equal(initial.mines[first].x + initial.mines[second].x, S.W);
  assert.equal(initial.mines[first].y + initial.mines[second].y, S.H);
}
for (const team of [0, 1]) {
  const base = initial.bases[team];
  const distance = (point) => Math.hypot(point.x - base.x, point.y - base.y);
  const natural = initial.mines[2 + team];
  assert(distance(natural) < distance(initial.mines[5 + team]));
  assert(distance(natural) < distance(initial.mines[7 + team]));
}
for (const objective of [initial.mines[4], initial.mines[4].site]) {
  const distances = initial.bases.map((base) => Math.hypot(base.x - objective.x, base.y - objective.y));
  assert(Math.abs(distances[0] - distances[1]) < 1e-9, 'Objectif central équidistant des départs');
}
for (const site of S.reservedSites) {
  assert(S.walk[Math.floor(site.y / S.CELL) * S.COLS + Math.floor(site.x / S.CELL)]);
  assert(initial.mines.every((mine) => Math.hypot(mine.x - site.x, mine.y - site.y) > 120));
}
// Exercise real commands and ticks, not only the route finder. Each waypoint
// must be visited; a direct route to the enemy would only prove one approach.
const routes = [
  ...S.lanes,
  ...S.passages.map((passage) => ({
    name: passage.name,
    points: [
      ...S.lanes[0].points.slice(0, 4),
      ...passage.points,
      ...S.lanes[0].points.slice(-4),
    ],
  })),
];
const travelled = new Map();
for (const team of [0, 1]) {
  for (const lane of routes) {
    for (const type of ['commis', 'knight', 'archer', 'mage']) {
      const state = S.create();
      // Isolate terrain travel from neutral camp combat.
      state.monsters = [];
      state.camps = [];
      state.units = [];
      S.spawn(state, type, team);
      const unit = state.units[0];
      const points = team === 0 ? lane.points : [...lane.points].reverse();
      let ticks = 0;
      let distance = 0;
      for (const [x, y] of points.slice(1)) {
        command(state, team, { kind: 'move', ids: [unit.id], x, y });
        const destination = unit.path.at(-1);
        assert(destination, `${team}/${lane.name}/${type}: trajet disponible`);
        let lastX = unit.x;
        let lastY = unit.y;
        let stalled = 0;
        for (let step = 0; unit.path.length && step < 4000; step++) {
          const previous = { x: unit.x, y: unit.y };
          S.tick(state, 0.05);
          distance += Math.hypot(unit.x - previous.x, unit.y - previous.y);
          ticks++;
          assert(unit.hp > 0, 'Unité vivante après les bosquets');
          assert(S.walk[Math.floor(unit.y / S.CELL) * S.COLS + Math.floor(unit.x / S.CELL)], 'Terrain praticable à chaque tick');
          if (Math.hypot(unit.x - lastX, unit.y - lastY) > 1) {
            stalled = 0;
            lastX = unit.x;
            lastY = unit.y;
          } else {
            stalled++;
          }
          assert(stalled < 40, 'Aucune immobilisation pendant deux secondes');
        }
        assert.equal(unit.path.length, 0, 'Ordre terminé');
        assert(Math.hypot(unit.x - x, unit.y - y) < 25, 'Point du chemin atteint');
      }
      const enemy = state.bases[1 - team];
      assert(Math.hypot(unit.x - enemy.x, unit.y - enemy.y) < 25);
      travelled.set(`${team}/${lane.name}/${type}`, distance);
      console.log(`PASS ${team}/${lane.name}/${type}: ${ticks} ticks`);
    }
  }
}
for (const team of [0, 1]) {
  for (const type of ['commis', 'knight', 'archer', 'mage']) {
    const centre = travelled.get(`${team}/centre/${type}`);
    for (const flank of ['nord', 'sud']) {
      assert(travelled.get(`${team}/${flank}/${type}`) <= centre * 0.9, 'Trajet réel du flanc au moins 10 % plus court');
    }
  }
}
const restored = unpack(pack(initial));
for (const team of [0, 1]) {
  const client = view(restored, team);
  decodeSnapshotFog(client, team);
  assert.equal(client.visible[team].length, S.COLS * S.ROWS);
  assert.equal(client.explored[team].length, S.COLS * S.ROWS);
  assert.deepEqual(client.bases.map(({ x, y }) => ({ x, y })), initial.bases.map(({ x, y }) => ({ x, y })));
  const base = initial.bases[team];
  assert.deepEqual(clampCamera(base.x, base.y, 844, 390, 1.3, S.W, S.H), { x: base.x, y: base.y });
}
assert.deepEqual(minimapToWorld(140, 80, 140, 80, S.W, S.H), { x: S.W, y: S.H });
console.log('PASS: carte, trois chemins et quatre passages dans les deux sens, quatre types, réserves, caméra et synchronisation.');
