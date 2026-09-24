import { expect, test } from "@playwright/test";

// Start tests/fixtures/provider.cjs in the web container before setting this URL.
test("connection management preserves secrets and enforces ownership", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.TEST_PROVIDER_URL, "Requires the local fixture provider");
  const stamp = Date.now();
  const name = `Provider ${stamp}`;
  await page.goto("/login");
  await page
    .getByLabel("Username", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "replace-with-a-long-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const base = new URL(page.url()).origin;
  const member = await browser.newContext();
  const memberEmail = `connection-member-${stamp}@example.com`;
  let connectionId: string | undefined;
  try {
    const created = await page.request.post("/api/users", {
      data: { username: memberEmail.split("@")[0], email: memberEmail },
    });
    const account = await created.json();
    await member.request.post(`${base}/api/auth/login`, {
      data: { username: memberEmail.split("@")[0], password: account.temporaryPassword },
    });
    await member.request.post(`${base}/api/auth/change-password`, {
      data: {
        password: "connection-member-password",
        confirmPassword: "connection-member-password",
      },
    });
    await member.request.post(`${base}/api/auth/login`, {
      data: { username: memberEmail.split("@")[0], password: "connection-member-password" },
    });
    await page.goto("/providers");
    await page.getByText("Add provider", { exact: true }).first().click();
    const createForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add provider", exact: true }) });
    await createForm.getByLabel("Name", { exact: true }).fill(name);
    await createForm.getByLabel("Base URL", { exact: true }).fill(process.env.TEST_PROVIDER_URL!);
    await createForm.getByLabel("API key", { exact: true }).fill("connection-test-secret");
    await page.getByRole("button", { name: "Add provider", exact: true }).click();
    const card = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toBeVisible();
    const connections = await (await page.request.get("/api/connections")).json();
    connectionId = connections.connections.find(
      (connection: { name: string }) => connection.name === name,
    ).id;
    expect(JSON.stringify(connections)).not.toContain("connection-test-secret");
    expect(JSON.stringify(connections)).not.toContain("api_key_ciphertext");
    expect(
      JSON.stringify(await (await member.request.get(`${base}/api/connections`)).json()),
    ).not.toContain(name);
    await card.getByText("Edit provider", { exact: true }).click();
    await expect(card.getByLabel("Replacement API key (optional)")).toHaveValue("");
    await card.getByLabel("Visibility").selectOption("public");
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByText("Changes saved", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Test provider", exact: true }).click();
    await expect(
      card.getByText("Provider test passed. 1 models returned.", { exact: true }),
    ).toBeVisible();
    await card.getByLabel("Replacement API key (optional)").fill("wrong-test-secret");
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByLabel("Replacement API key (optional)")).toHaveValue("");
    await card.getByRole("button", { name: "Test provider", exact: true }).click();
    await expect(
      card.getByText("Provider test failed (HTTP 401). Check the URL and credentials.", {
        exact: true,
      }),
    ).toBeVisible();
    await card.getByLabel("Replacement API key (optional)").fill("connection-test-secret");
    await card.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByLabel("Replacement API key (optional)")).toHaveValue("");
    await card.getByRole("button", { name: "Disable", exact: true }).click();
    await expect(card.getByRole("button", { name: "Run probe" })).toBeDisabled();
    expect(
      (
        await page.request.post(`/api/connections/${connectionId}/probe`, {
          data: { model: "fixture-model" },
        })
      ).status(),
    ).toBe(404);
    await card.getByRole("button", { name: "Enable", exact: true }).click();
    await expect(card.getByRole("button", { name: "Run probe" })).toBeEnabled();
    const sharedPage = await member.newPage();
    await sharedPage.goto(`${base}/connections`);
    const sharedCard = sharedPage
      .getByRole("article")
      .filter({ has: sharedPage.getByRole("heading", { name, exact: true }) });
    await expect(sharedCard).toBeVisible();
    await expect(sharedCard.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);
    await expect(sharedCard.getByText("Edit provider", { exact: true })).toHaveCount(0);
    expect(
      (
        await member.request.patch(`${base}/api/connections/${connectionId}`, {
          data: { enabled: false },
        })
      ).status(),
    ).toBe(404);
    expect((await member.request.post(`${base}/api/connections/${connectionId}`)).status()).toBe(
      404,
    );
    await sharedCard.getByLabel("Model", { exact: true }).fill("fixture-model");
    await sharedCard.getByRole("button", { name: "Run probe" }).click();
    await expect(sharedCard.getByText("Latest probe: passed", { exact: true })).toBeVisible();
    await sharedCard.getByText("Probe evidence", { exact: true }).click();
    await expect(
      sharedCard.getByRole("heading", { name: "chat: passed", exact: true }),
    ).toBeVisible();
    await sharedPage.reload();
    await expect(
      sharedCard.getByText("Identity confidence: medium", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(card.getByText("Latest probe: passed", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "test-results/connections-mobile.png", fullPage: true });
    // Owners can manage their own private providers, and admins can manage them too.
    const owned = await member.request.post(`${base}/api/connections`, {
      data: {
        name: `${name} member`,
        baseUrl: process.env.TEST_PROVIDER_URL,
        apiKey: "connection-test-secret",
        visibility: "private",
      },
    });
    const own = await owned.json();
    try {
      expect(
        (
          await member.request.patch(`${base}/api/connections/${own.id}`, {
            data: { name: `${name} renamed` },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await page.request.patch(`/api/connections/${own.id}`, { data: { enabled: false } })
        ).status(),
      ).toBe(200);
    } finally {
      await member.request.delete(`${base}/api/connections/${own.id}`);
    }
  } finally {
    if (connectionId) await page.request.delete(`/api/connections/${connectionId}`);
    await member.close();
  }
});
