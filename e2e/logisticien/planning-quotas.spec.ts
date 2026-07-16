import { test, expect } from "@playwright/test";
import { hasE2eCredentials } from "../helpers/guards";

test.describe("Planning & quotas RX", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.skip(!hasE2eCredentials(), "E2E_USER_EMAIL et E2E_USER_PASSWORD requis.");
    await page.goto("/logisticien/planning?espace=rx");
  });

  test("cartes d’action et titres métier visibles", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /planning & quotas/i })).toBeVisible();
    await expect(page.getByText(/que souhaitez-vous faire/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /limiter le nombre de véhicules/i })).toBeVisible();

    await page.getByRole("button", { name: /limiter le nombre de véhicules/i }).click();
    await expect(page.getByText(/où appliquer le quota/i)).toBeVisible();
    await expect(page.getByText(/limiter le nombre de véhicules/i).first()).toBeVisible();
  });

  test("champ quota absent de l’onglet calendrier", async ({ page }) => {
    await page.getByRole("button", { name: /voir les jours autorisés/i }).click();
    await expect(page.getByText(/où appliquer le quota/i)).toHaveCount(0);
  });
});
