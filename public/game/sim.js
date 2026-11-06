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
const W = 1680,
  H = 940,
  CELL = 20,
  COLS = 84,
  ROWS = 47;
const TYPES = BrigadeCuisine.unites;
function stats(type, team) {
  return team === 1 ? RatsGout.unites[type] : TYPES[type];
}
const RULES = {
  towerRadius: 65,
  towerCapture: 4,
  baseBlindRadius: 200,
  forestDamage: 2,
  forestReveal: 80,
  mineCost: 120,
  harvestCapacity: 10,
  harvestTime: 3,
  harvestSpeed: 60,
};
// Traversable terrain joined by the map's ramps; cliffs and lava stay outside.
const polygons = [
  [
    [180, 600],
    [355, 530],
    [490, 558],
    [610, 660],
    [705, 716],
    [672, 812],
    [554, 845],
    [395, 839],
    [275, 770],
    [150, 701],
  ],
  [
    [470, 552],
    [557, 558],
    [660, 634],
    [618, 673],
  ],
  [
    [565, 352],
    [705, 308],
    [1040, 310],
    [1140, 365],
    [1133, 525],
    [1035, 585],
    [947, 722],
    [802, 765],
    [704, 714],
    [644, 634],
    [580, 587],
    [556, 487],
  ],
  [
    [710, 78],
    [1017, 45],
    [1050, 210],
    [986, 258],
    [765, 260],
    [710, 211],
  ],
  [
    [822, 237],
    [924, 237],
    [924, 332],
    [810, 335],
  ],
  [
    [1096, 210],
    [1200, 134],
    [1444, 166],
    [1512, 321],
    [1440, 384],
    [1270, 369],
    [1165, 320],
  ],
  [
    [1135, 301],
    [1221, 321],
    [1157, 393],
    [1080, 369],
  ],
  [
    [1133, 544],
    [1320, 527],
    [1453, 604],
    [1460, 717],
    [1345, 803],
    [1161, 767],
    [1050, 710],
  ],
  [
    [1011, 522],
    [1120, 521],
    [1176, 590],
    [1083, 637],
  ],
  [
    [751, 790],
    [877, 781],
    [946, 864],
    [932, 937],
    [707, 937],
    [665, 886],
  ],
  [
    [762, 697],
    [843, 694],
    [874, 823],
    [747, 828],
  ],
  [
    [281, 240],
    [426, 217],
    [491, 282],
    [445, 351],
    [330, 381],
    [266, 320],
  ],
  [
    [407, 299],
    [491, 297],
    [605, 352],
    [577, 412],
    [464, 374],
  ],
];
function inside(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    let a = p[i],
      b = p[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const walk = new Uint8Array(COLS * ROWS);
for (let y = 0; y < ROWS; y++)
  for (let x = 0; x < COLS; x++)
    walk[y * COLS + x] = polygons.some((p) => inside(x * CELL + 10, y * CELL + 10, p)) ? 1 : 0;
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
  return ((u.x - 800) / 150) ** 2 + ((u.y - 445) / 110) ** 2 < 1;
}
function create() {
  let s = {
    queues: [[], []],
    controlGroups: [[], [], [], []],
    time: 0,
    id: 0,
    gold: [100, 100],
    units: [],
    shots: [],
    winner: null,
    aiClock: 0,
    fogClock: 0,
    bases: [
      { x: 390, y: 667, team: 0, hp: 1500, max: 1500, base: true },
      { x: 1360, y: 265, team: 1, hp: 1500, max: 1500, base: true },
    ],
    tower: { x: 381, y: 299, owner: -1, progress: 0 },
    mines: [
      { x: 475, y: 688, owner: 0, name: 'Mine de la Braise', boost: false },
      { x: 1390, y: 343, owner: 1, name: 'Mine du Voile', boost: false },
      {
        x: 819,
        y: 183,
        owner: -1,
        name: 'Plateau nord — ouest',
        boost: false,
        site: { x: 750, y: 170 },
      },
      {
        x: 810,
        y: 866,
        owner: -1,
        name: 'Faille sud — ouest',
        boost: false,
        site: { x: 730, y: 890 },
      },
      { x: 1275, y: 682, owner: -1, name: 'Mine de rubis', boost: true, site: { x: 1200, y: 710 } },
      {
        x: 970,
        y: 130,
        owner: -1,
        name: 'Plateau nord — est',
        boost: false,
        site: { x: 970, y: 210 },
      },
      {
        x: 900,
        y: 890,
        owner: -1,
        name: 'Faille sud — est',
        boost: false,
        site: { x: 870, y: 830 },
      },
    ],
    visible: [new Uint8Array(walk.length), new Uint8Array(walk.length)],
    explored: [new Uint8Array(walk.length), new Uint8Array(walk.length)],
  };
  spawn(s, 'commis', 0);
  spawn(s, 'commis', 1);
  ensureSlots(s);
  visibility(s);
  return s;
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
  if (type === 'commis') {
    const mine =
      s.mines
        .map((m, i) => ({ m, i }))
        .filter((v) => v.m.owner === team)
        .sort(
          (a, c) => Math.hypot(a.m.x - b.x, a.m.y - b.y) - Math.hypot(c.m.x - b.x, c.m.y - b.y),
        )[0]?.i ?? -1;
    if (mine >= 0) assignHarvest(s, s.units.at(-1), mine);
  }
}
function ensureSlots(s) {
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
function recruit(s, type, team, producerId = null) {
  s.queues ??= [[], []];
  if (s.winner !== null || !Object.hasOwn(TYPES, type)) return false;
  ensureSlots(s);
  const cfg = stats(type, team),
    q = s.queues[team],
    options = producers(s, team, type).filter(
      (p) =>
        (!producerId || p.id === producerId) && q.filter((j) => j.producerId === p.id).length < 8,
    );
  if (
    !options.length ||
    s.gold[team] < cfg.cost ||
    s.units.filter((u) => u.team === team).length + q.length >= 30
  )
    return false;
  const workload = (p) =>
    q.filter((j) => j.producerId === p.id).reduce((n, j) => n + j.remaining, 0);
  options.sort((a, b) => workload(a) - workload(b));
  s.gold[team] -= cfg.cost;
  q.push({ type, remaining: cfg.production, total: cfg.production, producerId: options[0].id });
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
      if (!job.producerId) {
        const p = available.find((p) => p.unit === job.type);
        if (p) job.producerId = p.id;
      }
      if (!available.some((p) => p.id === job.producerId && p.unit === job.type)) {
        s.gold[t] += stats(job.type, t).cost;
        q.splice(i, 1);
      }
    }
    for (const p of available) {
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
        } else break;
      }
    }
  }
}

function order(s, ids, x, y, target = null, retreat = false) {
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
    u.manual = null;
    u.harvest = null;
    u.path = route(u.x, u.y, destination.x, destination.y);
    if (!u.path.length) u.path = [{ x: destination.x, y: destination.y }];
    u.target = target;
    u.hold = false;
    u.retreat = retreat;
    u.repath = 0;
    u.stuck = null;
  });
}
function build(s, team, index) {
  let m = s.mines[index];
  if (
    s.winner !== null ||
    !m ||
    (m.owner === team && (index < 2 || m.depot)) ||
    s.gold[team] < RULES.mineCost ||
    !s.units.some((u) => u.team === team && Math.hypot(u.x - m.x, u.y - m.y) < 95) ||
    s.units.some((u) => u.team !== team && Math.hypot(u.x - m.x, u.y - m.y) < 95)
  )
    return false;
  s.gold[team] -= RULES.mineCost;
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
        .map((u) => ({ ...u, vision: stats(u.type, u.team).vision })),
      ...s.mines.filter((m) => m.owner === t).map((m) => ({ ...m, vision: 105 })),
    ];
    for (let i = 0; i < v.length; i++) {
      let x = (i % COLS) * CELL + 10,
        y = Math.floor(i / COLS) * CELL + 10;
      let tower =
        s.tower.owner === t &&
        Math.hypot(x - s.bases[1 - t].x, y - s.bases[1 - t].y) > RULES.baseBlindRadius &&
        !s.mines.some((m) => m.owner === 1 - t && Math.hypot(x - m.x, y - m.y) < 140);
      if (tower || sources.some((a) => (a.x - x) ** 2 + (a.y - y) ** 2 < a.vision * a.vision)) {
        v[i] = 1;
        s.explored[t][i] = 1;
      }
    }
  }
}
function tick(s, dt) {
  if (s.winner !== null) return;
  productionTick(s, dt);
  s.time += dt;
  s.fogClock += dt;
  s.aiClock += dt;
  let near = s.units.filter(
      (u) => Math.hypot(u.x - s.tower.x, u.y - s.tower.y) < RULES.towerRadius,
    ),
    a = near.some((u) => u.team === 0),
    b = near.some((u) => u.team === 1);
  if (!a && !b) {
    s.tower.owner = -1;
    s.tower.progress = 0;
  } else if (a !== b) {
    s.tower.progress = Math.max(-4, Math.min(4, s.tower.progress + (a ? dt : -dt)));
    if (s.tower.progress >= 4) s.tower.owner = 0;
    if (s.tower.progress <= -4) s.tower.owner = 1;
  }
  if (s.fogClock > 0.18) {
    visibility(s);
    s.fogClock = 0;
  }
  const fighting = new Set();
  for (let u of s.units) {
    if (u.hp <= 0) continue;
    u.cool -= dt;
    u.repath -= dt;
    if (forest(u)) u.hp -= RULES.forestDamage * dt;
    if (u.hp <= 0) continue;
    if (u.manual) {
      manualTick(u, dt);
      continue;
    }
    if (u.harvest) {
      harvestTick(s, u, dt);
      continue;
    }
    let cfg = stats(u.type, u.team),
      target = u.target;
    if (target && (target.hp <= 0 || !canSee(s, u.team, target))) target = u.target = null;
    if (!target && !u.retreat) {
      let list = [...s.units, s.bases[1 - u.team]].filter(
        (v) =>
          v.team !== u.team &&
          v.hp > 0 &&
          canSee(s, u.team, v) &&
          Math.hypot(v.x - u.x, v.y - u.y) < cfg.range + 75,
      );
      target = list.sort(
        (a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y),
      )[0];
    }
    let d = target ? Math.hypot(target.x - u.x, target.y - u.y) : Infinity;
    if (target && d <= cfg.range + (target.base ? 45 : 0) && !u.retreat) {
      fighting.add(u.id);
      if (u.cool <= 0) {
        u.cool = cfg.rate;
        target.hp -= cfg.damage;
        if (cfg.splash) {
          for (const v of s.units)
            if (
              v !== target &&
              v.team !== u.team &&
              v.hp > 0 &&
              Math.hypot(v.x - target.x, v.y - target.y) <= cfg.splash
            )
              v.hp -= cfg.damage;
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
        u.path = route(u.x, u.y, target.x, target.y);
        u.repath = 0.9;
      }
      if (!u.hold && u.path.length) {
        let p = u.path[0],
          dx = p.x - u.x,
          dy = p.y - u.y,
          l = Math.hypot(dx, dy),
          step = cfg.speed * dt;
        if (l <= step) {
          moveSafely(u, p.x - u.x, p.y - u.y);
          if (Math.hypot(p.x - u.x, p.y - u.y) < 0.01) u.path.shift();
          if (!u.path.length) u.retreat = false;
        } else {
          moveSafely(u, (dx / l) * step, (dy / l) * step);
        }
      }
    }
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
    if (!valid(x, u.y) || !valid(u.x, y) || !valid(x, y)) break;
    u.x = x;
    u.y = y;
  }
}
function separate(units, fighting, dt) {
  const radius = (u) => u.type === 'knight' ? 12 : u.type === 'mage' ? 11 : 9;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < units.length; j++) {
      const b = units[j];
      if (b.hp <= 0) continue;
      if (a.team === b.team && (a.harvest || b.harvest)) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const overlap = radius(a) + radius(b) - distance;
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
      const movableA = !fighting.has(a.id);
      const movableB = !fighting.has(b.id);
      const count = Number(movableA) + Number(movableB);
      if (!count) continue;
      const push = Math.min(overlap / count, 30 * dt);
      if (movableA) moveSafely(a, -dx * push, -dy * push);
      if (movableB) moveSafely(b, dx * push, dy * push);
    }
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
function assignHarvest(s, u, index) {
  u.manual = null;
  u.harvest = { mine: index, phase: u.cargo > 0 ? 'VERS_BASE' : 'VERS_GISEMENT', elapsed: 0 };
  u.target = null;
  u.hold = false;
  u.retreat = false;
  if (u.cargo > 0) returnToDepot(s, u);
  else {
    const dest = s.mines[index];
    harvestPath(u, dest.x, dest.y);
  }
}
function gather(s, team, ids, index) {
  const m = s.mines[index];
  if (s.winner !== null || !Number.isInteger(index) || !m || m.owner !== team) return false;
  const workers = s.units.filter(
    (u) => u.team === team && u.type === 'commis' && u.hp > 0 && ids.includes(u.id),
  );
  for (const u of workers) assignHarvest(s, u, index);
  return workers.length > 0;
}
function harvestTick(s, u, dt) {
  let h = u.harvest,
    m = s.mines[h.mine];
  if ((!m || m.owner !== u.team) && h.phase !== 'VERS_BASE') {
    u.harvest = null;
    u.path = [];
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
      u.cargo = RULES.harvestCapacity * (m.boost ? 2 : 1);
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
      s.gold[u.team] += u.cargo || 0;
      u.cargo = 0;
      if (!m || m.owner !== u.team) {
        u.harvest = null;
        break;
      }
      h.phase = 'VERS_GISEMENT';
      harvestPath(u, m.x, m.y);
    }
  }
}

export const CendreSim = {
  steer,
  baseSites,
  producers,
  gather,
  BUILDINGS,
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
  nearest,
  route,
  forest,
  create,
  spawn,
  recruit,
  order,
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
      u.harvest = null;
      u.target = null;
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
