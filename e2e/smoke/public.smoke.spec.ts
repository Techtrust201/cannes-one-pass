import { test, expect } from "@playwright/test";

const smokeBase =
  process.env.E2E_SMOKE_BASE_URL ?? "https://cannes-one-pass-r2.vercel.app";

test.describe("Smoke production (lecture seule)", () => {
  test.use({ baseURL: smokeBase });

  test("page login répond sans 500", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole("button", { name: /connexion|se connecter|login/i })).toBeVisible();
  });

  test("route protégée redirige vers login", async ({ page }) => {
    await page.goto("/logisticien");
    await expect(page).toHaveURL(/\/login/);
  });

  test("formulaire public RX charge sans erreur critique console", async ({ page }) => {
    const critical: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") critical.push(msg.text());
    });
    const response = await page.goto("/accreditation/rx");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
    const blocking = critical.filter(
      (line) => !line.includes("favicon") && !line.includes("404")
    );
    expect(blocking).toEqual([]);
  });
});
