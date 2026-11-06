import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
const advance = (s, time) => {
  for (let t = 0; t < time - 1e-8; t += 0.05) S.tick(s, Math.min(0.05, time - t));
};
for (let team = 0; team < 2; team++) {
  const s = S.create(),
    u = s.units.find((u) => u.team === team);
  assert.equal(u.harvest.phase, 'VERS_GISEMENT');
  while (u.harvest.phase !== 'MINAGE') S.tick(s, 0.01);
  assert.equal(s.rubies[team], 100);
  advance(s, 2.9);
  assert.equal(u.cargo, 0);
  assert.equal(s.rubies[team], 100);
  while (u.harvest.phase !== 'VERS_BASE') S.tick(s, 0.01);
  assert.equal(u.cargo, 10);
  assert.equal(s.rubies[team], 100);
  while (u.cargo) S.tick(s, 0.01);
  assert.equal(s.rubies[team], 110);
  assert.equal(u.harvest.phase, 'VERS_GISEMENT');
  const restored = unpack(pack(s));
  assert.deepEqual(restored.units.find((v) => v.id === u.id).harvest, u.harvest);
  command(s, team, { kind: 'hold', ids: [u.id] });
  const g = s.rubies[team];
  advance(s, 10);
  assert.equal(s.rubies[team], g);
  command(s, team, { kind: 'gather', ids: [u.id], index: team });
  assert(u.harvest);
  S.order(s, [u.id], u.x, u.y);
  assert.equal(u.harvest, null);
}
{
  const s = S.create(),
    u = s.units[0];
  s.mines[4].owner = 0;
  const m = s.mines[4],
    cell = S.nearest(m.x, m.y);
  u.x = (cell % S.COLS) * 20 + 10;
  u.y = Math.floor(cell / S.COLS) * 20 + 10;
  assert(S.gather(s, 0, [u.id], 4));
  advance(s, 3.05);
  assert.equal(u.cargo, 20);
  assert.equal(s.rubies[0], 100);
  // Losing ownership still permits delivery of an already filled bag.
  s.mines[4].owner = 1;
  while (u.cargo && s.time < 90) S.tick(s, 0.05);
  assert.equal(u.cargo, 0);
  assert.equal(s.rubies[0], 120);
  assert.equal(u.harvest, null);
}
{
  const s = S.create(),
    u = s.units[0];
  s.mines[0].owner = 1;
  advance(s, 0.1);
  assert.equal(u.harvest, null);
  assert(!S.gather(s, 0, [u.id], 0));
  assert(!S.gather(s, 0, [s.units[1].id], 1));
  assert.throws(() => command(s, 0, { kind: 'gather', ids: [u.id], index: 4 }));
  s.units = [];
  advance(s, 15);
  assert.deepEqual(s.rubies, [100, 100]);
}
{
  const s = S.create(),
    u = s.units[0];
  u.cargo = 10;
  u.hp = 0;
  advance(s, 5);
  assert(!s.units.some((v) => v.id === u.id));
  assert.equal(s.rubies[0], 100);
  const n = S.create();
  S.spawn(n, 'commis', 0);
  assert(n.units.at(-1).harvest);
  n.winner = 1;
  const before = pack(n);
  S.tick(n, 10);
  assert.equal(pack(n), before);
}
console.log(
  'PASS: worker trips, mining delay, delivery only, both factions, ruby, capture, interruption, ownership, death, no passive income, persistence and end state.',
);

// One isolated worker is the reference yield with no possible separation.
function mineYield(count, withAllies) {
  const state = S.create();
  state.units = [];
  for (let index = 0; index < count; index++) {
    S.spawn(state, 'commis', 0);
    const worker = state.units.at(-1);
    worker.x = 470;
    worker.y = 690;
    S.gather(state, 0, [worker.id], 0);
  }
  if (withAllies) {
    for (let index = 0; index < 6; index++) {
      S.spawn(state, 'knight', 0);
      const ally = state.units.at(-1);
      ally.x = 470;
      ally.y = 690;
      ally.hold = true;
    }
  }
  advance(state, 60);
  return state.rubies[0] - 100;
}
const referenceYield = mineYield(1, false) * 10;
assert(referenceYield > 0);
assert(mineYield(10, false) >= referenceYield * 0.95, 'Rendement de dix ouvriers ≥ 95 %');
assert(mineYield(10, true) >= referenceYield * 0.95, 'Les alliés ne repoussent pas les récolteurs');
