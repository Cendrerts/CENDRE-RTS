import assert from 'node:assert/strict';
import { mettreAJourCachesConnues } from '../public/game/caches-connues.js';

const memoire = new Map();
const cache = { name: 'Cache', x: 120, y: 240, readyAt: 0, progress: 0, capturingTeam: -1 };
const estVisible = (x, y) => x === cache.x && y === cache.y;
const invisible = () => false;

assert.deepEqual(mettreAJourCachesConnues(memoire, [cache], invisible, 0), []);

function observer(temps, pleine) {
  const [vue] = mettreAJourCachesConnues(memoire, [cache], estVisible, temps);
  assert.deepEqual(vue, { name: cache.name, x: cache.x, y: cache.y, pleine, vue: true, progress: 0, capturingTeam: -1 });
  const souvenir = { name: vue.name, x: vue.x, y: vue.y, pleine: vue.pleine };
  memoire.set(vue.name, souvenir);
  return souvenir;
}

const souvenirPlein = observer(0, true);
cache.readyAt = 10 + 150;
assert.deepEqual(mettreAJourCachesConnues(memoire, [cache], invisible, 10), [
  { ...souvenirPlein, vue: false },
]);

const souvenirVide = observer(10, false);
assert.deepEqual(mettreAJourCachesConnues(memoire, [cache], invisible, cache.readyAt + 1), [
  { ...souvenirVide, vue: false },
]);
observer(cache.readyAt, true);
