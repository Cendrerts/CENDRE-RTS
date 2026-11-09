import { BrigadeCuisine } from './cooks-config.js';
import { RatsGout } from './rats-config.js';

const unitPlurals = [
  {
    commis: 'Commis',
    knight: 'Gardes-Manger',
    archer: 'Bouchers-Tireurs',
    mage: 'Chefs de Brigade',
  },
  {
    commis: 'Rats-Essuyeurs',
    knight: 'Rats-Éboueurs',
    archer: 'Rats-Balance-Déchets',
    mage: 'Chamans de la Poubelle',
  },
];

export function unitLabel(type, count, faction = 0) {
  if (type === 'unit') return count === 1 ? 'unité' : 'unités';
  const units = faction === 1 ? RatsGout.unites : BrigadeCuisine.unites;
  return count === 1 ? units[type].name : unitPlurals[faction][type];
}

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
  return `${count} ${unitLabel('unit', count)} · Toute l'armée`;
}

export function groupToastText(index, count) {
  return `Groupe ${index + 1} assigné · ${count} ${unitLabel('unit', count)}`;
}
