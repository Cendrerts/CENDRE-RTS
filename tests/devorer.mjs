import assert from 'node:assert/strict';
import { CendreSim as S } from '../public/game/sim.js';
import { command, pack, unpack, view } from '../lib/match.mjs';
import { resolveTap } from '../public/game/tap.js';

function advance(state, seconds) {
  for (let step = 0; step < Math.round(seconds / 0.05); step++) S.tick(state, 0.05);
}
function unit(state, team = 1, type = 'knight', x = 2000, y = 1100) {
  S.spawn(state, type, team);
  const result = state.units.at(-1);
  Object.assign(result, { x, y, path: [], harvest: null, hold: true });
  S.visibility(state);
  return result;
}
function fixture(type = 'knight') {
  const state = S.create();
  state.monsters = [];
  const rat = unit(state);
  S.setScavenge(state, 1, [rat.id], false);
  rat.hp = rat.max / 2;
  const victim = unit(state, 0, type, rat.x + 10, rat.y);
  victim.hp = 1;
  command(state, 1, { kind: 'move', ids: [rat.id], x: victim.x, y: victim.y, target: { id: victim.id } });
  S.tick(state, 0.05);
  assert.equal(victim.hp <= 0, true);
  rat.cool = 100;
  return { state, rat, corpse: state.corpses[0] };
}
function eat(state, rat, corpse) {
  command(state, rat.team, { kind: 'devour', ids: [rat.id], corpseId: corpse.id });
  S.tick(state, 0.05);
  assert(rat.devour?.startedAt != null);
}
{
  const { state, corpse } = fixture();
  assert(corpse);
  advance(state, 29.95);
  assert.equal(state.corpses.length, 1);
  advance(state, 0.05);
  assert.equal(state.corpses.length, 0);
  assert.equal(fixture('commis').state.corpses.length, 0);
}
for (const type of ['knight', 'sanglier']) {
  const { state, rat, corpse } = fixture();
  if (type === 'sanglier') {
    const monster = S.create().monsters[0];
    Object.assign(monster, { x: rat.x + 10, y: rat.y, hp: 1, cool: 100 });
    state.camps = [{ name: monster.camp, x: monster.x, y: monster.y, respawnAt: null }];
    state.monsters = [monster];
    state.corpses = [];
    rat.cool = 0;
    command(state, 1, { kind: 'move', ids: [rat.id], x: monster.x, y: monster.y, target: { id: monster.id } });
    S.tick(state, 0.05);
    assert.equal(state.corpses[0].type, 'sanglier');
    state.ingredients[1].viande = 0;
  }
  const health = rat.hp;
  eat(state, rat, state.corpses[0]);
  advance(state, 3.95);
  assert.equal(state.ingredients[1].viande, 0);
  const restored = unpack(pack(state));
  advance(state, 0.05);
  advance(restored, 0.05);
  assert.deepEqual(state, restored);
  assert.equal(state.ingredients[1].viande, type === 'sanglier' ? 10 : 6);
  assert.equal(rat.hp, Math.min(rat.max, health + rat.max * 0.3));
  assert.equal(state.corpses.length, 0);
  assert.equal(view(state, 1).devourEvents[0].amount, state.ingredients[1].viande);
}
for (const interruption of ['move', 'hold', 'steer', 'retreat', 'patrol', 'queue', 'damage']) {
  const { state, rat, corpse } = fixture();
  eat(state, rat, corpse);
  advance(state, 2);
  if (interruption === 'damage') {
    const enemy = unit(state, 0, 'archer', rat.x + 15, rat.y);
    command(state, 0, { kind: 'move', ids: [enemy.id], x: rat.x, y: rat.y, target: { id: rat.id } });
    S.tick(state, 0.05);
    state.units = state.units.filter((candidate) => candidate !== enemy);
  } else {
    command(state, 1, { kind: interruption === 'queue' ? 'move' : interruption, ids: [rat.id], x: rat.x + 80, y: rat.y, dx: 1, dy: 0, queue: interruption === 'queue' });
  }
  assert.equal(rat.devour, null, interruption);
  advance(state, 4.1);
  assert.equal(state.ingredients[1].viande, 0, interruption);
  assert.equal(state.corpses.length, 1);
}
{
  const { state, rat, corpse } = fixture();
  const second = unit(state, 1, 'archer', rat.x - 10, rat.y);
  eat(state, rat, corpse);
  assert.equal(S.devour(state, 1, [second.id], corpse.id), false);
  assert(!second.devour, 'Une réservation manuelle empêche un deuxième repas');
  advance(state, 4.1);
  assert.equal(state.ingredients[1].viande, 6);
  assert.equal(second.path.length, 0);
  const cook = unit(state, 0);
  state.corpses.push({ ...corpse, expiresAt: state.time + 30 });
  assert.equal(S.devour(state, 0, [cook.id], corpse.id), false);
  assert.equal(cook.devour, undefined);
  const worker = unit(state, 1, 'commis');
  assert.equal(S.devour(state, 1, [worker.id], corpse.id), false);
}
{
  const { state, rat, corpse } = fixture();
  const second = unit(state, 1, 'archer', rat.x - 50, rat.y);
  command(state, 1, { kind: 'devour', ids: [rat.id, second.id], corpseId: corpse.id });
  assert.equal(state.units.filter((candidate) => candidate.devour).length, 1);
  assert(second.path.length > 0);
  assert(view(state, 1).corpses.some((item) => item.id === corpse.id));
  rat.x = corpse.x - 100;
  second.x = corpse.x - 150;
  for (const scale of [0.4, 1, 2]) {
    const action = resolveTap(state, 1, new Set([rat.id]), { x: corpse.x + 21 / scale, y: corpse.y }, scale);
    assert.equal(action.kind, 'devour', 'Zone tactile de 44 px');
  }
  const enemy = unit(state, 0, 'archer', corpse.x, corpse.y + 20);
  assert.equal(resolveTap(state, 1, new Set([rat.id]), corpse).kind, 'attack');
  state.units = state.units.filter((candidate) => candidate !== enemy);
  const cook = unit(state, 0, 'knight', corpse.x - 100, corpse.y);
  const rats = state.units.filter((candidate) => candidate.team === 1);
  state.units = state.units.filter((candidate) => candidate.team !== 1);
  assert.equal(resolveTap(state, 0, new Set([cook.id]), corpse).kind, 'move');
  state.units.push(...rats);
  state.time = corpse.expiresAt - 0.1;
  advance(state, 0.2);
  assert.equal(rat.devour, null);
}
{
  const { state, corpse } = fixture();
  const worker = unit(state, 1, 'commis', corpse.x - 100, corpse.y);
  const mine = state.mines[1];
  Object.assign(mine, { x: corpse.x + 5, y: corpse.y, owner: 1 });
  let target = null;
  const gather = resolveTap(state, 1, new Set([worker.id]), mine, 1, (winner) => {
    target = winner.target;
  });
  assert.equal(gather.kind, 'gather', 'Le cadavre voisin ne vole pas la mine au commis Rat');
  assert.equal(target, mine, 'Le ciblage appelle onTarget');
}
{
  const { state, corpse } = fixture();
  state.units = [];
  const cook = unit(state, 0, 'knight', corpse.x - 100, corpse.y);
  assert.equal(resolveTap(state, 0, new Set([cook.id]), corpse).kind, 'move');
  const slot = state.slots[0][0];
  Object.assign(slot, { x: corpse.x + 5, y: corpse.y, occupe: true, batiment: { type: S.BUILDINGS[0][0].id } });
  assert.equal(resolveTap(state, 0, new Set([cook.id]), slot).kind, 'production', 'Le cadavre voisin ne vole pas le bâtiment Cuistot');
}
{
  const { state, rat, corpse } = fixture();
  rat.hp = rat.max - 1;
  rat.x -= 140;
  S.visibility(state);
  command(state, 1, { kind: 'devour', ids: [rat.id], corpseId: corpse.id });
  advance(state, 3);
  assert(rat.devour?.startedAt != null, 'Le rat rejoint le cadavre');
  const position = { x: rat.x, y: rat.y };
  advance(state, 1);
  assert.deepEqual({ x: rat.x, y: rat.y }, position, 'Repas immobile');
  advance(state, 4);
  assert.equal(state.ingredients[1].viande, 6);
  assert.equal(rat.hp, rat.max, 'Soin plafonné aux PV max');
}
{
  const { state, rat } = fixture();
  const killer = unit(state, 0, 'knight', rat.x + 10, rat.y);
  rat.hp = 1;
  rat.cool = 100;
  command(state, 0, { kind: 'move', ids: [killer.id], x: rat.x, y: rat.y, target: { id: rat.id } });
  S.tick(state, 0.05);
  assert(state.corpses.some((corpse) => corpse.id === rat.id && corpse.team === 1), 'Les Rats laissent aussi un cadavre');
}
console.log('OK dévorer : cadavres, gains, interruptions, concurrence, commandes réseau et tactile');

function scavengerFixture(distance = 150) {
  const state = S.create();
  state.monsters = [];
  const rat = unit(state);
  rat.hold = false;
  const corpse = { id: 1000, x: rat.x + distance, y: rat.y, team: 0, type: 'knight', expiresAt: 30 };
  state.corpses.push(corpse);
  return { state, rat, corpse };
}
{
  const { state, rat, corpse } = scavengerFixture();
  state.corpses.unshift({ ...corpse, id: 1001, y: corpse.y + 80 });
  const second = unit(state, 1, 'archer', rat.x - 10, rat.y);
  second.hold = false;
  S.tick(state, 0.05);
  assert.equal(rat.devour?.corpseId, corpse.id, 'Le rat choisit le cadavre le plus proche');
  assert.equal(second.devour?.corpseId, 1001, 'Le second rat prend le cadavre libre');
  advance(state, 10);
  assert.equal(state.ingredients[1].viande, 12);
  assert.equal(state.corpses.length, 0);
}
for (const blocker of ['distance', 'enemy', 'hold', 'disabled', 'queue', 'worker']) {
  const { state, rat } = scavengerFixture(blocker === 'distance' ? 200 : 150);
  if (blocker === 'enemy') unit(state, 0, 'knight', rat.x, rat.y + 200);
  if (blocker === 'hold') command(state, 1, { kind: 'hold', ids: [rat.id] });
  if (blocker === 'disabled') {
    command(state, 0, { kind: 'setScavenge', ids: [rat.id], enabled: false });
    assert.equal(rat.scavengeDisabled, undefined, 'Un adversaire ne peut pas couper la bascule');
    command(state, 1, { kind: 'setScavenge', ids: [rat.id], enabled: false });
    const restored = unpack(pack(state));
    assert.equal(view(restored, 1).units.find((candidate) => candidate.id === rat.id).scavengeDisabled, true);
  }
  if (blocker === 'queue') {
    command(state, 1, { kind: 'move', ids: [rat.id], x: rat.x, y: rat.y + 100, queue: true });
  }
  const testedUnit = blocker === 'worker' ? unit(state, 1, 'commis', rat.x, rat.y) : rat;
  if (blocker === 'worker') {
    testedUnit.hold = false;
    command(state, 1, { kind: 'setScavenge', ids: [testedUnit.id], enabled: false });
    assert.equal(testedUnit.scavengeDisabled, undefined);
  }
  const { x, y } = testedUnit;
  advance(state, 0.25);
  assert(!testedUnit.devour, blocker);
  if (blocker !== 'queue' && blocker !== 'worker') assert.deepEqual([testedUnit.x, testedUnit.y], [x, y], blocker);
}
for (const interruption of ['move', 'enemy', 'disabled', 'manual']) {
  const { state, rat, corpse } = scavengerFixture();
  advance(state, 3);
  assert(rat.devour?.startedAt != null, 'Le rat commence le repas automatique');
  if (interruption === 'move') {
    command(state, 1, { kind: 'move', ids: [rat.id], x: rat.x - 100, y: rat.y });
    assert(rat.path.length > 0);
  } else if (interruption === 'enemy') {
    unit(state, 0, 'knight', rat.x, rat.y + 200);
    S.tick(state, 0.05);
  } else if (interruption === 'disabled') {
    command(state, 1, { kind: 'setScavenge', ids: [rat.id], enabled: false });
    assert.equal(rat.devour, null);
    command(state, 1, { kind: 'setScavenge', ids: [rat.id], enabled: true });
    S.tick(state, 0.05);
    assert(rat.devour?.automatic);
    continue;
  } else {
    const second = unit(state, 1, 'knight', rat.x + 20, rat.y);
    command(state, 1, { kind: 'devour', ids: [second.id], corpseId: corpse.id });
    assert.equal(second.devour?.corpseId, corpse.id);
    assert(!second.devour.automatic);
  }
  assert.equal(rat.devour, null, interruption);
  assert.equal(state.ingredients[1].viande, 0);
}
{
  const { state, rat } = scavengerFixture();
  const enemy = unit(state, 0, 'knight', rat.x, rat.y + 10);
  rat.hold = true;
  S.tick(state, 0.05);
  assert(rat.hp < rat.max, 'Le rat a pris un coup');
  state.units = state.units.filter((candidate) => candidate !== enemy);
  rat.hold = false;
  advance(state, 2.95);
  assert(!rat.devour, 'Le rat attend trois secondes après le dernier coup');
  S.tick(state, 0.05);
  assert(rat.devour?.automatic);
}
console.log('OK charognard : portée, priorité des ordres, danger, dégâts, réservation et bascule');
