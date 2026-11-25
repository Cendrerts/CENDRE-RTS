import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
function idle() {
  const s = S.create();
  for (let t = 0; t < 2; t++) {
    s.rubies[t] += 450;
    s.bases[t].niveau = 3;
    for (const b of S.BUILDINGS[t]) S.construct(s, t, b.id);
  }
  s.time = Math.max(...s.slots.flat().filter((slot) => slot.occupe).map((slot) => slot.batiment.readyAt));
  for (const u of s.units) {
    u.harvest = null;
    u.path = [];
  }
  return s;
}
let s = idle();
assert.equal(s.units.length, 2);
assert.equal(s.rubies[0], 100);
assert(S.recruit(s, 'knight', 0));
assert.equal(s.rubies[0], 40);
s.rubies[0] = 0;
assert(!S.recruit(s, 'mage', 0));
// Every objective must be reachable from BOTH spawn areas, without crossing lava.
for (let b of s.bases)
  for (let p of [...s.mines, ...s.watchtowers, ...s.bases]) {
    let r = S.route(b.x, b.y + 40, p.x, p.y);
    assert(
      r.length || S.nearest(b.x, b.y + 40) === S.nearest(p.x, p.y),
      `No path ${b.team} => ${p.name || 'tower/base'}`,
    );
    for (let n of r) assert(S.walk[Math.floor(n.y / 20) * S.COLS + Math.floor(n.x / 20)]);
  }
assert(!S.canSee(s, 0, s.bases[1]));
assert(!S.canSee(s, 1, s.bases[0]));
s = idle();
s.units[1].x = S.groves[0].x;
s.units[1].y = S.groves[0].y;
s.watchtowers[0].owner = 0;
S.visibility(s);
assert(!S.canSee(s, 0, s.units[1]));
s.units[0].x = S.groves[0].x - 30;
s.units[0].y = S.groves[0].y;
S.visibility(s);
assert(S.canSee(s, 0, s.units[1]));
s.units = s.units.slice(0, 1);
let hp = s.units[0].hp;
S.tick(s, 1);
assert.equal(s.units[0].hp, hp - 2);
s = idle();
s.rubies[0] = 500;
s.units[0].x = s.mines[4].x;
s.units[0].y = s.mines[4].y;
assert(S.build(s, 0, 4));
assert.equal(s.rubies[0], 380);
let g = s.rubies[0];
S.tick(s, 1);
assert.equal(s.rubies[0] - g, 0);
assert(!S.build(s, 0, 4));
s = idle();
s.units = s.units.slice(0, 1);
s.units[0].x = s.bases[1].x - 30;
s.units[0].y = s.bases[1].y;
s.bases[1].hp = 1;
S.visibility(s);
S.tick(s, 0.05);
assert.equal(s.winner, 0);
console.log(
  'PASS: recruitment, traversable routes to all objectives, fog for both teams, forest concealment and damage, ruby income, victory.',
);

s = idle();
assert.equal(s.units.filter((u) => u.type === 'commis').length, 2);
assert(S.recruit(s, 'commis', 0));
assert.equal(s.rubies[0], 60);
assert(S.recruit(s, 'commis', 1));
assert.equal(s.queues[1][0].remaining, 5);
assert.equal(s.queues[0][0].remaining, 5);
assert.equal(s.units.length, 2);

// Timed production, reserved population and faction stats.
s = idle();
S.recruit(s, 'commis', 1);
S.tick(s, 4.9);
assert.equal(s.units.filter((u) => u.team === 1).length, 1);
S.tick(s, 0.1);
assert.equal(s.units.filter((u) => u.team === 1).length, 2);
assert.equal(s.units.at(-1).max, 45);
s = idle();
s.rubies[1] = 99999;
for (let i = 0; i < 8; i++) assert(S.recruit(s, 'mage', 1));
assert(!S.recruit(s, 'mage', 1));
assert.equal(s.queues[1].length, 8);
const elapsed = s.queues[1][0].remaining;
s.winner = 0;
S.tick(s, 30);
assert.equal(s.queues[1][0].remaining, elapsed);
s = idle();
s.units = [];
for (const [type, team] of [
  ['knight', 0],
  ['knight', 0],
  ['knight', 1],
  ['mage', 1],
])
  S.spawn(s, type, team);
const mage = s.units.find((u) => u.team === 1 && u.type === 'mage'),
  a = s.units[0],
  b = s.units[1],
  ally = s.units[2];
s.units = [mage, a, b, ally];
mage.x = 600;
mage.y = 500;
mage.hold = true;
a.x = 650;
a.y = 500;
b.x = 670;
b.y = 500;
ally.x = 620;
ally.y = 510;
for (const u of [a, b, ally]) {
  u.cool = 99;
  u.hold = true;
}
S.visibility(s);
const ah = a.hp,
  bh = b.hp,
  fh = ally.hp;
S.tick(s, 0.05);
assert.equal(ah - a.hp, 18);
assert.equal(bh - b.hp, 18);
assert.equal(ally.hp, fh);
assert.equal(S.stats('knight', 1).hp, 110);
assert.equal(S.stats('archer', 1).damage, 11);
console.log('PASS: Rats-Goût queue, timings, stats, splash, no friendly fire.');

// Both factions finish each unit only after its full production duration.
for (const [team, times] of [
  [0, [5, 20, 24, 45]],
  [1, [5, 10, 12, 22]],
])
  for (const [i, type] of ['commis', 'knight', 'archer', 'mage'].entries()) {
    const state = idle();
    assert(S.recruit(state, type, team));
    S.tick(state, times[i] - 0.1);
    assert.equal(state.units.filter((u) => u.team === team).length, 1);
    S.tick(state, 0.1);
    assert.equal(state.units.filter((u) => u.team === team).length, 2);
    assert.equal(state.units.at(-1).max, S.stats(type, team).hp);
    assert.equal(state.queues[team].length, 0);
  }
// Elite chef splashes nearby foes but never allies.
{
  const state = idle();
  state.units = [];
  for (const [type, team] of [
    ['knight', 0],
    ['knight', 1],
    ['knight', 1],
    ['mage', 0],
  ])
    S.spawn(state, type, team);
  const chef = state.units.find((u) => u.team === 0 && u.type === 'mage'),
    foes = state.units.filter((u) => u.team === 1 && u.type === 'knight').slice(0, 2),
    friend = state.units[0];
  state.units = [chef, ...foes, friend];
  for (const [i, u] of state.units.entries()) {
    u.x = 600 + i * 15;
    u.y = 500;
    u.hold = true;
    u.cool = 99;
  }
  chef.cool = 0;
  S.visibility(state);
  S.tick(state, 0.01);
  assert.deepEqual(
    foes.map((u) => u.hp),
    [75, 75],
  );
  assert.equal(friend.hp, 200);
}
console.log('PASS: asymmetric production for all eight units and elite chef splash.');

{
  const state = idle();
  assert.deepEqual(state.rubies, [100, 100]);
  assert.equal(state.bases.length, 2);
  assert.deepEqual(state.queues, [[], []]);
  for (let t = 0; t < 2; t++) {
    const units = state.units.filter((u) => u.team === t);
    assert.equal(units.length, 1);
    assert.equal(units[0].type, 'commis');
    assert(Math.hypot(units[0].x - state.bases[t].x, units[0].y - state.bases[t].y) < 150);
  }
}
