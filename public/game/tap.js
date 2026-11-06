import { CendreSim as Sim } from './sim.js';

function distance(point, target) {
  return Math.hypot(target.x - point.x, target.y - point.y);
}

function friendlyUnit(state, player, point) {
  return state.units
    .filter((unit) => unit.team === player && unit.hp > 0)
    .sort((a, b) => distance(point, a) - distance(point, b))
    .find((unit) => distance(point, unit) < (point.unitRadius ?? 22));
}

function enemyTarget(state, player, point) {
  return [...state.units, state.bases[1 - player]].find(
    (unit) =>
      unit.team !== player &&
      unit.hp > 0 &&
      Sim.canSee(state, player, unit) &&
      distance(point, unit) < (unit.base ? 70 : 25),
  );
}

// Resolves input intent only; commands and UI effects remain with the caller.
export function resolveTap(state, player, selection, point) {
  const selected = state.units.filter(
    (unit) => unit.team === player && unit.hp > 0 && selection.has(unit.id),
  );
  const near = friendlyUnit(state, player, point);
  const mine = state.mines.findIndex(
    (item) => Sim.visibleAt(state, player, item.x, item.y) && distance(point, item) < 55,
  );
  if (selected.length) {
    if (near) return { kind: 'select', id: near.id };
    const target = enemyTarget(state, player, point);
    if (target) return { kind: 'attack', target };
    const workers = selected.filter((unit) => unit.type === 'commis');
    if (workers.length && mine >= 0 && state.mines[mine].owner === player) {
      return { kind: 'gather', ids: workers.map((unit) => unit.id), index: mine };
    }
    return { kind: 'move' };
  }
  const emptySlot = (state.slots?.[player] || [])
    .filter((slot) => !slot.occupe && distance(point, slot) < 23)
    .sort((a, b) => distance(point, a) - distance(point, b))[0];
  if (emptySlot) {
    return { kind: 'radial', context: { baseId: emptySlot.baseId, slotId: emptySlot.id } };
  }
  const site = state.mines.findIndex(
    (item, index) =>
      index >= 2 &&
      item.site &&
      Sim.visibleAt(state, player, item.x, item.y) &&
      distance(point, item.site) < 30,
  );
  if (site >= 0) {
    const item = state.mines[site];
    if (item.owner !== player && item.depot) return { kind: 'enemyBase', index: site };
    return {
      kind: 'radial',
      context: { baseId: item.depot ? 'mine_' + site : null, mine: site },
    };
  }
  const productionSlot = (state.slots?.[player] || []).find(
    (slot) => slot.occupe && distance(point, slot) < 26,
  );
  if (productionSlot) return { kind: 'production', id: productionSlot.id };
  if (near) return { kind: 'select', id: near.id };
  const base = state.bases[player];
  if (distance(point, { x: base.x, y: base.y - 35 }) < 72) {
    return { kind: 'radial', context: { baseId: 'main_' + player } };
  }
  if (mine >= 0) return { kind: 'mine', index: mine };
  return { kind: 'none' };
}

export function isEmptyTap(state, player, point) {
  return (
    resolveTap(state, player, new Set(), point).kind === 'none' &&
    !enemyTarget(state, player, point)
  );
}
