import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings, parseSettings, SOUND_IDS } from "../src/lib/settings";

test("missing, corrupt, and outdated settings use safe defaults", () => {
  for (const value of [null, "{", "null", "[]", '{"version":9}', '{"masterVolume":1}']) {
    assert.deepEqual(parseSettings(value), defaultSettings());
  }
});

test("mix and master volume survive serialization", () => {
  const settings = defaultSettings();
  settings.sounds.cafe = { enabled: true, volume: 0.21 };
  settings.sounds.fireplace = { enabled: true, volume: 0.33 };
  settings.masterVolume = 0.47;
  assert.deepEqual(parseSettings(JSON.stringify(settings)), settings);
});

test("untrusted settings clamp volumes and ignore unknown sound ids", () => {
  const parsed = parseSettings(JSON.stringify({ version: 1, masterVolume: 90, durations: { focus: -1 }, sounds: { rain: { enabled: "yes", volume: -2 }, unknown: { enabled: true, volume: 1 } } }));
  assert.equal(parsed.masterVolume, 1);
  assert.equal(parsed.sounds.rain.volume, 0);
  assert.equal(parsed.sounds.rain.enabled, true);
  assert.deepEqual(Object.keys(parsed.sounds), [...SOUND_IDS]);
  assert.equal(parsed.durations.focus, 1500000);
});
