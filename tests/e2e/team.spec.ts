import { expect, test } from "@playwright/test";

test("admin creates a user who must replace the temporary password", async ({ page, browser }) => {
  const email = `team-${Date.now()}@example.com`;
  const password = "a-new-member-password-123";
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin");
  await page.getByLabel("Password", { exact: true }).fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/team");
  await page.getByLabel("Username", { exact: true }).fill(email.split("@")[0].toUpperCase());
  await page.getByLabel("User email").fill(email);
  await page.getByRole("button", { name: "Create user", exact: true }).click();
  const temporaryPassword = await page.getByLabel("Temporary password").inputValue();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(24);
  expect((await page.request.post("/api/users", { data: { username: email.split("@")[0], email } })).status()).toBe(409);
  expect((await page.request.post("/api/users", { data: { username: email.split("@")[0].toUpperCase(), email: `other-${email}` } })).status()).toBe(409);
  expect((await page.request.post("/api/users", { data: { email: "invalid", role: "root" } })).status()).toBe(400);
  expect((await page.request.post("/api/invitations", { data: { username: email.split("@")[0], email } })).status()).toBe(404);
  expect((await page.request.post("/api/invitations/accept", { data: {} })).status()).toBe(404);

  const context = await browser.newContext();
  const member = await context.newPage();
  const base = new URL(page.url()).origin;
  try {
    await member.goto(`${base}/login`);
    await member.getByLabel("Username", { exact: true }).fill(email.split("@")[0].toUpperCase());
    await member.getByLabel("Password", { exact: true }).fill(temporaryPassword);
    await member.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(member).toHaveURL(/\/change-password$/);
    const oldSession = await browser.newContext({ storageState: await context.storageState() });
    try {
      for (const path of ["/dashboard", "/team", "/connections", "/routing", "/usage", "/probes"]) {
        await member.goto(`${base}${path}`);
        await expect(member).toHaveURL(/\/change-password$/);
      }
      for (const path of ["/api/keys", "/api/connections", "/api/routing-configs", "/api/usage", "/api/probes", "/api/request-logs"]) {
        expect((await context.request.get(`${base}${path}`)).status()).toBe(401);
      }
      expect((await context.request.post(`${base}/api/users`, { data: { email: "denied@example.com" } })).status()).toBe(401);
      for (const data of [{ password: "short", confirmPassword: "short" }, { password, confirmPassword: "mismatch" }, { password: temporaryPassword, confirmPassword: temporaryPassword }]) {
        expect((await context.request.post(`${base}/api/auth/change-password`, { data })).status()).toBe(400);
      }
      await member.getByLabel("New password", { exact: true }).fill(password);
      await member.getByLabel("Confirm password", { exact: true }).fill(password);
      await member.getByRole("button", { name: "Change password", exact: true }).click();
      await expect(member).toHaveURL(/\/login$/);
      expect((await oldSession.request.get(`${base}/api/auth/me`)).status()).toBe(401);
      expect((await oldSession.request.post(`${base}/api/auth/change-password`, { data: { password, confirmPassword: password } })).status()).toBe(401);
      expect((await context.request.post(`${base}/api/auth/login`, { data: { username: email.split("@")[0], password: temporaryPassword } })).status()).toBe(401);
      await member.getByLabel("Username", { exact: true }).fill(email.split("@")[0].toUpperCase());
      await member.getByLabel("Password", { exact: true }).fill(password);
      await member.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(member).toHaveURL(/\/dashboard$/);
      expect((await context.request.post(`${base}/api/users`, { data: { email: "denied@example.com" } })).status()).toBe(403);
      expect((await context.request.get(`${base}/api/keys`)).status()).toBe(200);
    } finally {
      await oldSession.close();
    }
  } finally {
    await context.close();
  }
});
