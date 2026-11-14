import { CendreSim as S } from '../public/game/sim.js';
export class MatchError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new MatchError(message, status);
};
export function pack(s) {
  return JSON.stringify(s, (k, v) =>
    k === 'target'
      ? v
        ? v.base
          ? { base: true, team: v.team }
          : { id: v.id }
        : null
      : v instanceof Uint8Array
        ? Array.from(v)
        : v,
  );
}
export function unpack(raw) {
  const s = S.migrateState(JSON.parse(raw));
  s.visible = s.visible.map((v) => Uint8Array.from(v));
  s.explored = s.explored.map((v) => Uint8Array.from(v));
  for (const u of s.units)
    u.target = u.target
      ? u.target.base
        ? s.bases[u.target.team]
        : [...s.units, ...s.monsters].find((v) => v.id === u.target.id) || null
      : null;
  return s;
}
export function view(s, t) {
  const empty = () => Array(S.COLS * S.ROWS).fill(0);
  return {
    slots: S.ensureSlots(s).map((slots) =>
      slots.filter((p) => p.team === t || S.visibleAt(s, t, p.x, p.y)),
    ),
    queues: [0, 1].map((i) => (i === t ? s.queues?.[i] || [] : [])),
    idleWorkerIds: S.idleWorkers(s, t).map((unit) => unit.id),
    time: s.time,
    damageEvents: (s.damageEvents || []).filter((event) => event.team === t && s.time - event.time < 2),
    winner: s.winner,
    ...(s.winner !== null ? { matchCounters: S.matchStats(s).teams } : {}),
    ingredients: s.ingredients.map((amount, team) => team === t ? amount : 0),
    camps: s.camps.map((camp) => ({
      ...camp,
      respawnAt: S.visibleAt(s, t, camp.x, camp.y) ? camp.respawnAt : null,
    })),
    monsters: s.monsters.filter((monster) => monster.hp > 0 && S.canSee(s, t, monster)).map((monster) => ({ ...monster, path: [], targetId: null })),
    rubies: s.rubies.map((g, i) => (i === t ? g : 0)),
    units: s.units
      .filter((u) => S.canSee(s, t, u))
      .map(({ lastDamageEventAt, ...u }) => ({
        ...u,
        path: [],
        orderQueue: u.team === t ? u.orderQueue : [],
        target: null,
        harvest: u.team === t ? u.harvest : null,
        cargo: u.team === t ? u.cargo : 0,
      })),
    bases: s.bases.map(({ lastDamageEventAt, ...b }) => ({ ...b, hp: S.canSee(s, t, b) ? b.hp : b.max })),
    mines: s.mines.map((m) => ({
      ...m,
      owner: m.owner === t || S.visibleAt(s, t, m.x, m.y) ? m.owner : -1,
      depot: m.owner === t || S.visibleAt(s, t, m.x, m.y) ? !!m.depot : false,
    })),
    watchtowers: s.watchtowers.map((tower) => ({
      ...tower,
      progress: S.visibleAt(s, t, tower.x, tower.y) ? tower.progress : 0,
      capturingTeam: S.visibleAt(s, t, tower.x, tower.y) ? tower.capturingTeam : -1,
    })),
    shots: s.shots.filter((p) => S.visibleAt(s, t, p.x, p.y) && S.visibleAt(s, t, p.tx, p.ty)),
    visible: [0, 1].map((i) => (i === t ? Array.from(s.visible[t]) : empty())),
    explored: [0, 1].map((i) => (i === t ? Array.from(s.explored[t]) : empty())),
  };
}
export function command(s, t, c) {
  if (s.winner !== null) return;
  const ids = Array.isArray(c.ids)
    ? c.ids.filter((id) => s.units.some((u) => u.id === id && u.team === t)).slice(0, 30)
    : [];
  if (c.kind === 'setRally') {
    if (!S.setRally(s, t, c)) fail('Ralliement impossible.');
  } else if (c.kind === 'recruit') {
    if (!Object.hasOwn(S.TYPES, c.type) || !S.recruit(s, c.type, t, c.producerId))
      fail('Recrutement impossible.');
  } else if (c.kind === 'cancelProduction') {
    if (!S.cancelProduction(s, t, c.producerId, c.jobId)) fail('Production indisponible.');
  } else if (c.kind === 'gather') {
    if (!S.gather(s, t, ids, c.index)) fail('Sélectionnez un ouvrier et une mine à vous.');
  } else if (c.kind === 'construct') {
    if (!S.construct(s, t, c.type, c.baseId, c.slotId))
      fail(
        'Construction impossible : ressources insuffisantes, type incorrect ou emplacement indisponible.',
      );
  } else if (c.kind === 'build') {
    if (!Number.isInteger(c.index) || !S.build(s, t, c.index))
      fail('Mine contestée, trop loin ou rubis insuffisants.');
  } else if (c.kind === 'steer') {
    if (!Number.isFinite(c.dx) || !Number.isFinite(c.dy)) fail('Direction incorrecte.');
    S.steer(s, ids, c.dx, c.dy);
  } else if (c.kind === 'hold') {
    for (const u of s.units)
      if (ids.includes(u.id)) {
        u.orderQueue = [];
        u.queueActive = false;
        u.followId = null;
        u.patrol = null;
        u.manual = null;
        u.harvest = null;
        u.retreat = false;
        u.path = [];
        u.target = null;
        u.hold = true;
      }
  } else if (c.kind === 'retreat') {
    S.disengage(s, ids);
  } else if (c.kind === 'move' || c.kind === 'attackMove' || c.kind === 'patrol') {
    let x = c.x,
      y = c.y,
      target = null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > S.W || y > S.H)
      fail('Destination incorrecte.');
    if (c.target) {
      target = c.target.base
        ? s.bases[1 - t]
        : [...s.units, ...s.monsters].find((u) => u.id === c.target.id && u.team !== t);
      if (target && !S.canSee(s, t, target)) target = null;
    }
    if (c.kind === 'patrol') {
      S.patrol(s, ids, x, y);
      return;
    }
    S.order(s, ids, x, y, target, !target && c.kind !== 'attackMove', c.queue === true);
  } else fail('Ordre inconnu.');
}
export function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(7)),
    (b) => alphabet[b % alphabet.length],
  ).join('');
}
export async function digest(token) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export function normalizeRoomCode(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase().replace(/^SALON/, '');
}
export async function handle(db, input, now = Date.now()) {
  if (!input || typeof input !== 'object') fail('Requête incorrecte.');
  if (!['create', 'join', 'sync', 'leave'].includes(input.action)) fail('Action inconnue.');
  if (input.action === 'create') {
    const token = crypto.randomUUID() + crypto.randomUUID(),
      team = input.team === 1 ? 1 : 0,
      room = {
        state: pack(S.create()),
        players: [{ hash: await digest(token), team, seen: now, seq: 0 }],
        started: false,
        updated: now,
      };
    await db.prepare('DELETE FROM matches WHERE expires < ?').bind(now).run();
    for (let n = 0; n < 4; n++) {
      const code = randomCode();
      const r = await db
        .prepare('INSERT OR IGNORE INTO matches(code,data,revision,expires) VALUES(?,?,0,?)')
        .bind(code, JSON.stringify(room), now + 7200000)
        .run();
      if (r.meta.changes) return { code, token, team, status: 'waiting' };
    }
    fail('Création indisponible, réessayez.', 503);
  }
  const code = normalizeRoomCode(input.code);
  if (!/^[A-Z2-9]{7}$/.test(code)) fail('Code de salon incorrect.');
  const joining = input.action === 'join',
    token = joining ? crypto.randomUUID() + crypto.randomUUID() : input.token;
  if (typeof token !== 'string' || token.length > 100) fail('Connexion requise.', 401);
  const hash = await digest(token);
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await db
      .prepare('SELECT * FROM matches WHERE code=? AND expires>?')
      .bind(code, now)
      .first();
    if (!row) fail('Salon introuvable ou expiré.', 404);
    const room = JSON.parse(row.data),
      s = unpack(room.state);
    if (room.cancelled) fail('Salon fermé.', 410);
    let p = room.players.find((p) => p.hash === hash),
      status = 'waiting',
      error = null;
    if (joining) {
      if (room.players.length === 2 || s.winner !== null) fail('Ce salon est déjà complet.', 409);
      p = { hash, team: 1 - room.players[0].team, seen: now, seq: 0 };
      room.players.push(p);
      room.started = true;
      room.startAt = now + 3000;
    } else if (!p) fail('Session inconnue. Rejoignez avec le code.', 401);
    if (room.started && s.winner === null) {
      const absent = room.players.find((p) => now - p.seen >= 30000);
      if (absent) {
        s.winner = 1 - absent.team;
        room.reason = 'déconnexion';
      } else if (now > room.startAt) {
        let dt = Math.min(1, Math.max(0, (now - Math.max(room.updated, room.startAt)) / 1000));
        while (dt > 0) {
          const step = Math.min(0.05, dt);
          S.tick(s, step);
          dt -= step;
        }
      }
    }
    p.seen = now;
    room.updated = now;
    if (input.action === 'leave') {
      if (room.started) {
        if (s.winner === null) s.winner = 1 - p.team;
      } else room.cancelled = true;
    }
    if (room.started)
      status =
        s.winner !== null
          ? 'ended'
          : now < room.startAt
            ? 'countdown'
            : room.players.every((p) => now - p.seen < 10000)
              ? 'playing'
              : 'disconnected';
    const commands = Array.isArray(input.commands)
      ? input.commands.slice(0, 12)
      : input.command
        ? [{ command: input.command, seq: input.seq }]
        : [];
    for (const item of commands) {
      if (
        !item ||
        !item.command ||
        typeof item.command !== 'object' ||
        !Number.isSafeInteger(item.seq) ||
        item.seq <= p.seq
      )
        continue;
      if (['playing', 'disconnected'].includes(status)) {
        try {
          command(s, p.team, item.command);
        } catch (e) {
          if (e instanceof MatchError) error = e.message;
          else throw e;
        }
      } else error = 'Attendez que les deux joueurs soient connectés.';
      p.seq = item.seq;
    }

    room.state = pack(s);
    const r = await db
      .prepare('UPDATE matches SET data=?,revision=revision+1 WHERE code=? AND revision=?')
      .bind(JSON.stringify(room), code, row.revision)
      .run();
    if (r.meta.changes)
      return {
        code,
        ...(joining ? { token } : {}),
        team: p.team,
        status,
        revision: row.revision + 1,
        ack: p.seq,
        error,
        reason: room.reason || null,
        disconnectCountdown: Math.max(
          0,
          ...room.players
            .filter((entry) => entry !== p && now - entry.seen >= 10000)
            .map((entry) => Math.ceil((entry.seen + 30000 - now) / 1000)),
        ),
        countdown: Math.max(0, Math.ceil((room.startAt - now) / 1000)) || 0,
        state: view(s, p.team),
      };
  }
  fail('Serveur occupé, nouvelle tentative…', 503);
}
