import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const views = ["overview", "work-orders", "dispatch", "scheduling", "technicians", "customers", "assets", "agreements", "inventory", "financials", "automation", "scenario-lab", "analytics", "activity", "portfolio"];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("every view has no WCAG 2.1 A/AA axe violations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Navigation per view is desktop; mobile covered below");
  const failures: string[] = [];
  for (const view of views) {
    await page.getByTestId(`nav-${view}`).click();
    await page.locator("h1").first().waitFor();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of violations) failures.push(`${view}: ${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("overview plus open mobile navigation or guided tour have no axe violations", async ({ page }, testInfo) => {
  const scan = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(await scan()).toEqual([]);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByTestId("nav-work-orders")).toBeVisible();
  } else {
    await page.getByTestId("start-tour").click();
    await expect(page.getByTestId("tour")).toBeVisible();
  }
  expect(await scan()).toEqual([]);
});

test("tour dialog moves focus in and Escape returns focus to the trigger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop header trigger");
  await page.getByTestId("start-tour").click();
  await expect(page.getByTestId("tour-next")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await expect(page.getByTestId("start-tour")).toBeFocused();
});

test("reduced motion disables animations", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const duration = await page.locator("body").evaluate(() => {
    const el = document.createElement("div"); el.style.transition = "opacity 2s"; el.style.animation = "x 2s"; document.body.appendChild(el);
    const s = getComputedStyle(el); return [s.transitionDuration, s.animationDuration];
  });
  expect(duration.every((d) => parseFloat(d) <= 0.01)).toBe(true);
  await context.close();
});
