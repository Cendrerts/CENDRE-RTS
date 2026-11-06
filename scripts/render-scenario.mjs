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
