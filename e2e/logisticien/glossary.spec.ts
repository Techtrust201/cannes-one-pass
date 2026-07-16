import { test, expect } from "@playwright/test";
import { hasE2eCredentials } from "../helpers/guards";

const PAGES: Array<{ path: string; glossaryId: string }> = [
  { path: "/logisticien?espace=rx", glossaryId: "lexique-liste" },
  { path: "/logisticien/planning?espace=rx", glossaryId: "lexique-planning" },
  { path: "/admin/import?org=rx&format=rx", glossaryId: "lexique-import" },
];

for (const { path, glossaryId } of PAGES) {
  test.describe(`Lexique — ${path}`, () => {
    test.beforeEach(({}, testInfo) => {
      testInfo.skip(!hasE2eCredentials(), "E2E_USER_EMAIL et E2E_USER_PASSWORD requis.");
    });

    test("clic Voir le lexique ouvre le details", async ({ page }) => {
      await page.goto(path);
      const link = page.getByRole("button", { name: /voir le lexique/i }).first();
      if (!(await link.isVisible())) {
        test.skip(true, "Bandeau d’aide masqué (localStorage) — test ignoré.");
      }
      await link.click();
      const details = page.locator(`#${glossaryId}`);
      await expect(details).toHaveAttribute("open", "");
      await expect(page).toHaveURL(new RegExp(`#${glossaryId}`));
      const summary = details.locator("summary");
      await expect(summary).toBeFocused();
      await expect(details).toBeInViewport();
    });

    test(`ouverture directe par hash #${glossaryId}`, async ({ page }) => {
      await page.goto(`${path}#${glossaryId}`);
      const details = page.locator(`#${glossaryId}`);
      await expect(details).toHaveAttribute("open", "");
      await expect(details).toBeInViewport();
    });
  });
}
