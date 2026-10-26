import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("urgent work order can be assigned, reserved, completed, and reflected in audit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop acceptance workflow");
  await page.getByTestId("nav-work-orders").click();
  await page.getByTestId("selected-work-order").click();
  await page.getByTestId("preview-assignment").click();
  await expect(page.getByTestId("assignment-preview")).toContainText("Sarah Chen");
  await page.getByTestId("approve-assignment").click();
  await expect(page.getByText("Sarah Chen assigned and schedule updated.")).toBeVisible();
  await page.getByTestId("reserve-parts").click();
  await expect(page.getByText("Parts reserved and dispatch-ready")).toBeVisible();
  for (let index = 0; index < 5; index += 1) await page.getByTestId("advance-status").click();
  await expect(page.getByText("Service job closed")).toBeVisible();
  await expect(page.getByText("$574 recognized service revenue")).toBeVisible();
  await page.getByTestId("nav-activity").click();
  await expect(page.getByText("Quality Review → Closed.")).toBeVisible();
});

test("technician callout scenario is isolated and reversible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop scenario workflow");
  await page.getByTestId("nav-scenario-lab").click();
  await page.getByTestId("scenario-technician-callout").click();
  await expect(page.getByText("Active isolated scenario")).toBeVisible();
  await expect(page.getByText("WO-10470 · WO-10476")).toBeVisible();
  await page.getByTestId("reset-scenario").click();
  await expect(page.getByText("Select a disruption")).toBeVisible();
});

test("mobile navigation exposes core workflows", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only assertion");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByTestId("nav-work-orders").click();
  await expect(page.getByRole("heading", { name: "Work orders" })).toBeVisible();
});
