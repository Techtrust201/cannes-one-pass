export const dynamic = "force-dynamic";
export const maxDuration = 60;

import Link from "next/link";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  getAvailableEspacesForUser,
  resolveEspaceOrgId,
} from "@/lib/auth-helpers";
import { pickPreferredEspaceSlug } from "@/lib/default-espace";
import { ESPACE_COOKIE } from "@/lib/espace-cookie";
import { withEspaceQuery } from "@/lib/url";
import NoEspaceState from "@/components/logisticien/NoEspaceState";

export default async function StandsPage(props: {
  searchParams: Promise<Record<string, string>>;
}) {
  const paramsObj = await props.searchParams;

  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session?.user?.id) redirect("/login");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  });
  if (!currentUser || !currentUser.isActive) redirect("/login");

  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";
  const espaceParam = paramsObj.espace?.trim() || null;
  const availableEspaces = await getAvailableEspacesForUser(session.user.id);

  if (!isSuperAdmin && availableEspaces.length === 0) {
    return (
      <div className="min-h-screen sm:h-screen flex flex-col">
        <NoEspaceState mode="none" />
      </div>
    );
  }

  const isAccessible = (slug: string | null) =>
    !!slug && availableEspaces.some((o) => o.slug === slug);
  const urlEspace =
    espaceParam && (isSuperAdmin || isAccessible(espaceParam)) ? espaceParam : null;

  if (!urlEspace) {
    const cookieStore = await cookies();
    const cookieEspace = cookieStore.get(ESPACE_COOKIE)?.value || null;
    const resolved =
      (isAccessible(cookieEspace) ? cookieEspace : null) ||
      pickPreferredEspaceSlug(availableEspaces);
    if (resolved) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(paramsObj)) {
        if (k === "espace" || !v) continue;
        qs.set(k, String(v));
      }
      qs.set("espace", resolved);
      redirect(`/logisticien/stands?${qs.toString()}`);
    }
  }

  const espaceOrgId = espaceParam ? await resolveEspaceOrgId(espaceParam) : null;

  const stands = espaceOrgId
    ? await prisma.stand.findMany({
        where: { organizationId: espaceOrgId },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          sector: true,
          _count: {
            select: { accreditations: { where: { isArchived: false } } },
          },
        },
      })
    : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
          <Store size={20} className="text-[#4F587E]" />
          Stands
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Point d&apos;entrée par stand : accédez aux accréditations rattachées.
        </p>
      </div>

      {stands.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Aucun stand pour cet espace.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stands.map((s) => (
            <Link
              key={s.id}
              href={withEspaceQuery(`/logisticien/stands/${s.id}`, espaceParam)}
              className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-[#4F587E] hover:shadow-md active:bg-gray-50 transition flex flex-col gap-2 min-h-[96px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900 truncate" title={s.number}>
                  {s.number}
                </span>
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-[#4F587E]/10 text-[#4F587E] text-xs font-semibold">
                  {s._count.accreditations}
                </span>
              </div>
              {s.sector && (
                <span className="text-xs text-gray-500 truncate">{s.sector}</span>
              )}
              <span className="mt-auto text-[11px] text-gray-400 group-hover:text-[#4F587E]">
                {s._count.accreditations > 1
                  ? `${s._count.accreditations} accréditations`
                  : `${s._count.accreditations} accréditation`}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
