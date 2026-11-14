import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { pack, unpack, view, command } from '../lib/match.mjs';
const place = (u, x, y) => {
  const c = S.nearest(x, y);
  u.x = (c % S.COLS) * 20 + 10;
  u.y = Math.floor(c / S.COLS) * 20 + 10;
};
const s = S.create();
assert.equal(s.mines.length, 9);
assert.equal(s.mines.filter((m) => m.name.startsWith('Naturelle')).length, 2);
assert.equal(s.mines.filter((m) => m.name.startsWith('Flanc nord')).length, 2);
for (let i = 2; i < s.mines.length; i++) {
  const m = s.mines[i];
  assert(m.site);
  assert(S.route(m.x, m.y, m.site.x, m.site.y).length);
  assert(S.walk[Math.floor(m.site.y / 20) * S.COLS + Math.floor(m.site.x / 20)]);
}
function trip(withDepot, team, index) {
  const s = S.create(),
    u = s.units.find((u) => u.team === team),
    m = s.mines[index];
  // Measure depot travel without neutral camp combat along the route.
  s.monsters = [];
  s.camps = [];
  place(u, m.x, m.y);
  s.rubies[team] = 500;
  if (withDepot) {
    command(s, team, { kind: 'build', index });
    assert(m.depot);
    assert.equal(s.rubies[team], 380);
    assert(!S.build(s, team, index));
  } else m.owner = team;
  S.gather(s, team, [u.id], index);
  const initial = s.rubies[team];
  for (let n = 0; n < 2400 && s.rubies[team] === initial; n++) S.tick(s, 0.05);
  assert.equal(s.rubies[team] - initial, m.boost ? 20 : 10);
  return s.time;
}
for (let team = 0; team < 2; team++)
  for (const i of [2, 3, 4, 5, 6, 7, 8]) {
    const local = trip(true, team, i),
      far = trip(false, team, i);
    assert(local < far, `No gain ${team}/${i}: ${local}/${far}`);
    console.log(`Team ${team}, mine ${i}: local ${local.toFixed(1)}s vs main ${far.toFixed(1)}s`);
  }
{
  const s = S.create(),
    u = s.units[0];
  s.rubies[0] = 500;
  place(u, s.mines[2].x, s.mines[2].y);
  S.build(s, 0, 2);
  S.gather(s, 0, [u.id], 2);
  while (!u.cargo) S.tick(s, 0.05);
  assert.equal(u.harvest.depot, 2);
  s.mines[2].owner = 1;
  S.tick(s, 0.05);
  assert.equal(u.harvest.depot, -1);
  assert.deepEqual(unpack(pack(s)).mines, s.mines);
  assert.equal(view(s, 1).mines[2].depot, true);
  s.mines[2].owner = 0;
  S.visibility(s);
  assert.equal(view(s, 1).mines[2].depot, false);
}
console.log(
  'PASS: nine mines, accessible sites, costs, local delivery for both factions, capture reroute and fog.',
);
