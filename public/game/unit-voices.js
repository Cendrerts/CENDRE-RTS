// These are HTTP asset URLs, not paths to the player's desktop.
// Convert commis_1.aif to MP3 before placing the files in assets/voices/.
export const UNIT_VOICE_FILES = Object.freeze({
  commis_unit: '/game/assets/voices/commis_1.mp3',
  chef_de_brigade: '/game/assets/voices/chef_de_brigade1.mp3',
});

export class UnitVoices {
  constructor({
    files = UNIT_VOICE_FILES,
    cooldownMs = 1500,
    pitchVariation = 0.1,
    volume = 1,
    onError = console.error,
  } = {}) {
    this.files = { ...files };
    this.cooldownMs = Math.max(0, cooldownMs);
    this.pitchVariation = Math.max(0, Math.min(0.1, pitchVariation));
    this.volume = Math.max(0, Math.min(1, volume));
    this.onError = onError;
    this.context = null;
    this.buffers = new Map();
    this.lastPlayed = new Map();
    this.pending = new Map();
    this.sources = new Set();
    this.generation = 0;
    this.disposed = false;
  }

  initialize() {
    if (this.disposed) throw new Error('Audio disposed.');
    if (this.context) return;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) throw new Error('Web Audio indisponible.');
    this.context = new Context();
    this.output = this.context.createGain();
    this.output.gain.value = this.volume;
    this.output.connect(this.context.destination);
  }

  load(unitType) {
    if (!Object.hasOwn(this.files, unitType)) return Promise.reject(new Error('Voix inconnue.'));
    this.initialize();
    if (this.buffers.has(unitType)) return this.buffers.get(unitType);
    const context = this.context;
    const promise = (async () => {
      const response = await fetch(this.files[unitType]);
      if (!response.ok) throw new Error(`Audio ${unitType} : HTTP ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    })().catch((error) => {
      this.buffers.delete(unitType);
      throw error;
    });
    this.buffers.set(unitType, promise);
    return promise;
  }

  // Invoke synchronously inside the selection gesture to unlock mobile audio.
  async select({ instanceId, unitType }) {
    if (this.disposed || instanceId == null || !Object.hasOwn(this.files, unitType)) return false;
    if (
      this.pending.has(instanceId) ||
      performance.now() - (this.lastPlayed.get(instanceId) ?? -Infinity) < this.cooldownMs
    )
      return false;
    const token = Symbol(),
      generation = this.generation;
    this.pending.set(instanceId, token);
    try {
      this.initialize();
      const resume = this.context.resume();
      const [buffer] = await Promise.all([this.load(unitType), resume]);
      if (
        this.disposed ||
        generation !== this.generation ||
        this.pending.get(instanceId) !== token ||
        this.context.state !== 'running'
      )
        return false;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      // Playback rate changes pitch and duration together.
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * this.pitchVariation;
      source.connect(this.output);
      source.onended = () => {
        source.disconnect();
        this.sources.delete(source);
      };
      source.start();
      this.sources.add(source);
      this.lastPlayed.set(instanceId, performance.now());
      return true;
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.onError(error);
      return false;
    } finally {
      if (this.pending.get(instanceId) === token) this.pending.delete(instanceId);
    }
  }

  acknowledge({ unitType }) {
    return this.select({ instanceId: `order:${unitType}`, unitType });
  }

  forget(instanceId) {
    this.lastPlayed.delete(instanceId);
    this.pending.delete(instanceId);
  }
  reset() {
    this.generation++;
    this.lastPlayed.clear();
    this.pending.clear();
    for (const source of this.sources) {
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
  }
  async dispose() {
    this.disposed = true;
    this.reset();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }
}

// The live engine uses commis/mage for both factions. Rats must stay silent.
export function selectionVoice(units, player) {
  const types = { commis: 'commis_unit', mage: 'chef_de_brigade' };
  const unit = units.find((u) => u.team === player && u.team === 0 && Object.hasOwn(types, u.type));
  return unit ? { instanceId: unit.id, unitType: types[unit.type] } : null;
}

export function bindUnitSelection(root, voices) {
  const handleClick = (event) => {
    const element = event.target?.closest?.('[data-unit-instance-id][data-unit-type]');
    if (!element || !root.contains(element)) return;
    void voices.select({
      instanceId: element.dataset.unitInstanceId,
      unitType: element.dataset.unitType,
    });
  };
  root.addEventListener('click', handleClick);
  return () => root.removeEventListener('click', handleClick);
}
