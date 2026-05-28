import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

/**
 * Redirection legacy : `/accreditation` → `/accreditation/palais`.
 *
 * Préserve les query params éventuels (`?lang=fr&step=1` etc.) pour que
 * les anciens liens distribués par le Palais continuent de fonctionner
 * tel quels.
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
  redirect(`/accreditation/palais${suffix ? `?${suffix}` : ""}`);
}
