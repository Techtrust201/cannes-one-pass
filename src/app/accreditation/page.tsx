import { redirect } from "next/navigation";
import { DEFAULT_ESPACES_PALAIS_SLUG } from "@/lib/default-espace";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

/**
 * Redirection legacy : `/accreditation` → `/accreditation/palais-des-festivals`.
 *
 * Préserve les query params éventuels (`?lang=fr&step=1` etc.) pour que
 * les anciens liens distribués par le Palais continuent de fonctionner
 * tel quels. Le slug de destination matche l'`Organization.slug` réel en
 * base (pas le `template.slug` qui est juste la clé du registry).
 */
export default async function LegacyAccreditationRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    } else if (v != null) {
      qs.set(k, v);
    }
  }
  const suffix = qs.toString();
  redirect(
    `/accreditation/${DEFAULT_ESPACES_PALAIS_SLUG}${suffix ? `?${suffix}` : ""}`
  );
}
