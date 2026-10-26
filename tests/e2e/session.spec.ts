import { expect, test } from "@playwright/test";

test("tampered saved state is rejected and the baseline loads with a notice", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop only");
  await page.addInitScript(() => window.localStorage.setItem("serviceops.demo.v1", JSON.stringify({ schemaVersion: 2, canonical: { evil: true }, scenario: null })));
  await page.goto("/");
  await expect(page.getByText(/Saved demo state was rejected/)).toBeVisible();
  await expect(page.locator("main")).toContainText("WO-10483");
});

test("global search filters the work-order list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop only");
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByTestId("global-search").fill("WO-10476");
  await page.getByTestId("global-search").press("Enter");
  await expect(page.locator("main")).toContainText("WO-10476");
  await expect(page.locator("main")).not.toContainText("WO-10475");
});
