import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("./");
  await expect(page.getByRole("button", { name: "START", exact: true })).toBeEnabled();
}

async function readyClock(page: Page) {
  const time = new Date("2030-01-01T00:00:00Z");
  await page.clock.install({ time });
  await ready(page);
  // Real browser actions must not consume countdown time between assertions.
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
}

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

async function setRange(page: Page, name: string, value: number) {
  await page.getByRole("slider", { name, exact: true }).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("start, pause, resume, reset and keyboard controls", async ({ page }) => {
  await readyClock(page);
  await expect(page.getByTestId("timer")).toHaveText("25:00");
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId("timer")).toHaveText("24:50");
  await page.getByRole("button", { name: "PAUSE", exact: true }).click();
  await expect(page).toHaveTitle("24:50 · Focus（一時停止） — Focuscape");
  await page.clock.fastForward(20_000);
  await expect(page.getByTestId("timer")).toHaveText("24:50");
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId("timer")).toHaveText("24:40");
  await page.getByRole("button", { name: "タイマーをリセット" }).click();
  await expect(page.getByTestId("timer")).toHaveText("25:00");
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "PAUSE", exact: true })).toBeVisible();
});

test("Space shortcut respects IME, modifier keys, editable controls and dialogs", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", "残り 25分 0秒");
  for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }, { isComposing: true }, { repeat: true }]) {
    await page.locator("body").dispatchEvent("keydown", { code: "Space", bubbles: true, ...modifiers });
    await expect(page.getByRole("button", { name: "START", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.getByRole("spinbutton", { name: "集中時間（分）" }).dispatchEvent("keydown", { code: "Space", bubbles: true });
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await expect(page.getByRole("button", { name: "START", exact: true })).toBeVisible();
});

test("focus and break complete once, announce visually, and wait for START", async ({ page }) => {
  await readyClock(page);
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(25 * 60_000);
  await expect(page.getByTestId("timer")).toHaveText("05:00");
  await expect(page.getByRole("button", { name: /Break/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText("集中、おつかれさまでした");
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId("timer")).toHaveText("05:00");
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(5 * 60_000);
  await expect(page.getByTestId("timer")).toHaveText("25:00");
  await expect(page.getByRole("status")).toContainText("休憩が終わりました");
});

test("settings and simultaneous sound selections survive reload without autoplay", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Rain ON", exact: true }).click();
  await page.getByRole("button", { name: "Cafe ON", exact: true }).click();
  await setRange(page, "Rainの音量", 70);
  await setRange(page, "Cafeの音量", 20);
  await setRange(page, "Master Volume", 35);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.getByRole("spinbutton", { name: "集中時間（分）" }).fill("50");
  await page.getByRole("spinbutton", { name: "休憩時間（分）" }).fill("10");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.reload();
  await expect(page.getByTestId("timer")).toHaveText("50:00");
  await expect(page.getByRole("button", { name: "Rain OFF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Cafe OFF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Rainの音量" })).toHaveValue("70");
  await expect(page.getByRole("slider", { name: "Cafeの音量" })).toHaveValue("20");
  await expect(page.getByRole("slider", { name: "Master Volume" })).toHaveValue("35");
  await expect(page.getByRole("button", { name: "選択した環境音を再生" })).toBeVisible();
});

test("all six real Web Audio channels start, mix, adjust and stop", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const tracking = { contexts: [] as AudioContext[], sources: [] as AudioBufferSourceNode[], gains: [] as GainNode[] };
    (window as unknown as { audioTracking: typeof tracking }).audioTracking = tracking;
    window.AudioContext = class extends Native {
      constructor() { super(); tracking.contexts.push(this); }
      createBufferSource() { const source = super.createBufferSource(); tracking.sources.push(source); return source; }
      createGain() { const gain = super.createGain(); tracking.gains.push(gain); return gain; }
    };
  });
  await ready(page);
  for (const name of ["Rain", "White Noise", "Cafe", "Ocean", "Forest", "Fireplace"]) await page.getByRole("button", { name: `${name} ON`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { audioTracking: { contexts: AudioContext[] } }).audioTracking.contexts[0].state)).toBe("running");
  await expect(page.getByText("6種類の音 をミックス中")).toBeVisible();
  const graph = await page.evaluate(() => {
    const data = (window as unknown as { audioTracking: { contexts: AudioContext[]; sources: AudioBufferSourceNode[] } }).audioTracking;
    return { state: data.contexts[0].state, sources: data.sources.length, loops: data.sources.every((s) => s.loop), nonzero: data.sources.every((s) => s.buffer!.getChannelData(0).some((v) => v !== 0)) };
  });
  expect(graph).toEqual({ state: "running", sources: 6, loops: true, nonzero: true });
  await setRange(page, "Rainの音量", 70);
  await setRange(page, "Master Volume", 30);
  await page.waitForTimeout(200);
  const gain = await page.evaluate(() => (window as unknown as { audioTracking: { gains: GainNode[] } }).audioTracking.gains[0].gain.value);
  expect(gain).toBeCloseTo(0.195, 2);
  await page.getByRole("button", { name: "すべての音をミュート" }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { audioTracking: { gains: GainNode[] } }).audioTracking.gains[0].gain.value)).toBeCloseTo(0, 3);
  await page.getByRole("button", { name: "環境音をすべて停止" }).click();
  await expect(page.getByRole("button", { name: "選択した環境音を再生" })).toBeVisible();
});

test("auto-start begins the next phase; duration fields lock while running", async ({ page }) => {
  await readyClock(page);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.getByRole("checkbox", { name: /次のセッションを自動開始/ }).check();
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(25 * 60_000);
  await expect(page.getByTestId("timer")).toHaveText("05:00");
  await expect(page.getByRole("button", { name: "PAUSE", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByRole("spinbutton", { name: "集中時間（分）" })).toBeDisabled();
});

test("dialog supports Escape and restores keyboard focus", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "設定を開く" })).toBeFocused();
});

test("corrupt storage and blocked audio preserve timer usability", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("focuscape.settings.v1", "{broken");
    window.AudioContext = class extends AudioContext { constructor() { super(); void this.close(); throw new Error("Audio blocked"); } };
  });
  await readyClock(page);
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.locator(".error-message[role=alert]")).toContainText("音を再生できませんでした");
  await expect(page.getByRole("button", { name: "PAUSE", exact: true })).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(page.getByTestId("timer")).toHaveText("24:59");
});

test("background wake checks the real deadline without inventing missed sessions", async ({ page }) => {
  await readyClock(page);
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.setSystemTime(await page.evaluate(() => Date.now() + 6 * 60 * 60_000));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByTestId("timer")).toHaveText("05:00");
  await expect(page.getByRole("button", { name: "START", exact: true })).toBeVisible();
  await expect(page.getByText(/SESSION 02/)).toBeVisible();
});

test("allowed notifications fire once with the correct icon path", async ({ page }) => {
  await page.addInitScript(() => {
    const notices: { title: string; options: NotificationOptions }[] = [];
    (window as unknown as { notices: typeof notices }).notices = notices;
    window.Notification = class {
      static permission = "granted";
      constructor(title: string, options: NotificationOptions) { notices.push({ title, options }); }
    } as unknown as typeof Notification;
    localStorage.setItem("focuscape.settings.v1", JSON.stringify({ notifications: true }));
  });
  await readyClock(page);
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(25 * 60_000);
  await page.clock.fastForward(30_000);
  const notices = await page.evaluate(() => (window as unknown as { notices: { title: string; options: NotificationOptions }[] }).notices);
  expect(notices).toHaveLength(1);
  expect(notices[0].title).toBe("Focuscape");
  expect(notices[0].options.body).toContain("集中、おつかれさまでした");
  expect(notices[0].options.icon).toBe(process.env.TEST_PAGES === "true" ? "/Focuscape/icon.svg" : "/icon.svg");
});

test("invalid durations stay in the dialog, and the longest supported time fits", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.getByRole("spinbutton", { name: "集中時間（分）" }).fill("0");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("spinbutton", { name: "集中時間（分）" }).fill("180");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.getByTestId("timer")).toHaveText("180:00");
  const face = await page.locator(".timer-face").boundingBox();
  const digits = await page.getByTestId("timer").boundingBox();
  expect(digits!.width).toBeLessThan(face!.width);
});

test("blocked browser storage still permits timer and sound controls", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Unavailable", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Unavailable", "SecurityError"); };
  });
  await ready(page);
  await page.getByRole("button", { name: "Rain ON", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rain OFF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.getByRole("button", { name: "PAUSE", exact: true })).toBeVisible();
});

for (const [width, height] of [[320, 844], [390, 844], [768, 1080], [1024, 768], [1366, 768], [1440, 1080]]) test(`no overflow or browser errors at ${width}x${height}`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width, height });
  await ready(page);
  await expect(page.getByTestId("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rain ON", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-focuscape-${width}.png`, fullPage: true });
  const layout = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: window.innerHeight }));
  if (width >= 1024) expect(layout.height, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByRole("button", { name: "設定を保存" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const dialogBox = await page.getByRole("dialog").boundingBox();
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - height / 2)).toBeLessThan(2);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-settings-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
