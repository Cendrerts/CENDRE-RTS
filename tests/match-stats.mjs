import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view } from '../lib/match.mjs';

function scriptedMatch() {
  const s = S.create();
  assert.deepEqual(S.matchStats(s).teams.map((team) => team.unitsProduced), [0, 0]);
  assert(S.recruit(s, 'commis', 0));
  const beforeRecruit = S.matchStats(s);
  assert.equal(beforeRecruit.teams[0].unitsProduced, 0);
  const initialRubies = [...s.rubies];
  const deposits = [0, 0];
  for (let step = 0; step < 1200; step++) {
    const before = [...s.rubies];
    S.tick(s, 0.05);
    for (const team of [0, 1]) deposits[team] += s.rubies[team] - before[team];
  }
  assert(deposits[0] > 0);
  assert(deposits[1] > 0);
  for (const team of [0, 1]) {
    assert.equal(S.matchStats(s).teams[team].rubiesCollected, deposits[team]);
    assert.equal(s.rubies[team], initialRubies[team] + deposits[team]);
  }
  assert.equal(S.matchStats(s).teams[0].unitsProduced, 1);
  const victim = s.units.find((unit) => unit.team === 1);
  S.spawn(s, 'knight', 0);
  const attacker = s.units.at(-1);
  Object.assign(attacker, { x: 400, y: 600, target: victim, cool: 0 });
  Object.assign(victim, { x: 405, y: 600, hp: 1, harvest: null });
  S.visibility(s);
  S.tick(s, 0.05);
  assert.equal(S.matchStats(s).teams[1].unitsLost, 1);
  assert.equal(S.matchStats(s).teams[0].unitsKilled, 1);
  assert(!Object.hasOwn(view(s, 0), 'matchCounters'));
  assert(!Object.hasOwn(view(s, 1), 'matchCounters'));
  const base = s.bases[1];
  Object.assign(attacker, { x: base.x - 10, y: base.y, target: base, cool: 0 });
  base.hp = 1;
  S.visibility(s);
  S.tick(s, 0.05);
  assert.equal(s.winner, 0);
  assert.equal(S.matchStats(s).teams[0].buildingsDestroyed, 1);
  for (const team of [0, 1]) {
    assert.deepEqual(S.matchStats(view(s, team)), S.matchStats(s));
  }
  assert.deepEqual(S.matchStats(unpack(pack(s))), S.matchStats(s));
  const snapshot = pack(s);
  const result = S.matchStats(s);
  result.teams[0].unitsKilled = 999;
  assert.equal(pack(s), snapshot, 'matchStats returns independent copies without mutation');
  S.tick(s, 10);
  assert.equal(pack(s), snapshot, 'statistics freeze after victory');
  return S.matchStats(s);
}
assert.deepEqual(scriptedMatch(), scriptedMatch());
const legacy = S.create();
delete legacy.matchCounters;
const before = pack(legacy);
assert.equal(S.matchStats(legacy).teams[0].rubiesCollected, 0);
assert.equal(pack(legacy), before, 'pure read of legacy state');
S.migrateState(legacy);
assert.equal(legacy.matchCounters.length, 2);
assert.deepEqual(S.migrateState(legacy), legacy);

// Environmental losses belong to the victim only.
const forest = S.create();
const worker = forest.units[0];
Object.assign(worker, { x: 800, y: 445, hp: 0.001 });
S.tick(forest, 0.05);
assert.equal(S.matchStats(forest).teams[0].unitsLost, 1);
assert.equal(S.matchStats(forest).teams[1].unitsKilled, 0);

// One area attack can kill several units; subsequent ticks must not recount them.
const splash = S.create();
splash.units = [];
S.spawn(splash, 'mage', 0);
S.spawn(splash, 'knight', 1);
S.spawn(splash, 'knight', 1);
const [mage, first, second] = splash.units;
Object.assign(mage, { x: 400, y: 600, target: first, harvest: null });
Object.assign(first, { x: 410, y: 600, hp: 1 });
Object.assign(second, { x: 415, y: 600, hp: 1 });
S.visibility(splash);
S.tick(splash, 0.05);
assert.equal(S.matchStats(splash).teams[0].unitsKilled, 2);
assert.equal(S.matchStats(splash).teams[1].unitsLost, 2);
S.tick(splash, 0.05);
assert.equal(S.matchStats(splash).teams[0].unitsKilled, 2);

console.log('PASS: match counters, deposits, recruitment, combat, migration, determinism and final-only multiplayer disclosure.');
