import { testWindow } from "./dom-setup";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Focuscape } from "../src/components/focuscape";
import { defaultSettings, SETTINGS_KEY, TIMER_KEY } from "../src/lib/settings";

afterEach(() => {
  cleanup();
  testWindow.localStorage.clear();
});

test("first render is ready at 25:00 with all six sound controls", () => {
  const view = render(createElement(Focuscape));
  assert.equal(view.getByTestId("timer-display").textContent, "25:00");
  assert.ok(!(view.getByRole("button", { name: "集中タイマーを開始" }) as HTMLButtonElement).disabled);
  for (const sound of ["Rain", "White Noise", "Cafe", "Ocean", "Forest", "Fireplace"]) {
    assert.ok(view.getByRole("button", { name: new RegExp(`${sound}を`) }));
    assert.ok(view.getByRole("slider", { name: `${sound}の音量` }));
  }
});

test("START, PAUSE, RESUME and RESET change actual React state", () => {
  const view = render(createElement(Focuscape));
  fireEvent.click(view.getByRole("button", { name: "集中タイマーを開始" }));
  assert.equal(JSON.parse(testWindow.localStorage.getItem(TIMER_KEY)!).status, "running");
  fireEvent.click(view.getByRole("button", { name: "集中タイマーを一時停止" }));
  assert.equal(JSON.parse(testWindow.localStorage.getItem(TIMER_KEY)!).status, "paused");
  fireEvent.click(view.getByRole("button", { name: "集中タイマーを再開" }));
  assert.equal(JSON.parse(testWindow.localStorage.getItem(TIMER_KEY)!).status, "running");
  fireEvent.click(view.getByRole("button", { name: "タイマーをリセット" }));
  assert.equal(view.getByTestId("timer-display").textContent, "25:00");
  assert.equal(JSON.parse(testWindow.localStorage.getItem(TIMER_KEY)!).status, "idle");
});

test("expired focus hydrates into break and displays a visible completion message", () => {
  testWindow.localStorage.setItem(TIMER_KEY, JSON.stringify({ version: 1, phase: "focus", status: "running", durationMs: 1500000, remainingMs: 1500000, endTime: Date.now() - 1000 }));
  const view = render(createElement(Focuscape));
  assert.equal(view.getByTestId("timer-display").textContent, "05:00");
  assert.ok(view.getByRole("button", { name: "休憩タイマーを開始" }));
  assert.ok(view.getByText(/集中、おつかれさまでした/));
  assert.ok(view.container.querySelector(".break-phase"));
});

test("expired break returns to a waiting focus session", () => {
  testWindow.localStorage.setItem(TIMER_KEY, JSON.stringify({ version: 1, phase: "break", status: "running", durationMs: 300000, remainingMs: 300000, endTime: Date.now() - 1000 }));
  const view = render(createElement(Focuscape));
  assert.equal(view.getByTestId("timer-display").textContent, "25:00");
  assert.ok(view.getByRole("button", { name: "集中タイマーを開始" }));
  assert.ok(view.getByText(/休憩が終わりました/));
});

test("mix toggles and volume sliders persist from the rendered UI", () => {
  const view = render(createElement(Focuscape));
  fireEvent.click(view.getByRole("button", { name: "CafeをON" }));
  fireEvent.click(view.getByRole("button", { name: "FireplaceをON" }));
  fireEvent.change(view.getByRole("slider", { name: "Cafeの音量" }), { target: { value: "21" } });
  fireEvent.change(view.getByRole("slider", { name: "全体音量" }), { target: { value: "47" } });
  const saved = JSON.parse(testWindow.localStorage.getItem(SETTINGS_KEY)!);
  assert.equal(saved.sounds.cafe.enabled, true);
  assert.equal(saved.sounds.fireplace.enabled, true);
  assert.equal(saved.sounds.cafe.volume, 0.21);
  assert.equal(saved.masterVolume, 0.47);
  fireEvent.click(view.getByRole("button", { name: "すべての環境音をミュート" }));
  assert.equal(JSON.parse(testWindow.localStorage.getItem(SETTINGS_KEY)!).muted, true);
  assert.equal(view.getByRole("button", { name: "CafeをOFF" }).getAttribute("aria-pressed"), "true");
});

test("stored mix and paused time hydrate without overwriting preferences", () => {
  const settings = defaultSettings();
  settings.sounds.cafe.enabled = true;
  settings.masterVolume = 0.47;
  testWindow.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  testWindow.localStorage.setItem(TIMER_KEY, JSON.stringify({ version: 1, phase: "focus", status: "paused", durationMs: 1500000, remainingMs: 1440000, endTime: null }));
  const view = render(createElement(Focuscape));
  assert.equal(view.getByTestId("timer-display").textContent, "24:00");
  assert.ok(view.getByRole("button", { name: "集中タイマーを再開" }));
  assert.ok(view.getByRole("button", { name: "CafeをOFF" }));
  assert.equal((view.getByRole("slider", { name: "全体音量" }) as HTMLInputElement).value, "47");
});

test("Space and R work from the document and leave focused controls alone", () => {
  const view = render(createElement(Focuscape));
  fireEvent.keyDown(testWindow.document.body, { code: "Space", key: " " });
  assert.ok(view.getByRole("button", { name: "集中タイマーを一時停止" }));
  fireEvent.keyDown(testWindow.document.body, { code: "Space", key: " " });
  assert.ok(view.getByRole("button", { name: "集中タイマーを再開" }));
  fireEvent.keyDown(testWindow.document.body, { code: "KeyR", key: "r" });
  assert.ok(view.getByRole("button", { name: "集中タイマーを開始" }));
  fireEvent.keyDown(view.getByRole("slider", { name: "全体音量" }), { code: "Space", key: " " });
  assert.ok(view.getByRole("button", { name: "集中タイマーを開始" }));
});

test("settings open, update the chime preference, and close on cancel", () => {
  const view = render(createElement(Focuscape));
  fireEvent.click(view.getByRole("button", { name: "設定を開く" }));
  const dialog = view.getByRole("dialog", { name: "設定" });
  assert.ok(dialog.hasAttribute("open"));
  fireEvent.click(view.getByRole("switch", { name: "終了チャイム" }));
  assert.equal(JSON.parse(testWindow.localStorage.getItem(SETTINGS_KEY)!).chime, false);
  fireEvent(dialog, new testWindow.Event("cancel", { bubbles: false }));
  assert.equal(view.queryByRole("dialog"), null);
});
