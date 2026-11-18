import { snapshot } from './ia-diagnostic.mjs';

export function parseReplayOptions(minimumSeed, maximumSeed, supportsSeries = false, argumentsList = process.argv.slice(2), supportsBlock = false) {
  let seed = null;
  let series = null;
  let block = null;
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
    } else if (argument === '--bloc' && supportsBlock) {
      block = argumentsList[++index];
      if (block !== 'poussees') {
        throw new Error('--bloc attend poussees.');
      }
    } else {
      throw new Error(`Option inconnue : ${argument}`);
    }
  }
  if (block !== null && (seed !== null || series !== null)) {
    throw new Error('--bloc est incompatible avec --graine et --serie.');
  }
  if (series !== null && seed === null) {
    throw new Error('--serie nécessite --graine.');
  }
  const replay = { seed, series: series ?? 'difficile-normal' };
  if (supportsBlock) {
    replay.block = block;
  }
  return replay;
}

export function reportReplay(seed, step, state, controllers) {
  if (seed === null || (step + 1) % 1200 !== 0) {
    return;
  }
  for (const team of [0, 1]) {
    console.log(`releve ${JSON.stringify(snapshot(state, team, controllers[team]))}`);
  }
}
