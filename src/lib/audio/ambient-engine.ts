import { SOUND_IDS, unitVolume, type Settings, type SoundId } from "../settings";
import { buildSoundSamples } from "./synthesis";

export type AudioStatus = "idle" | "playing" | "muted" | "suspended" | "error";
type Voice = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; stopTimeout: ReturnType<typeof setTimeout> | null };

export class AmbientEngine {
  private context: AudioContext;
  private master: GainNode;
  private ambience: GainNode;
  private limiter: DynamicsCompressorNode;
  private voices = new Map<SoundId, Voice>();
  private buffers = new Map<SoundId, AudioBuffer>();
  private settings: Settings;
  private unlocked = false;
  private destroyed = false;

  constructor(settings: Settings, private onStatus: (status: AudioStatus) => void) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio is unavailable");
    this.context = new AudioContextClass();
    this.settings = settings;
    this.master = this.context.createGain();
    this.ambience = this.context.createGain();
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 18;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.25;
    this.master.gain.value = 0;
    this.ambience.gain.value = 0;
    this.ambience.connect(this.master);
    this.master.connect(this.limiter);
    this.limiter.connect(this.context.destination);
    this.context.onstatechange = () => this.reportStatus();
  }

  private ramp(parameter: AudioParam, value: number) {
    const now = this.context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, 0.06);
  }

  private reportStatus() {
    if (this.destroyed) return;
    if (!this.unlocked) return this.onStatus("idle");
    if (this.context.state !== "running") return this.onStatus("suspended");
    if (this.settings.muted || this.settings.masterVolume === 0) return this.onStatus("muted");
    this.onStatus(SOUND_IDS.some(id => this.settings.sounds[id].enabled && this.settings.sounds[id].volume > 0) ? "playing" : "idle");
  }

  private createVoice(id: SoundId): Voice {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      const rate = 22050;
      const seconds = 18;
      buffer = this.context.createBuffer(2, rate * seconds, rate);
      for (let channel = 0; channel < 2; channel++) buffer.copyToChannel(buildSoundSamples(id, rate, seconds, channel), channel);
      this.buffers.set(id, buffer);
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = id === "cafe" ? "bandpass" : "lowpass";
    filter.frequency.value = { rain: 6500, white: 16000, cafe: 750, ocean: 2400, forest: 6500, fireplace: 1800 }[id];
    filter.Q.value = id === "cafe" ? 0.45 : 0.5;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambience);
    source.start();
    const voice: Voice = { source, filter, gain, stopTimeout: null };
    this.voices.set(id, voice);
    return voice;
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    if (!this.unlocked || this.destroyed) return;
    this.ramp(this.master.gain, unitVolume(settings.masterVolume, 0.5));
    this.ramp(this.ambience.gain, settings.muted ? 0 : 0.8);
    for (const id of SOUND_IDS) {
      const sound = settings.sounds[id];
      let voice = this.voices.get(id);
      if (sound.enabled) {
        voice ??= this.createVoice(id);
        if (voice.stopTimeout) { clearTimeout(voice.stopTimeout); voice.stopTimeout = null; }
        this.ramp(voice.gain.gain, unitVolume(sound.volume, 0.5));
      } else if (voice && !voice.stopTimeout) {
        this.ramp(voice.gain.gain, 0);
        const stoppedVoice = voice;
        voice.stopTimeout = setTimeout(() => {
          stoppedVoice.source.stop();
          stoppedVoice.source.disconnect();
          stoppedVoice.filter.disconnect();
          stoppedVoice.gain.disconnect();
          this.voices.delete(id);
        }, 500);
      }
    }
    this.reportStatus();
  }

  async play() {
    if (this.destroyed) return;
    // Call resume from the user's gesture before any asynchronous work.
    const resumed = this.context.resume();
    this.unlocked = true;
    this.setSettings(this.settings);
    await resumed;
    this.reportStatus();
  }

  chime() {
    if (!this.unlocked || this.destroyed || !this.settings.chime || this.context.state !== "running") return;
    const now = this.context.currentTime;
    for (const [frequency, offset] of [[523.25, 0], [659.25, 0.22]] as const) {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0, now + offset);
      envelope.gain.linearRampToValueAtTime(0.07, now + offset + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.75);
      oscillator.connect(envelope);
      envelope.connect(this.master);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.8);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    }
  }

  destroy() {
    this.destroyed = true;
    this.context.onstatechange = null;
    for (const voice of this.voices.values()) {
      if (voice.stopTimeout) clearTimeout(voice.stopTimeout);
      voice.source.stop();
      voice.source.disconnect();
      voice.filter.disconnect();
      voice.gain.disconnect();
    }
    this.voices.clear();
    this.buffers.clear();
    this.ambience.disconnect();
    this.master.disconnect();
    this.limiter.disconnect();
    void this.context.close();
  }
}
