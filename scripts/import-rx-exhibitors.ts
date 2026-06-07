/**
 * Importe la liste d'exposants RX depuis `CYF26-TT-02juin.xlsx` (modèle
 * définitif fourni par RX) dans la table `Exhibitor`, scopée à l'organisation
 * RX et à son événement CYF26.
 *
 * Colonnes attendues : PORT | ZONE T-T | COMPANY NAME | NUM-TERRE | NUM-FLOT.
 *   - name   = COMPANY NAME
 *   - stand  = NUM-FLOT si présent, sinon NUM-TERRE
 *   - sector = "{PORT} — {ZONE T-T}" (compatible deriveSpaceFromSector)
 *   - zone   = stand (convention actuelle)
 *
 * Idempotent : upsert sur (eventId, name, stand).
 *
 * Usage :
 *   npx tsx scripts/import-rx-exhibitors.ts [chemin.xlsx] [--event=<slug>]
 *   (défaut fichier : ~/Téléchargements/CYF26-TT-02juin.xlsx)
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });
dotenvConfig({ path: resolve(process.cwd(), ".env") });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface Row {
  PORT?: string;
  "ZONE T-T"?: string;
  "COMPANY NAME"?: string;
  "NUM-TERRE"?: string;
  "NUM-FLOT"?: string;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let file = resolve(homedir(), "Téléchargements", "CYF26-TT-02juin.xlsx");
  let eventSlug: string | null = null;
  for (const a of args) {
    if (a.startsWith("--event=")) eventSlug = a.slice("--event=".length);
    else if (!a.startsWith("--")) file = a;
  }
  return { file, eventSlug };
}

async function main() {
  const { file, eventSlug } = parseArgs();

  const rx = await prisma.organization.findUnique({
    where: { slug: "rx" },
    select: { id: true },
  });
  if (!rx) throw new Error("Organisation RX introuvable (slug 'rx').");

  const event = eventSlug
    ? await prisma.event.findFirst({
        where: { organizationId: rx.id, slug: eventSlug },
        select: { id: true, slug: true, name: true },
      })
    : await prisma.event.findFirst({
        where: { organizationId: rx.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, slug: true, name: true },
      });
  if (!event) {
    throw new Error(
      "Aucun event RX cible. Créez-en un (CYF26) ou précisez --event=<slug>."
    );
  }
  console.log(`• Event cible : ${event.name} (${event.slug})`);

  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const r of rows) {
    const name = String(r["COMPANY NAME"] ?? "").trim();
    const port = String(r.PORT ?? "").trim();
    const zone = String(r["ZONE T-T"] ?? "").trim();
    const flot = String(r["NUM-FLOT"] ?? "").trim();
    const terre = String(r["NUM-TERRE"] ?? "").trim();
    const stand = flot || terre;
    if (!name || !stand) {
      skipped++;
      continue;
    }
    const sector = [port, zone].filter(Boolean).join(" — ");

    const existing = await prisma.exhibitor.findFirst({
      where: { eventId: event.id, name, stand },
      select: { id: true },
    });
    if (existing) {
      await prisma.exhibitor.update({
        where: { id: existing.id },
        data: { sector, zone: stand, isActive: true },
      });
      updated++;
    } else {
      await prisma.exhibitor.create({
        data: {
          organizationId: rx.id,
          eventId: event.id,
          name,
          stand,
          sector,
          zone: stand,
          isActive: true,
        },
      });
      created++;
    }
  }
  console.log(
    `✓ Exposants : ${created} créés, ${updated} mis à jour, ${skipped} ignorés.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
