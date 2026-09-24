import { expect, test } from "@playwright/test";

test("admin can sign in and out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Username").fill(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin");
  await page.getByLabel("Password").fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Team gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest model probes" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  const toDark = page.getByRole("button", { name: "Switch to dark theme" });
  if (await toDark.count()) await toDark.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "test-results/dashboard-dark.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  for (const name of ["API access", "Connections", "Routing", "Usage", "Probes", "Team", "Dashboard"]) {
    const link = page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.locator("main h1")).toBeVisible();
  }
  await expect(page.locator(".metric-card").first()).toHaveAttribute("data-slot", "card");
  const contrast = await page.locator(".metric-featured").evaluate(element => {
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(element).backgroundColor; ctx.fillRect(0, 0, 1, 1);
    const luminance = () => Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => { const v = value / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const background = luminance();
    ctx.fillStyle = getComputedStyle(element.querySelector(".metric-caption")!).color; ctx.fillRect(0, 0, 1, 1);
    return (luminance() + .05) / (background + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(await page.locator(".dashboard-heading").evaluate(el => getComputedStyle(el).animationName)).toBe("content-enter");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".dashboard-heading").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("link", { name: "My usage", exact: true }).click();
  await expect(page).toHaveURL(/scope=mine/);
  await expect(page.getByText("Your gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Your gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await expect(page.locator(".dashboard-heading")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
