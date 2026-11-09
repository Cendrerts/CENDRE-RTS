// The same sustained 30 vs 30 combat is used in Node and Chromium.
export function combatScenario(sim) {
  const state = sim.create();
  state.units = [];
  for (let team = 0; team < 2; team++) {
    for (let index = 0; index < 30; index++) {
      sim.spawn(state, index % 2 ? 'archer' : 'knight', team);
      const unit = state.units.at(-1);
      unit.x = 790 + team * 60 + (index % 5) * 4;
      unit.y = 570 + Math.floor(index / 5) * 3;
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

// Sustained combat, centered at (844, 585), within a landscape phone view.
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
      unit.x = 820 + team * 24 + (index % 5) * 4;
      unit.y = 570 + Math.floor(index / 5) * 3;
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
