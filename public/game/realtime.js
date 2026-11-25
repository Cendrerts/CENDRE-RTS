export function normalizeRoomCode(value) {
  return String(value || '').replace(/\s/g, '').toUpperCase().replace(/^SALON/, '');
}

export function networkQuality(rtt) {
  return rtt < 80 ? 'good' : rtt <= 160 ? 'fair' : 'poor';
}

import { CendreSim as Sim } from './sim.js';
import { decodeSnapshotFog } from './snapshot-fog.js';
import { decodeSnapshotUnits } from './snapshot-units.js';

const maxUnitSpeed = Math.max(...Object.keys(Sim.TYPES).flatMap((type) => [
  Sim.stats(type, 0).speed,
  Sim.stats(type, 1).speed,
]));
const displaySpeedLimit = 1.5 * maxUnitSpeed / 1000;

// A session survives socket replacement; sequence numbers make retries idempotent.
export class RealtimeClient {
  constructor({ url = '/api/ws', Socket = globalThis.WebSocket, clock = globalThis,
    now = () => performance.now(), onSnapshot = () => {}, onStatus = () => {}, onRtt = () => {} } = {}) {
    Object.assign(this, { url, Socket, clock, now, onSnapshot, onStatus, onRtt });
    this.pending = new Map();
    this.backoff = 500;
  }
  connect(parameters) {
    this.parameters = { ...parameters };
    this.closed = false;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.open();
    });
  }
  open() {
    const base = globalThis.location?.href || 'http://localhost/';
    const url = new URL(this.url, base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.delete('token');
    for (const [key, value] of Object.entries(this.parameters)) {
      if (key !== 'token') url.searchParams.set(key, key === 'code' ? normalizeRoomCode(value) : value);
    }
    try {
      this.socket = new this.Socket(url.href);
    } catch (error) {
      this.lost(error);
      return;
    }
    const socket = this.socket;
    const snapshotFields = {};
    let snapshotMines;
    let queueSnapshot;
    let snapshotUnits = new Map();
    let damageEvents = [];
    socket.onopen = () => {
      if (socket === this.socket && !this.closed) {
        socket.send(JSON.stringify({ type: 'hello', token: this.parameters.token }));
      }
    };
    this.timeout = this.clock.setTimeout(() => socket.close(), 4000);
    socket.onmessage = (event) => {
      if (socket !== this.socket || this.closed) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === 'session') {
        this.clock.clearTimeout(this.timeout);
        socket.authenticated = true;
        this.session = data;
        this.parameters = { code: data.code, token: data.token };
        this.backoff = 500;
        this.awaitingPong = false;
        this.ping();
      } else if (data.type === 'snapshot') {
        const state = data.state;
        if (state) {
          decodeSnapshotFog(state, data.team);
          if (state.resetUnits) damageEvents = [];
          damageEvents.push(...(state.damageEvents ?? []));
          damageEvents = damageEvents.filter((event) => state.time - event.time < 2);
          state.damageEvents = structuredClone(damageEvents);
          if (Array.isArray(state.unitIds)) {
            if (state.resetUnits) snapshotUnits.clear();
            for (const { unset, ...change } of state.units) {
              const unit = snapshotUnits.get(change.id) ?? {};
              Object.assign(unit, change);
              for (const field of unset ?? []) {
                delete unit[field];
              }
              snapshotUnits.set(change.id, unit);
            }
            snapshotUnits = new Map(state.unitIds.map((id) => [id, snapshotUnits.get(id)]));
            state.units = structuredClone(Array.from(snapshotUnits.values()));
            delete state.unitIds;
            delete state.resetUnits;
          }
          decodeSnapshotUnits(state);
          if (Object.hasOwn(state, 'mines')) {
            snapshotMines = state.mines;
          } else if (snapshotMines) {
            if (state.minesChanged) {
              snapshotMines = snapshotMines.slice();
              for (const [index, mine] of state.minesChanged) {
                snapshotMines[index] = mine;
              }
            }
            state.mines = snapshotMines;
          }
          delete state.minesChanged;
          for (const field of ['slots', 'visible', 'explored', 'camps', 'watchtowers', 'braises', 'bases', 'corpses']) {
            if (Object.hasOwn(state, field)) {
              snapshotFields[field] = state[field];
            } else if (Object.hasOwn(snapshotFields, field)) {
              state[field] = snapshotFields[field];
            }
          }
          if (Object.hasOwn(state, 'queues')) {
            queueSnapshot = { queues: structuredClone(state.queues), time: state.time };
          } else if (queueSnapshot) {
            const elapsed = state.time - queueSnapshot.time;
            state.queues = queueSnapshot.queues.map((queue) => {
              const activeProducers = new Set();
              return queue.map((job) => {
                if (activeProducers.has(job.producerId)) return { ...job };
                activeProducers.add(job.producerId);
                return { ...job, remaining: Math.max(0, job.remaining - elapsed) };
              });
            });
          }
        }
        if (!this.connected) {
          this.connected = true;
          this.clock.clearTimeout(this.graceTimer);
          this.reconnectDeadline = null;
          this.onStatus('connected');
          this.ack(data.ack);
          for (const message of this.pending.values()) this.send(message);
        }
        this.resolve?.({ ...this.session, ...data });
        this.ack(data.ack);
        this.onSnapshot(data);
      } else if (data.type === 'ack') {
        this.ack(data.seq);
      } else if (data.type === 'pong') {
        this.awaitingPong = false;
        this.onRtt(this.now() - this.pingAt);
        this.clock.clearTimeout(this.timeout);
      } else if (data.type === 'error') {
        this.onStatus(data.error || 'Ordre refusé');
        if (!this.session) {
          this.reject?.(new Error(data.error));
          this.close();
        }
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (socket === this.socket) this.lost(new Error('WebSocket indisponible'));
    };
  }
  ack(sequence) {
    for (const seq of this.pending.keys()) {
      if (seq <= sequence) this.pending.delete(seq);
    }
  }
  send(message) {
    if (this.socket?.readyState === 1 && this.socket.authenticated) {
      this.socket.send(JSON.stringify(message));
    }
  }
  command(command, seq) {
    if (!this.connected || this.socket?.readyState !== 1 || !this.socket.authenticated) {
      const now = this.now();
      if (this.lastRefusalAt == null || now - this.lastRefusalAt >= 1000) {
        this.lastRefusalAt = now;
        this.onStatus('Ordre refusé : reconnexion en cours.');
      }
      return false;
    }
    const message = { type: 'cmd', cmd: command, seq };
    this.pending.set(seq, message);
    this.send(message);
    return true;
  }
  ping() {
    if (this.awaitingPong) {
      this.socket.close();
      return;
    }
    this.awaitingPong = true;
    this.pingAt = this.now();
    this.send({ type: 'ping' });
    this.pingTimer = this.clock.setTimeout(() => this.ping(), 2000);
  }
  lost(error) {
    this.clock.clearTimeout(this.timeout);
    this.clock.clearTimeout(this.pingTimer);
    if (this.closed) return;
    if (!this.session) {
      this.closed = true;
      this.reject?.(error);
      return;
    }
    this.connected = false;
    this.clock.clearTimeout(this.retry);
    if (this.reconnectDeadline == null) {
      this.reconnectDeadline = this.now() + 30000;
      this.graceTimer = this.clock.setTimeout(() => {
        this.close();
        this.onStatus('Connexion perdue : délai de reconnexion dépassé.');
      }, 30000);
    }
    if (this.now() >= this.reconnectDeadline) return;
    this.onStatus('reconnecting');
    this.retry = this.clock.setTimeout(() => this.open(), this.backoff);
    this.backoff = Math.min(2000, this.backoff * 2);
  }
  close() {
    this.closed = true;
    this.connected = false;
    for (const timer of [this.timeout, this.pingTimer, this.retry, this.graceTimer]) this.clock.clearTimeout(timer);
    this.socket?.close();
  }
}

// Only received, visible entities enter the buffer. Remote positions never extrapolate.
export class RealtimeMotion {
  constructor() {
    this.clear();
  }
  clear() {
    this.snapshots = [];
    this.display = new Map();
    this.predictions = new Map();
    this.corrections = new Map();
  }
  receive(units, now, serverTime) {
    const time = Number.isFinite(serverTime) ? serverTime * 1000 : now;
    this.offset = now - time;
    this.snapshots.push({ time, units: new Map(units.map((unit) => [unit.id, unit])) });
    this.snapshots = this.snapshots.slice(-3);
    const visible = this.snapshots.at(-1).units;
    for (const id of this.display.keys()) {
      if (!visible.has(id)) {
        this.display.delete(id);
        this.corrections.delete(id);
      }
    }
    for (const [id, prediction] of this.predictions) {
      if (!visible.has(id) || now - prediction.started >= 140) {
        const displayed = this.display.get(id);
        if (visible.has(id) && displayed) {
          this.corrections.set(id, { ...displayed, started: now });
        }
        this.predictions.delete(id);
      }
    }
  }
  predict(command, state, team, now) {
    if (command.queue === true || !['move', 'attackMove', 'steer'].includes(command.kind)) {
      for (const id of command.ids || []) this.predictions.delete(id);
      return;
    }
    const units = state.units.filter((unit) => unit.team === team && command.ids?.includes(unit.id))
      .map((unit) => ({ ...structuredClone(unit), ...this.position(unit, now) }));
    const local = { ...state, units };
    if (command.kind !== 'steer') Sim.order(local, units.map((unit) => unit.id), command.x, command.y);
    for (const unit of units) {
      this.corrections.delete(unit.id);
      this.predictions.set(unit.id, { unit, local, command, started: now, at: now });
    }
  }
  position(unit, now) {
    const latest = this.snapshots.at(-1);
    if (!latest?.units.has(unit.id)) return { x: unit.x, y: unit.y };
    const time = now - this.offset - 100;
    let left = this.snapshots[0];
    let right = latest;
    for (const snapshot of this.snapshots) {
      if (snapshot.time <= time) left = snapshot;
      if (snapshot.time >= time) {
        right = snapshot;
        break;
      }
    }
    const a = left.units.get(unit.id) || latest.units.get(unit.id);
    const b = right.units.get(unit.id) || a;
    const fraction = Math.max(0, Math.min(1, (time - left.time) / (right.time - left.time || 1)));
    let target = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
    const prediction = this.predictions.get(unit.id);
    if (prediction && now - prediction.started < 500) {
      Sim.predictMotion(prediction.local, prediction.unit, prediction.command, Math.min(0.05, (now - prediction.at) / 1000));
      prediction.at = now;
      target = prediction.unit;
    }
    const correction = this.corrections.get(unit.id);
    if (correction) {
      const fraction = Math.min(1, (now - correction.started) / 120);
      target = {
        x: correction.x + (target.x - correction.x) * fraction,
        y: correction.y + (target.y - correction.y) * fraction,
      };
      if (fraction === 1) this.corrections.delete(unit.id);
    }
    const previous = this.display.get(unit.id);
    if (!previous) {
      const first = { x: target.x, y: target.y, at: now };
      this.display.set(unit.id, first);
      return first;
    }
    const dt = Math.max(0, now - previous.at);
    const dx = target.x - previous.x;
    const dy = target.y - previous.y;
    const distance = Math.hypot(dx, dy);
    let speedLimit = displaySpeedLimit;
    if (!prediction && !correction && this.snapshots.length > 1) {
      const preceding = this.snapshots.at(-2);
      const precedingUnit = preceding.units.get(unit.id);
      const elapsed = latest.time - preceding.time;
      if (precedingUnit && elapsed > 0) {
        const latestUnit = latest.units.get(unit.id);
        const observedSpeed = Math.hypot(latestUnit.x - precedingUnit.x, latestUnit.y - precedingUnit.y) / elapsed;
        // A burst of snapshots should not make a slow unit catch up at full speed.
        // Keep some room for corrections after the unit has stopped.
        speedLimit = Math.min(displaySpeedLimit, Math.max(displaySpeedLimit / 2, 1.5 * observedSpeed));
      }
    }
    const amount = Math.min(1, distance ? dt * speedLimit / distance : 1);
    const result = { x: previous.x + dx * amount, y: previous.y + dy * amount, at: now };
    this.display.set(unit.id, result);
    return result;
  }
}
