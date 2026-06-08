"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TranslationProvider, useTranslation } from "./TranslationProvider";
import LangSelector from "./LangSelector";
import { SupportTicketForm } from "./SupportTicketForm";

interface Props {
  orgSlug: string;
}

function ContactInner({ orgSlug }: Props) {
  const { t, lang } = useTranslation();
  const s = t.support;

  return (
    <div
      className="min-h-screen flex flex-col text-gray-900"
      style={{ background: "linear-gradient(#353c52 0 50%, #ffffff 0 100%)" }}
    >
      <main className="mb-24 flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-10">
        <div className="w-full max-w-3xl flex justify-end mb-4">
          <LangSelector />
        </div>

        <div className="px-4 flex flex-col items-center text-white gap-1 w-full max-w-3xl mb-8">
          <h1 className="text-4xl font-bold">{s.title}</h1>
          <p className="text-lg opacity-80">{s.subtitle}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 w-11/12 max-w-2xl">
          <SupportTicketForm orgSlug={orgSlug} />
        </div>

        <div className="mt-6 text-sm">
          <Link
            href={`/accreditation/${orgSlug}?lang=${lang}`}
            className="text-white/80 hover:text-white underline"
          >
            {s.backToForm}
          </Link>
        </div>
      </main>
    </div>
  );
}

export function ContactPageContent({ orgSlug }: Props) {
  const searchParams = useSearchParams();
  const urlLang = searchParams.get("lang");

  return (
    <TranslationProvider urlLang={urlLang}>
      <ContactInner orgSlug={orgSlug} />
    </TranslationProvider>
  );
}
