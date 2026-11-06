import { CendreSim as Sim } from './sim.js';
// A session survives socket replacement; sequence numbers make retries idempotent.
export class RealtimeClient {
  constructor({ url = '/api/ws', Socket = globalThis.WebSocket, clock = globalThis,
    now = () => performance.now(), onSnapshot = () => {}, onStatus = () => {}, onRtt = () => {} } = {}) {
    Object.assign(this, { url, Socket, clock, now, onSnapshot, onStatus, onRtt });
    this.pending = new Map();
    this.backoff = 250;
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
    for (const [key, value] of Object.entries(this.parameters)) url.searchParams.set(key, value);
    try {
      this.socket = new this.Socket(url.href);
    } catch (error) {
      this.lost(error);
      return;
    }
    const socket = this.socket;
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
        this.session = data;
        this.parameters = { code: data.code, token: data.token };
        this.backoff = 250;
        this.onStatus('connected');
        for (const message of this.pending.values()) this.send(message);
        this.awaitingPong = false;
        this.ping();
      } else if (data.type === 'snapshot') {
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
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }
  command(command, seq) {
    const message = { type: 'cmd', cmd: command, seq };
    this.pending.set(seq, message);
    this.send(message);
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
    this.onStatus('reconnecting');
    this.retry = this.clock.setTimeout(() => this.open(), this.backoff);
    this.backoff = Math.min(4000, this.backoff * 2);
  }
  close() {
    this.closed = true;
    for (const timer of [this.timeout, this.pingTimer, this.retry]) this.clock.clearTimeout(timer);
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
    if (!['move', 'attackMove', 'steer'].includes(command.kind)) {
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
    // 120 ms correction, with a screen-space-safe velocity ceiling at maximum zoom.
    const amount = Math.min(1, distance ? dt * 0.1 / distance : 1);
    const result = { x: previous.x + dx * amount, y: previous.y + dy * amount, at: now };
    this.display.set(unit.id, result);
    return result;
  }
}
