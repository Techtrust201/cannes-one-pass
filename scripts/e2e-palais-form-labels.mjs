/**
 * Tests métier post-déploiement — libellés/options formulaire Palais vs RX.
 * Usage: node scripts/e2e-palais-form-labels.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://cannes-one-pass-r2.vercel.app";

async function waitForm(page) {
  await page.waitForSelector("#company", { timeout: 20000 });
  await page.waitForSelector("#unloading", { timeout: 20000 });
}

function unloadingOptions(page) {
  return page.locator("#unloading option").evaluateAll((opts) =>
    opts
      .filter((o) => o.value !== "")
      .map((o) => ({ value: o.value, label: o.textContent?.trim() ?? "" }))
  );
}

async function testPalaisPublicLang(page, lang, expectations) {
  const url = `${BASE}/accreditation/palais-des-festivals?step=1&lang=${lang}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForm(page);

  const companyLabel = await page.locator('label[for="company"]').textContent();
  const standLabel = await page.locator('label[for="stand"]').textContent();
  const options = await unloadingOptions(page);

  const companyClean = companyLabel?.replace(/\*/g, "").trim() ?? "";
  const standClean = standLabel?.replace(/\*/g, "").trim() ?? "";

  const errors = [];
  if (!companyClean.includes(expectations.company)) {
    errors.push(`company label: got "${companyClean}", expected "${expectations.company}"`);
  }
  if (!standClean.includes(expectations.stand)) {
    errors.push(`stand label: got "${standClean}", expected "${expectations.stand}"`);
  }
  if (expectations.unloadingFirst) {
    if (options[0]?.label !== expectations.unloadingFirst) {
      errors.push(
        `unloading[0]: got "${options[0]?.label}" (${options[0]?.value}), expected "${expectations.unloadingFirst}"`
      );
    }
  }
  if (expectations.unloadingSecond) {
    if (options[1]?.label !== expectations.unloadingSecond) {
      errors.push(
        `unloading[1]: got "${options[1]?.label}" (${options[1]?.value}), expected "${expectations.unloadingSecond}"`
      );
    }
  }
  if (expectations.noDecorator) {
    if (companyClean.toLowerCase().includes("décorateur") || companyClean.toLowerCase().includes("decorator")) {
      errors.push(`company still shows decorator wording: "${companyClean}"`);
    }
  }
  if (expectations.noFrenchResidue && lang !== "fr") {
    const frTerms = ["Inconnu", "Déchargement manuel", "Société", "Stand desservi", "Nom du décorateur"];
    for (const term of frTerms) {
      if (companyClean.includes(term) || standClean.includes(term)) {
        errors.push(`French residue "${term}" in labels for lang=${lang}`);
      }
      for (const o of options.slice(0, 2)) {
        if (o.label === term) errors.push(`French residue "${term}" in option for lang=${lang}`);
      }
    }
  }

  return { lang, companyClean, standClean, options: options.slice(0, 5), errors };
}

async function testRx(page) {
  const url = `${BASE}/accreditation/rx?step=1&lang=fr`;
  await page.goto(url, { waitUntil: "networkidle" });
  // RX wizard step 1 may differ — wait for any form or RX-specific content
  await page.waitForTimeout(3000);
  const body = await page.locator("body").textContent();
  const hasSociete = body?.includes("Société") ?? false;
  const hasStandClient = body?.includes("Stand | Client") ?? false;
  const hasUnknownOption = body?.includes("UNKNOWN") ?? false;
  const errors = [];
  if (hasSociete) errors.push("RX page contains 'Société'");
  if (hasStandClient) errors.push("RX page contains 'Stand | Client'");
  // RX should not have our synthetic UNKNOWN in visible UI at step 1
  const unloading = page.locator("#unloading");
  if (await unloading.count()) {
    const opts = await unloadingOptions(page);
    if (opts.some((o) => o.value === "UNKNOWN")) errors.push("RX has UNKNOWN synthetic option");
  }
  return { errors, snippet: body?.slice(0, 500) };
}

async function testDefaultUnloadingPreselect(page) {
  const url = `${BASE}/accreditation/palais-des-festivals?step=1&lang=fr`;
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForm(page);
  const val = await page.locator("#unloading").inputValue();
  return val;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  results.push(
    await testPalaisPublicLang(page, "fr", {
      company: "Société",
      stand: "Stand | Client",
      unloadingFirst: "Inconnu",
      unloadingSecond: "Déchargement manuel",
      noDecorator: true,
    })
  );
  results.push(
    await testPalaisPublicLang(page, "en", {
      company: "Company",
      stand: "Stand | Client",
      unloadingFirst: "Unknown",
      unloadingSecond: "Manual unloading",
      noFrenchResidue: true,
    })
  );
  results.push(
    await testPalaisPublicLang(page, "pt", {
      company: "Empresa",
      stand: "Stand | Client",
      unloadingFirst: "Desconhecido",
      unloadingSecond: "Descarga manual",
      noFrenchResidue: true,
    })
  );
  results.push(
    await testPalaisPublicLang(page, "pl", {
      company: "Firma",
      stand: "Stoisko | Klient",
      unloadingFirst: "Nieznany",
      unloadingSecond: "Rozładunek ręczny",
      noFrenchResidue: true,
    })
  );

  const preselect = await testDefaultUnloadingPreselect(page);
  results.push({ test: "preselect", value: preselect, ok: preselect === "UNKNOWN" });

  const rx = await testRx(page);
  results.push({ test: "rx", ...rx });

  await browser.close();

  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => (r.errors && r.errors.length > 0) || r.ok === false);
  if (failed.length) {
    console.error("\nFAILED:", failed.length);
    process.exit(1);
  }
  console.log("\nAll browser checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
