import { CendreSim as Sim } from './sim.js';

// Bounds follow building() and drawFactionBuilding() in game.js, in world units.
export function buildingBounds(target, size = 1, main = false, team = target.team, kind = 3) {
  if (main) return { x: target.x - 80, y: target.y - 117, width: 160, height: 177 };
  const top = team === 1 ? (kind === 2 ? 59 : 52) : kind === 2 ? 71 : kind === 1 ? 62 : 57;
  return { x: target.x - 34 * size, y: target.y - top * size, width: 68 * size, height: (top + 18) * size };
}

export function constructionBarBounds(slot, kind, scale) {
  const { y } = buildingBounds(slot, 0.65, false, slot.team, kind);
  return { x: slot.x - 24 / scale, y: y - 13 / scale, width: 48 / scale, height: 9 / scale };
}

// Bounds match the sprite dimensions in drawCook and the crystals in drawMine.
export function unitHitbox(unit) {
  const size = unit.type === 'commis' ? 34 : unit.type === 'archer' ? 52 : unit.type === 'mage' ? 49 : 46;
  return { x: unit.x - size / 2, y: unit.y - size + 5, width: size, height: size * 1.125 };
}

export function mineHitbox(mine) {
  const size = mine.boost ? 2.8 : 2;
  return { x: mine.x - 6.5 * size, y: mine.y - 15 * size, width: 13 * size, height: 17 * size };
}

// Resolves input intent only; commands and UI effects remain with the caller.
export function resolveTap(state, player, selection, point, scale = 1, onTarget = null) {
  const selected = state.units.filter(
    (unit) => unit.team === player && unit.hp > 0 && selection.has(unit.id),
  );
  const workers = selected.filter((unit) => unit.type === 'commis');
  const combat = selected.some((unit) => unit.type !== 'commis');
  const ratMilitary = player === 1 && combat;
  const candidates = [];
  const priorities = workers.length
    ? ['mine', 'unit', 'enemy', 'building', 'slot']
    : combat ? ['enemy', 'unit', 'building', 'mine', 'slot'] : ['unit', 'enemy', 'building', 'slot', 'mine'];
  if (ratMilitary) priorities.splice(priorities.indexOf('enemy') + 1, 0, 'corpse');
  priorities.push('pantry');
  const pantry = state.pantries?.[1 - player];
  let pantryHit = false;
  if (pantry && Sim.visibleAt(state, player, pantry.x, pantry.y)) {
    const action = selected.length
      ? { kind: 'attackMove', x: pantry.x, y: pantry.y }
      : { kind: 'enemyPantry' };
    const width = Math.max(76, 44 / scale);
    const bounds = { x: pantry.x - width / 2, y: pantry.y - 42, width, height: 53 };
    add(pantry, 'pantry', 22, action, bounds);
    pantryHit = candidates.length > 0;
  }
  function add(target, category, radius, action, bounds = null, sprite = false) {
    const center = sprite
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : target;
    let distance = Math.hypot(point.x - center.x, point.y - center.y) * scale;
    if (pantryHit && action.kind === 'attack' && sprite && target.type && !target.structure) {
      const groundDistance = Math.hypot(point.x - target.x, point.y - target.y) * scale;
      if (groundDistance <= 6) distance = Math.min(distance, groundDistance);
    }
    const margin = sprite ? 0 : 10 / scale;
    const insideBounds = bounds
      ? point.x >= bounds.x - margin && point.x <= bounds.x + bounds.width + margin &&
        point.y >= bounds.y - margin && point.y <= bounds.y + bounds.height + margin
      : distance <= radius;
    const hit = insideBounds || ((sprite || category === 'pantry') && distance <= radius);
    if (hit) candidates.push({ target, category, distance, action, bounds, radius, center, sprite });
  }
  for (const unit of [...state.units, ...(state.monsters || [])]) {
    if (unit.hp <= 0 || (unit.team !== player && !Sim.canSee(state, player, unit))) continue;
    if (unit.team === player) add(unit, 'unit', 26, { kind: 'select', id: unit.id }, unitHitbox(unit), true);
    else add(unit, combat && !workers.length ? 'enemy' : 'unit', 26, selected.length ? { kind: 'attack', target: unit } : { kind: 'none' }, unitHitbox(unit), true);
  }
  for (const corpse of state.corpses || []) {
    if (!ratMilitary) continue;
    if (corpse.expiresAt <= state.time || !Sim.visibleAt(state, player, corpse.x, corpse.y)) continue;
    add(corpse, 'corpse', 22, {
      kind: 'devour',
      ids: selected.map((unit) => unit.id),
      corpseId: corpse.id,
    });
  }
  for (const base of state.bases) {
    if (base.hp <= 0 || !Sim.canSee(state, player, base)) continue;
    const action = base.team === player
      ? { kind: 'radial', context: { baseId: 'main_' + player } }
      : selected.length ? { kind: 'attack', target: base } : { kind: 'none' };
    add(base, combat && !workers.length && base.team !== player ? 'enemy' : 'building', 0, action, buildingBounds(base, 1, true));
  }
  for (const slot of state.slots?.[player] || []) {
    const action = slot.occupe
      ? { kind: 'production', id: slot.id }
      : { kind: 'radial', context: { baseId: slot.baseId, slotId: slot.id } };
    const kind = Sim.BUILDINGS[player].findIndex((building) => building.id === slot.batiment?.type);
    const bounds = slot.occupe ? buildingBounds(slot, 0.65, false, player, kind) : null;
    if (Sim.isUnderConstruction(state, slot)) {
      const bar = constructionBarBounds(slot, kind, scale);
      const width = Math.max(bounds.width, bar.width);
      const top = bar.y;
      bounds.x = slot.x - width / 2;
      bounds.width = width;
      bounds.height = Math.max(bounds.y + bounds.height - top, 44 / scale);
      bounds.y = top;
      add(slot, 'building', 0, action, bounds, true);
    } else {
      add(slot, slot.occupe ? 'building' : 'slot', 28, action, bounds);
    }
  }
  const enemy = 1 - player;
  for (const slot of state.slots?.[enemy] || []) {
    if (!slot.occupe || !slot.batiment || !Sim.visibleAt(state, player, slot.x, slot.y)) continue;
    const kind = Sim.BUILDINGS[enemy].findIndex((building) => building.id === slot.batiment.type);
    const action = selected.length ? { kind: 'attack', target: slot.batiment } : { kind: 'none' };
    add(slot, 'building', 22, action, buildingBounds(slot, 0.65, false, enemy, kind), true);
  }
  state.mines.forEach((mine, index) => {
    const action = workers.length && mine.owner === player
      ? { kind: 'gather', ids: workers.map((unit) => unit.id), index }
      : { kind: selected.length ? 'move' : 'mine', index };
    if (Sim.visibleAt(state, player, mine.x, mine.y)) {
      add(mine, 'mine', 34, action, mineHitbox(mine), true);
    }
    if (index < 2 || !mine.site || !Sim.visibleAt(state, player, mine.site.x, mine.site.y)) return;
    const siteAction = mine.owner !== player && mine.depot
      ? selected.length
        ? { kind: 'attack', target: mine.site }
        : { kind: 'enemyBase', index }
      : { kind: 'radial', context: { baseId: mine.depot ? 'mine_' + index : null, mine: index } };
    add(mine.site, mine.depot ? 'building' : 'slot', 28, siteAction,
      mine.depot ? buildingBounds(mine.site, 0.95, false, mine.owner) : null);
  });
  if (!candidates.length) return { kind: selected.length ? 'move' : 'none' };
  const ownUnits = selected.length ? [] : candidates.filter((candidate) => candidate.action.kind === 'select');
  const eligible = ownUnits.length ? ownUnits : candidates;
  const nearest = Math.min(...eligible.map((candidate) => candidate.distance));
  const tied = eligible.filter((candidate) => candidate.distance <= nearest + 6);
  tied.sort((a, b) => priorities.indexOf(a.category) - priorities.indexOf(b.category) || a.distance - b.distance);
  const winner = tied[0];
  if (winner.action.kind !== 'move') onTarget?.(winner);
  return winner.action;
}

export function isEmptyTap(state, player, point, scale = 1) {
  let hit = false;
  resolveTap(state, player, new Set(), point, scale, () => { hit = true; });
  return !hit;
}
