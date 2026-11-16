'use strict';
import {
  BUILDINGS,
  baseSites,
  producers,
  ensureSlots as syncSlots,
  construct as placeBuilding,
} from './slots.js';
import { BrigadeCuisine } from './cooks-config.js';
import { RatsGout } from './rats-config.js';
const W = 4000;
const H = 2200;
const CELL = 20;
const COLS = W / CELL;
const ROWS = H / CELL;
const TYPES = BrigadeCuisine.unites;
const NEUTRAL = -1;
const BOAR = {
  hp: 220,
  damage: 12,
  range: 25,
  rate: 1.2,
  speed: TYPES.commis.speed * 0.9,
  name: 'Sanglier des cendres',
};
function unitLimit(team) {
  return (team === 1 ? RatsGout : BrigadeCuisine).unitLimit;
}
function stats(type, team) {
  if (team === NEUTRAL) return BOAR;
  return team === 1 ? RatsGout.unites[type] : TYPES[type];
}
const RULES = {
  towerRadius: 90,
  towerCapture: 4,
  towerVision: 420,
  forestDamage: 2,
  forestReveal: 80,
  mineCost: 120,
  mineReserve: 30000,
  harvestCapacity: 10,
  harvestTime: 3,
  harvestSpeed: 60,
};
// All dimensions are world pixels; the collision grid is shared with the server.
const baseApproach = [[450, 1750], [760, 1750], [960, 1550], [1100, 1550]];
const enemyApproach = baseApproach.map(([x, y]) => [W - x, H - y]).reverse();
const lanes = [
  { name: 'centre', width: 440, points: [...baseApproach, [1420, 750], [1660, 750], [2000, 1100], [2340, 1450], [2580, 1450], ...enemyApproach] },
  { name: 'nord', width: 180, points: [...baseApproach, [1300, 850], [1500, 450], [2000, 450], ...enemyApproach] },
  { name: 'sud', width: 180, points: [...baseApproach, [2000, 1750], [2500, 1750], [2700, 1350], ...enemyApproach] },
];
const passages = [
  { name: 'nord-ouest', width: 140, points: [[650, 850], [1300, 850]] },
  { name: 'nord-est', width: 140, points: [[1800, 450], [1800, 850]] },
  { name: 'sud-est', width: 140, points: [[3350, 1350], [2700, 1350]] },
  { name: 'sud-ouest', width: 140, points: [[2200, 1750], [2200, 1350]] },
];
const reservedSites = [
  { name: 'tour-nord', x: 1800, y: 650 },
  { name: 'tour-sud', x: 2200, y: 1550 },
  { name: 'camp-nord-ouest', x: 450, y: 1300 },
  { name: 'camp-sud-est', x: 3550, y: 900 },
  { name: 'camp-nord-est', x: 1600, y: 200 },
  { name: 'camp-sud-ouest', x: 2400, y: 2000 },
  { name: 'braises-ouest', x: 950, y: 850 },
  { name: 'braises-est', x: 3050, y: 1350 },
];
function segmentDistance(x, y, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const ratio = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - ratio * dx, y - a[1] - ratio * dy);
}
function onRoute(x, y, points, width) {
  return points.slice(1).some((point, index) => segmentDistance(x, y, points[index], point) < width / 2);
}
function homeTerrain(x, y) {
  // The chamber and natural pocket have no other opening through their walls.
  if (x < 820 && y > 1460) {
    return (x >= 120 && x < 680 && y >= 1520 && y < 2100) || (x >= 680 && y >= 1670 && y < 1830);
  }
  if (x >= 800 && x < 1120 && y > 1260) {
    return (x >= 820 && x < 1020 && y >= 1380 && y < 1860) ||
      (x >= 1020 && y >= 1400 && y < 1700);
  }
  return null;
}
// Keep the outer branches serving the four connectors and the side pockets.
const outerBranch = [[1100, 1550], [650, 1100], [650, 450], [2000, 450]];
const centralCorridor = [
  [1100, 1550], [1300, 1550], [1300, 850], [2000, 850],
  [2000, 1350], [2700, 1350], [2700, 650], [2900, 650],
];
const peripheralGroves = [[240, 360, 110, 140], [1100, 120, 140, 70], [2300, 120, 180, 70]];
function traversable(x, y) {
  const home = homeTerrain(x, y);
  if (home !== null) return home;
  const away = homeTerrain(W - x, H - y);
  if (away !== null) return away;
  if (lanes.slice(1).some((lane) => onRoute(x, y, lane.points.slice(3, -3), lane.width))) return true;
  // Broad shared approaches leave 440 px around the offset central entrances.
  if ((x >= 1120 && x < 1680 && y >= 360 && y < 800) ||
      (x > 2320 && x <= 2880 && y > 1400 && y <= 1840)) return true;
  // Offset entrances force the central approach around both forest walls.
  if ((x >= 1520 && x < 1640 && y >= 800 && y < 1900) ||
      (x > 2360 && x <= 2480 && y > 300 && y <= 1400)) return false;
  if (x >= 1640 && x < 2360 && y >= 840 && y < 1360) return true;
  if (onRoute(x, y, outerBranch, 180) ||
      onRoute(W - x, H - y, outerBranch, 180)) return true;
  if (onRoute(x, y, centralCorridor, 440)) return true;
  if (passages.some((passage) => onRoute(x, y, passage.points, passage.width))) return true;
  if (onRoute(x, y, baseApproach.slice(2), 300) || onRoute(x, y, enemyApproach.slice(0, 2), 300)) return true;
  if (peripheralGroves.some(([gx, gy, rx, ry]) =>
    ((x - gx) / rx) ** 2 + ((y - gy) / ry) ** 2 < 1 ||
    ((W - x - gx) / rx) ** 2 + ((H - y - gy) / ry) ** 2 < 1)) return false;
  // Broad side clearings break up the forest. Narrow strips retain the flank
  // corridors; the openings at their ends lead into these optional pockets.
  if ((x < 500 && y < 1260) || (x > 3500 && y > 940)) return true;
  if ((y < 300 && x < 2920) || (y > 1900 && x > 1080)) return true;
  if ((x > 760 && x < 1760 && y > 960 && y < 1240) ||
      (x < 3240 && x > 2240 && y < 1240 && y > 960)) return true;
  if (reservedSites.some((site) => !site.name.startsWith('tour-') && Math.hypot(x - site.x, y - site.y) < 180)) return true;
  return false;
}
// Concealing groves use the existing artwork and rules.
const groves = [
  { x: 1450, y: 1100, rx: 90, ry: 60 },
  { x: 2550, y: 1100, rx: 90, ry: 60 },
];
const walk = new Uint8Array(COLS * ROWS);
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    walk[y * COLS + x] = traversable(x * CELL + CELL / 2, y * CELL + CELL / 2) ? 1 : 0;
  }
}
function nearest(x, y) {
  let best = -1,
    d = Infinity;
  for (let i = 0; i < walk.length; i++)
    if (walk[i]) {
      let dx = (i % COLS) * CELL + 10 - x,
        dy = Math.floor(i / COLS) * CELL + 10 - y,
        dd = dx * dx + dy * dy;
      if (dd < d) {
        d = dd;
        best = i;
      }
    }
  return best;
}
function route(x, y, tx, ty) {
  let a = nearest(x, y),
    b = nearest(tx, ty);
  if (a === b) return [];
  let queue = [a],
    head = 0,
    prev = new Int32Array(walk.length).fill(-1);
  prev[a] = a;
  while (head < queue.length && prev[b] === -1) {
    let i = queue[head++],
      ix = i % COLS,
      iy = Math.floor(i / COLS);
    for (let [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      let nx = ix + dx,
        ny = iy + dy,
        n = ny * COLS + nx;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || !walk[n] || prev[n] !== -1) continue;
      if (dx && dy && (!walk[i + dx] || !walk[i + dy * COLS])) continue;
      prev[n] = i;
      queue.push(n);
    }
  }
  if (prev[b] === -1) return [];
  let out = [];
  for (let n = b; n !== a; n = prev[n])
    out.push({ x: (n % COLS) * CELL + 10, y: Math.floor(n / COLS) * CELL + 10 });
  return out.reverse();
}
function forest(u) {
  return groves.some((grove) => ((u.x - grove.x) / grove.rx) ** 2 + ((u.y - grove.y) / grove.ry) ** 2 < 1);
}
function configureIncome(s, team, bonus) {
  if (!s.incomeMultiplier) s.incomeMultiplier = [1, 1];
  s.incomeMultiplier[team] = 1 + bonus;
}
function createBraises() {
  return reservedSites.filter((site) => site.name.startsWith('braises-')).map((site) => ({
    ...site,
    lit: false,
    holder: NEUTRAL,
    nextTickAt: null,
  }));
}
function braisesTick(s, dt) {
  let cursor = s.time - dt;
  while (cursor < s.time - 1e-9) {
    while (cursor + 1e-9 >= s.braisesNextAt) {
      for (const foyer of s.braises) {
        foyer.lit = !foyer.lit;
        foyer.holder = NEUTRAL;
        foyer.nextTickAt = null;
      }
      s.braisesNextAt += s.braises[0].lit ? 60 : 90;
    }
    const end = Math.min(s.time, s.braisesNextAt);
    for (const foyer of s.braises) {
      if (!foyer.lit) continue;
      const nearby = [...s.units, ...s.monsters].filter((unit) => unit.hp > 0 &&
        Math.hypot(unit.x - foyer.x, unit.y - foyer.y) <= 150);
      const military = nearby.filter((unit) => unit.type !== 'commis');
      const first = military.some((unit) => unit.team === 0);
      const second = military.some((unit) => unit.team === 1);
      const holder = first !== second ? (first ? 0 : 1) : NEUTRAL;
      if (holder !== foyer.holder || holder === NEUTRAL) {
        foyer.nextTickAt = holder === NEUTRAL ? null : cursor + 5;
      }
      foyer.holder = holder;
      // A dead defender cannot keep cooking until the end of a long step.
      const survival = military.filter((unit) => unit.team === holder)
        .reduce((longest, unit) => Math.max(longest, unit.team === 0 ? Infinity : unit.hp / 2), 0);
      while (foyer.nextTickAt !== null && foyer.nextTickAt <= Math.min(end, cursor + survival) + 1e-9) {
        s.ingredients[holder] += holder === 0 ? 3 : 6;
        foyer.nextTickAt += 5;
      }
      for (const unit of nearby) {
        if (unit.team !== 0) applyDamage(s, unit, 2 * (end - cursor));
      }
      if (holder !== NEUTRAL && !nearby.some((unit) => unit.team === holder && unit.type !== 'commis' && unit.hp > 0)) {
        foyer.holder = NEUTRAL;
        foyer.nextTickAt = null;
      }
    }
    cursor = end;
  }
  // Apply the visible transition at its exact timestamp, without burning retroactively.
  if (s.time + 1e-9 >= s.braisesNextAt) {
    for (const foyer of s.braises) {
      foyer.lit = !foyer.lit;
      foyer.holder = NEUTRAL;
      foyer.nextTickAt = null;
    }
    s.braisesNextAt += s.braises[0].lit ? 60 : 90;
  }
}
function createWatchtowers() {
  return reservedSites.filter((site) => site.name.startsWith('tour-')).map((site) => ({
    ...site,
    owner: NEUTRAL,
    capturingTeam: NEUTRAL,
    progress: 0,
    losses: [0, 0],
  }));
}
function watchtowersTick(s, dt) {
  for (const tower of s.watchtowers) {
    const nearby = s.units.filter((unit) => unit.hp > 0 && unit.type !== 'commis' &&
      (unit.team === 0 || unit.team === 1) && Math.hypot(unit.x - tower.x, unit.y - tower.y) < RULES.towerRadius);
    const first = nearby.some((unit) => unit.team === 0);
    const second = nearby.some((unit) => unit.team === 1);
    const team = first !== second ? (first ? 0 : 1) : NEUTRAL;
    if (team === NEUTRAL || team === tower.owner) {
      tower.progress = 0;
      tower.capturingTeam = NEUTRAL;
      continue;
    }
    if (tower.capturingTeam !== team) tower.progress = 0;
    tower.capturingTeam = team;
    tower.progress = Math.min(RULES.towerCapture, tower.progress + dt);
    if (tower.progress + 1e-9 >= RULES.towerCapture) {
      if (tower.owner !== NEUTRAL) tower.losses[tower.owner]++;
      tower.owner = team;
      tower.progress = 0;
      tower.capturingTeam = NEUTRAL;
      visibility(s);
    }
  }
}
function create() {
  let s = {
    matchCounters: [emptyMatchCounters(), emptyMatchCounters()],
    heroProgress: [{ level: 1, xp: 0 }, { level: 1, xp: 0 }],
    queues: [[], []],
    controlGroups: [[], [], [], []],
    time: 0,
    id: 0,
    rubies: [100, 100],
    ingredients: [0, 0],
    ragout: { readyAt: null, expiresAt: 0 },
    festin: { readyAt: null },
    monsterId: 0,
    monsters: [],
    corpses: [],
    devourEvents: [],
    camps: reservedSites.filter((site) => site.name.startsWith('camp-')).map((site) => ({ ...site, respawnAt: null })),
    incomeMultiplier: [1, 1],
    units: [],
    shots: [],
    damageEvents: [],
    winner: null,
    aiClock: 0,
    fogClock: 0,
    bases: [
      { x: 450, y: 1750, team: 0, hp: 1500, max: 1500, base: true },
      { x: 3550, y: 450, team: 1, hp: 1500, max: 1500, base: true },
    ],
    watchtowers: createWatchtowers(),
    braises: createBraises(),
    braisesNextAt: 240,
    mines: [
      { x: 535, y: 1770, owner: 0, name: 'Mine de la Braise', boost: false },
      { x: 3465, y: 430, owner: 1, name: 'Mine du Voile', boost: false },
      { x: 940, y: 1550, owner: -1, name: 'Naturelle de la Braise', boost: false, site: { x: 860, y: 1550 } },
      { x: 3060, y: 650, owner: -1, name: 'Naturelle du Voile', boost: false, site: { x: 3140, y: 650 } },
      { x: 2000, y: 1100, owner: -1, name: 'Veine riche', boost: true, site: { x: 2052, y: 1224 } },
      { x: 650, y: 410, owner: -1, name: 'Flanc nord — ouest', boost: false, site: { x: 650, y: 490 } },
      { x: 3350, y: 1790, owner: -1, name: 'Flanc sud — est', boost: false, site: { x: 3350, y: 1710 } },
      { x: 1440, y: 450, owner: -1, name: 'Flanc nord — est', boost: false, site: { x: 1360, y: 450 } },
      { x: 2560, y: 1750, owner: -1, name: 'Flanc sud — ouest', boost: false, site: { x: 2640, y: 1750 } },
    ],
    visible: [new Uint8Array(walk.length), new Uint8Array(walk.length)],
    explored: [new Uint8Array(walk.length), new Uint8Array(walk.length)],
  };
  for (const mine of s.mines) mine.remaining = RULES.mineReserve;
  for (const camp of s.camps) spawnCamp(s, camp);
  spawn(s, 'commis', 0);
  spawn(s, 'commis', 1);
  ensureSlots(s);
  visibility(s);
  return s;
}
// Monsters use IDs, never object references, for targets across saved ticks.
function spawnCamp(s, camp) {
  for (const offset of [-24, 24]) {
    s.monsters.push({
      // Army IDs also determine collision ties; keep their sequence unchanged.
      id: --s.monsterId,
      type: 'sanglier',
      team: NEUTRAL,
      camp: camp.name,
      x: camp.x + offset,
      y: camp.y,
      hp: BOAR.hp,
      max: BOAR.hp,
      cool: 0,
      path: [],
      targetId: null,
      returning: false,
    });
  }
  camp.respawnAt = null;
}
function returnMonster(monster, camp) {
  monster.returning = true;
  monster.targetId = null;
  monster.lastAttackAt = undefined;
  monster.hp = monster.max;
  monster.path = route(monster.x, monster.y, camp.x, camp.y);
}
function monstersTick(s, dt) {
  for (const monster of s.monsters) {
    if (monster.hp <= 0) continue;
    const camp = s.camps.find((camp) => camp.name === monster.camp);
    monster.cool -= dt;
    if (Math.hypot(monster.x - camp.x, monster.y - camp.y) > 260) {
      returnMonster(monster, camp);
    }
    if (monster.returning) {
      const burning = s.braises.some((foyer) => foyer.lit &&
        Math.hypot(monster.x - foyer.x, monster.y - foyer.y) <= 150);
      if (!burning) monster.hp = monster.max;
      const point = monster.path[0] || camp;
      const distance = Math.hypot(point.x - monster.x, point.y - monster.y);
      const step = Math.min(distance, BOAR.speed * dt);
      if (distance) moveSafely(monster, (point.x - monster.x) / distance * step, (point.y - monster.y) / distance * step);
      if (distance <= step) monster.path.shift();
      if (Math.hypot(monster.x - camp.x, monster.y - camp.y) < 2) monster.returning = false;
      continue;
    }
    let target = s.units.find((unit) => unit.id === monster.targetId && unit.hp > 0);
    if (!target) target = s.units.find((unit) => unit.hp > 0 && Math.hypot(unit.x - camp.x, unit.y - camp.y) < 90);
    monster.targetId = target?.id ?? null;
    if (!target) continue;
    const distance = Math.hypot(target.x - monster.x, target.y - monster.y);
    if (distance <= BOAR.range) {
      if (monster.cool <= 0) {
        monster.cool = BOAR.rate;
        monster.lastAttackTargetId = target.id;
        monster.lastAttackAt = s.time;
        applyDamage(s, target, BOAR.damage);
      }
    } else {
      // Route around walls so the leash also works near the clearing edge.
      if (!monster.path.length || monster.repathAt <= s.time) {
        monster.path = route(monster.x, monster.y, target.x, target.y);
        monster.repathAt = s.time + 0.5;
      }
      const point = monster.path[0];
      if (!point) continue;
      const length = Math.hypot(point.x - monster.x, point.y - monster.y);
      const step = Math.min(length, BOAR.speed * dt);
      if (length) moveSafely(monster, (point.x - monster.x) / length * step, (point.y - monster.y) / length * step);
      if (length <= step) monster.path.shift();
      if (Math.hypot(monster.x - camp.x, monster.y - camp.y) > 260) returnMonster(monster, camp);
    }
  }
  s.monsters = s.monsters.filter((monster) => monster.hp > 0);
  for (const camp of s.camps) {
    if (s.monsters.some((monster) => monster.camp === camp.name)) continue;
    if (camp.respawnAt === null) camp.respawnAt = s.time + 120;
    if (s.time >= camp.respawnAt) spawnCamp(s, camp);
  }
}
// Resolve the persistent structure, since producers() returns presentation copies.
function rallyBuilding(s, team, buildingId) {
  if (buildingId === 'main_' + team) return s.bases[team];
  const mine = s.mines.find((mine, index) =>
    buildingId === 'mine_' + index && mine.depot && mine.owner === team);
  if (mine) return mine.site;
  return s.slots?.[team]?.find((slot) => slot.id === buildingId && slot.occupe);
}
function setRally(s, team, command) {
  const building = rallyBuilding(s, team, command.buildingId);
  if (s.winner !== null || !building) return false;
  let rally;
  if (command.mineIndex !== undefined) {
    const mine = s.mines[command.mineIndex];
    if (!Number.isInteger(command.mineIndex) || !mine || mine.owner !== team) return false;
    rally = { mineIndex: command.mineIndex };
  } else if (command.unitId !== undefined) {
    const unit = s.units.find((unit) => unit.id === command.unitId && unit.team === team && unit.hp > 0);
    if (!unit) return false;
    rally = { unitId: unit.id };
  } else {
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return false;
    rally = { x: Math.max(0, Math.min(W, command.x)), y: Math.max(0, Math.min(H, command.y)) };
  }
  building.rally = rally;
  return true;
}
function rallyPoint(s, rally) {
  if (!rally) return null;
  if (rally.mineIndex !== undefined) return s.mines[rally.mineIndex];
  if (rally.unitId !== undefined) return s.units.find((unit) => unit.id === rally.unitId && unit.hp > 0);
  return rally;
}
function applyRally(s, unit, origin) {
  const rally = rallyBuilding(s, unit.team, origin?.id)?.rally;
  const point = rallyPoint(s, rally);
  if (!point) return;
  const workerGroundRally = unit.type === 'commis' &&
    rally.mineIndex === undefined && rally.unitId === undefined;
  order(s, [unit.id], point.x, point.y, null, workerGroundRally);
  if (rally.mineIndex !== undefined && unit.type === 'commis' && availableMine(point, unit.team)) {
    assignHarvest(s, unit, rally.mineIndex);
  } else if (rally.unitId !== undefined && point.team === unit.team) {
    unit.followId = point.id;
    unit.attackDestination = null;
  }
}
function spawn(s, type, team, origin = null) {
  let b = origin || s.bases[team],
    n = s.units.filter((u) => u.team === team).length,
    i = origin
      ? nearest(b.x + ((n % 3) - 1) * 12, b.y + 25)
      : nearest(b.x + (team ? -65 : 70) + (n % 3) * 22, b.y + 45 + Math.floor(n / 3) * 24);
  s.units.push({
    id: ++s.id,
    type,
    team,
    x: (i % COLS) * CELL + 10,
    y: Math.floor(i / COLS) * CELL + 10,
    hp: stats(type, team).hp,
    max: stats(type, team).hp,
    cool: 0,
    path: [],
    target: null,
    hold: false,
    repath: 0,
    retreat: false,
    cargo: 0,
    harvest: null,
  });
  if (type === 'hero') {
    s.heroProgress ??= [{ level: 1, xp: 0 }, { level: 1, xp: 0 }];
    const hero = s.units.at(-1);
    Object.assign(hero, s.heroProgress[team]);
    hero.max = stats(type, team).hp * (1 + 0.15 * (hero.level - 1));
    hero.hp = hero.max;
  }
  if (type === 'commis') {
    const mine =
      s.mines
        .map((m, i) => ({ m, i }))
        .filter((v) => availableMine(v.m, team))
        .sort(
          (a, c) => Math.hypot(a.m.x - b.x, a.m.y - b.y) - Math.hypot(c.m.x - b.x, c.m.y - b.y),
        )[0]?.i ?? -1;
    if (mine >= 0) assignHarvest(s, s.units.at(-1), mine);
  }
  applyRally(s, s.units.at(-1), origin);
}
function emptyMatchCounters() {
  return {
    rubiesCollected: 0,
    unitsProduced: 0,
    unitsLost: 0,
    unitsKilled: 0,
    buildingsDestroyed: 0,
  };
}
function matchStats(s) {
  return {
    teams: [0, 1].map((team) => ({ ...emptyMatchCounters(), ...s.matchCounters?.[team] })),
    duration: s.time,
  };
}
function awardHeroExperience(s, target, recipient = null, bonus = 0) {
  if (!recipient && !target.type) return;
  for (const hero of s.units) {
    if (hero.type !== 'hero' || hero.hp <= 0) continue;
    if (recipient ? hero !== recipient : hero.team === target.team) continue;
    if (!recipient && Math.hypot(hero.x - target.x, hero.y - target.y) >= 400) continue;
    const experience = recipient ? bonus : target.type === 'sanglier' ? 30 : target.type === 'commis' ? 10 : 20;
    hero.xp += experience;
    hero.level = hero.xp >= 250 ? 3 : hero.xp >= 100 ? 2 : 1;
    const maximum = stats('hero', hero.team).hp * (1 + 0.15 * (hero.level - 1));
    hero.hp += maximum - hero.max;
    hero.max = maximum;
    s.heroProgress ??= [{ level: 1, xp: 0 }, { level: 1, xp: 0 }];
    s.heroProgress[hero.team] = { level: hero.level, xp: hero.xp };
  }
}
function applyDamage(s, target, damage, attackerTeam = null, attackerId = null) {
  if (target.team === NEUTRAL && target.returning && attackerTeam !== null) return;
  const wasAlive = target.hp > 0;
  target.hp -= damage;
  if (damage > 0 && target.devour?.startedAt != null) cancelDevour(target);
  if (wasAlive && target.hp <= 0 && !target.base && target.type !== 'commis') {
    s.corpses.push({ id: target.id, x: target.x, y: target.y, type: target.type, team: target.team, expiresAt: s.time + 30 });
  }
  if (wasAlive && target.hp <= 0) awardHeroExperience(s, target);
  recordDamageEvent(s, target);
  if (target.team === NEUTRAL) {
    if (wasAlive && !target.returning && attackerTeam !== null) {
      target.targetId = attackerId;
    }
    if (wasAlive && target.hp <= 0 && (attackerTeam === 0 || attackerTeam === 1)) s.ingredients[attackerTeam] += 15;
    return;
  }
  if (!wasAlive || target.hp > 0) return;
  if (!target.base) s.matchCounters[target.team].unitsLost++;
  if (attackerTeam === null || attackerTeam === target.team) return;
  const counter = target.base ? 'buildingsDestroyed' : 'unitsKilled';
  s.matchCounters[attackerTeam][counter]++;
}
// Shared migration for saved solo states and persisted server matches.
function migrateState(s) {
  s.watchtowers ??= createWatchtowers();
  s.braises ??= createBraises();
  s.braisesNextAt ??= 240;
  delete s.tower;
  s.ingredients ??= [0, 0];
  s.ragout ??= { readyAt: null, expiresAt: 0 };
  s.festin ??= { readyAt: null };
  s.monsterId ??= 0;
  s.monsters ??= [];
  s.corpses ??= [];
  s.devourEvents ??= [];
  s.camps ??= [];
  if (!s.incomeMultiplier) s.incomeMultiplier = [1, 1];
  s.matchCounters ??= [emptyMatchCounters(), emptyMatchCounters()];
  if (Object.hasOwn(s, 'gold')) {
    if (!Object.hasOwn(s, 'rubies')) s.rubies = s.gold;
    delete s.gold;
  }
  for (const mine of s.mines || []) {
    if (mine.remaining === undefined) mine.remaining = RULES.mineReserve;
    if (mine.boost) mine.name = 'Veine riche';
  }
  return s;
}
const RAGOUT_REASONS = {
  faction: 'Seuls les Cuistots peuvent préparer le Ragoût.',
  tower: 'Tour principale indisponible.',
  cooking: 'Ragoût déjà en cuisson.',
  ingredients: 'Ingrédients insuffisants : 40 nécessaires.',
  ended: 'La partie est terminée.',
};
function festinFreePlaces(s) {
  return populationCap(s, 1) - populationUsed(s, 1);
}
function cookDishBlockReason(s, team, dish = 'ragout') {
  if (dish === 'festin') {
    if (team !== 1) return 'Seuls les Rats-Goût peuvent préparer le Festin.';
    if (s.winner !== null) return RAGOUT_REASONS.ended;
    if (!(s.bases[1]?.hp > 0)) return 'Grande Décharge indisponible.';
    if (festinFreePlaces(s) < 4) return 'Population insuffisante : 4 places libres nécessaires.';
    if (s.festin?.readyAt != null) return 'Festin déjà en préparation.';
    if ((s.ingredients?.[team] || 0) < 40) return RAGOUT_REASONS.ingredients;
    return null;
  }
  if (dish !== 'ragout') return 'Plat inconnu.';
  if (team !== 0) return RAGOUT_REASONS.faction;
  if (s.winner !== null) return RAGOUT_REASONS.ended;
  if (!(s.bases[team]?.hp > 0)) return RAGOUT_REASONS.tower;
  if (s.ragout?.readyAt != null) return RAGOUT_REASONS.cooking;
  if ((s.ingredients?.[team] || 0) < 40) return RAGOUT_REASONS.ingredients;
  return null;
}
function cookDish(s, team, dish = 'ragout') {
  const reason = cookDishBlockReason(s, team, dish);
  if (reason) return { ok: false, reason };
  migrateState(s);
  s.ingredients[team] -= 40;
  if (dish === 'festin') s.festin.readyAt = s.time + 15;
  else s.ragout.readyAt = s.time + 20;
  return { ok: true, reason: null };
}
function festinTick(s) {
  if (s.festin.readyAt === null || s.time + 1e-9 < s.festin.readyAt) return;
  s.festin.readyAt = null;
  if (!(s.bases[1]?.hp > 0)) return;
  const count = Math.max(0, Math.min(4, festinFreePlaces(s)));
  for (let index = 0; index < count; index++) {
    spawn(s, 'knight', 1, { ...s.bases[1], id: 'main_1' });
  }
}
function ragoutActive(s, unit) {
  return unit.team === 0 && unit.type !== 'commis' && unit.hp > 0 &&
    (unit.ragoutUntil || 0) > s.time + 1e-9;
}
function ragoutDamageMultiplier(s, unit) {
  if (!ragoutActive(s, unit)) return 1;
  const chefNearby = s.units.some((hero) => hero.type === 'hero' &&
    hero.team === unit.team && hero.hp > 0 && Math.hypot(hero.x - unit.x, hero.y - unit.y) < 250);
  return chefNearby ? 1.25 : 1.15;
}
function ragoutTick(s) {
  if (s.ragout.readyAt === null || s.time + 1e-9 < s.ragout.readyAt) return;
  s.ragout.expiresAt = s.ragout.readyAt + 45;
  s.ragout.readyAt = null;
  for (const unit of s.units) {
    if (unit.team === 0 && unit.type !== 'commis' && unit.hp > 0) {
      unit.ragoutUntil = s.ragout.expiresAt;
      if (unit.type === 'hero') awardHeroExperience(s, null, unit, 40);
    }
  }
}
function ensureSlots(s) {
  migrateState(s);
  return syncSlots(s, (x, y, occupied, base) => {
    let best = null,
      d = Infinity;
    for (let i = 0; i < walk.length; i++)
      if (walk[i]) {
        const px = (i % COLS) * CELL + 10,
          py = Math.floor(i / COLS) * CELL + 10;
        if (
          occupied.some((p) => Math.hypot(p.x - px, p.y - py) < 36) ||
          Math.hypot(base.x - px, base.y - py) < 48 ||
          s.mines.some((m) => Math.hypot(m.x - px, m.y - py) < 32)
        )
          continue;
        const dd = (px - x) ** 2 + (py - y) ** 2;
        if (dd < d) {
          d = dd;
          best = { x: px, y: py };
        }
      }
    return best || { x, y };
  });
}
function construct(s, team, type, baseId, slotId = null) {
  ensureSlots(s);
  return placeBuilding(s, team, type, baseId, slotId);
}
export function populationCap(state, team) {
  return unitLimit(team);
}
export function populationUsed(state, team) {
  const units = state.units.filter((unit) => unit.team === team);
  const jobs = state.queues?.[team] || [];
  return [...units, ...jobs].reduce((total, unit) => total + (unit.type === 'hero' ? 3 : 1), 0);
}
function heroBlockReason(state, team) {
  if (state.units.some((unit) => unit.team === team && unit.type === 'hero' && unit.hp > 0)) return 'heroAlive';
  if (state.queues[team].some((job) => job.type === 'hero')) return 'heroQueued';
  return null;
}
export function canRecruit(s, team, type, producerId = null) {
  s.queues ??= [[], []];
  if (s.winner !== null || !Object.hasOwn(TYPES, type)) return false;
  ensureSlots(s);
  const queue = s.queues[team];
  if (type === 'hero' && heroBlockReason(s, team)) return false;
  return s.rubies[team] >= stats(type, team).cost &&
    populationUsed(s, team) + (type === 'hero' ? 3 : 1) <= populationCap(s, team) &&
    producers(s, team, type).some((producer) =>
      (!producerId || producer.id === producerId) &&
      queue.filter((job) => job.producerId === producer.id).length < 8);
}
// Evaluate on a copy because canRecruit also migrates older states.
export function recruitBlockReason(state, team, type, producerId = null) {
  const snapshot = structuredClone(state);
  if (canRecruit(snapshot, team, type, producerId)) return null;
  const queue = snapshot.queues[team];
  const population = populationUsed(snapshot, team);
  if (population + (type === 'hero' ? 3 : 1) > populationCap(snapshot, team)) return 'population';
  if (type === 'hero' && heroBlockReason(snapshot, team)) return heroBlockReason(snapshot, team);
  const buildings = producers(snapshot, team, type).filter((producer) =>
    !producerId || producer.id === producerId);
  if (!buildings.length) return 'producer';
  if (buildings.every((producer) =>
    queue.filter((job) => job.producerId === producer.id).length >= 8)) return 'queues';
  if (Object.hasOwn(TYPES, type) && snapshot.rubies[team] < stats(type, team).cost) return 'rubies';
  return 'producer';
}
export function leastLoadedProducer(state, team, candidates) {
  const queue = state.queues[team];
  const available = candidates.filter((producer) =>
    queue.filter((job) => job.producerId === producer.id).length < 8);
  const workload = (producer) => queue.filter((job) => job.producerId === producer.id)
    .reduce((total, job) => total + job.remaining, 0);
  available.sort((a, b) => workload(a) - workload(b));
  return available[0];
}

function recruit(s, type, team, producerId = null) {
  if (!canRecruit(s, team, type, producerId)) return false;
  const cfg = stats(type, team);
  const q = s.queues[team];
  const options = producers(s, team, type).filter((producer) =>
    (!producerId || producer.id === producerId) &&
    q.filter((job) => job.producerId === producer.id).length < 8);
  const producer = leastLoadedProducer(s, team, options);
  s.rubies[team] -= cfg.cost;
  s.nextProductionJobId = (s.nextProductionJobId || 0) + 1;
  q.push({
    id: s.nextProductionJobId,
    type,
    remaining: cfg.production,
    total: cfg.production,
    producerId: producer.id,
  });
  return true;
}
function cancelProduction(s, team, producerId, jobId) {
  if (!Number.isInteger(jobId)) return false;
  const queue = s.queues?.[team];
  const index = queue?.findIndex((job) => job.id === jobId) ?? -1;
  const job = queue?.[index];
  if (s.winner !== null || !job || job.producerId !== producerId) return false;
  s.rubies[team] += stats(job.type, team).cost;
  queue.splice(index, 1);
  return true;
}
function productionTick(s, dt) {
  s.queues ??= [[], []];
  ensureSlots(s);
  for (let t = 0; t < 2; t++) {
    const q = s.queues[t],
      available = Object.keys(TYPES).flatMap((type) => producers(s, t, type));
    for (let i = q.length - 1; i >= 0; i--) {
      const job = q[i];
      if (!Number.isInteger(job.id)) {
        s.nextProductionJobId = (s.nextProductionJobId || 0) + 1;
        job.id = s.nextProductionJobId;
      }
      if (!job.producerId) {
        const p = available.find((p) => p.unit === job.type);
        if (p) job.producerId = p.id;
      }
      if (!available.some((p) => p.id === job.producerId && p.unit === job.type)) {
        s.rubies[t] += stats(job.type, t).cost;
        q.splice(i, 1);
      }
    }
    const uniqueProducers = available.filter((producer, index) =>
      available.findIndex((item) => item.id === producer.id) === index);
    for (const p of uniqueProducers) {
      let left = dt;
      while (left > 0) {
        const index = q.findIndex((j) => j.producerId === p.id);
        if (index < 0) break;
        const j = q[index],
          step = Math.min(left, j.remaining);
        j.remaining -= step;
        left -= step;
        if (j.remaining <= 1e-6) {
          q.splice(index, 1);
          spawn(s, j.type, t, p);
          s.matchCounters[t].unitsProduced++;
        } else break;
      }
    }
  }
}

function startWaypoint(s, unit, point) {
  unit.path = route(unit.x, unit.y, point.x, point.y);
  if (!unit.path.length) unit.path = [{ x: point.x, y: point.y }];
  unit.attackDestination = point.attackMove ? point : null;
  unit.retreat = !point.attackMove && !point.target;
  unit.chasing = false;
  unit.target = point.target
    ? point.target.base
      ? s.bases[point.target.team]
      : [...s.units, ...s.monsters].find((candidate) => candidate.id === point.target.id) || null
    : null;
  if (point.target && (!unit.target || unit.target.hp <= 0 || !canSee(s, unit.team, unit.target))) {
    unit.target = null;
    unit.path = [];
    unit.retreat = true;
  }
  unit.autoTargetId = null;
  unit.lastRetargetAt = null;
  unit.hold = false;
  unit.repath = 0;
  unit.stuck = null;
}

function order(s, ids, x, y, target = null, retreat = !target, queue = false) {
  const units = s.units.filter((u) => ids.includes(u.id));
  if (!units.length) return;
  const centerX = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
  const centerY = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
  const spreadX = units.reduce((sum, unit) => sum + (unit.x - centerX) ** 2, 0);
  const spreadY = units.reduce((sum, unit) => sum + (unit.y - centerY) ** 2, 0);
  const axis = spreadX >= spreadY ? 'x' : 'y';
  const secondaryAxis = axis === 'x' ? 'y' : 'x';
  const byOffset = (a, b) => a[axis] - b[axis] || a[secondaryAxis] - b[secondaryAxis];
  units.sort((a, b) => byOffset(a, b) || a.id - b.id);
  const targetCell = nearest(x, y);
  const targetX = (targetCell % COLS) * CELL + 10;
  const targetY = Math.floor(targetCell / COLS) * CELL + 10;
  const cells = [];
  for (let cell = 0; cell < walk.length; cell++) {
    if (!walk[cell]) continue;
    const px = (cell % COLS) * CELL + 10;
    const py = Math.floor(cell / COLS) * CELL + 10;
    cells.push({ x: px, y: py, distance: (px - targetX) ** 2 + (py - targetY) ** 2 });
  }
  cells.sort((a, b) => a.distance - b.distance);
  const destinations = [];
  for (const cell of cells) {
    if (destinations.some((destination) =>
      Math.hypot(destination.x - cell.x, destination.y - cell.y) < 24)) continue;
    const path = route(targetX, targetY, cell.x, cell.y);
    if (cell.distance > 0 && !path.length) continue;
    let previous = { x: targetX, y: targetY };
    let length = 0;
    for (const point of path) {
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    if (length > 1.5 * Math.sqrt(cell.distance)) continue;
    destinations.push(cell);
    if (destinations.length === units.length) break;
  }
  destinations.sort(byOffset);
  units.forEach((u, index) => {
    const destination = destinations[index % destinations.length];
    cancelDevour(u);
    if (queue === true) {
      u.orderQueue ??= [];
      if (u.orderQueue.length >= 8) return;
      const point = { x: destination.x, y: destination.y, attackMove: !retreat };
      if (target) {
        point.x = target.x;
        point.y = target.y;
        point.target = target.base ? { base: true, team: target.team } : { id: target.id };
        point.attackMove = false;
      }
      u.orderQueue.push(point);
      if (u.orderQueue.length === 1 &&
          (u.harvest || u.manual || u.patrol || u.followId || (!u.path.length && !u.target && !u.chasing))) {
        u.followId = null;
        u.patrol = null;
        u.manual = null;
        u.harvest = null;
        u.queueActive = true;
        startWaypoint(s, u, point);
      }
      return;
    }
    u.orderQueue = [];
    u.queueActive = false;
    u.followId = null;
    u.patrol = null;
    u.manual = null;
    u.harvest = null;
    u.path = route(u.x, u.y, destination.x, destination.y);
    if (!u.path.length) u.path = [{ x: destination.x, y: destination.y }];
    u.attackDestination = !retreat && !target ? destination : null;
    u.chasing = false;
    u.target = target;
    u.autoTargetId = null;
    u.lastRetargetAt = null;
    u.hold = false;
    u.retreat = retreat;
    u.repath = 0;
    u.stuck = null;
  });
}
function cancelDevour(unit) {
  if (!unit.devour) return;
  unit.devour = null;
  unit.path = [];
  unit.retreat = false;
  unit.stuck = null;
}
function devour(s, team, ids, corpseId) {
  const corpse = s.corpses.find((item) => item.id === corpseId && item.expiresAt > s.time);
  const units = s.units.filter((unit) => ids.includes(unit.id) && unit.team === team && unit.hp > 0);
  if (!corpse || !visibleAt(s, team, corpse.x, corpse.y)) return false;
  order(s, units.map((unit) => unit.id), corpse.x, corpse.y);
  const eater = units.filter((unit) => unit.team === 1 && unit.type !== 'commis')
    .sort((a, b) => Math.hypot(a.x - corpse.x, a.y - corpse.y) - Math.hypot(b.x - corpse.x, b.y - corpse.y) || a.id - b.id)[0];
  if (!eater) return false;
  const companions = units.filter((unit) => unit !== eater).map((unit) => unit.id);
  order(s, companions, corpse.x + 48, corpse.y);
  eater.devour = { corpseId, startedAt: null };
  eater.path = route(eater.x, eater.y, corpse.x, corpse.y);
  return true;
}
function devourTick(s, unit, dt) {
  const corpse = s.corpses.find((item) => item.id === unit.devour.corpseId);
  if (!corpse) {
    cancelDevour(unit);
    return;
  }
  if (unit.devour.startedAt == null) {
    if (Math.hypot(unit.x - corpse.x, unit.y - corpse.y) <= 24) {
      unit.path = [];
      unit.devour.startedAt = s.time;
    } else {
      let remaining = stats(unit.type, unit.team).speed * dt;
      while (remaining > 0 && unit.path.length) {
        const point = unit.path[0];
        const distance = Math.hypot(point.x - unit.x, point.y - unit.y);
        const step = Math.min(distance, remaining);
        if (distance > 0) moveSafely(unit, (point.x - unit.x) / distance * step, (point.y - unit.y) / distance * step);
        remaining -= step;
        if (Math.hypot(point.x - unit.x, point.y - unit.y) > 0.01) break;
        unit.path.shift();
      }
      if (!unit.path.length && Math.hypot(unit.x - corpse.x, unit.y - corpse.y) > 24) cancelDevour(unit);
    }
    return;
  }
  const duration = unit.type === 'hero' ? 3 : 4;
  if (s.time - unit.devour.startedAt + 1e-9 < duration) return;
  const amount = corpse.type === 'sanglier' ? 10 : 6;
  s.ingredients[unit.team] += amount;
  if (unit.type === 'hero') awardHeroExperience(s, null, unit, 40);
  unit.hp = Math.min(unit.max, unit.hp + unit.max * 0.3);
  s.devourEvents.push({ x: unit.x, y: unit.y, team: unit.team, amount, time: s.time });
  s.corpses = s.corpses.filter((item) => item.id !== corpse.id);
  cancelDevour(unit);
}
function patrol(s, ids, x, y) {
  const origins = new Map(
    s.units
      .filter((unit) => ids.includes(unit.id))
      .map((unit) => [unit.id, { x: unit.x, y: unit.y }]),
  );
  order(s, ids, x, y, null, false);
  for (const unit of s.units) {
    if (!origins.has(unit.id)) continue;
    unit.patrol = { points: [origins.get(unit.id), { ...unit.path.at(-1) }], index: 1 };
  }
}

function build(s, team, index) {
  let m = s.mines[index];
  if (
    s.winner !== null ||
    !m ||
    (m.owner === team && (index < 2 || m.depot)) ||
    s.rubies[team] < RULES.mineCost ||
    !s.units.some((u) => u.team === team && Math.hypot(u.x - m.x, u.y - m.y) < 95) ||
    s.units.some((u) => u.team !== team && Math.hypot(u.x - m.x, u.y - m.y) < 95)
  )
    return false;
  s.rubies[team] -= RULES.mineCost;
  m.owner = team;
  if (index >= 2) {
    m.site ??= { x: m.x - 60, y: m.y + 30 };
    m.depot = true;
  }
  ensureSlots(s);
  visibility(s);
  return true;
}
function visibleAt(s, t, x, y) {
  let cx = Math.floor(x / CELL),
    cy = Math.floor(y / CELL);
  return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && !!s.visible[t][cy * COLS + cx];
}
function canSee(s, t, u) {
  if (u.team === t) return true;
  if (!visibleAt(s, t, u.x, u.y)) return false;
  if (
    !u.base &&
    forest(u) &&
    !s.units.some((a) => a.team === t && Math.hypot(a.x - u.x, a.y - u.y) < RULES.forestReveal)
  )
    return false;
  return true;
}
function visibility(s) {
  for (let t = 0; t < 2; t++) {
    let v = s.visible[t];
    v.fill(0);
    let sources = [
      ...baseSites(s, t).map((b) => ({ ...b, vision: 180 })),
      ...s.units
        .filter((u) => u.team === t)
        .map((u) => ({ x: u.x, y: u.y, vision: stats(u.type, u.team).vision })),
      ...s.mines.filter((m) => m.owner === t).map((m) => ({ ...m, vision: 105 })),
      ...s.watchtowers.filter((tower) => tower.owner === t).map((tower) => ({ ...tower, vision: RULES.towerVision })),
    ];
    // Visit only cells inside each source's bounds instead of testing every
    // cell against every source. The strict radius test matches the old rule.
    for (const source of sources) {
      const minX = Math.max(0, Math.ceil((source.x - source.vision - 10) / CELL));
      const maxX = Math.min(COLS - 1, Math.floor((source.x + source.vision - 10) / CELL));
      const minY = Math.max(0, Math.ceil((source.y - source.vision - 10) / CELL));
      const maxY = Math.min(ROWS - 1, Math.floor((source.y + source.vision - 10) / CELL));
      const radiusSquared = source.vision * source.vision;
      for (let cy = minY; cy <= maxY; cy++) {
        const dy = cy * CELL + 10 - source.y;
        for (let cx = minX; cx <= maxX; cx++) {
          const index = cy * COLS + cx;
          if (v[index]) continue;
          const dx = cx * CELL + 10 - source.x;
          if (dx * dx + dy * dy < radiusSquared) v[index] = 1;
        }
      }
    }
    for (let i = 0; i < v.length; i++) {
      if (v[i]) s.explored[t][i] = 1;
    }
  }
}
function recordDamageEvent(s, entity) {
  if (s.time - (entity.lastDamageEventAt ?? -Infinity) < 1) return;
  // Persist the cooldown because server requests reload entities from storage.
  entity.lastDamageEventAt = s.time;
  s.damageEvents.push({ x: entity.x, y: entity.y, team: entity.team, time: s.time });
  if (s.damageEvents.length > 24) {
    s.damageEvents.splice(0, s.damageEvents.length - 24);
  }
}
// Workers can defend themselves but are not combat threats.
function targetPriority(entity) {
  if (entity.base || !entity.type) return 3;
  if (entity.type === 'commis' || !(stats(entity.type, entity.team).damage > 0)) return 2;
  return 1;
}
function targetKey(entity) {
  return entity.base ? `base${entity.team}` : entity.id;
}
function automaticTarget(s, unit, range, retaliating = false) {
  let priority = Infinity;
  let nearestDistance = Infinity;
  const candidates = [];
  const entities = [...s.units, ...s.monsters, s.bases[1 - unit.team]];
  for (const candidate of entities) {
    if (candidate.team === NEUTRAL && (candidate.returning || !candidate.targetId || candidate.lastAttackAt === undefined)) continue;
    if (candidate.team === unit.team || candidate.hp <= 0) continue;
    const distanceSquared = (candidate.x - unit.x) ** 2 + (candidate.y - unit.y) ** 2;
    if (distanceSquared > range * range || !canSee(s, unit.team, candidate)) continue;
    const candidatePriority = targetPriority(candidate);
    if (retaliating && (candidatePriority !== 1 || candidate.lastAttackTargetId !== unit.id ||
        s.time - candidate.lastAttackAt > stats(candidate.type, candidate.team).rate + 0.1)) continue;
    if (candidatePriority > priority) continue;
    if (candidatePriority < priority) {
      candidates.length = 0;
      nearestDistance = Infinity;
      priority = candidatePriority;
    }
    const distance = Math.sqrt(distanceSquared);
    nearestDistance = Math.min(nearestDistance, distance);
    candidates.push({ entity: candidate, distance });
  }
  // Anchor the 10 px band to the nearest enemy: pairwise comparisons can drift.
  let selected = null;
  let selectedDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.distance > nearestDistance + 10) continue;
    if (!selected || candidate.entity.hp < selected.hp ||
        (candidate.entity.hp === selected.hp && candidate.distance < selectedDistance)) {
      selected = candidate.entity;
      selectedDistance = candidate.distance;
    }
  }
  return selected;
}
function tick(s, dt) {
  migrateState(s);
  if (s.winner !== null) return;
  productionTick(s, dt);
  s.time += dt;
  ragoutTick(s);
  festinTick(s);
  s.corpses = s.corpses.filter((corpse) => corpse.expiresAt > s.time + 1e-9);
  s.devourEvents = s.devourEvents.filter((event) => s.time - event.time < 1.5);
  s.damageEvents = (s.damageEvents || []).filter((event) => s.time - event.time < 5).slice(-24);
  s.fogClock += dt;
  s.aiClock += dt;
  watchtowersTick(s, dt);
  if (s.fogClock > 0.18) {
    visibility(s);
    s.fogClock = 0;
  }
  monstersTick(s, dt);
  braisesTick(s, dt);
  const fighting = new Set();
  const entities = new Map([...s.units, ...s.monsters].map((unit) => [unit.id, unit]));
  for (const base of s.bases) entities.set(targetKey(base), base);
  for (let u of s.units) {
    if (u.hp <= 0) continue;
    u.cool -= dt;
    u.repath -= dt;
    if (forest(u)) {
      applyDamage(s, u, RULES.forestDamage * dt);
    }
    if (u.hp <= 0) continue;
    if (u.devour) {
      devourTick(s, u, dt);
      if (u.devour?.startedAt != null) fighting.add(u.id);
      continue;
    }
    if (u.manual) {
      manualTick(u, dt);
      continue;
    }
    if (u.harvest) {
      harvestTick(s, u, dt);
      continue;
    }
    if (u.followId) {
      const leader = entities.get(u.followId);
      if (!leader || leader.hp <= 0 || leader.team !== u.team) {
        u.followId = null;
        u.path = [];
      } else if (u.repath <= 0) {
        u.path = Math.hypot(leader.x - u.x, leader.y - u.y) > 45
          ? route(u.x, u.y, leader.x, leader.y) : [];
        u.repath = 0.3;
      }
    }
    let cfg = stats(u.type, u.team),
      target = u.target;
    // Allow the initial approach; abandon a target that escapes both the waypoint and pursuit range.
    const activeWaypoint = u.queueActive ? u.orderQueue?.[0] : null;
    const targetedWaypoint = activeWaypoint?.target;
    if (target && (target.returning || target.hp <= 0 || !canSee(s, u.team, target) ||
        (targetedWaypoint && u.chasing &&
          Math.hypot(target.x - activeWaypoint.x, target.y - activeWaypoint.y) > cfg.range + 75 +
            (target.base ? 45 : 0) &&
          Math.hypot(target.x - u.x, target.y - u.y) > cfg.range + 75 + (target.base ? 45 : 0)))) {
      target = u.target = null;
      if (targetedWaypoint) {
        u.path = [];
        u.chasing = false;
        u.hold = false;
      }
    }
    if (!target && !u.retreat && !targetedWaypoint) {
      target = entities.get(u.autoTargetId);
      if (target && (target.returning || target.hp <= 0 || !canSee(s, u.team, target) ||
          Math.hypot(target.x - u.x, target.y - u.y) > cfg.range + 75 + (target.base ? 45 : 0))) {
        target = null;
        if (u.chasing) u.path = [];
      }
      if (!target) {
        target = automaticTarget(s, u, cfg.range + 75);
      } else if (s.time - (u.lastRetargetAt ?? -Infinity) >= 0.5) {
        const threat = targetPriority(target) > 1 ? automaticTarget(s, u, cfg.range + 75) : null;
        let attacker = threat && targetPriority(threat) === 1 ? threat : null;
        if (!attacker && Math.hypot(target.x - u.x, target.y - u.y) > cfg.range) {
          attacker = automaticTarget(s, u, cfg.range, true);
        }
        if (attacker && attacker !== target) {
          target = attacker;
          u.lastRetargetAt = s.time;
          u.repath = 0;
        }
      }
      u.autoTargetId = target ? targetKey(target) : null;
    }
    if (!target && !u.hold && u.chasing && u.attackDestination) {
      u.path = route(u.x, u.y, u.attackDestination.x, u.attackDestination.y);
      u.chasing = false;
    }
    while (!target && !u.path.length && !u.chasing && u.orderQueue?.length) {
      if (u.queueActive) u.orderQueue.shift();
      u.queueActive = u.orderQueue.length > 0;
      if (u.queueActive) {
        u.followId = null;
        u.patrol = null;
        startWaypoint(s, u, u.orderQueue[0]);
        target = u.target;
      } else {
        u.retreat = false;
        u.attackDestination = null;
      }
    }
    if (!target && !u.hold && u.patrol && !u.path.length) {
      u.patrol.index = 1 - u.patrol.index;
      const destination = u.patrol.points[u.patrol.index];
      u.attackDestination = destination;
      u.path = route(u.x, u.y, destination.x, destination.y);
    }
    let d = target ? Math.hypot(target.x - u.x, target.y - u.y) : Infinity;
    if (target && d <= cfg.range + (target.base ? 45 : 0) && !u.retreat) {
      fighting.add(u.id);
      if (u.cool <= 0) {
        u.cool = cfg.rate;
        u.lastAttackTargetId = target.id ?? null;
        u.lastAttackAt = s.time;
        const levelMultiplier = u.type === 'hero' ? 1 + 0.15 * (u.level - 1) : 1;
        const damage = cfg.damage * levelMultiplier * ragoutDamageMultiplier(s, u);
        applyDamage(s, target, damage, u.team, u.id);
        if (cfg.splash) {
          for (const v of [...s.units, ...s.monsters])
            if (
              v !== target &&
              v.team !== u.team &&
              v.hp > 0 &&
              Math.hypot(v.x - target.x, v.y - target.y) <= cfg.splash
            ) {
              applyDamage(s, v, damage, u.team, u.id);
            }
        }
        s.shots.push({
          x: u.x,
          y: u.y - 15,
          tx: target.x,
          ty: target.y - 12,
          team: u.team,
          life: 0.2,
        });
        if (target.base && target.hp <= 0) {
          s.winner = u.team;
          return;
        }
      }
    } else {
      if (target && !u.hold && !u.retreat && u.repath <= 0) {
        u.chasing = true;
        u.path = route(u.x, u.y, target.x, target.y);
        u.repath = 0.9;
      }
      if (!u.hold && u.path.length) {
        // A displaced unit must not return to a waypoint it has already passed.
        // Keep the next segment's corner checks when cutting a waypoint.
        while (u.path.length > 1) {
          const point = u.path[0];
          const next = u.path[1];
          const passed = (u.x - point.x) * (next.x - point.x) +
            (u.y - point.y) * (next.y - point.y) >= 0;
          if (!passed) break;
          const probe = { x: u.x, y: u.y };
          moveSafely(probe, next.x - probe.x, next.y - probe.y);
          if (Math.hypot(probe.x - next.x, probe.y - next.y) > 0.01) break;
          u.path.shift();
        }
        let remaining = cfg.speed * dt;
        while (remaining > 0 && u.path.length) {
          const point = u.path[0];
          const dx = point.x - u.x;
          const dy = point.y - u.y;
          const length = Math.hypot(dx, dy);
          const step = Math.min(length, remaining);
          if (length > 0) moveSafely(u, dx / length * step, dy / length * step);
          remaining -= step;
          if (Math.hypot(point.x - u.x, point.y - u.y) >= 0.01) break;
          u.path.shift();
        }
        if (!u.path.length && !u.orderQueue?.length) u.retreat = false;
      }
    }
  }
  for (const camp of s.camps) {
    if (camp.respawnAt === null && !s.monsters.some((monster) => monster.camp === camp.name && monster.hp > 0)) camp.respawnAt = s.time + 120;
  }
  separate(s.units, fighting, dt);
  for (const u of s.units) {
    if (!u.path.length || u.hold || fighting.has(u.id)) {
      u.stuck = null;
      continue;
    }
    if (!u.stuck || Math.hypot(u.x - u.stuck.x, u.y - u.stuck.y) > 2) {
      u.stuck = { x: u.x, y: u.y, elapsed: 0 };
    } else {
      u.stuck.elapsed += dt;
      if (u.stuck.elapsed > 1) {
        const destination = u.path.at(-1);
        u.path = route(u.x, u.y, destination.x, destination.y);
        if (!u.path.length) u.path = [destination];
        u.stuck = null;
      }
    }
  }
  s.units = s.units.filter((u) => u.hp > 0);
  s.shots = s.shots.filter((p) => (p.life -= dt) > 0);
}

// Check the whole segment, including both sides of diagonal corners.
function moveSafely(u, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
  const valid = (x, y) =>
    x >= 0 && x < W && y >= 0 && y < H &&
    walk[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)];
  for (let step = 0; step < steps; step++) {
    const x = u.x + dx / steps;
    const y = u.y + dy / steps;
    if (!valid(x, u.y) || !valid(u.x, y) || !valid(x, y)) {
      // Slide along terrain instead of freezing both axes against a corner.
      if (valid(x, u.y)) u.x = x;
      else if (valid(u.x, y)) u.y = y;
      continue;
    }
    u.x = x;
    u.y = y;
  }
}
function separate(units, fighting, dt) {
  const radius = (u) => u.type === 'knight' ? 12 : u.type === 'mage' ? 11 : 9;
  // Separation changes positions only: combat and path status stay fixed for
  // this pass. Skip immovable pairs before computing their geometry.
  const mobile = units.map((unit) => !fighting.has(unit.id));
  const nextMobile = new Array(units.length + 1);
  nextMobile[units.length] = units.length;
  for (let index = units.length - 1; index >= 0; index--) {
    nextMobile[index] = mobile[index] ? index : nextMobile[index + 1];
  }
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.hp <= 0) continue;
    // Preserve pair order, jumping over pairs where both units are fighting.
    for (let j = mobile[i] ? i + 1 : nextMobile[i + 1]; j < units.length;
      j = mobile[i] ? j + 1 : nextMobile[j + 1]) {
      const b = units[j];
      if (b.hp <= 0) continue;
      if (a.team === b.team && (a.harvest || b.harvest)) continue;
      const movableA = mobile[i] && (a.path.length > 0 || b.path.length === 0);
      const movableB = mobile[j] && (b.path.length > 0 || a.path.length === 0);
      const count = Number(movableA) + Number(movableB);
      if (!count) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      // No unit pair can overlap beyond the largest combined radius.
      if (dx <= -24 || dx >= 24 || dy <= -24 || dy >= 24) continue;
      const combinedRadius = radius(a) + radius(b);
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared >= combinedRadius * combinedRadius) continue;
      const distance = Math.hypot(dx, dy);
      const overlap = combinedRadius - distance;
      if (overlap <= 0) continue;
      if (distance === 0) {
        // Stable IDs break coincident positions without randomness.
        const angle = ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      } else {
        dx /= distance;
        dy /= distance;
      }
      // Incoming units yield to allies that have already settled in formation.
      const push = Math.min(overlap / count, 30 * dt);
      if (movableA) moveSafely(a, -dx * push, -dy * push);
      if (movableB) moveSafely(b, dx * push, dy * push);
    }
  }
}

export function idleWorkers(s, team) {
  return s.units.filter((unit) =>
    unit.team === team && unit.type === 'commis' && unit.hp > 0 &&
    (s.idleWorkerIds ? s.idleWorkerIds.includes(unit.id) :
      !unit.harvest && !unit.path.length && !unit.manual && !unit.patrol &&
      !unit.followId && !unit.target && !unit.autoTargetId && !unit.hold &&
      !unit.attackDestination),
  ).sort((a, b) => a.id - b.id);
}

function availableMine(mine, team) {
  return mine && mine.owner === team && mine.remaining > 0 && !(mine.hp <= 0);
}

function reassignHarvest(s, unit) {
  const base = s.bases[unit.team];
  let closest = -1;
  let distance = Infinity;
  for (let index = 0; index < s.mines.length; index++) {
    const mine = s.mines[index];
    if (!availableMine(mine, unit.team)) continue;
    const candidate = (mine.x - base.x) ** 2 + (mine.y - base.y) ** 2;
    if (candidate < distance) {
      closest = index;
      distance = candidate;
    }
  }
  if (closest >= 0) assignHarvest(s, unit, closest);
  else {
    unit.harvest = null;
    unit.path = [];
  }
}

function harvestPath(u, x, y) {
  const cell = nearest(x, y),
    dest = { x: (cell % COLS) * CELL + 10, y: Math.floor(cell / COLS) * CELL + 10 };
  u.path = route(u.x, u.y, dest.x, dest.y);
  if (!u.path.length) u.path = [dest];
}

function returnToDepot(s, u) {
  const options = [
    { ...s.bases[u.team], index: -1 },
    ...s.mines.flatMap((m, index) => (m.owner === u.team && m.depot ? [{ ...m.site, index }] : [])),
  ];
  let best = null;
  for (const d of options) {
    const path = route(u.x, u.y, d.x, d.y);
    let x = u.x,
      y = u.y,
      length = 0;
    for (const p of path) {
      length += Math.hypot(p.x - x, p.y - y);
      x = p.x;
      y = p.y;
    }
    if (!best || length < best.length) best = { ...d, length };
  }
  u.harvest.depot = best.index;
  harvestPath(u, best.x, best.y);
}
function approachMine(s, u) {
  const mine = s.mines[u.harvest.mine];
  const depot = s.mines[u.harvest.depot]?.site || s.bases[u.team];
  const spread = ((u.id * 0.618033988749895) % 1 - 0.5) * Math.PI * 2 / 3;
  const angle = Math.atan2(depot.y - mine.y, depot.x - mine.x) + spread;
  const destination = {
    x: mine.x + Math.cos(angle) * 20,
    y: mine.y + Math.sin(angle) * 20,
  };
  harvestPath(u, destination.x, destination.y);
  u.path.push(destination);
}
function assignHarvest(s, u, index) {
  u.manual = null;
  u.patrol = null;
  u.followId = null;
  u.orderQueue = [];
  u.queueActive = false;
  u.harvest = { mine: index, phase: u.cargo > 0 ? 'VERS_BASE' : 'VERS_GISEMENT', elapsed: 0 };
  u.target = null;
  u.autoTargetId = null;
  u.attackDestination = null;
  u.chasing = false;
  u.hold = false;
  u.retreat = false;
  if (u.cargo > 0) returnToDepot(s, u);
  else {
    approachMine(s, u);
  }
}
function gather(s, team, ids, index) {
  const m = s.mines[index];
  if (s.winner !== null || !Number.isInteger(index) || !availableMine(m, team)) return false;
  const workers = s.units.filter(
    (u) => u.team === team && u.type === 'commis' && u.hp > 0 && ids.includes(u.id),
  );
  for (const u of workers) assignHarvest(s, u, index);
  return workers.length > 0;
}
function harvestTick(s, u, dt) {
  let h = u.harvest,
    m = s.mines[h.mine];
  if (!availableMine(m, u.team) && h.phase !== 'VERS_BASE') {
    reassignHarvest(s, u);
    return;
  }
  if (
    h.phase === 'VERS_BASE' &&
    h.depot >= 0 &&
    (!s.mines[h.depot]?.depot || s.mines[h.depot].owner !== u.team)
  )
    returnToDepot(s, u);
  let left = dt;
  while (left > 0 && u.harvest) {
    h = u.harvest;
    if (h.phase === 'MINAGE') {
      const step = Math.min(left, RULES.harvestTime - h.elapsed);
      h.elapsed += step;
      left -= step;
      if (h.elapsed < RULES.harvestTime - 1e-8) break;
      u.cargo = Math.min(m.remaining, RULES.harvestCapacity * (m.boost ? 2 : 1));
      m.remaining -= u.cargo;
      h.phase = 'VERS_BASE';
      returnToDepot(s, u);
      continue;
    }
    while (u.path.length && left > 0) {
      const p = u.path[0],
        dx = p.x - u.x,
        dy = p.y - u.y,
        d = Math.hypot(dx, dy),
        time = d / RULES.harvestSpeed;
      if (time <= left) {
        moveSafely(u, p.x - u.x, p.y - u.y);
        if (Math.hypot(p.x - u.x, p.y - u.y) >= 0.01) break;
        u.path.shift();
        left -= time;
      } else {
        moveSafely(u, (dx / d) * RULES.harvestSpeed * left, (dy / d) * RULES.harvestSpeed * left);
        left = 0;
      }
    }
    if (u.path.length) break;
    if (h.phase === 'VERS_GISEMENT') {
      h.phase = 'MINAGE';
      h.elapsed = 0;
    } else {
      const deposit = (u.cargo || 0) * (s.incomeMultiplier?.[u.team] ?? 1);
      s.rubies[u.team] += deposit;
      s.matchCounters[u.team].rubiesCollected += deposit;
      u.cargo = 0;
      if (!availableMine(m, u.team)) {
        reassignHarvest(s, u);
        break;
      }
      h.phase = 'VERS_GISEMENT';
      approachMine(s, u);
    }
  }
}

// Presentation prediction uses the same routing, speed and terrain collision as simulation.
function predictMotion(state, unit, command, dt) {
  if (command.kind === 'steer') {
    const length = Math.hypot(command.dx, command.dy);
    if (length) {
      const distance = stats(unit.type, unit.team).speed * dt;
      moveSafely(unit, command.dx / length * distance, command.dy / length * distance);
    }
    return;
  }
  if (!unit.path?.length) return;
  let distance = stats(unit.type, unit.team).speed * dt;
  while (distance > 0 && unit.path.length) {
    const point = unit.path[0];
    const dx = point.x - unit.x;
    const dy = point.y - unit.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) {
      unit.path.shift();
      continue;
    }
    const step = Math.min(distance, length);
    moveSafely(unit, dx / length * step, dy / length * step);
    distance -= step;
    if (step === length) unit.path.shift();
  }
}

export const CendreSim = {
  devour,
  cancelDevour,
  cookDish,
  cookDishBlockReason,
  ragoutActive,
  idleWorkers,
  leastLoadedProducer,
  setRally,
  rallyBuilding,
  rallyPoint,
  predictMotion,
  steer,
  disengage,
  baseSites,
  cancelProduction,
  producers,
  gather,
  BUILDINGS,
  migrateState,
  matchStats,
  ensureSlots,
  construct,
  W,
  H,
  CELL,
  COLS,
  ROWS,
  TYPES,
  RULES,
  stats,
  walk,
  lanes,
  passages,
  reservedSites,
  groves,
  nearest,
  route,
  forest,
  create,
  configureIncome,
  spawn,
  recruit,
  canRecruit,
  populationCap,
  populationUsed,
  unitLimit,
  recruitBlockReason,
  order,
  patrol,
  build,
  visibleAt,
  canSee,
  visibility,
  tick,
};

// Short-lived steering input: no chasing, no pathfinding, and no cliff crossing.
function steer(s, ids, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const length = Math.hypot(dx, dy),
    divisor = Math.max(1, length);
  for (const u of s.units)
    if (ids.includes(u.id)) {
      cancelDevour(u);
      u.orderQueue = [];
      u.queueActive = false;
      u.followId = null;
      u.patrol = null;
      u.harvest = null;
      u.attackDestination = null;
      u.chasing = false;
      u.target = null;
      u.autoTargetId = null;
      u.path = [];
      u.retreat = false;
      u.hold = true;
      u.manual = length > 0.08 ? { dx: dx / divisor, dy: dy / divisor, left: 0.65 } : null;
    }
}
function manualTick(u, dt) {
  const m = u.manual,
    step = stats(u.type, u.team).speed * Math.min(dt, m.left);
  const valid = (x, y) =>
    x >= 0 && x < W && y >= 0 && y < H && walk[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)];
  const dx = m.dx * step,
    dy = m.dy * step;
  // Axis checks also prevent cutting across blocked diagonal corners.
  if (valid(u.x + dx, u.y)) u.x += dx;
  if (valid(u.x, u.y + dy)) u.y += dy;
  m.left -= dt;
  if (m.left <= 0) u.manual = null;
}

// Retreat from nearby visible enemies; without contact, fall back toward home.
function disengage(s, ids) {
  const units = s.units.filter((unit) => ids.includes(unit.id) && unit.hp > 0);
  if (!units.length) return;
  const team = units[0].team;
  const x = units.reduce((sum, unit) => sum + unit.x, 0) / units.length;
  const y = units.reduce((sum, unit) => sum + unit.y, 0) / units.length;
  const enemies = s.units.filter(
    (unit) =>
      unit.team !== team &&
      canSee(s, team, unit) &&
      unit.hp > 0 &&
      !unit.base &&
      Math.hypot(unit.x - x, unit.y - y) < 260,
  );
  let dx = s.bases[team].x - x;
  let dy = s.bases[team].y - y;
  if (enemies.length) {
    dx = x - enemies.reduce((sum, unit) => sum + unit.x, 0) / enemies.length;
    dy = y - enemies.reduce((sum, unit) => sum + unit.y, 0) / enemies.length;
  }
  const length = Math.hypot(dx, dy);
  if (!length) {
    dx = team ? 1 : -1;
    dy = 0;
  }
  const divisor = length || 1;
  order(s, ids, x + dx / divisor * 150, y + dy / divisor * 150, null, true);
}
