import { SOUND_IDS, type Settings, type SoundId } from "./settings";

type Channel = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
const FILTERS: Record<SoundId, [BiquadFilterType, number]> = {
  rain: ["lowpass", 6500], white: ["lowpass", 12000], cafe: ["lowpass", 1150],
  ocean: ["lowpass", 2200], forest: ["lowpass", 7500], fireplace: ["lowpass", 4000],
};

export class AudioPlaybackError extends Error {}

// Original procedural soundscapes. No recordings, external assets, or network requests.
// Long stereo loops with a crossfade keep noise continuous at the loop boundary.
function soundBuffer(ctx: AudioContext, id: SoundId): AudioBuffer {
  // Ambient textures need no ultrasonic detail; cap PCM memory on phones.
  const rate = Math.min(ctx.sampleRate, 24_000);
  const length = rate * 24;
  const fade = Math.floor(rate * 0.35);
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 19 + SOUND_IDS.indexOf(id) * 971;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let channel = 0; channel < 2; channel++) {
    const samples = new Float32Array(length + fade);
    let brown = 0;
    const chirps = Array.from({ length: 17 }, () => ({ start: random() * 24, duration: 0.12 + random() * 0.3, hz: 1800 + random() * 2200 }));
    const crackles = Array.from({ length: 130 }, () => ({ start: random() * 24, duration: 0.008 + random() * 0.04, level: 0.15 + random() * 0.35 }));
    for (let i = 0; i < samples.length; i++) {
      const time = i / rate;
      const white = random() * 2 - 1;
      brown = (brown + white * 0.025) / 1.025;
      let sample: number;
      switch (id) {
        case "white": sample = white * 0.24; break;
        case "rain": sample = white * (0.23 + 0.035 * Math.sin(time * 0.71)) + brown * 0.35; break;
        case "ocean": {
          const wave = 0.5 - 0.5 * Math.cos(time * Math.PI / 6);
          sample = (white * 0.17 + brown * 1.3) * (0.2 + wave * 0.8);
          break;
        }
        case "cafe": {
          // Soft overlapping murmurs without intelligible speech.
          const chatter = Math.sin(time * 1.9 + channel) * Math.sin(time * 3.7) * Math.sin(time * 0.37);
          sample = brown * (0.7 + chatter * 0.35) + white * 0.045;
          sample += Math.sin(time * 2 * Math.PI * (160 + 12 * Math.sin(time * 2.1))) * 0.014 * (0.5 + 0.5 * Math.sin(time * 4.1));
          break;
        }
        case "forest": {
          sample = brown * 0.32 + white * 0.012;
          break;
        }
        case "fireplace": {
          sample = brown * 0.85 + white * 0.035;
          break;
        }
      }
      samples[i] = sample;
    }
    if (id === "forest") for (const chirp of chirps) {
      for (let j = 0; j < chirp.duration * rate; j++) {
        const t = j / rate;
        const sample = 0.10 * Math.sin(Math.PI * t / chirp.duration) ** 2 * Math.sin(2 * Math.PI * (chirp.hz * t + 1500 * t * t));
        const index = (Math.floor(chirp.start * rate) + j) % length;
        samples[index] += sample;
        if (index < fade) samples[length + index] += sample;
      }
    }
    if (id === "fireplace") for (const crackle of crackles) {
      for (let j = 0; j < crackle.duration * rate; j++) {
        const t = j / rate;
        const sample = (random() * 2 - 1) * crackle.level * Math.exp(-t / (crackle.duration * 0.2));
        const index = (Math.floor(crackle.start * rate) + j) % length;
        samples[index] += sample;
        if (index < fade) samples[length + index] += sample;
      }
    }
    const data = buffer.getChannelData(channel);
    data.set(samples.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const mix = i / fade;
      data[i] = samples[length + i] * (1 - mix) + samples[i] * mix;
    }
  }
  return buffer;
}

export class AmbientAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private channels = new Map<SoundId, Channel>();
  private buffers = new Map<SoundId, AudioBuffer>();

  async unlock() {
    if (!this.context) {
      const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new AudioPlaybackError("このブラウザでは環境音を再生できません。最新版のブラウザでお試しください。");
      const context = new AudioCtor();
      try {
        const master = context.createGain();
        master.gain.value = 0;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.knee.value = 12;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.25;
        master.connect(limiter);
        limiter.connect(context.destination);
        this.context = context;
        this.master = master;
      } catch (cause) {
        void context.close().catch(() => {});
        throw cause;
      }
    }
    const context = this.context;
    if (context.state !== "running") await context.resume();
    if (this.context !== context) return; // Disposed while resume was pending.
    if (context.state !== "running") throw new AudioPlaybackError("音を再生できませんでした。もう一度「音を再生」を押してください。");
  }

  update(settings: Settings, playing: boolean, muted: boolean) {
    const ctx = this.context;
    if (!ctx || !this.master) return;
    this.ramp(this.master.gain, muted ? 0 : settings.masterVolume / 100 * 0.65);
    for (const id of SOUND_IDS) {
      const enabled = settings.sounds[id].enabled && playing;
      let channel = this.channels.get(id);
      if (enabled && !channel) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        if (!this.buffers.has(id)) this.buffers.set(id, soundBuffer(ctx, id));
        source.buffer = this.buffers.get(id)!;
        source.loop = true;
        filter.type = FILTERS[id][0];
        filter.frequency.value = FILTERS[id][1];
        filter.Q.value = 0.5;
        gain.gain.value = 0;
        source.connect(filter); filter.connect(gain); gain.connect(this.master);
        source.start();
        channel = { source, filter, gain };
        this.channels.set(id, channel);
      }
      if (channel) {
        this.ramp(channel.gain.gain, enabled ? settings.sounds[id].volume / 100 * 0.6 : 0);
        if (!enabled) {
          channel.source.stop(ctx.currentTime + 0.2);
          const stopped = channel;
          stopped.source.onended = () => { stopped.source.disconnect(); stopped.filter.disconnect(); stopped.gain.disconnect(); };
          this.channels.delete(id);
        }
      }
    }
  }

  private ramp(param: AudioParam, value: number) {
    const now = this.context!.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + 0.15);
  }

  chime() {
    const ctx = this.context;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const start = ctx.currentTime + index * 0.22;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.12, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      oscillator.connect(envelope); envelope.connect(master);
      oscillator.start(start); oscillator.stop(start + 0.85);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    });
  }

  dispose() {
    this.channels.clear(); this.buffers.clear();
    if (this.context && this.context.state !== "closed") void this.context.close().catch(() => {});
    this.context = null; this.master = null;
  }
}
