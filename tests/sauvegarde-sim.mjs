import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createAI } from '../public/game/ai.js';
import { CendreSim as Sim } from '../public/game/sim.js';

assert.equal(Sim.restore('{'), null);
assert.equal(Sim.restore(JSON.stringify({ version: 99 })), null);
assert.equal(Sim.restore(JSON.stringify({ version: 1, nodes: [['object', {}]] })), null);

const targeting = Sim.create();
Sim.spawn(targeting, 'hero', 0);
Sim.spawn(targeting, 'hero', 1);
const [worker, enemyWorker, hero, enemyHero] = targeting.units;
for (const [unit, target] of [
  [worker, targeting.monsters[0]],
  [enemyWorker, targeting.bases[0]],
  [hero, enemyHero],
  [enemyHero, hero],
]) {
  Sim.order(targeting, [unit.id], target.x, target.y, target);
}
const restoredTargets = Sim.restore(Sim.serialize(targeting));
assert.ok(restoredTargets);
assert.strictEqual(restoredTargets.units[0].target, restoredTargets.monsters[0]);
assert.strictEqual(restoredTargets.units[1].target, restoredTargets.bases[0]);
assert.strictEqual(restoredTargets.units[2].target, restoredTargets.units[3]);
assert.strictEqual(restoredTargets.units[3].target, restoredTargets.units[2]);

const initialRandom = Math.random;
let seed = 18;
Math.random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

const step = 0.05;
const replayStep = 1 / 60;
const teams = [0, 1];
let state;
try {
  state = Sim.create();
  const controllers = teams.map((team) => createAI(team, 'brutal', state));
  for (let tick = 0; tick < 7200; tick++) {
    for (const controller of controllers) {
      controller.update(state);
    }
    Sim.tick(state, step);
  }
} finally {
  Math.random = initialRandom;
}

assert.ok(Math.abs(state.time - 360) < 1e-8);
assert.equal(state.winner, null);
const heroes = state.units.filter((unit) => unit.type === 'hero');
assert.equal(heroes.length, 2);
assert.ok(state.corpses.length > 0);
assert.ok(state.monsters.length > 0);
// Garantir une cible à restaurer quelle que soit l'issue des combats avec les camps.
const boar = state.monsters[0];
Sim.order(state, [heroes[0].id], boar.x, boar.y, boar);
console.log('À six minutes', {
  heroes: heroes.length,
  corpses: state.corpses.length,
  boars: state.monsters.length,
  litBraziers: state.braises.filter((foyer) => foyer.lit).length,
  targets: state.units.filter((unit) => unit.target).length,
});

const start = performance.now();
const saved = Sim.serialize(state);
const copy = Sim.restore(saved);
const duration = performance.now() - start;
assert.ok(copy);
assert.deepStrictEqual(copy, state);
assert.equal(Sim.serialize(copy), saved);
assert.ok(copy.units.some((unit) => unit.target && !unit.target.base));
for (const grid of [...copy.visible, ...copy.explored]) {
  assert.ok(grid instanceof Uint8Array);
}
for (const unit of copy.units) {
  if (unit.target) {
    assert.ok([...copy.units, ...copy.monsters, ...copy.bases].includes(unit.target));
  }
  if (unit.harvest) {
    assert.ok(copy.mines[unit.harvest.mine]);
  }
}

function moveToCenter(current) {
  for (const team of teams) {
    const ids = current.units.filter((unit) => unit.team === team && unit.hp > 0 &&
      !unit.base && unit.type !== 'commis')
      .slice(0, 5).map((unit) => unit.id);
    assert.equal(ids.length, 5);
    Sim.order(current, ids, Sim.W / 2, Sim.H / 2);
  }
}

function attackVisibleEnemy(current) {
  for (const team of teams) {
    const target = current.units.find((unit) => unit.team !== team && unit.hp > 0 &&
      !unit.base && Sim.canSee(current, team, unit));
    if (!target) continue;
    const attacker = current.units.find((unit) => unit.team === team && unit.hp > 0 && !unit.base);
    assert.ok(attacker);
    Sim.order(current, [attacker.id], target.x, target.y, target);
    assert.strictEqual(attacker.target, target);
    return target.id;
  }
  assert.fail('Aucune unité ennemie visible au tick 200');
}

for (let tick = 1; tick <= 1200; tick++) {
  if (tick === 1) {
    moveToCenter(state);
    moveToCenter(copy);
  }
  if (tick === 200) {
    assert.equal(attackVisibleEnemy(copy), attackVisibleEnemy(state));
  }
  Sim.tick(state, replayStep);
  Sim.tick(copy, replayStep);
}
assert.ok(Math.abs(state.time - 380) < 1e-8, `Temps final ${state.time}, vainqueur ${state.winner}`);
assert.equal(Sim.serialize(copy), Sim.serialize(state));
console.log(`Sauvegarde à six minutes — ${Buffer.byteLength(saved)} octets, sérialisation et restauration en ${duration.toFixed(1)} ms.`);
