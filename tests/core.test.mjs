import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Run the actual pure application modules without a bundler or test framework.
async function loadSource(path) {
  const source = stripTypeScriptTypes(await readFile(new URL(path, import.meta.url), 'utf8'));
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const { createTimer, timerReducer: reduce, formatTime } = await loadSource('../src/lib/timer.ts');
const { parseSettings, DEFAULT_SETTINGS, SOUND_IDS } = await loadSource('../src/lib/settings.ts');

test('defaults to a stopped 25-minute focus and 5-minute break', () => {
  const state = createTimer();
  assert.equal(state.phase, 'focus');
  assert.equal(state.remainingMs, 25 * 60_000);
  assert.equal(state.durations.break, 5 * 60_000);
  assert.equal(state.running, false);
});

test('start uses a deadline; repeated start does not restart the session', () => {
  const state = reduce(createTimer(), { type: 'start', now: 1000 });
  assert.equal(state.deadline, 1_501_000);
  assert.equal(reduce(state, { type: 'start', now: 50_000 }), state);
  assert.equal(reduce(state, { type: 'tick', now: 1001 }).remainingMs, 1_499_999);
});

test('pause uses the current clock, even when the last interval did not run', () => {
  const started = reduce(createTimer(), { type: 'start', now: 1000 });
  const paused = reduce(started, { type: 'pause', now: 91_123 });
  assert.equal(paused.remainingMs, 1_409_877);
  assert.equal(paused.deadline, null);
  assert.equal(paused.running, false);
  const resumed = reduce(paused, { type: 'start', now: 500_000 });
  assert.equal(resumed.deadline, 1_909_877);
});

test('focus completion switches to a full, stopped break and completes only once', () => {
  const started = reduce(createTimer(), { type: 'start', now: 10 });
  const finished = reduce(started, { type: 'tick', now: 1_500_010 });
  assert.equal(finished.phase, 'break');
  assert.equal(finished.remainingMs, 300_000);
  assert.equal(finished.completedFocus, 1);
  assert.deepEqual(finished.completion, { id: 1, phase: 'focus' });
  assert.equal(reduce(finished, { type: 'tick', now: 1_500_100 }), finished);
});

test('break completion returns to focus and does not add a focus session', () => {
  let state = reduce(createTimer(), { type: 'start', now: 0 });
  state = reduce(state, { type: 'tick', now: 1_500_000 });
  state = reduce(state, { type: 'start', now: 2_000_000 });
  state = reduce(state, { type: 'tick', now: 2_300_000 });
  assert.equal(state.phase, 'focus');
  assert.equal(state.remainingMs, 1_500_000);
  assert.equal(state.completedFocus, 1);
  assert.deepEqual(state.completion, { id: 2, phase: 'break' });
});

test('waking after six hours never creates unobserved sessions', () => {
  const started = reduce(createTimer(), { type: 'start', now: 0 });
  const finished = reduce(started, { type: 'tick', now: 21_600_000, autoStart: true });
  assert.equal(finished.completedFocus, 1);
  assert.equal(finished.phase, 'break');
  assert.equal(finished.deadline, 21_900_000);
  assert.equal(finished.remainingMs, 300_000);
});

test('auto-start creates the next deadline based on the completion clock', () => {
  const started = reduce(createTimer(), { type: 'start', now: 0 });
  const finished = reduce(started, { type: 'tick', now: 1_500_100, autoStart: true });
  assert.equal(finished.running, true);
  assert.equal(finished.deadline, 1_800_100);
});

test('pause at an expired deadline still completes the session', () => {
  const started = reduce(createTimer(), { type: 'start', now: 0 });
  const paused = reduce(started, { type: 'pause', now: 1_600_000 });
  assert.equal(paused.phase, 'break');
  assert.equal(paused.running, false);
  assert.equal(paused.completedFocus, 1);
});

test('reset stops and restores the current phase without counting a session', () => {
  let state = reduce(createTimer(), { type: 'phase', phase: 'break' });
  state = reduce(state, { type: 'start', now: 0 });
  state = reduce(state, { type: 'tick', now: 100_000 });
  state = reduce(state, { type: 'reset' });
  assert.equal(state.phase, 'break');
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 300_000);
  assert.equal(state.completedFocus, 0);
});

test('manual phase selection stops the timer and resets to the new duration', () => {
  const started = reduce(createTimer(), { type: 'start', now: 0 });
  const state = reduce(started, { type: 'phase', phase: 'break' });
  assert.equal(state.deadline, null);
  assert.equal(state.running, false);
  assert.equal(state.remainingMs, 300_000);
  assert.equal(state.completion, null);
});

test('custom durations apply while stopped and never shift a running deadline', () => {
  const durations = { focus: 50 * 60_000, break: 10 * 60_000 };
  const configured = reduce(createTimer(), { type: 'configure', durations });
  assert.equal(configured.remainingMs, 3_000_000);
  const started = reduce(createTimer(), { type: 'start', now: 0 });
  const updated = reduce(started, { type: 'configure', durations });
  assert.equal(updated.deadline, started.deadline);
  assert.equal(updated.remainingMs, started.remainingMs);
});

test('display rounds up, formats long times, and never displays negatives', () => {
  assert.equal(formatTime(1_499_999), '25:00');
  assert.equal(formatTime(1), '00:01');
  assert.equal(formatTime(-5), '00:00');
  assert.equal(formatTime(180 * 60_000), '180:00');
});

test('corrupt or missing stored settings recover safely to defaults', () => {
  for (const raw of [null, '{broken', 'null', 'false', '[]', '42']) assert.deepEqual(parseSettings(raw), DEFAULT_SETTINGS);
});

test('stored settings clamp invalid numbers and preserve independent mix volumes', () => {
  const settings = parseSettings(JSON.stringify({ focusMinutes: 999, breakMinutes: -1, masterVolume: 'loud', chime: 'false', autoStart: true, sounds: { rain: { enabled: true, volume: 70 }, cafe: { enabled: true, volume: 20 }, ocean: { volume: -5 } } }));
  assert.equal(settings.focusMinutes, 180);
  assert.equal(settings.breakMinutes, 1);
  assert.equal(settings.masterVolume, 45);
  assert.equal(settings.chime, true);
  assert.equal(settings.autoStart, true);
  assert.deepEqual(settings.sounds.rain, { enabled: true, volume: 70 });
  assert.deepEqual(settings.sounds.cafe, { enabled: true, volume: 20 });
  assert.equal(settings.sounds.ocean.volume, 0);
  assert.equal(Object.keys(settings.sounds).length, SOUND_IDS.length);
});
