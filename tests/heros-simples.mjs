import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { pack, unpack } from '../lib/match.mjs';

function fresh() {
  const state = Sim.create();
  state.units = [];
  state.monsters = [];
  state.camps = [];
  state.rubies = [1000, 1000];
  return state;
}

function spawn(state, type, team, x, y) {
  Sim.spawn(state, type, team);
  const unit = state.units.at(-1);
  Object.assign(unit, { x, y, hold: true, path: [] });
  return unit;
}

function attack(state, attacker, target) {
  attacker.target = target;
  attacker.cool = 0;
  state.visible[attacker.team].fill(1);
  Sim.tick(state, 0.01);
}

{
  const state = fresh();
  const chef = spawn(state, 'hero', 0, 450, 1950);
  for (let index = 0; index < 20; index++) {
    const victim = spawn(state, 'knight', 1, chef.x + 10, chef.y);
    victim.hp = 20;
    victim.cool = 10;
    attack(state, chef, victim);
    assert.equal(victim.hp, 0);
    assert.equal(chef.max, 420);
  }
  assert.equal(Sim.matchStats(state).teams[0].unitsKilled, 20);

  const enemyBase = state.bases[1];
  chef.x = enemyBase.x - 20;
  chef.y = enemyBase.y;
  const baseHp = enemyBase.hp;
  attack(state, chef, enemyBase);
  assert.equal(baseHp - enemyBase.hp, 20);

  chef.x = 450;
  chef.y = 1950;
  chef.hp = 1;
  chef.cool = 10;
  const killer = spawn(state, 'knight', 1, chef.x + 10, chef.y);
  attack(state, killer, chef);
  assert(!state.units.includes(chef));
  state.units = [];
  assert(Sim.recruit(state, 'hero', 0, 'main_0'));
  Sim.tick(state, 35);
  const returned = state.units.find((unit) => unit.type === 'hero');
  assert.notEqual(returned.id, chef.id);
  assert.equal(returned.hp, 420);
  assert.equal(returned.max, 420);
  returned.x = enemyBase.x - 20;
  returned.y = enemyBase.y;
  const nextBaseHp = enemyBase.hp;
  attack(state, returned, enemyBase);
  assert.equal(nextBaseHp - enemyBase.hp, 20);
}

{
  const state = fresh();
  const king = spawn(state, 'hero', 1, 2000, 1100);
  for (let index = 0; index < 5; index++) {
    const corpse = {
      id: ++state.id,
      x: king.x + 10,
      y: king.y,
      type: 'knight',
      team: 0,
      expiresAt: state.time + 30,
    };
    state.corpses.push(corpse);
    Sim.visibility(state);
    Sim.devour(state, 1, [king.id], corpse.id);
    Sim.tick(state, 0.01);
    assert.notEqual(king.devour?.startedAt, undefined);
    Sim.tick(state, 3);
    assert(!state.corpses.includes(corpse));
    assert.equal(king.max, 360);
  }
  assert.equal(state.ingredients[1].viande, 30);
}

{
  const legacy = fresh();
  legacy.heroProgress = [{ level: 3, xp: 300 }, { level: 1, xp: 0 }];
  const chef = spawn(legacy, 'hero', 0, 450, 1950);
  Object.assign(chef, { level: 3, xp: 300, max: 546, hp: 500 });
  const king = spawn(legacy, 'hero', 1, 2000, 1100);
  Object.assign(king, { level: 3, xp: 300, max: 468, hp: 200 });

  for (const restored of [Sim.restore(Sim.serialize(legacy)), unpack(pack(legacy))]) {
    assert(restored);
    assert(!Object.hasOwn(restored, 'heroProgress'));
    const [restoredChef, restoredKing] = restored.units;
    assert.equal(restoredChef.max, 420);
    assert.equal(restoredChef.hp, 420);
    assert.equal(restoredKing.max, 360);
    assert.equal(restoredKing.hp, 200);
    for (const hero of restored.units) {
      assert(!Object.hasOwn(hero, 'level'));
      assert(!Object.hasOwn(hero, 'xp'));
    }
    assert.deepEqual(Sim.restore(Sim.serialize(restored)), restored);
  }
}

console.log('PASS : statistiques fixes après 20 éliminations, 5 dévorations, reproduction et migration.');
