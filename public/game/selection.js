import { CendreSim as Sim } from './sim.js';

// This 2D engine uses world (x,y), equivalent to ground-plane (x,z).
export function cameraBounds(ox, oy, scale, width, height) {
  return {
    minX: -ox / scale,
    maxX: (width - ox) / scale,
    minY: -oy / scale,
    maxY: (height - oy) / scale,
  };
}
export function unitsOfType(units, team, type, bounds) {
  const total = units.filter((u) => u.team === team && u.type === type && u.hp > 0);
  const visible = total.filter(
    (u) => u.x >= bounds.minX && u.x <= bounds.maxX && u.y >= bounds.minY && u.y <= bounds.maxY,
  );
  return { total, visible };
}
export function createFieldDoubleTap() {
  let previous = null;
  return {
    reset() {
      previous = null;
    },
    tap(unitType, screenX, screenY, now) {
      const double = previous?.unitType === unitType &&
        now >= previous.time && now - previous.time < 350 &&
        Math.hypot(screenX - previous.x, screenY - previous.y) < 40;
      previous = double ? null : { unitType, x: screenX, y: screenY, time: now };
      return double ? 'double' : 'single';
    },
  };
}

export function createPortraitTap() {
  let previous = null;
  return {
    reset() {
      previous = null;
    },
    tap(type, now) {
      const double = previous?.type === type && now >= previous.time && now - previous.time < 350;
      previous = double ? null : { type, time: now };
      return double ? 'all' : 'visible';
    },
  };
}

export function unitsInBox(units, team, start, end) {
  const inside = units.filter((unit) =>
    unit.team === team && unit.hp > 0 &&
    unit.x >= Math.min(start.x, end.x) && unit.x <= Math.max(start.x, end.x) &&
    unit.y >= Math.min(start.y, end.y) && unit.y <= Math.max(start.y, end.y),
  );
  const combat = inside.filter((unit) => unit.type !== 'commis');
  return combat.length ? combat : inside;
}

export function boxSelection(current, units) {
  if (!units.length) return current;
  return new Set(units.map((unit) => unit.id));
}

export function filterSelection(selection, units, type, remove = false) {
  return new Set(units.filter((unit) =>
    selection.has(unit.id) && unit.hp > 0 && (remove ? unit.type !== type : unit.type === type),
  ).map((unit) => unit.id));
}

export function armyUnits(units, team) {
  return units.filter((unit) => unit.team === team && unit.hp > 0 && unit.type !== 'commis');
}

export function armyToastText(count) {
  return count + (count === 1 ? " unité · Toute l'armée" : " unités · Toute l'armée");
}

export function groupToastText(index, count) {
  return 'Groupe ' + (index + 1) + ' assigné · ' + count + (count === 1 ? ' unité' : ' unités');
}

export function buildingsOfType(state, player, type, bounds) {
  const config = Sim.BUILDINGS[player].find((building) => building.id === type);
  if (!config) return [];
  return Sim.producers(state, player, config.unit).filter((building) =>
    building.x >= bounds.minX && building.x <= bounds.maxX &&
    building.y >= bounds.minY && building.y <= bounds.maxY,
  );
}

export function selectedProducers(state, player, ids) {
  return Object.keys(Sim.TYPES).flatMap((type) => Sim.producers(state, player, type))
    .filter((producer) => ids.includes(producer.id));
}

export function buildingSelectionVisuals(state, player, panelContext) {
  const ids = panelContext.producerIds || [panelContext.producerId ||
    (!panelContext.slotId && panelContext.baseId)].filter(Boolean);
  const buildings = selectedProducers(state, player, ids);
  const rallyLines = [];
  const rallyFlags = [];
  for (const building of buildings) {
    const structure = Sim.rallyBuilding(state, player, building.id);
    const point = Sim.rallyPoint(state, structure?.rally);
    if (!point) continue;
    rallyLines.push({ building, point });
    if (!rallyFlags.some((flag) => flag.x === point.x && flag.y === point.y)) {
      rallyFlags.push(point);
    }
  }
  return { buildings, rallyLines, rallyFlags };
}

export function selectedRecruitCommand(state, player, type, ids) {
  const producers = selectedProducers(state, player, ids).filter((producer) => producer.unit === type);
  const producer = Sim.leastLoadedProducer(state, player, producers);
  return { kind: 'recruit', type, producerId: producer?.id || ids[0] };
}

export function selectedRallyCommands(state, player, ids, target) {
  return selectedProducers(state, player, ids).map((producer) => ({
    ...target,
    kind: 'setRally',
    buildingId: producer.id,
  }));
}
