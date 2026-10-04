import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSoundSamples } from "../src/lib/audio/synthesis";
import { SOUND_IDS } from "../src/lib/settings";

for (const id of SOUND_IDS) {
  test(`${id} produces non-silent, finite stereo samples without clipping or loop-boundary clicks`, () => {
    const left = buildSoundSamples(id, 22050, 18, 0);
    const right = buildSoundSamples(id, 22050, 18, 1);
    let energy = 0;
    let peak = 0;
    let stereoDifference = 0;
    for (let i = 0; i < left.length; i++) {
      assert.ok(Number.isFinite(left[i]));
      energy += left[i] ** 2;
      peak = Math.max(peak, Math.abs(left[i]));
      stereoDifference += Math.abs(left[i] - right[i]);
    }
    assert.ok(energy / left.length > 0.00001, "audible signal");
    assert.ok(peak < 0.95, "headroom for mixing");
    assert.ok(stereoDifference > 1, "independent stereo channels");
    assert.equal(Math.abs(left[0]), 0);
    assert.equal(Math.abs(left[left.length - 1]), 0);
  });
}
