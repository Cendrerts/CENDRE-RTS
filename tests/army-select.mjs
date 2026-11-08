import assert from 'node:assert/strict';
import { armyUnits, armyToastText } from '../public/game/selection.js';

const units = [
  { id: 1, team: 0, type: 'knight', hp: 100, x: 10, y: 10 },
  { id: 2, team: 0, type: 'knight', hp: 50, x: 100, y: 100 },
  { id: 3, team: 0, type: 'knight', hp: 1, x: 5000, y: 5000 },
  { id: 4, team: 0, type: 'commis', hp: 50 },
  { id: 5, team: 0, type: 'commis', hp: 50 },
  { id: 6, team: 1, type: 'knight', hp: 100, x: 10, y: 10 },
  { id: 7, team: 1, type: 'knight', hp: 100, x: 5000, y: 5000 },
  { id: 8, team: 0, type: 'knight', hp: 0 },
  { id: 9, team: 0, type: 'knight', hp: -10 },
];
assert.deepEqual(armyUnits(units, 0), units.slice(0, 3));
assert.deepEqual(armyUnits(units.filter((unit) => unit.type === 'commis' || unit.hp <= 0), 0), []);
assert.deepEqual(armyUnits([], 0), []);
assert.equal(armyToastText(1), "1 unité · Toute l'armée");
assert.equal(armyToastText(3), "3 unités · Toute l'armée");
console.log('PASS: army selection includes off-screen combat units, excludes workers, enemies and dead units.');
