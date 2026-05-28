/**
 * `GET /api/admin/exhibitors/template` — Renvoie un template CSV vide.
 */
export async function GET() {
  const csv =
    "name,stand,sector,zone\n" +
    "ACME Yachting,PALAIS 110,PALAIS — PALAIS,PALAIS\n" +
    "Sunseeker,JETEE 101,VIEUX PORT — JETEE,JETEE\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=exhibitors-template.csv",
    },
  });
}
