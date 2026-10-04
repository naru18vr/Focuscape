import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

async function openWithClock(page: Page) {
  const now = new Date("2026-10-04T10:00:00Z");
  await page.clock.install({ time: now });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeEnabled();
  await page.clock.pauseAt(new Date("2026-10-04T10:01:00Z"));
}

test("start, exact pause/resume, reset, and background deadline correction", async ({ page }) => {
  await openWithClock(page);
  await expect(page.getByTestId("timer-display")).toHaveText("25:00");
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await page.clock.fastForward(65000);
  await expect(page.getByTestId("timer-display")).toHaveText("23:55");
  await page.getByRole("button", { name: "集中タイマーを一時停止" }).click();
  await page.clock.fastForward(120000);
  await expect(page.getByTestId("timer-display")).toHaveText("23:55");
  await page.getByRole("button", { name: "集中タイマーを再開" }).click();
  await page.clock.fastForward(30000);
  await expect(page.getByTestId("timer-display")).toHaveText("23:25");
  await page.getByRole("button", { name: "タイマーをリセット" }).click();
  await expect(page.getByTestId("timer-display")).toHaveText("25:00");
  await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeVisible();
});

test("25 minute focus -> manual 5 minute break -> next focus", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await page.clock.fastForward(1500000);
  await expect(page.getByTestId("timer-display")).toHaveText("05:00");
  await expect(page.getByRole("status").filter({ hasText: "集中、おつかれさまでした" })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/break-phase/);
  await page.clock.fastForward(60000);
  await expect(page.getByTestId("timer-display")).toHaveText("05:00");
  await page.getByRole("button", { name: "休憩タイマーを開始", exact: true }).click();
  await page.clock.fastForward(300000);
  await expect(page.getByTestId("timer-display")).toHaveText("25:00");
  await expect(page.getByRole("status").filter({ hasText: "休憩が終わりました" })).toBeVisible();
  await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeVisible();
});

test("mix settings, master volume, and paused timer survive reload", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "CafeをON", exact: true }).click();
  await page.getByRole("button", { name: "FireplaceをON", exact: true }).click();
  await page.getByRole("slider", { name: "Cafeの音量", exact: true }).fill("21");
  await page.getByRole("slider", { name: "全体音量", exact: true }).fill("47");
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await page.clock.fastForward(60000);
  await page.getByRole("button", { name: "集中タイマーを一時停止" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "CafeをOFF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "FireplaceをOFF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "Cafeの音量", exact: true })).toHaveValue("21");
  await expect(page.getByRole("slider", { name: "全体音量", exact: true })).toHaveValue("47");
  await expect(page.getByTestId("timer-display")).toHaveText("24:00");
  await expect(page.getByRole("button", { name: "集中タイマーを再開" })).toBeVisible();
});

test("running timer recovers its deadline and offers audio restart on reload", async ({ page }) => {
  await openWithClock(page);
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await page.clock.fastForward(60000);
  await page.reload();
  await expect(page.getByTestId("timer-display")).toHaveText("24:00");
  await expect(page.getByRole("button", { name: "環境音を再生", exact: true })).toBeVisible();
  await page.clock.fastForward(1440000);
  await expect(page.getByTestId("timer-display")).toHaveText("05:00");
});

test("six sound sources toggle independently; mute preserves the mix", async ({ page }) => {
  await page.goto("/");
  for (const name of ["White Noise", "Cafe", "Ocean", "Forest", "Fireplace"]) {
    await page.getByRole("button", { name: `${name}をON`, exact: true }).click();
  }
  await expect(page.locator(".sound-count")).toHaveText("6 SELECTED");
  await expect(page.getByText("あなたのサウンドを再生中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "すべての環境音をミュート", exact: true }).click();
  await expect(page.getByText("環境音はミュート中", { exact: true })).toBeVisible();
  await expect(page.locator(".sound-count")).toHaveText("6 SELECTED");
  await page.getByRole("button", { name: "環境音のミュートを解除", exact: true }).click();
  for (const name of ["Rain", "White Noise", "Cafe", "Ocean", "Forest", "Fireplace"]) {
    await page.getByRole("button", { name: `${name}をOFF`, exact: true }).click();
  }
  await expect(page.locator(".sound-count")).toHaveText("0 SELECTED");
});

test("real Web Audio output responds to individual volume, master volume, and mute", async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const meterWindow = window as unknown as { __meter: AnalyserNode | null };
    meterWindow.__meter = null;
    window.AudioContext = class extends Original {
      override createDynamicsCompressor() {
        const compressor = super.createDynamicsCompressor();
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        const silent = this.createGain();
        silent.gain.value = 0;
        compressor.connect(analyser);
        analyser.connect(silent);
        silent.connect(this.destination);
        meterWindow.__meter = analyser;
        return compressor;
      }
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  const energy = () => page.evaluate(() => {
    const analyser = (window as unknown as { __meter: AnalyserNode | null }).__meter;
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
  });
  await expect.poll(energy).toBeGreaterThan(0.00005);
  await page.getByRole("slider", { name: "Rainの音量", exact: true }).fill("0");
  await expect.poll(energy).toBeLessThan(0.000001);
  await page.getByRole("slider", { name: "Rainの音量", exact: true }).fill("60");
  await expect.poll(energy).toBeGreaterThan(0.00005);
  await page.getByRole("slider", { name: "全体音量", exact: true }).fill("0");
  await expect.poll(energy).toBeLessThan(0.000001);
  await page.getByRole("slider", { name: "全体音量", exact: true }).fill("50");
  await expect.poll(energy).toBeGreaterThan(0.00005);
  await page.getByRole("button", { name: "すべての環境音をミュート", exact: true }).click();
  await expect.poll(energy).toBeLessThan(0.000001);
});

test("keyboard controls and settings dialog work without interfering with sliders", async ({ page }) => {
  await openWithClock(page);
  await page.locator("body").click({ position: { x: 3, y: 3 } });
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "集中タイマーを一時停止" })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "集中タイマーを再開" })).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByTestId("timer-display")).toHaveText("25:00");
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByRole("dialog", { name: "設定" })).toBeVisible();
  await page.getByRole("switch", { name: "終了チャイム", exact: true }).click();
  await expect(page.getByRole("switch", { name: "終了チャイム", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "設定を開く" })).toBeFocused();
  await page.getByRole("slider", { name: "全体音量", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("slider", { name: "全体音量", exact: true })).toHaveValue("51");
  await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeVisible();
});

test("storage denial and unavailable audio still leave the timer usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Denied", "SecurityError"); } });
    Object.defineProperty(window, "AudioContext", { value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { value: undefined });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await expect(page.getByRole("button", { name: "集中タイマーを一時停止" })).toBeVisible();
  await expect(page.getByText("音を開始できませんでした。STARTか音カードで再試行できます。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "設定を開く" }).click();
  await expect(page.getByText("このブラウザでは設定を保存できません。現在のページでは通常どおり使えます。", { exact: true })).toBeVisible();
});

test("notification permission is never requested automatically and granted notifications are sent once", async ({ page }) => {
  await page.addInitScript(() => {
    const events = window as unknown as { __notifications: string[]; __requests: number };
    events.__notifications = [];
    events.__requests = 0;
    class FakeNotification {
      static permission = "default";
      static async requestPermission() { events.__requests++; this.permission = "granted"; return "granted"; }
      constructor(title: string) { events.__notifications.push(title); }
    }
    Object.defineProperty(window, "Notification", { value: FakeNotification });
  });
  await openWithClock(page);
  expect(await page.evaluate(() => (window as unknown as { __requests: number }).__requests)).toBe(0);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.getByRole("switch", { name: "ブラウザ通知", exact: true }).click();
  await expect(page.getByRole("switch", { name: "ブラウザ通知", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "設定を閉じる" }).click();
  await page.getByRole("button", { name: "集中タイマーを開始", exact: true }).click();
  await page.clock.fastForward(1500000);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __notifications: string[] }).__notifications.length)).toBe(1);
  await page.clock.fastForward(10000);
  expect(await page.evaluate(() => (window as unknown as { __notifications: string[] }).__notifications.length)).toBe(1);
});

test("desktop, tablet, and narrow mobile layouts fit without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId("timer-display")).toBeVisible();
    await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeVisible();
  }
});

test("home and settings meet automated WCAG 2.2 AA checks", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "集中タイマーを開始", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("focuscape.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "設定を開く" }).click();
  await page.screenshot({ path: testInfo.outputPath("focuscape-settings.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
});
