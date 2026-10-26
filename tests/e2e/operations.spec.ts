import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop operations workflows");
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("new work order is created with contract SLA and audit, then triaged", async ({ page }) => {
  await page.getByTestId("nav-work-orders").click();
  await page.getByTestId("new-work-order").click();
  await page.getByTestId("new-description").fill("Rooftop unit short cycling");
  await page.getByTestId("new-priority").selectOption("HIGH");
  await page.getByTestId("create-work-order").click();
  await expect(page.getByText("WO-10484 created as Requested.")).toBeVisible();
  await expect(page.getByTestId("contract-sla")).toBeVisible();
  await page.getByTestId("advance-status").click();
  await expect(page.getByText("Work order moved to TRIAGED.")).toBeVisible();
  await page.getByTestId("nav-activity").click();
  await page.getByTestId("audit-search").fill("WO-10484");
  await expect(page.getByTestId("audit-count")).toHaveText("2 events");
});

test("overview KPI drills into filtered work orders and region filter changes counts", async ({ page }) => {
  const all = await page.getByTestId("kpi-open").locator("strong").innerText();
  await page.getByTestId("region-filter").selectOption("West");
  const west = await page.getByTestId("kpi-open").locator("strong").innerText();
  expect(Number(west)).toBeLessThan(Number(all));
  await page.getByTestId("kpi-open").click();
  await expect(page.getByTestId("status-filter")).toHaveValue("OPEN");
});

test("scheduler compares to baseline and accepts assignments", async ({ page }) => {
  await page.getByTestId("nav-scheduling").click();
  await page.getByTestId("run-scheduler").click();
  await expect(page.getByTestId("schedule-result")).toContainText("baseline → heuristic");
  await expect(page.getByTestId("schedule-runtime")).toContainText("ms");
  await page.getByTestId("accept-schedule").click();
  await expect(page.getByText(/assignment\(s\) applied from the scheduling run/)).toBeVisible();
});

test("invoice payment and automation approval write state and receipts", async ({ page }) => {
  await page.getByTestId("nav-financials").click();
  const payButton = page.locator('[data-testid^="pay-INV"]').first();
  await payButton.click();
  await page.getByTestId("payment-amount").fill("10.00");
  await page.getByTestId("confirm-payment").click();
  await expect(page.getByText(/Payment recorded on INV/)).toBeVisible();
  await page.getByTestId("nav-automation").click();
  await page.getByTestId("preview-automation").first().click();
  await expect(page.getByTestId("automation-preview")).toBeVisible();
  await page.getByTestId("approve-automation").click();
  await expect(page.getByTestId("automation-receipts")).toContainText("EXECUTED");
});

test("entity screens render detail panels", async ({ page }) => {
  await page.getByTestId("nav-technicians").click();
  await expect(page.getByTestId("technician-detail")).toBeVisible();
  await page.getByTestId("nav-customers").click();
  await page.getByTestId("customer-search").fill("Riverton");
  await expect(page.getByTestId("customer-detail")).toContainText("Riverton Medical Center");
  await page.getByTestId("nav-assets").click();
  await page.getByTestId("asset-filter").selectOption("OVERDUE");
  await page.getByTestId("asset-table").locator("tbody tr").first().click();
  await expect(page.getByTestId("asset-detail")).toContainText("Service history");
  await page.getByTestId("nav-agreements").click();
  await expect(page.getByTestId("agreement-table")).toBeVisible();
  await page.getByTestId("nav-inventory").click();
  await page.getByTestId("inventory-health").selectOption("SHORTAGE");
  await expect(page.getByTestId("inventory-detail")).toContainText("CR-440");
});
