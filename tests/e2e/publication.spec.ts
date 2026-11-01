import { expect, test } from "@playwright/test";

const canonicalUrl = "https://serviceops-phi.vercel.app";
const portfolioUrl = "https://veldariumworth.com/";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("publication metadata and crawler files identify the verified demo URL", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Metadata is viewport independent");

  await expect(page).toHaveTitle("ServiceOPS — Industrial Field Service Operations Demo");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonicalUrl);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonicalUrl);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Industrial Field Service/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);

  const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? "{}");
  expect(jsonLd).toMatchObject({
    "@type": "SoftwareApplication",
    name: "ServiceOPS",
    url: canonicalUrl,
    applicationCategory: "BusinessApplication",
  });

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain(`Sitemap: ${canonicalUrl}/sitemap.xml`);
  expect(robotsText).toContain("Disallow: /api/");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(`<loc>${canonicalUrl}</loc>`);

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "ServiceOPS", start_url: "/", display: "standalone" });

  const socialImage = await request.get("/opengraph-image");
  expect(socialImage.ok()).toBe(true);
  expect(socialImage.headers()["content-type"]).toContain("image/png");

  const icon = await request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
});

test("portfolio presentation links home and labels private source access accurately", async ({ page }) => {
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible()) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByTestId("nav-portfolio").click();

  await expect(page.getByTestId("portfolio-home-link")).toHaveAttribute("href", portfolioUrl);
  await expect(page.getByTestId("repository-status")).toHaveText("Private source repository");
  await expect(page.getByRole("link", { name: "Private repository" })).toHaveCount(0);
});

test("mobile navigation controls meet the minimum touch target and preserve portfolio access", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile touch-target check");

  const menu = page.getByRole("button", { name: "Open navigation" });
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width).toBeGreaterThanOrEqual(44);
  expect(menuBox?.height).toBeGreaterThanOrEqual(44);

  await menu.click();
  const closeBox = await page.getByRole("button", { name: "Close navigation" }).first().boundingBox();
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);

  const portfolioNavBox = await page.getByTestId("nav-portfolio").boundingBox();
  expect(portfolioNavBox?.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId("nav-portfolio").click();
  await expect(page.getByTestId("portfolio-home-link")).toBeVisible();
});
