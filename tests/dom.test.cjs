const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

test('React UI connects real timer actions, completion messages, mix selections and persistent settings', async () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:3000' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'KeyboardEvent', 'localStorage']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // JSDOM has no native dialog or audio. Those native APIs remain E2E checks.
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };

  const ts = require('typescript');
  const originalResolve = Module._resolveFilename;
  const previousTs = Module._extensions['.ts'];
  const previousTsx = Module._extensions['.tsx'];
  const sourceRoot = path.join(__dirname, '../src');
  Module._resolveFilename = function(request, parent, ...args) {
    return originalResolve.call(this, request.startsWith('@/') ? path.join(sourceRoot, request.slice(2)) : request, parent, ...args);
  };
  const compile = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    module._compile(outputText, filename);
  };
  Module._extensions['.ts'] = compile;
  Module._extensions['.tsx'] = compile;
  const { Focuscape } = require('../src/components/focuscape.tsx');
  const { AmbientAudio } = require('../src/lib/audio.ts');
  Module._resolveFilename = originalResolve;
  Module._extensions['.ts'] = previousTs;
  Module._extensions['.tsx'] = previousTsx;

  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  const container = document.getElementById('root');
  let root = createRoot(container);
  const originalNow = Date.now;
  let now = 100_000;
  Date.now = () => now;
  const byLabel = (label) => {
    const element = container.querySelector(`[aria-label="${label}"]`);
    assert.ok(element, `Missing control: ${label}`);
    return element;
  };
  const timer = () => container.querySelector('[data-testid="timer"]').textContent;
  const primary = () => container.querySelector('.start-button');
  const click = async (element) => act(async () => element.click());
  const tick = async (ms) => act(async () => { now += ms; document.dispatchEvent(new Event('visibilitychange')); });
  const input = async (element, value) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });

  try {
    await act(async () => root.render(React.createElement(Focuscape)));
    assert.equal(timer(), '25:00');
    assert.equal(primary().disabled, false);
    await click(primary());
    await tick(10_000);
    assert.equal(timer(), '24:50');
    assert.equal(primary().textContent, 'PAUSE');
    await click(primary());
    await tick(20_000);
    assert.equal(timer(), '24:50');
    await click(primary());
    await tick(10_000);
    assert.equal(timer(), '24:40');
    await click(byLabel('タイマーをリセット'));
    assert.equal(timer(), '25:00');

    await click(primary());
    await tick(25 * 60_000);
    assert.equal(timer(), '05:00');
    assert.match(container.querySelector('[role="status"]').textContent, /集中、おつかれさまでした/);
    assert.equal(primary().textContent, 'START');
    await click(primary());
    await tick(5 * 60_000);
    assert.equal(timer(), '25:00');
    assert.match(container.querySelector('[role="status"]').textContent, /休憩が終わりました/);

    await click(byLabel('Rain ON'));
    await click(byLabel('Cafe ON'));
    assert.equal(byLabel('Rain OFF').getAttribute('aria-pressed'), 'true');
    assert.equal(byLabel('Cafe OFF').getAttribute('aria-pressed'), 'true');
    assert.equal(byLabel('Rainの音量').disabled, false);
    await input(byLabel('Master Volume'), '35');
    await input(byLabel('Rainの音量'), '70');
    await input(byLabel('Cafeの音量'), '20');

    await click(byLabel('設定を開く'));
    await input(byLabel('集中時間（分）'), '50');
    await input(byLabel('休憩時間（分）'), '10');
    await act(async () => container.querySelector('.settings-content').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(timer(), '50:00');
    const stored = JSON.parse(localStorage.getItem('focuscape.settings.v1'));
    assert.equal(stored.masterVolume, 35);
    assert.equal(stored.sounds.rain.volume, 70);
    assert.equal(stored.sounds.cafe.volume, 20);
    assert.equal(stored.focusMinutes, 50);
    assert.equal(stored.breakMinutes, 10);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(React.createElement(Focuscape)));
    assert.equal(timer(), '50:00');
    assert.equal(byLabel('Rain OFF').getAttribute('aria-pressed'), 'true');
    assert.equal(byLabel('Master Volume').value, '35');
    assert.ok(byLabel('選択した環境音を再生'));
    await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    assert.equal(primary().textContent, 'PAUSE');

    // Browser resume can settle after a later user action. The latest intent wins.
    const originalUnlock = AmbientAudio.prototype.unlock;
    const originalUpdate = AmbientAudio.prototype.update;
    const pending = [];
    const updates = [];
    AmbientAudio.prototype.unlock = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    AmbientAudio.prototype.update = (settings, playing) => updates.push(playing && Object.values(settings.sounds).some((sound) => sound.enabled));
    try {
      await click(primary());
      await click(byLabel('選択した環境音を再生'));
      assert.ok(byLabel('環境音をすべて停止'));
      await click(byLabel('環境音をすべて停止'));
      await act(async () => pending.shift().resolve());
      assert.ok(byLabel('選択した環境音を再生'));
      assert.equal(updates.at(-1), false);

      await click(byLabel('選択した環境音を再生'));
      await click(byLabel('Rain OFF'));
      await click(byLabel('Cafe OFF'));
      await act(async () => pending.shift().resolve());
      assert.equal(byLabel('選択した環境音を再生').disabled, true);
      assert.equal(updates.at(-1), false);

      await click(byLabel('Rain ON'));
      await click(byLabel('Cafe ON'));
      const older = pending.shift();
      const newer = pending.shift();
      await act(async () => newer.resolve());
      await act(async () => older.reject(new Error('Old resume request failed')));
      assert.ok(byLabel('環境音をすべて停止'));
      assert.equal(container.querySelector('[role="alert"]'), null);

      // A failed audio graph must leave timer controls and completion working.
      AmbientAudio.prototype.update = (settings, playing) => { if (playing) throw new Error('Graph unavailable'); };
      await input(byLabel('Master Volume'), '40');
      assert.match(container.querySelector('[role="alert"]').textContent, /音を再生できませんでした/);
      await click(primary());
      await tick(1000);
      assert.equal(timer(), '49:59');
      await act(async () => pending.shift().resolve());
    } finally {
      AmbientAudio.prototype.unlock = originalUnlock;
      AmbientAudio.prototype.update = originalUpdate;
    }
  } finally {
    await act(async () => root.unmount());
    Date.now = originalNow;
    dom.window.close();
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  }
});
