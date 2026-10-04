import type { SoundId } from "../settings";

const SEEDS: Record<SoundId, number> = { rain: 1729, white: 4919, cafe: 7919, ocean: 104729, forest: 15485863, fireplace: 32452843 };

function randomGenerator(seed: number) {
  let state = seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function addChirp(samples: Float32Array, rate: number, start: number, duration: number, frequency: number, gain: number) {
  const offset = Math.floor(start * rate);
  const length = Math.floor(duration * rate);
  let phase = 0;
  for (let i = 0; i < length && offset + i < samples.length; i++) {
    const progress = i / length;
    phase += 2 * Math.PI * (frequency + Math.sin(progress * Math.PI * 2) * frequency * 0.2) / rate;
    const envelope = Math.sin(progress * Math.PI) ** 2;
    samples[offset + i] += Math.sin(phase) * envelope * gain;
  }
}

// Original procedural sounds. No recording, third-party audio, or network fetch.
// Each channel uses independent noise and small shared events for a soft stereo field.
export function buildSoundSamples(id: SoundId, rate: number, seconds: number, channel: number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(Math.floor(rate * seconds));
  const random = randomGenerator(SEEDS[id] + channel * 971);
  let brown = 0;
  let smooth = 0;
  let rustle = 0;
  for (let i = 0; i < samples.length; i++) {
    const noise = random() * 2 - 1;
    brown = (brown + noise * 0.035) / 1.035;
    smooth += (noise - smooth) * 0.15;
    rustle += (noise - rustle) * 0.018;
    const t = i / rate;
    switch (id) {
      case "white": samples[i] = noise * 0.27; break;
      case "rain": samples[i] = smooth * 0.62 + noise * 0.055 + brown * 0.2; break;
      case "ocean": {
        const swell = 0.55 + 0.4 * Math.sin(2 * Math.PI * t / (seconds / 2));
        samples[i] = (smooth * 0.6 + brown * 0.8) * swell;
        break;
      }
      case "forest": samples[i] = rustle * 0.7 + brown * 0.17; break;
      case "cafe": {
        const murmur = 0.65 + 0.17 * Math.sin(2 * Math.PI * t / (seconds / 5)) + 0.1 * Math.sin(2 * Math.PI * t / (seconds / 9));
        samples[i] = (smooth * 0.4 + brown * 0.5) * murmur;
        break;
      }
      case "fireplace": samples[i] = brown * 0.75 + smooth * 0.11; break;
    }
  }
  if (id === "forest") {
    for (let i = 0; i < 9; i++) {
      addChirp(samples, rate, 0.9 + i * 1.7 + channel * 0.08, 0.22 + random() * 0.25, 2200 + random() * 1700, 0.065);
    }
  }
  if (id === "cafe") {
    for (let i = 0; i < 5; i++) addChirp(samples, rate, 1.5 + i * 3.1, 0.035, 1300 + random() * 1000, 0.07);
  }
  if (id === "rain" || id === "fireplace") {
    const events = id === "rain" ? 38 : 70;
    for (let event = 0; event < events; event++) {
      const offset = Math.floor((0.2 + random() * (seconds - 0.5)) * rate);
      const length = Math.floor((id === "rain" ? 0.015 : 0.009 + random() * 0.025) * rate);
      const amplitude = id === "rain" ? 0.055 : 0.14;
      for (let i = 0; i < length && offset + i < samples.length; i++) {
        const envelope = Math.sin(Math.PI * i / length) * Math.exp(-i * 6 / length);
        samples[offset + i] += (random() * 2 - 1) * envelope * amplitude;
      }
    }
  }
  // Short, smooth loop boundary. Keep the noise bed constant through most of the loop.
  const edge = Math.floor(rate * 0.018);
  for (let i = 0; i < edge; i++) {
    const envelope = Math.sin(i / edge * Math.PI / 2);
    samples[i] *= envelope;
    samples[samples.length - 1 - i] *= envelope;
  }
  return samples;
}
