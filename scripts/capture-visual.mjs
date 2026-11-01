import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputDirectory = path.resolve(process.argv[2] ?? "test-results/visual");
await mkdir(outputDirectory, { recursive: true });
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 3010;
const baseURL = `http://127.0.0.1:${port}`;
async function loadPortfolioImages(page) {
  for (const image of await page.locator(".portfolio-shots img").all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => {
      if (node.complete && node.naturalWidth > 0) return;
      return new Promise((resolve, reject) => {
        node.addEventListener("load", resolve, { once: true });
        node.addEventListener("error", reject, { once: true });
      });
    });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
const server = spawn(
  process.execPath,
  [path.join(projectDirectory, "node_modules/next/dist/bin/next"), "dev", "-p", String(port)],
  { cwd: projectDirectory, stdio: "ignore" },
);

let ready = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    const response = await fetch(baseURL);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (!ready) {
  server.kill();
  throw new Error(`ServiceOPS did not become ready at ${baseURL}.`);
}

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 1 });
const page = await desktop.newPage();
await page.addInitScript(() => window.localStorage.clear());
await page.goto(baseURL, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(outputDirectory, "serviceops-overview.png") });
await page.getByTestId("nav-work-orders").click();
await page.getByTestId("selected-work-order").click();
await page.screenshot({ path: path.join(outputDirectory, "serviceops-work-order.png") });
await page.getByTestId("nav-portfolio").click();
await page.getByTestId("portfolio-home-link").waitFor();
await loadPortfolioImages(page);
await page.screenshot({ path: path.join(outputDirectory, "serviceops-portfolio.png"), fullPage: true });
await desktop.close();

const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
const mobilePage = await mobile.newPage();
await mobilePage.emulateMedia({ reducedMotion: "reduce" });
await mobilePage.goto(baseURL, { waitUntil: "networkidle" });
await mobilePage.getByRole("button", { name: "Open navigation" }).click();
await mobilePage.screenshot({ path: path.join(outputDirectory, "serviceops-mobile-nav.png") });
await mobilePage.getByTestId("nav-portfolio").click();
await mobilePage.getByTestId("portfolio-home-link").waitFor();
await loadPortfolioImages(mobilePage);
await mobilePage.screenshot({ path: path.join(outputDirectory, "serviceops-mobile-portfolio.png"), fullPage: true });
await mobile.close();
await browser.close();
server.kill();

for (const name of ["serviceops-overview.png", "serviceops-work-order.png", "serviceops-portfolio.png", "serviceops-mobile-nav.png", "serviceops-mobile-portfolio.png"]) {
  process.stdout.write(`${path.join(outputDirectory, name)}\n`);
}
