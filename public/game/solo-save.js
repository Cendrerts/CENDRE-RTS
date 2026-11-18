import { DIFFICULTIES } from './ai-config.js';
import { CendreSim as Sim } from './sim.js';

const SOLO_SAVE_KEY = 'cendre-solo-v1';

export function soloSaveLabel({ state, player, difficulty }) {
  const faction = player === 0 ? 'Cuistots' : 'Rats';
  const difficultyLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
  const elapsedSeconds = Math.round(state.time);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  return `${faction} · ${difficultyLabel} · ${minutes}:${seconds}`;
}

export function restoreSoloSave(text) {
  try {
    const save = JSON.parse(text);
    if (!save || ![0, 1].includes(save.player)) return null;
    const { player, difficulty, cameraX, cameraY, zoom } = save;
    if (typeof difficulty !== 'string' || !Object.hasOwn(DIFFICULTIES, difficulty)) return null;
    if (![cameraX, cameraY, zoom].every(Number.isFinite) || zoom < 1 || zoom > 3.5) return null;
    const state = Sim.restore(save.state);
    if (!state || state.winner !== null || state.time < 0) return null;
    // Les quatre groupes de contrôle font partie de l'état sérialisé par Sim.
    if (state.controlGroups.length !== 4 || !state.controlGroups.every(Array.isArray)) return null;
    return { state, player, difficulty, cameraX, cameraY, zoom };
  } catch {
    return null;
  }
}

export function readSoloSave() {
  try {
    return restoreSoloSave(localStorage.getItem(SOLO_SAVE_KEY));
  } catch {
    return null;
  }
}

export function writeSoloSave({ state, player, difficulty, cameraX, cameraY, zoom }) {
  try {
    localStorage.setItem(SOLO_SAVE_KEY, JSON.stringify({
      state: Sim.serialize(state),
      player,
      difficulty,
      cameraX,
      cameraY,
      zoom,
    }));
  } catch {}
}

export function clearSoloSave() {
  try {
    localStorage.removeItem(SOLO_SAVE_KEY);
  } catch {}
}
