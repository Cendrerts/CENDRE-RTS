import { CendreSim as S } from '../public/game/sim.js';
import { MatchError, command, digest, pack, unpack, view } from '../lib/match.mjs';

const STEP_MS = 50;
const SAVE_MS = 5000;
const COMMAND_REFILL_MS = 100;
const COMMAND_BURST = 20;
const COMMAND_ERROR_INTERVAL_MS = 1000;

function exploredAdditions(previous, current) {
  const ranges = [];
  const runs = [];
  let previousEnd = 0;
  let start = -1;
  for (let cell = 0; cell <= current.length; cell++) {
    if (previous[cell] === 1 && current[cell] === 0) return null;
    if (current[cell] === 1 && previous[cell] === 0) {
      if (start === -1) start = cell;
    } else if (start !== -1) {
      const length = cell - start;
      ranges.push([start, length]);
      runs.push((start - previousEnd).toString(36), length.toString(36));
      previousEnd = cell;
      start = -1;
    }
  }
  if (previousEnd < current.length) runs.push((current.length - previousEnd).toString(36));
  const encoded = runs.join(',');
  return encoded.length + 2 < JSON.stringify(ranges).length ? encoded : ranges;
}

export class Match {
  constructor(state, env, clock = globalThis) {
    this.ctx = state;
    this.clock = clock;
    this.room = null;
    this.timer = null;
    this.snapshotFields = new WeakMap();
    this.snapshotUnits = new WeakMap();
    this.pongStats = new Map();
    this.ready = state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get('room');
      if (saved) {
        this.room = saved;
        this.sim = unpack(saved.state);
        this.nextTick = this.now() + STEP_MS;
        this.lastSave = this.now();
        this.nextSnapshot = this.now() + 100;
        this.startTimer();
      }
    });
  }

  now() {
    return this.clock.Date.now();
  }

  resetPongStats(socket) {
    this.pongStats.set(socket, { tickLagMax: 0, cmdMaxMs: 0 });
  }

  sockets(team) {
    return this.ctx.getWebSockets().filter((socket) => {
      const attachment = socket.deserializeAttachment();
      return !attachment.closed && attachment.team !== undefined &&
        (team === undefined || attachment.team === team);
    });
  }

  status(now = this.now()) {
    if (this.room.cancelled) return 'closed';
    if (this.sim.winner !== null) return 'ended';
    if (!this.room.started) return 'waiting';
    if (now < this.room.startAt) return 'countdown';
    return this.room.players.every((player) => player.disconnectedAt == null && now - player.seen < 10000)
      ? 'playing'
      : 'disconnected';
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.webSocketClose(socket);
      return false;
    }
  }

  snapshot(socket) {
    const { team } = socket.deserializeAttachment();
    const player = this.room.players.find((entry) => entry.team === team);
    const state = view(this.sim, team, { compactShots: true });
    const previousFields = this.snapshotFields.get(socket);
    const fields = { time: state.time };
    for (const field of ['slots', 'visible', 'camps', 'watchtowers', 'braises', 'bases', 'corpses', 'ragout', 'festin', 'roti', 'bouillon', 'fieldKitchens', 'fumets', 'pantries']) {
      fields[field] = JSON.stringify(state[field]);
      if (previousFields?.[field] === fields[field]) delete state[field];
    }
    fields.explored = state.explored;
    if (previousFields?.explored === fields.explored) {
      fields.exploredGrid = previousFields.exploredGrid;
      delete state.explored;
    } else {
      fields.exploredGrid = this.sim.explored[team].slice();
      if (previousFields) {
        const added = exploredAdditions(previousFields.exploredGrid, fields.exploredGrid);
        if (added !== null) {
          state.exploredAdded = added;
          delete state.explored;
        }
      }
    }
    fields.mines = state.mines.map((mine) => JSON.stringify(mine));
    if (previousFields?.mines.length === fields.mines.length) {
      const minesChanged = [];
      for (const [index, mine] of state.mines.entries()) {
        if (fields.mines[index] !== previousFields.mines[index]) {
          minesChanged.push([index, mine]);
        }
      }
      if (minesChanged.length > 0) state.minesChanged = minesChanged;
      delete state.mines;
    }
    fields.queues = JSON.stringify(state.queues.map((queue) =>
      queue.map(({ id, type, producerId, total }) => [id, type, producerId, total]),
    ));
    if (previousFields?.queues === fields.queues) delete state.queues;
    if (previousFields) {
      state.damageEvents = state.damageEvents.filter((event) => event.time > previousFields.time);
      if (state.damageEvents.length === 0) delete state.damageEvents;
    }
    const previousUnits = this.snapshotUnits.get(socket);
    const units = new Map();
    const changes = [];
    for (const unit of state.units) {
      const previous = previousUnits?.get(unit.id);
      const current = new Map();
      const change = { id: unit.id };
      for (const [field, value] of Object.entries(unit)) {
        if (field === 'id') continue;
        const json = JSON.stringify(value);
        if (json === undefined) continue;
        current.set(field, json);
        if (previous?.get(field) !== json) change[field] = value;
      }
      units.set(unit.id, current);
      if (!previous) {
        changes.push(unit);
        continue;
      }
      const unset = [...previous.keys()].filter((field) => !current.has(field));
      if (unset.length) change.unset = unset;
      if (Object.keys(change).length > 1) changes.push(change);
    }
    state.units = changes;
    state.unitIds = Array.from(units.keys());
    if (!previousUnits) state.resetUnits = true;
    const sent = this.send(socket, {
      type: 'snapshot',
      code: this.room.code,
      team,
      status: this.status(),
      ack: player.seq,
      countdown: Math.max(0, Math.ceil((this.room.startAt - this.now()) / 1000)) || 0,
      disconnectCountdown: this.disconnectCountdown(),
      reason: this.room.reason || null,
      state,
    });
    if (sent) {
      this.snapshotFields.set(socket, fields);
      this.snapshotUnits.set(socket, units);
    }
  }

  disconnectCountdown() {
    const absent = this.room.players.find((player) => player.disconnectedAt != null);
    return absent ? Math.max(0, Math.ceil((absent.disconnectedAt + 30000 - this.now()) / 1000)) : 0;
  }

  startTimer() {
    if (
      this.timer !== null ||
      (!this.room.started && !this.sockets().length) ||
      ['ended', 'closed'].includes(this.status())
    )
      return;
    this.timer = this.clock.setInterval(() => this.advance(), STEP_MS);
  }

  stopTimer() {
    if (this.timer !== null) this.clock.clearInterval(this.timer);
    this.timer = null;
  }

  async save() {
    this.room.state = pack(this.sim);
    this.lastSave = this.now();
    await this.ctx.storage.put('room', this.room);
    if (['ended', 'closed'].includes(this.status())) {
      await this.ctx.storage.deleteAlarm();
    } else {
      await this.ctx.storage.setAlarm(this.now() + SAVE_MS);
    }
  }

  advance() {
    if (!this.room) return;
    const now = this.now();
    if (now - this.room.created > 7200000) this.room.cancelled = true;
    for (const socket of this.sockets()) {
      const attachment = socket.deserializeAttachment();
      const player = this.room.players.find((entry) => entry.team === attachment.team);
      if (now - (attachment.lastMessageAt ?? player.seen) >= 6000) {
        this.webSocketClose(socket);
      }
    }
    for (const player of this.room.players) {
      if (this.sockets(player.team).length) {
        player.seen = now;
        player.disconnectedAt = null;
      }
    }
    if (this.room.started && this.sim.winner === null) {
      const absent = this.room.players.find((player) => now - (player.disconnectedAt ?? player.seen) >= 30000);
      if (absent) {
        this.sim.winner = 1 - absent.team;
        this.room.reason = 'déconnexion';
      }
    }
    let broadcast = false;
    let tickLagMax = 0;
    while (this.nextTick <= now) {
      if (['playing', 'disconnected'].includes(this.status(this.nextTick)) && this.nextTick > this.room.startAt) {
        tickLagMax = Math.max(tickLagMax, this.now() - this.nextTick);
        S.tick(this.sim, 0.05);
      }
      if (this.nextTick >= this.nextSnapshot) {
        broadcast = true;
        this.nextSnapshot += 100;
      }
      this.nextTick += STEP_MS;
    }
    if (tickLagMax > 0) {
      for (const stats of this.pongStats.values()) {
        stats.tickLagMax = Math.max(stats.tickLagMax, tickLagMax);
      }
    }
    if (broadcast || this.sim.winner !== null) {
      for (const socket of this.sockets()) this.snapshot(socket);
    }
    const finished = ['ended', 'closed'].includes(this.status());
    if (finished) this.stopTimer();
    if (finished || now - this.lastSave >= SAVE_MS) this.ctx.waitUntil(this.save());
  }

  async alarm() {
    await this.ready;
    if (!this.room) return;
    this.advance();
    this.startTimer();
    await this.save();
  }

  async fetch(request) {
    await this.ready;
    try {
      const url = new URL(request.url);
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) throw new MatchError('Origine refusée.', 403);
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        throw new MatchError('WebSocket requis.', 426);
      }
      url.searchParams.delete('token');
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ url: url.href, deadline: this.now() + 5000, closed: false });
      this.clock.setTimeout(() => {
        const attachment = server.deserializeAttachment();
        if (attachment.team === undefined && !attachment.closed) {
          this.webSocketClose(server);
        }
      }, 5000);
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      if (!(error instanceof MatchError)) throw error;
      return Response.json({ error: error.message }, { status: error.status });
    }
  }

  async authenticate(url, helloToken) {
    const action = url.searchParams.get('action') || 'sync';
    const code = url.searchParams.get('code');
    if (!/^[A-Z2-9]{7}$/.test(code || '')) throw new MatchError('Code incorrect.');
    if (!['create', 'join', 'sync'].includes(action)) throw new MatchError('Action inconnue.');
    if (this.room && this.now() - this.room.created > 7200000)
      throw new MatchError('Salon expiré.', 404);
    if (action === 'create' && this.room) throw new MatchError('Code déjà utilisé.', 409);
    if (action !== 'create' && !this.room) throw new MatchError('Salon introuvable.', 404);
    if (this.room?.cancelled) throw new MatchError('Salon fermé.', 410);
    const token =
      action === 'sync' ? helloToken : crypto.randomUUID() + crypto.randomUUID();
    if (typeof token !== 'string' || !token.length || token.length > 100) {
      throw new MatchError('Connexion requise.', 401);
    }
    const hash = await digest(token);
    const now = this.now();
    if (action === 'create') {
      this.sim = S.create();
      this.room = {
        code,
        created: now,
        players: [{ hash, team: url.searchParams.get('team') === '1' ? 1 : 0, seen: now, seq: 0 }],
        started: false,
      };
      this.nextTick = now + STEP_MS;
      this.nextSnapshot = now + 100;
    } else if (action === 'join') {
      if (this.room.players.length === 2 || this.sim.winner !== null)
        throw new MatchError('Salon complet.', 409);
      this.room.players.push({ hash, team: 1 - this.room.players[0].team, seen: now, seq: 0 });
      this.room.started = true;
      this.room.startAt = now + 3000;
    }
    const player = this.room.players.find((entry) => entry.hash === hash);
    if (!player) throw new MatchError('Session inconnue.', 401);
    // Resolve an expired disconnect before marking the participant present again.
    this.advance();
    player.seen = now;
    player.disconnectedAt = null;
    await this.save();
    return { code, token, team: player.team, status: this.status() };
  }

  webSocketMessage(socket, raw) {
    const attachment = socket.deserializeAttachment();
    if (attachment.closed) return;
    const now = this.now();
    attachment.lastMessageAt = now;
    socket.serializeAttachment(attachment);
    let processingCommand = false;
    try {
      if (typeof raw !== 'string' || raw.length > 12000) throw new MatchError('Message incorrect.');
      const message = JSON.parse(raw);
      if (attachment.team === undefined) {
        return this.ctx.blockConcurrencyWhile(async () => {
          try {
            if (message?.type !== 'hello' || this.now() >= attachment.deadline) {
              throw new MatchError('Hello requis dans les 5 secondes.');
            }
            const session = await this.authenticate(new URL(attachment.url), message.token);
            if (socket.deserializeAttachment().closed) return;
            socket.serializeAttachment({ team: session.team, closed: false, lastMessageAt: this.now() });
            this.resetPongStats(socket);
            for (const previous of this.sockets(session.team)) {
              if (previous !== socket) {
                this.pongStats.delete(previous);
                previous.serializeAttachment({ team: session.team, closed: true });
                previous.close(1000, 'Session remplacée');
              }
            }
            this.send(socket, { type: 'session', ...session });
            this.snapshot(socket);
            this.startTimer();
          } catch (error) {
            if (!(error instanceof MatchError)) throw error;
            this.send(socket, { type: 'error', error: error.message });
            this.webSocketClose(socket);
          }
        });
      }
      const { team } = attachment;
      const player = this.room.players.find((entry) => entry.team === team);
      if (message?.type === 'cmd') {
        processingCommand = true;
        if (!Number.isSafeInteger(message.seq) || message.seq < 1)
          throw new MatchError('Séquence incorrecte.');
        // Send before any asynchronous work, including persistence or the next tick.
        this.send(socket, { type: 'ack', seq: message.seq });
        if (message.seq <= player.seq) return;
        player.seq = message.seq;
        // Count credit in milliseconds so partial refills stay exact.
        const capacity = COMMAND_BURST * COMMAND_REFILL_MS;
        const elapsed = Math.max(0, now - (attachment.commandRefillAt ?? now));
        const credit = Math.min(capacity, (attachment.commandCredit ?? capacity) + elapsed);
        if (credit < COMMAND_REFILL_MS) {
          if (now - (attachment.commandErrorAt ?? -Infinity) >= COMMAND_ERROR_INTERVAL_MS) {
            attachment.commandErrorAt = now;
            socket.serializeAttachment(attachment);
            this.send(socket, { type: 'error', error: "Trop d'ordres, ralentis." });
          }
          return;
        }
        attachment.commandCredit = credit - COMMAND_REFILL_MS;
        attachment.commandRefillAt = now;
        socket.serializeAttachment(attachment);
        if (!message.cmd || typeof message.cmd !== 'object' || Array.isArray(message.cmd))
          throw new MatchError('Commande incorrecte.');
        const status = this.status();
        if (!['playing', 'disconnected'].includes(status) &&
            !(status === 'ended' && message.cmd.kind === 'kingFeast'))
          throw new MatchError('Attendez que les deux joueurs soient connectés.');
        command(this.sim, team, message.cmd);
      } else if (message?.type === 'leave') {
        if (this.room.started) {
          if (this.sim.winner === null) this.sim.winner = 1 - team;
        } else {
          this.room.cancelled = true;
        }
        for (const peer of this.sockets()) this.snapshot(peer);
        this.stopTimer();
        this.ctx.waitUntil(this.save());
      } else if (message?.type === 'ping') {
        const stats = this.pongStats.get(socket);
        this.resetPongStats(socket);
        this.send(socket, { type: 'pong', tickLagMax: stats?.tickLagMax ?? 0, cmdMaxMs: stats?.cmdMaxMs ?? 0 });
      } else {
        throw new MatchError('Message inconnu.');
      }
    } catch (error) {
      if (!(error instanceof MatchError) && !(error instanceof SyntaxError)) throw error;
      this.send(socket, { type: 'error', error: error.message });
      if (socket.deserializeAttachment().team === undefined) this.webSocketClose(socket);
    } finally {
      if (processingCommand) {
        // Cloudflare's production clock can stay frozen during synchronous work.
        const duration = this.now() - now;
        if (duration > 0) {
          for (const stats of this.pongStats.values()) {
            stats.cmdMaxMs = Math.max(stats.cmdMaxMs, duration);
          }
        }
      }
    }
  }

  webSocketClose(socket) {
    this.pongStats.delete(socket);
    const attachment = socket.deserializeAttachment();
    if (attachment.closed) return;
    socket.serializeAttachment({ ...attachment, closed: true });
    socket.close(1000, 'Déconnexion');
    if (attachment.team === undefined) return;
    const player = this.room.players.find((entry) => entry.team === attachment.team);
    player.seen = attachment.lastMessageAt ?? this.now();
    player.disconnectedAt = player.seen;
    for (const peer of this.sockets()) this.snapshot(peer);
    this.startTimer();
    this.ctx.waitUntil(this.save());
  }

  webSocketError(socket) {
    this.webSocketClose(socket);
  }
}
