import { CendreSim as Sim } from './sim.js';

export function orderQueuePoints(state, player, queue) {
  return queue.map((point) => {
    if (!point.target) return point;
    const target = point.target.base
      ? state.bases[point.target.team]
      : [...state.units, ...(state.monsters || [])].find((candidate) => candidate.id === point.target.id);
    if (!target || !Sim.canSee(state, player, target)) return point;
    return { ...point, x: target.x, y: target.y };
  });
}
