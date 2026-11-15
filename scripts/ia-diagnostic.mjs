import { pathToFileURL } from 'node:url';
import { CendreSim as Sim } from '../public/game/sim.js';
import { createAI } from '../public/game/ai.js';
import { DIFFICULTIES } from '../public/game/ai-config.js';

// Population follows the game's supply counter (including queued recruits).
// Exploited mines are distinct, usable mines assigned to a living worker.
export function snapshot(state, team, controller) {
  const units = state.units.filter((unit) => unit.team === team && unit.hp > 0);
  const workers = units.filter((unit) => unit.type === 'commis');
  const military = units.filter((unit) => unit.type !== 'commis');
  const hero = military.find((unit) => unit.type === 'hero');
  const enemyBase = state.bases[1 - team];
  const exploitedMines = new Set();
  for (const worker of workers) {
    const mineIndex = worker.harvest?.mine;
    const mine = state.mines[mineIndex];
    if (mine?.owner === team && mine.remaining > 0 && !(mine.hp <= 0)) {
      exploitedMines.add(mineIndex);
    }
  }
  return {
    seconds: Number(state.time.toFixed(1)),
    team,
    population: Sim.populationUsed(state, team),
    military: military.length,
    workers: workers.length,
    rubies: state.rubies[team],
    ingredients: state.ingredients[team],
    waves: controller.metrics.waves,
    exploitedMines: exploitedMines.size,
    heroAlive: Boolean(hero),
    heroLevel: hero?.level ?? state.heroProgress[team].level,
    militaryNearEnemyBase: military.filter((unit) => Math.hypot(unit.x - enemyBase.x, unit.y - enemyBase.y) < 600).length,
  };
}

function play(difficulty, initialSeed, minutes, reversed) {
  let seed = initialSeed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const state = Sim.create();
  const delays = [random() * 4, random() * 4];
  for (const unit of state.units) {
    const cell = Sim.nearest(unit.x + random() * 120 - 60, unit.y + random() * 120 - 60);
    unit.x = (cell % Sim.COLS) * Sim.CELL + 10;
    unit.y = Math.floor(cell / Sim.COLS) * Sim.CELL + 10;
  }
  // Factions are fixed to team IDs in Sim. Rotate starting assets to swap sides.
  if (reversed) {
    const positions = [...state.bases, ...state.units, ...state.mines];
    positions.push(...state.mines.filter((mine) => mine.site).map((mine) => mine.site));
    for (const position of positions) {
      position.x = Sim.COLS * Sim.CELL - position.x;
      position.y = Sim.ROWS * Sim.CELL - position.y;
    }
  }
  Sim.visibility(state);
  const controllers = [0, 1].map((team) => createAI(team, difficulty, state));
  const bankSeconds = [0, 0];
  const maxBankSeconds = [0, 0];
  const stepSeconds = 0.1;
  const totalSteps = Math.floor(minutes * 600);
  for (let step = 0; step < totalSteps && state.winner === null; step++) {
    for (const team of [0, 1]) {
      if (state.time >= delays[team]) {
        controllers[team].update(state);
      }
    }
    Sim.tick(state, stepSeconds);
    for (const team of [0, 1]) {
      bankSeconds[team] = state.rubies[team] > 1500 ? bankSeconds[team] + stepSeconds : 0;
      maxBankSeconds[team] = Math.max(maxBankSeconds[team], bankSeconds[team]);
    }
    // Integer steps avoid missing a report through floating point drift.
    if ((step + 1) % 1200 === 0) {
      for (const team of [0, 1]) {
        console.log(`releve ${JSON.stringify(snapshot(state, team, controllers[team]))}`);
      }
    }
  }
  console.log(JSON.stringify({
    seed: initialSeed,
    winner: state.winner,
    seconds: Number(state.time.toFixed(1)),
    maxBankSeconds: maxBankSeconds.map((seconds) => Number(seconds.toFixed(1))),
  }));
}

function main(argumentsList) {
  const [difficulty, ...argumentsRest] = argumentsList;
  const seeds = [];
  let factions = 'cuistots-rats';
  let minutes = 30;
  for (let index = 0; index < argumentsRest.length; index++) {
    const argument = argumentsRest[index];
    if (argument === '--factions') {
      factions = argumentsRest[++index];
    } else if (argument === '--minutes') {
      minutes = Number(argumentsRest[++index]);
    } else if (/^\d+$/.test(argument)) {
      seeds.push(Number(argument));
    } else {
      throw new Error(`Argument invalide : ${argument}`);
    }
  }
  if (!Object.hasOwn(DIFFICULTIES, difficulty ?? '') || seeds.length === 0 ||
      seeds.some((seed) => !Number.isSafeInteger(seed) || seed > 0xffffffff) ||
      !Number.isFinite(minutes) || minutes <= 0 ||
      !['cuistots-rats', 'rats-cuistots', 'miroir'].includes(factions)) {
    throw new Error('Usage : node scripts/ia-diagnostic.mjs <difficulté> <graine> [<graine> ...] [--factions cuistots-rats|rats-cuistots|miroir] [--minutes N]');
  }
  // Miroir compares both starting orientations, in this order, for each seed.
  for (const seed of seeds) {
    const orientations = factions === 'miroir' ? [false, true] : [factions === 'rats-cuistots'];
    for (const reversed of orientations) {
      play(difficulty, seed, minutes, reversed);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
