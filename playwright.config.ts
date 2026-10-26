import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_BASE_URL runs the suite against a deployed URL (no local server).
const remote = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: remote ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: remote ? undefined : {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
