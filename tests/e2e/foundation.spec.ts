import { expect, test } from "@playwright/test";

test("admin can sign in and out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com");
  await page.getByLabel("Password").fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Team gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest model probes" })).toBeVisible();
  await page.getByRole("link", { name: "My usage", exact: true }).click();
  await expect(page).toHaveURL(/scope=mine/);
  await expect(page.getByText("Your gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Your gateway activity · Last 24 hours", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
