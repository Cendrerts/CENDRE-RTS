import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
const s = S.create();
assert.deepEqual(
  s.slots.map((a) => a.length),
  [8, 8],
);
for (let t = 0; t < 2; t++) {
  s.rubies[t] = 2000;
  s.bases[t].niveau = 3;
  const base = s.bases[t];
  assert(s.slots[t].every((p) => S.walk[Math.floor(p.y / 20) * S.COLS + Math.floor(p.x / 20)]));
  for (let i = 0; i < 8; i++) {
    command(s, t, { kind: 'construct', type: S.BUILDINGS[t][i % 3].id });
    assert(s.slots[t][i].occupe);
    assert.equal(s.slots[t][i].batiment.niveau, 1);
  }
  assert.throws(() => command(s, t, { kind: 'construct', type: S.BUILDINGS[t][0].id }));
}
assert.deepEqual(s.rubies, [850, 850]);
assert.deepEqual(unpack(pack(s)).slots, s.slots);
assert.equal(view(s, 0).slots[1].length, 0);
assert.equal(view(s, 1).slots[0].length, 0);
const fresh = S.create();
assert.throws(() => command(fresh, 0, { kind: 'construct', type: S.BUILDINGS[1][0].id }));
assert(!S.construct(fresh, 0, '__proto__'));
assert(fresh.slots[0].every((p) => !p.occupe));
command(fresh, 0, { kind: 'construct', team: 1, type: S.BUILDINGS[0][0].id });
assert(fresh.slots[0][0].occupe);
assert(fresh.slots[1].every((p) => !p.occupe));
fresh.winner = 1;
assert(!S.construct(fresh, 0, S.BUILDINGS[0][0].id));
delete fresh.slots;
assert.equal(S.ensureSlots(fresh)[0].length, 8);
console.log(
  'PASS: slot offsets, first free, cap, factions, authority, fog, persistence, legacy state and ended match.',
);
// Price enforcement shared by solo and authoritative multiplayer commands.
for (const team of [0, 1])
  for (const cfg of S.BUILDINGS[team]) {
    const s = S.create(),
      slot = s.slots[team][3];
    s.rubies[team] = cfg.cost - 1;
    s.bases[team].niveau = cfg.rank - 1;
    assert.throws(() => command(s, team, { kind: 'construct', type: cfg.id, slotId: slot.id }));
    assert.equal(s.rubies[team], cfg.cost - 1);
    assert(!slot.occupe);
    s.rubies[team] = cfg.cost;
    command(s, team, { kind: 'construct', type: cfg.id, slotId: slot.id });
    assert.equal(s.rubies[team], 0);
    assert(slot.occupe);
    s.rubies[team] = cfg.cost;
    assert(!S.construct(s, team, cfg.id, slot.baseId, slot.id));
    assert.equal(s.rubies[team], cfg.cost);
    assert(!S.construct(s, team, cfg.id, 'main_' + (1 - team)));
    assert.equal(s.rubies[team], cfg.cost);
  }
console.log(
  'PASS: all six building prices, insufficient funds, exact balance and no charges on rejected construction.',
);
