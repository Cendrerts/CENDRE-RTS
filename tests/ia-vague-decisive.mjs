import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';

for (const team of [0, 1]) {
  const state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  state.watchtowers = [];
  state.slots = [[], []];
  state.time = 800;
  state.rubies[team] = 1200;
  const base = state.bases[team];
  const enemyBase = state.bases[1 - team];
  for (let index = 0; index < 20; index++) {
    Sim.spawn(state, 'knight', team);
    const unit = state.units.at(-1);
    unit.x = base.x + (team ? -110 : 110);
    unit.y = base.y + (team ? 65 : -65);
    unit.path = [];
  }
  const military = [...state.units];
  for (let index = 20; index < Sim.unitLimit(team); index++) {
    Sim.spawn(state, 'commis', team);
  }
  assert.equal(Sim.populationUsed(state, team), Sim.unitLimit(team));
  assert(state.rubies[team] >= 800);
  const controller = createAI(team, 'brutal');
  controller.intelligence.bases.push({ x: enemyBase.x, y: enemyBase.y });
  Sim.visibility(state);
  controller.update(state);
  assert.equal(controller.metrics.waves, 1);

  // Une escarmouche sur une expansion expose un ouvrier après le départ.
  // L'armée supérieure doit poursuivre sa vague plutôt que défendre ce site.
  const mine = state.mines.filter((candidate, index) => index >= 2)
    .sort((first, second) => Math.hypot(second.x - base.x, second.y - base.y) -
      Math.hypot(first.x - base.x, first.y - base.y))[0];
  mine.owner = team;
  mine.depot = true;
  const worker = state.units.find((unit) => unit.type === 'commis');
  worker.x = mine.x;
  worker.y = mine.y;
  Sim.gather(state, team, [worker.id], state.mines.indexOf(mine));
  for (let index = 0; index < 8; index++) {
    Sim.spawn(state, 'knight', 1 - team);
    const enemy = state.units.at(-1);
    enemy.x = mine.x + index * 10;
    enemy.y = mine.y;
    enemy.hold = true;
    enemy.path = [];
  }
  const arrivals = new Set();
  const initialBaseHp = enemyBase.hp;
  for (let step = 0; step < 1200 && state.winner === null; step++) {
    Sim.visibility(state);
    controller.update(state);
    Sim.tick(state, 0.1);
    for (const unit of military) {
      if (unit.hp > 0 && Math.hypot(unit.x - enemyBase.x, unit.y - enemyBase.y) < 300) {
        arrivals.add(unit.id);
      }
    }
  }
  assert(arrivals.size >= 10, `Équipe ${team} : ${arrivals.size}/20 militaires arrivés en 120 s`);
  assert(enemyBase.hp < initialBaseHp, 'La vague attaque la tour principale ennemie');
  console.log(`PASS : équipe ${team}, ${arrivals.size}/20 militaires arrivés en moins de 120 s.`);
}
