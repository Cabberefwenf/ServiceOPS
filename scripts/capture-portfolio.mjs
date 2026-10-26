// Captures real screenshots of the running app into public/portfolio/.
// Usage: start `npm run dev`, then `node scripts/capture-portfolio.mjs [baseUrl]`.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => window.localStorage.clear());
const shot = (name) => page.screenshot({ path: `public/portfolio/${name}.png` });
await page.goto(base);
await page.getByTestId("kpi-open").waitFor();
await shot("overview");
await page.getByTestId("nav-work-orders").click();
await page.getByTestId("selected-work-order").click();
await page.getByTestId("preview-assignment").click();
await shot("work-order");
await page.getByTestId("reset-demo").click();
await page.getByTestId("nav-scheduling").click();
await page.getByTestId("run-scheduler").click();
await page.getByTestId("schedule-result").waitFor();
await shot("scheduling");
await page.getByTestId("nav-scenario-lab").click();
await page.getByTestId("scenario-technician-callout").click();
await page.getByTestId("recovery-plan").waitFor();
await shot("scenario");
await browser.close();
