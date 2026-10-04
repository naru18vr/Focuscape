import { defineConfig } from "@playwright/test";

const pages = process.env.TEST_PAGES === "true";
const origin = pages ? "http://127.0.0.1:4173" : "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: pages ? `${origin}/Focuscape/` : origin, browserName: "chromium", trace: "retain-on-failure" },
  webServer: {
    command: pages ? "node tests/serve-pages.mjs" : "npm run dev",
    url: pages ? `${origin}/Focuscape/` : origin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
