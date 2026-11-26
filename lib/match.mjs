import { CendreSim as S } from '../public/game/sim.js';
import { encodeFogGrid } from '../public/game/snapshot-fog.js';
import { omitSnapshotUnitDefaults } from '../public/game/snapshot-units.js';
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
      ? S.targetReference(v)
      : v instanceof Uint8Array
        ? Array.from(v)
        : v,
  );
}
export function unpack(raw) {
  const s = S.migrateState(JSON.parse(raw));
  s.visible = s.visible.map((v) => Uint8Array.from(v));
  s.explored = s.explored.map((v) => Uint8Array.from(v));
  for (const unit of s.units) unit.target = S.resolveTarget(s, unit.target);
  return s;
}
export function view(s, t, { compactUnits = true, normalizeUnitOrders = true, compactShots = false } = {}) {
  function roundUnitNumbers(value) {
    if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
      return Math.round(value * 10) / 10;
    }
    if (Array.isArray(value)) {
      return value.map(roundUnitNumbers);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, roundUnitNumbers(item)]),
      );
    }
    return value;
  }

  const visibleShots = s.shots.filter((shot) =>
    S.visibleAt(s, t, shot.x, shot.y) && S.visibleAt(s, t, shot.tx, shot.ty),
  );
  return {
    slots: S.ensureSlots(s).map((slots) =>
      slots
        .filter((slot) => slot.team === t || S.visibleAt(s, t, slot.x, slot.y))
        .map((slot) => {
          const { rally, batiment, ...visibleSlot } = slot;
          if (slot.team === t && rally) visibleSlot.rally = rally;
          if (batiment) {
            const { lastDamageEventAt, ...building } = batiment;
            visibleSlot.batiment = building;
          } else {
            visibleSlot.batiment = null;
          }
          return visibleSlot;
        }),
    ),
    queues: [0, 1].map((i) => (i === t ? s.queues?.[i] || [] : [])),
    idleWorkerIds: S.idleWorkers(s, t).map((unit) => unit.id),
    time: s.time,
    braises: s.braises,
    pantries: s.pantries.map(({ x, y, stock }, team) => ({ x, y, stock: team === t ? stock : null })),
    fieldKitchens: s.fieldKitchens.map((kitchen, team) => {
      if (!kitchen || (team !== t && !S.canSee(s, t, kitchen))) return null;
      const { lastDamageEventAt, ...visibleKitchen } = kitchen;
      return visibleKitchen;
    }),
    ragout: t === 0 ? { ...s.ragout } : { readyAt: null, expiresAt: 0 },
    festin: t === 1 ? { ...s.festin } : { readyAt: null },
    ...(t === 0 ? { roti: { ...s.roti } } : {
      bouillon: { ...s.bouillon },
      kingFeastReadyAt: s.kingFeastReadyAt ?? 0,
      kingFeastReason: S.kingFeastBlockReason(s, t),
    }),
    fumets: S.fumets(s).map(({ team, x, y, at }) => ({
      team, x: Math.round(x), y: Math.round(y),
      ...(at === 'campagne' ? { at: 'campagne' } : {}),
    })),
    corpses: (s.corpses || []).filter((corpse) => S.visibleAt(s, t, corpse.x, corpse.y)),
    devourEvents: (s.devourEvents || []).filter((event) => S.visibleAt(s, t, event.x, event.y)),
    damageEvents: (s.damageEvents || []).filter((event) => event.team === t && s.time - event.time < 2),
    winner: s.winner,
    ...(s.winner !== null ? { matchCounters: S.matchStats(s).teams } : {}),
    ingredients: s.ingredients.map((stock, team) => team === t ? { ...stock } : { viande: 0, epices: 0, conserves: 0 }),
    camps: s.camps.map((camp) => ({
      ...camp,
      respawnAt: S.visibleAt(s, t, camp.x, camp.y) ? camp.respawnAt : null,
    })),
    monsters: s.monsters.filter((monster) => monster.hp > 0 && S.canSee(s, t, monster)).map((monster) => ({ ...monster, path: [], targetId: null })),
    rubies: s.rubies.map((g, i) => (i === t ? g : 0)),
    units: s.units
      .filter((u) => S.canSee(s, t, u))
      .map(({
        attackDestination,
        autoTargetId,
        chasing,
        cool,
        followId,
        lastAttackAt,
        lastAttackTargetId,
        lastDamageEventAt,
        lastRetargetAt,
        manual,
        repath,
        retreat,
        stuck,
        target,
        ...u
      }) => {
        let harvest = null;
        if (u.team === t && u.harvest) {
          const { elapsed, ...visibleHarvest } = u.harvest;
          harvest = visibleHarvest;
        }
        const unit = roundUnitNumbers({
          ...u,
          path: [],
          orderQueue: u.team === t ? u.orderQueue ?? [] : [],
          ...(normalizeUnitOrders ? {
            queueActive: u.queueActive ?? false,
            patrol: u.patrol ?? null,
          } : {}),
          harvest,
          cargo: u.team === t ? u.cargo : 0,
        });
        return compactUnits ? omitSnapshotUnitDefaults(unit) : unit;
      }),
    bases: s.bases.map(({ lastDamageEventAt, ...base }) => {
      const visible = S.canSee(s, t, base);
      if (base.team !== t) delete base.rally;
      if (!visible) {
        delete base.niveau;
        delete base.readyAt;
      }
      return { ...base, hp: visible ? base.hp : base.max };
    }),
    mines: s.mines.map(({ site, ...mine }) => {
      const visible = mine.owner === t || S.visibleAt(s, t, mine.x, mine.y);
      const depot = !!(mine.depot && site &&
        (mine.owner === t || S.visibleAt(s, t, site.x, site.y)));
      if (site) {
        const { x, y, lastDamageEventAt, ...building } = site;
        mine.site = depot ? { x, y, ...building } : { x, y };
      }
      return { ...mine, owner: visible || depot ? mine.owner : -1, depot };
    }),
    watchtowers: s.watchtowers.map((tower) => ({
      ...tower,
      progress: S.visibleAt(s, t, tower.x, tower.y) ? tower.progress : 0,
      capturingTeam: S.visibleAt(s, t, tower.x, tower.y) ? tower.capturingTeam : -1,
    })),
    shots: compactShots ? visibleShots.map(({ x, y, tx, ty, team }) => ({
      x: Math.round(x),
      y: Math.round(y),
      tx: Math.round(tx),
      ty: Math.round(ty),
      team,
    })) : visibleShots,
    visible: encodeFogGrid(s.visible[t]),
    explored: encodeFogGrid(s.explored[t]),
  };
}
export function command(s, t, c) {
  if (c.kind === 'kingFeast') {
    const result = S.kingFeast(s, t);
    if (!result.ok) fail(result.reason);
    return;
  }
  if (s.winner !== null) return;
  const ids = [];
  if (Array.isArray(c.ids)) {
    const livingTeamIds = new Set();
    for (const unit of s.units) {
      if (unit.team === t && unit.hp > 0) livingTeamIds.add(unit.id);
    }
    for (const id of c.ids) {
      if (livingTeamIds.delete(id)) ids.push(id);
    }
  }
  if (c.kind === 'cookDish') {
    const result = S.cookDish(s, t, c.dish, { at: c.at });
    if (!result.ok) fail(result.reason);
  } else if (c.kind === 'fieldKitchen') {
    const result = S.fieldKitchen(s, t);
    if (!result.ok) fail(result.reason);
  } else if (c.kind === 'setRally') {
    if (!S.setRally(s, t, c)) fail('Ralliement impossible.');
  } else if (c.kind === 'recruit') {
    if (!Object.hasOwn(S.TYPES, c.type)) fail('Recrutement impossible.');
    if (!S.recruit(s, c.type, t, c.producerId)) {
      if (S.recruitBlockReason(s, t, c.type, c.producerId) === 'construction') {
        fail('Bâtiment en construction.');
      }
      fail('Recrutement impossible.');
    }
  } else if (c.kind === 'cancelConstruction') {
    if (!S.cancelConstruction(s, t, c.slotId)) fail('Chantier indisponible.');
  } else if (c.kind === 'cancelProduction') {
    if (!S.cancelProduction(s, t, c.producerId, c.jobId)) fail('Production indisponible.');
  } else if (c.kind === 'devour') {
    S.devour(s, t, ids, c.corpseId);
  } else if (c.kind === 'gather') {
    if (!S.gather(s, t, ids, c.index)) fail('Sélectionnez un ouvrier et une mine à vous.');
  } else if (c.kind === 'upgradeMain') {
    if (!S.upgradeMain(s, t)) fail(S.upgradeMainBlockReason(s, t));
  } else if (c.kind === 'construct') {
    if (!S.construct(s, t, c.type, c.baseId, c.slotId))
      fail(S.constructBlockReason(s, t, c.type, c.baseId, c.slotId));
  } else if (c.kind === 'build') {
    if (!Number.isInteger(c.index) || !S.build(s, t, c.index))
      fail('Mine contestée, trop loin ou rubis insuffisants.');
  } else if (c.kind === 'steer') {
    if (!Number.isFinite(c.dx) || !Number.isFinite(c.dy)) fail('Direction incorrecte.');
    S.steer(s, ids, c.dx, c.dy);
  } else if (c.kind === 'hold') {
    S.hold(s, t, ids);
  } else if (c.kind === 'retreat') {
    S.disengage(s, ids);
  } else if (c.kind === 'move' || c.kind === 'attack' || c.kind === 'attackMove' || c.kind === 'patrol') {
    let x = c.x,
      y = c.y,
      target = null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > S.W || y > S.H)
      fail('Destination incorrecte.');
    if (c.target) {
      target = c.target.base
        ? s.bases[1 - t]
        : S.resolveTarget(s, c.target);
      if (target && (target.team === t || target.hp <= 0 || !S.canSee(s, t, target))) target = null;
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
      if (['playing', 'disconnected'].includes(status) ||
          (status === 'ended' && item.command.kind === 'kingFeast')) {
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
        state: view(s, p.team, { compactUnits: false, normalizeUnitOrders: false }),
      };
  }
  fail('Serveur occupé, nouvelle tentative…', 503);
}
