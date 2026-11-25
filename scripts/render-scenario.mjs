// The same sustained 30 vs 30 combat is used in Node and Chromium.
export function combatScenario(sim) {
  const state = sim.create();
  state.units = [];
  for (let team = 0; team < 2; team++) {
    for (let index = 0; index < 30; index++) {
      sim.spawn(state, index % 2 ? 'archer' : 'knight', team);
      const unit = state.units.at(-1);
      unit.x = sim.W / 2 - 54 + team * 60 + (index % 5) * 4;
      unit.y = sim.H / 2 - 15 + Math.floor(index / 5) * 3;
      unit.hp = 1e9;
      unit.max = 1e9;
      unit.path = [];
      unit.harvest = null;
      unit.hold = true;
    }
  }
  sim.visibility(state);
  return state;
}

// Sustained combat, centered on the enlarged map, within a landscape phone view.
// 45 rats + 30 cooks + 8 workers per team = 91 units.
export function hordeScenario(sim) {
  const state = sim.create();
  state.units = [];
  const combatTypes = ['knight', 'archer', 'mage'];
  for (let team = 0; team < 2; team++) {
    const combatCount = team === 1 ? 45 : 30;
    for (let index = 0; index < combatCount + 8; index++) {
      const type = index < combatCount ? combatTypes[index % combatTypes.length] : 'commis';
      sim.spawn(state, type, team);
      const unit = state.units.at(-1);
      unit.x = sim.W / 2 - 24 + team * 24 + (index % 5) * 4;
      unit.y = sim.H / 2 - 15 + Math.floor(index / 5) * 3;
      // Keep the full workload alive throughout warmup and measurement.
      unit.hp = 1e9;
      unit.max = 1e9;
      unit.path = [];
      unit.harvest = null;
      unit.hold = true;
    }
  }
  sim.visibility(state);
  return state;
}

// Sustain all late-game effects inside the combat camera for the 20-second run.
export function loadedScenario(sim) {
  const state = hordeScenario(sim);
  for (let team = 0; team < 2; team++) {
    sim.spawn(state, 'hero', team);
    const hero = state.units.at(-1);
    hero.x = sim.W / 2 - 20 + team * 40;
    hero.y = sim.H / 2 + 35;
    hero.hp = 1e9;
    hero.max = 1e9;
    hero.path = [];
    hero.harvest = null;
    hero.hold = true;
  }
  for (let index = 0; index < 12; index++) {
    state.corpses.push({
      id: ++state.id,
      x: sim.W / 2 - 90 + (index % 6) * 36,
      y: sim.H / 2 - 50 + Math.floor(index / 6) * 100,
      type: index % 2 ? 'archer' : 'knight',
      team: index % 2,
      expiresAt: state.time + 30,
    });
  }
  state.monsters = state.monsters.slice(0, 4);
  for (const [index, monster] of state.monsters.entries()) {
    monster.x = sim.W / 2 - 60 + index * 40;
    monster.y = sim.H / 2 + 60;
    monster.hp = 1e9;
    monster.max = 1e9;
    const camp = state.camps.find((camp) => camp.name === monster.camp);
    camp.x = sim.W / 2;
    camp.y = sim.H / 2 + 60;
  }
  for (const [index, foyer] of state.braises.entries()) {
    foyer.x = sim.W / 2 - 65 + index * 130;
    foyer.y = sim.H / 2;
    foyer.lit = true;
  }
  for (const [index, tower] of state.watchtowers.entries()) {
    tower.x = sim.W / 2 - 180 + index * 360;
    tower.y = sim.H / 2 - 70;
    tower.owner = index;
  }
  state.ragout.expiresAt = state.time + 45;
  for (const unit of state.units) {
    if (unit.team === 0 && unit.type !== 'commis') {
      unit.ragoutUntil = state.ragout.expiresAt;
    }
  }
  sim.visibility(state);
  return state;
}
