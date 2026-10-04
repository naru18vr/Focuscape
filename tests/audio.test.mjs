import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

function url(source) { return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`; }
const settingsUrl = url(stripTypeScriptTypes(await readFile(new URL('../src/lib/settings.ts', import.meta.url), 'utf8')));
const { DEFAULT_SETTINGS, SOUND_IDS } = await import(settingsUrl);
const audioSource = stripTypeScriptTypes(await readFile(new URL('../src/lib/audio.ts', import.meta.url), 'utf8')).replace('"./settings"', JSON.stringify(settingsUrl));
const { AmbientAudio } = await import(url(audioSource));

// This validates generated PCM and routing logic. Native browser playback is covered by E2E.
class Param {
  value = 0;
  ramps = [];
  cancelScheduledValues() {}
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.ramps.push({ value, time }); }
}
class AudioNode {
  connections = [];
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
}
class FakeContext {
  sampleRate = 8000;
  currentTime = 2;
  state = 'suspended';
  sources = [];
  gains = [];
  oscillators = [];
  destination = new AudioNode();
  static instances = [];
  constructor() { FakeContext.instances.push(this); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { const node = Object.assign(new AudioNode(), { gain: new Param() }); this.gains.push(node); return node; }
  createDynamicsCompressor() { return Object.assign(new AudioNode(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map((key) => [key, new Param()]))); }
  createBiquadFilter() { return Object.assign(new AudioNode(), { frequency: new Param(), Q: new Param() }); }
  createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: (channel) => data[channel] }; }
  createBufferSource() {
    const node = Object.assign(new AudioNode(), { started: false, stopTime: null, start() { this.started = true; }, stop(time) { this.stopTime = time; } });
    this.sources.push(node); return node;
  }
  createOscillator() {
    const node = Object.assign(new AudioNode(), { frequency: new Param(), startTime: null, stopTime: null, start(time) { this.startTime = time; }, stop(time) { this.stopTime = time; } });
    this.oscillators.push(node); return node;
  }
}
globalThis.window = { AudioContext: FakeContext };

test('all six soundscapes produce finite, audible stereo PCM without clipped samples', async () => {
  const audio = new AmbientAudio();
  await audio.unlock();
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const id of SOUND_IDS) settings.sounds[id].enabled = true;
  audio.update(settings, true, false);
  const context = FakeContext.instances.at(-1);
  assert.equal(context.state, 'running');
  assert.equal(context.sources.length, 6);
  for (const source of context.sources) {
    assert.equal(source.started, true);
    assert.equal(source.loop, true);
    for (const channel of [0, 1]) {
      const samples = source.buffer.getChannelData(channel);
      assert.equal(samples.length, 24 * context.sampleRate);
      let energy = 0;
      for (const sample of samples) {
        assert.ok(Number.isFinite(sample));
        assert.ok(Math.abs(sample) < 1);
        energy += sample * sample;
      }
      assert.ok(energy / samples.length > 0.00001);
    }
    assert.notDeepEqual(source.buffer.getChannelData(0), source.buffer.getChannelData(1));
  }
  audio.dispose();
  assert.equal(context.state, 'closed');
});

test('master and individual volumes ramp smoothly; mute preserves saved levels', async () => {
  const audio = new AmbientAudio();
  await audio.unlock();
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.masterVolume = 30;
  settings.sounds.rain = { enabled: true, volume: 70 };
  settings.sounds.cafe = { enabled: true, volume: 20 };
  audio.update(settings, true, false);
  const context = FakeContext.instances.at(-1);
  assert.equal(context.gains[0].gain.value, 0.195);
  assert.equal(context.gains[1].gain.value, 0.42);
  assert.equal(context.gains[2].gain.value, 0.12);
  assert.equal(context.gains[0].gain.ramps.at(-1).time, 2.15);
  audio.update(settings, true, true);
  assert.equal(context.gains[0].gain.value, 0);
  assert.equal(settings.masterVolume, 30);
  audio.update(settings, true, false);
  assert.equal(context.gains[0].gain.value, 0.195);
  audio.dispose();
});

test('stop fades channels out; restart reuses buffers and creates fresh sources', async () => {
  const audio = new AmbientAudio();
  await audio.unlock();
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.sounds.rain.enabled = true;
  audio.update(settings, true, false);
  const context = FakeContext.instances.at(-1);
  const first = context.sources[0];
  audio.update(settings, false, false);
  assert.equal(first.stopTime, 2.2);
  assert.equal(context.gains[1].gain.value, 0);
  first.onended();
  assert.equal(first.connections.length, 0);
  audio.update(settings, true, false);
  assert.equal(context.sources.length, 2);
  assert.equal(context.sources[1].buffer, first.buffer);
  audio.dispose();
});

test('completion chime is short, low level, and routed through the master gain', async () => {
  const audio = new AmbientAudio();
  await audio.unlock();
  audio.update(DEFAULT_SETTINGS, false, false);
  audio.chime();
  const context = FakeContext.instances.at(-1);
  assert.equal(context.oscillators.length, 2);
  for (const oscillator of context.oscillators) {
    assert.ok(oscillator.stopTime - oscillator.startTime < 0.9);
    assert.equal(oscillator.connections[0].connections[0], context.gains[0]);
    assert.ok(oscillator.connections[0].gain.ramps.every(({ value }) => value <= 0.12));
  }
  audio.dispose();
});

test('unsupported audio fails with a clear error instead of failing silently', async () => {
  const native = window.AudioContext;
  window.AudioContext = undefined;
  await assert.rejects(new AmbientAudio().unlock(), /このブラウザでは環境音を再生できません/);
  window.AudioContext = native;
});

test('failed graph initialization closes the context and permits a clean retry', async () => {
  const audio = new AmbientAudio();
  const native = window.AudioContext;
  window.AudioContext = class extends FakeContext { createDynamicsCompressor() { throw new Error('Graph unavailable'); } };
  try {
    await assert.rejects(audio.unlock(), /Graph unavailable/);
    assert.equal(FakeContext.instances.at(-1).state, 'closed');
    window.AudioContext = native;
    await audio.unlock();
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.sounds.rain.enabled = true;
    audio.update(settings, true, false);
    assert.equal(FakeContext.instances.at(-1).sources.length, 1);
  } finally { window.AudioContext = native; audio.dispose(); }
});

test('disposal safely cancels a pending audio resume', async () => {
  const audio = new AmbientAudio();
  const native = window.AudioContext;
  let release;
  window.AudioContext = class extends FakeContext { resume() { return new Promise((resolve) => { release = resolve; }); } };
  try {
    const pending = audio.unlock();
    audio.dispose();
    release();
    await assert.doesNotReject(pending);
    assert.equal(FakeContext.instances.at(-1).state, 'closed');
  } finally { window.AudioContext = native; audio.dispose(); }
});

test('an unavailable audio output times out instead of remaining pending forever', async () => {
  const audio = new AmbientAudio();
  const native = window.AudioContext;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let expire;
  let cleared;
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 8000); expire = callback; return 42; };
  globalThis.clearTimeout = (id) => { cleared = id; };
  window.AudioContext = class extends FakeContext { resume() { return new Promise(() => {}); } };
  try {
    const pending = audio.unlock();
    expire();
    await assert.rejects(pending, /出力機器を確認/);
    assert.equal(cleared, 42);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    window.AudioContext = native;
    audio.dispose();
  }
});
