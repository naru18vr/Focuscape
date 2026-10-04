import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START", exact: true })).toBeEnabled();
}

async function setRange(page: Page, name: string, value: number) {
  await page.getByRole("slider", { name, exact: true }).evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(nextValue));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("start, pause, resume, reset and keyboard controls", async ({ page }) => {
  await page.clock.install();
  await ready(page);
  await expect(page.getByTestId("timer")).toHaveText("25:00");
  await page.getByRole("button", { name: "START", exact: true }).click();
  await page.clock.fastForward(10_000);
  await expect(page.getByTestId("timer")).toHaveText("24:50");
  await page.getByRole("button", { name: "PAUSE", exact: true }).click();
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

test("focus and break complete once, announce visually, and wait for START", async ({ page }) => {
  await page.clock.install();
  await ready(page);
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
  await page.clock.install();
  await ready(page);
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
    window.AudioContext = class extends AudioContext { resume(): Promise<void> { return Promise.reject(new Error("Audio blocked")); } };
  });
  await page.clock.install();
  await ready(page);
  await page.getByRole("button", { name: "START", exact: true }).click();
  await expect(page.getByRole("button", { name: "PAUSE", exact: true })).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(page.getByTestId("timer")).toHaveText("24:59");
});

for (const width of [320, 390, 768, 1440]) test(`no overflow or browser errors at ${width}px`, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: width < 700 ? 844 : 1080 });
  await ready(page);
  await expect(page.getByTestId("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rain ON", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/focuscape-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
