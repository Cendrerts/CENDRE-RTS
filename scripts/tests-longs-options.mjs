import { snapshot } from './ia-diagnostic.mjs';

export function parseReplayOptions(minimumSeed, maximumSeed, supportsSeries = false, argumentsList = process.argv.slice(2)) {
  let seed = null;
  let series = null;
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (argument === '--graine') {
      const value = argumentsList[++index];
      seed = Number(value);
      if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(seed) || seed < minimumSeed || seed > maximumSeed) {
        throw new Error(`--graine attend un entier de ${minimumSeed} à ${maximumSeed}.`);
      }
    } else if (argument === '--serie' && supportsSeries) {
      series = argumentsList[++index];
      if (!['difficile-normal', 'brutal-difficile'].includes(series)) {
        throw new Error('--serie attend difficile-normal ou brutal-difficile.');
      }
    } else {
      throw new Error(`Option inconnue : ${argument}`);
    }
  }
  if (series !== null && seed === null) {
    throw new Error('--serie nécessite --graine.');
  }
  return { seed, series: series ?? 'difficile-normal' };
}

export function reportReplay(seed, step, state, controllers) {
  if (seed === null || (step + 1) % 1200 !== 0) {
    return;
  }
  for (const team of [0, 1]) {
    console.log(`releve ${JSON.stringify(snapshot(state, team, controllers[team]))}`);
  }
}
