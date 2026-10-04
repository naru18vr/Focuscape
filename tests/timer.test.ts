import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings } from "../src/lib/settings";
import { createTimer, formatTime, remainingAt, restoreTimer, timerReducer, timerSnapshot } from "../src/lib/timer";

const durations = defaultSettings().durations;

test("deadline survives delayed ticks without drifting", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  assert.equal(started.endTime, 1501000);
  const afterBackground = timerReducer(started, { type: "tick", now: 541000, durations, autoStart: false });
  assert.equal(afterBackground.remainingMs, 960000);
  assert.equal(afterBackground.endTime, started.endTime);
});

test("pause preserves subsecond time and resume creates a new deadline", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  const paused = timerReducer(started, { type: "pause", now: 1750, durations });
  assert.equal(paused.remainingMs, 1499250);
  assert.equal(remainingAt(paused, 9999999), 1499250);
  const resumed = timerReducer(paused, { type: "start", now: 10000 });
  assert.equal(resumed.endTime, 1509250);
});

test("focus completes exactly once into an idle five minute break", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  const finished = timerReducer(started, { type: "tick", now: 2000000, durations, autoStart: false });
  assert.equal(finished.phase, "break");
  assert.equal(finished.status, "idle");
  assert.equal(finished.remainingMs, 300000);
  assert.equal(finished.completion?.phase, "focus");
  assert.equal(timerReducer(finished, { type: "tick", now: 3000000, durations, autoStart: false }), finished);
});

test("break returns to focus; the next session requires START", () => {
  const started = timerReducer(createTimer(durations, "break"), { type: "start", now: 1000 });
  const finished = timerReducer(started, { type: "tick", now: 301000, durations, autoStart: false });
  assert.equal(finished.phase, "focus");
  assert.equal(finished.remainingMs, 1500000);
  assert.equal(finished.status, "idle");
});

test("pause at an expired deadline completes instead of freezing at zero", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  assert.equal(timerReducer(started, { type: "pause", now: 1501000, durations }).phase, "break");
});

test("reset cancels the deadline and restores the current phase", () => {
  const started = timerReducer(createTimer(durations, "break"), { type: "start", now: 1000 });
  const reset = timerReducer(started, { type: "reset", durations });
  assert.equal(reset.phase, "break");
  assert.equal(reset.remainingMs, 300000);
  assert.equal(reset.endTime, null);
  assert.equal(reset.status, "idle");
});

test("a reloaded running timer uses the saved deadline, including expiry", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  assert.equal(restoreTimer(timerSnapshot(started), durations, 61000).remainingMs, 1440000);
  assert.equal(restoreTimer(timerSnapshot(started), durations, 1501000).phase, "break");
});

test("corrupt or impossible snapshots safely fall back to 25:00", () => {
  for (const raw of ["{", "null", JSON.stringify({ version: 1, phase: "focus", status: "running", durationMs: 1500000, remainingMs: 1500000, endTime: 1e20 })]) {
    assert.equal(restoreTimer(raw, durations, 1000).remainingMs, 1500000);
  }
});

test("future auto-start option is separated from manual MVP behavior", () => {
  const started = timerReducer(createTimer(durations), { type: "start", now: 1000 });
  const next = timerReducer(started, { type: "tick", now: 1501000, durations, autoStart: true });
  assert.equal(next.status, "running");
  assert.equal(next.phase, "break");
  assert.equal(next.endTime, 1801000);
});

test("display rounds up partial seconds, never showing a premature 00:00", () => {
  assert.equal(formatTime(1500000), "25:00");
  assert.equal(formatTime(1499999), "25:00");
  assert.equal(formatTime(1), "00:01");
  assert.equal(formatTime(-1), "00:00");
});
