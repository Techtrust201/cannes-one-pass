import { test as setup, expect } from "@playwright/test";
import { hasE2eCredentials } from "./helpers/guards";

const authFile = "e2e/.auth/user.json";

setup("authenticate E2E user", async ({ page, context }) => {
  if (!hasE2eCredentials()) {
    await context.storageState({ path: authFile });
    setup.skip(true, "E2E_USER_EMAIL et E2E_USER_PASSWORD requis.");
    return;
  }

  const email = process.env.E2E_USER_EMAIL!;
  const password = process.env.E2E_USER_PASSWORD!;

  await page.goto("/login");
  await page.getByLabel(/e-mail|email|identifiant/i).fill(email);
  await page.getByLabel(/mot de passe|password/i).fill(password);
  await page.getByRole("button", { name: /connexion|se connecter|login/i }).click();

  await page.waitForURL(/\/(logisticien|admin)/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);

  await context.storageState({ path: authFile });
});
