// One context for voices and ambience throughout the page lifetime.
export class SharedAudio {
  constructor(environment = globalThis) {
    this.environment = environment;
    this.context = null;
    this.onChange = () => {};
    this.resumePending = null;
  }

  getContext() {
    if (this.context) return this.context;
    const Context = this.environment.AudioContext || this.environment.webkitAudioContext;
    if (!Context) return null;
    this.context = new Context();
    this.context.addEventListener?.('statechange', () => {
      this.onChange(this.context.state === 'running');
      if (this.context.state === 'interrupted') void this.resume();
    });
    return this.context;
  }

  resume(gesture = false) {
    try {
      const context = gesture ? this.getContext() : this.context;
      if (!context || context.state === 'closed') return Promise.resolve(false);
      // Do not defer this call: Safari requires it in the gesture's call stack.
      if (gesture || !this.resumePending) {
        const resumed = context.resume();
        const pending = Promise.resolve(resumed)
          .then(() => context.state === 'running')
          .catch(() => false)
          .finally(() => {
            if (this.resumePending === pending) this.resumePending = null;
            this.onChange(context.state === 'running');
          });
        this.resumePending = pending;
      }
      if (gesture) {
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, context.sampleRate);
        source.connect(context.destination);
        source.onended = () => source.disconnect();
        source.start(0);
      }
      return this.resumePending;
    } catch {
      this.onChange(false);
      return Promise.resolve(false);
    }
  }
}

export const sharedAudio = new SharedAudio();

export function bindAudioUnlock({ audio = sharedAudio, document, window, button, onActive = () => {} }) {
  audio.onChange = (active) => {
    button.hidden = active;
    if (active) onActive();
  };
  button.hidden = audio.context?.state === 'running';
  const gesture = () => void audio.resume(true);
  const restore = () => {
    if (!document.hidden) void audio.resume();
  };
  // Capture also covers controls that stop bubbling to the document.
  document.addEventListener('touchend', gesture, true);
  document.addEventListener('pointerup', gesture, true);
  document.addEventListener('keydown', gesture, true);
  button.addEventListener('click', gesture);
  document.addEventListener('visibilitychange', restore);
  window.addEventListener('pageshow', restore);
}
