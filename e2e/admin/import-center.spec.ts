import { test, expect } from "@playwright/test";
import { hasE2eCredentials } from "../helpers/guards";

test.describe("Centre d’import RX", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.skip(!hasE2eCredentials(), "E2E_USER_EMAIL et E2E_USER_PASSWORD requis.");
    await page.goto("/admin/import?org=rx&format=rx");
  });

  test("cartes métier et avertissement Mathieu", async ({ page }) => {
    await expect(page.getByText(/qui expose et où/i)).toBeVisible();
    await expect(page.getByText(/quand les véhicules peuvent-ils venir/i)).toBeVisible();
    await expect(page.getByText(/fichiers.*référentiel.*planning.*mathieu/i)).toBeVisible();
    await expect(page.getByText(/aperçu sans enregistrement/i).first()).toBeVisible();
  });
});
