import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "laptop-1280", width: 1280, height: 720 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
] as const;

test.describe("Formulaire accréditation RX — responsive", () => {
  for (const viewport of VIEWPORTS) {
    test(`layout ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/accreditation/rx");

      // Étape langue → suivant si visible
      const nextBtn = page.getByRole("button", { name: /suivant|next|continuer/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
      }

      const formCard = page.locator(".bg-white.rounded-2xl").first();
      await expect(formCard).toBeVisible();

      const image = formCard.locator("img").first();
      if (await image.count()) {
        await expect(image).toBeVisible();
        const formBox = await formCard.boundingBox();
        const imageBox = await image.boundingBox();
        expect(formBox).not.toBeNull();
        expect(imageBox).not.toBeNull();
        if (viewport.width >= 768) {
          expect(imageBox!.x).toBeLessThan(formBox!.x + formBox!.width * 0.5);
        } else {
          expect(imageBox!.y).toBeLessThan(formBox!.y + formBox!.height * 0.45);
        }
      }

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);

      await page.screenshot({
        path: `test-results/form-rx-${viewport.name}.png`,
        fullPage: false,
      });
    });
  }
});
