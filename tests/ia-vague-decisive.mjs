import assert from 'node:assert/strict';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { command } from '../lib/match.mjs';

function verifyDecisiveWave(team, militaryCount) {
  const state = Sim.create();
  state.units = [];
  state.camps = [];
  state.monsters = [];
  state.watchtowers = [];
  state.slots = [[], []];
  state.time = 800;
  state.rubies[team] = militaryCount === 18 ? 800 : 1200;
  const base = state.bases[team];
  const enemyBase = state.bases[1 - team];
  for (let index = 0; index < militaryCount; index++) {
    Sim.spawn(state, 'knight', team);
    const unit = state.units.at(-1);
    unit.x = base.x + (team ? -110 : 110);
    unit.y = base.y + (team ? 65 : -65);
    unit.path = [];
  }
  const military = [...state.units];
  for (let index = militaryCount; index < Sim.unitLimit(team); index++) {
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
  // La vague doit continuer, y compris à 18 contre 18 avec une banque pleine.
  const mine = state.mines.filter((candidate, index) => index >= 2)
    .sort((first, second) => Math.hypot(second.x - base.x, second.y - base.y) -
      Math.hypot(first.x - base.x, first.y - base.y))[0];
  mine.owner = team;
  mine.depot = true;
  const worker = state.units.find((unit) => unit.type === 'commis');
  worker.x = mine.x;
  worker.y = mine.y;
  Sim.gather(state, team, [worker.id], state.mines.indexOf(mine));
  for (let index = 0; index < (militaryCount === 18 ? 18 : 8); index++) {
    Sim.spawn(state, 'knight', 1 - team);
    const enemy = state.units.at(-1);
    enemy.x = militaryCount === 20 || index < 4 ? mine.x + index * 10 : enemyBase.x;
    enemy.y = militaryCount === 20 || index < 4 ? mine.y : enemyBase.y + (team ? 350 : -350);
    enemy.hold = true;
    enemy.path = [];
  }
  const arrivals = new Set();
  const initialBaseHp = enemyBase.hp;
  for (let step = 0; step < 1200 && state.winner === null; step++) {
    Sim.visibility(state);
    // Tous les adversaires sont observés : aucune supériorité numérique cachée.
    if (militaryCount === 18) state.visible[team].fill(1);
    controller.update(state);
    Sim.tick(state, 0.1);
    for (const unit of military) {
      if (unit.hp > 0 && Math.hypot(unit.x - enemyBase.x, unit.y - enemyBase.y) < 300) {
        arrivals.add(unit.id);
      }
    }
  }
  assert(arrivals.size >= 10, `Équipe ${team} : ${arrivals.size}/${militaryCount} militaires arrivés en 120 s`);
  assert(enemyBase.hp < initialBaseHp, 'La vague attaque la tour principale ennemie');
  console.log(`PASS : équipe ${team}, ${arrivals.size}/${militaryCount} militaires arrivés en moins de 120 s.`);
}

for (const militaryCount of [20, 18]) {
  for (const team of [0, 1]) {
    verifyDecisiveWave(team, militaryCount);
  }
}

// Les troupes sont recrutées, se rassemblent et traversent réellement la carte.
// Aucun déplacement instantané ne fabrique le contact avec les défenseurs.
function verifyRetreatAtContact(decisive) {
  const state = Sim.create();
  state.rubies = [20000, 20000];
  for (const team of [0, 1]) {
    assert(Sim.construct(state, team, Sim.BUILDINGS[team][0].id));
  }
  const advance = () => Sim.tick(state, 0.1);
  const produce = (team, type, count) => {
    for (let index = 0; index < count; index++) {
      while (!Sim.recruit(state, type, team)) {
        assert(state.time < 1000, 'La production doit terminer avant le scénario de contact');
        advance();
      }
    }
    while (state.queues[team].length) {
      advance();
    }
  };
  produce(0, 'knight', 18);
  produce(1, 'knight', 12);
  produce(1, 'commis', Sim.unitLimit(1) - Sim.populationUsed(state, 1));
  const wave = state.units.filter((unit) => unit.team === 1 && unit.type === 'knight');
  const defenders = state.units.filter((unit) => unit.team === 0 && unit.type === 'knight');
  assert.equal(wave.length, 12);
  assert.equal(defenders.length, 18);
  const base = state.bases[1];
  const rally = { x: base.x - 110, y: base.y + 65 };
  Sim.order(state, wave.map((unit) => unit.id), rally.x, rally.y, null, false);
  while (state.time < 800 || wave.some((unit) => Math.hypot(unit.x - rally.x, unit.y - rally.y) > 180)) {
    assert(state.time < 1000, 'La vague doit rejoindre son point de rassemblement');
    advance();
  }
  assert.equal(Sim.populationUsed(state, 1), Sim.unitLimit(1));
  assert(state.rubies[1] >= 800);
  const defensivePosition = { x: state.bases[0].x + 250, y: state.bases[0].y };
  Sim.order(state, defenders.map((unit) => unit.id), defensivePosition.x, defensivePosition.y, null, false);
  for (let step = 0; step < 300; step++) {
    advance();
  }
  command(state, 0, { kind: 'hold', ids: defenders.map((unit) => unit.id) });
  const controller = createAI(1, decisive ? 'brutal' : 'difficile');
  controller.intelligence.bases.push({ x: state.bases[0].x, y: state.bases[0].y });
  const waveIds = new Set(wave.map((unit) => unit.id));
  const power = (units) => units.reduce((total, unit) => {
    const stats = Sim.stats(unit.type, unit.team);
    return total + unit.hp * stats.damage / stats.rate;
  }, 0);
  const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
  const originalOrder = Sim.order;
  let checkedContacts = 0;
  let retreatOrders = 0;
  let protectedContact = false;
  let contactInRetreatRange = false;
  Sim.order = (...args) => {
    if (args[0] === state && args[5] && args[1].some((id) => waveIds.has(id))) {
      if (contactInRetreatRange && Math.hypot(args[2] - rally.x, args[3] - rally.y) < 1) {
        retreatOrders++;
      }
      assert(!protectedContact, 'Aucun membre de la vague décisive ne reçoit un ordre de repli à un rapport ≥ 0,25');
    }
    return originalOrder(...args);
  };
  try {
    for (let step = 0; step < 1800 && state.winner === null; step++) {
      Sim.visibility(state);
      const army = wave.filter((unit) => unit.hp > 0);
      const fighting = defenders.filter((enemy) => enemy.hp > 0 && Sim.canSee(state, 1, enemy) &&
        army.some((unit) => distance(unit, enemy) < 200));
      const engaged = army.filter((unit) => fighting.some((enemy) => distance(unit, enemy) < 240));
      const ratio = fighting.length ? power(engaged) / power(fighting) : Infinity;
      protectedContact = decisive && fighting.length > 0 && ratio >= 0.25;
      contactInRetreatRange = ratio >= 0.25 && ratio < 0.6 && engaged.length > 0 &&
        engaged.some((unit) => distance(unit, state.bases[0]) < 500);
      if (contactInRetreatRange) {
        checkedContacts++;
      }
      if (decisive && checkedContacts && ratio < 0.25) {
        break;
      }
      controller.update(state);
      if ((decisive && checkedContacts >= 10) || (!decisive && checkedContacts && retreatOrders)) {
        break;
      }
      advance();
    }
  } finally {
    Sim.order = originalOrder;
  }
  assert.equal(controller.metrics.waveSizes[0], 12, 'La première vague comporte 12 unités');
  assert(checkedContacts > 0, 'Contact réel près de la tour, à un rapport de puissance entre 0,25 et 0,6');
  if (!decisive) {
    assert(retreatOrders > 0, 'Le témoin conserve le repli au seuil de 0,6');
  }
  console.log(`PASS : contact réel 12 contre 18, ${decisive ? 'vague décisive maintenue' : 'repli du témoin'}.`);
}

verifyRetreatAtContact(true);
verifyRetreatAtContact(false);
