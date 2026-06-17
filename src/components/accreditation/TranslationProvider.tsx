"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type LangCode, type T, getTranslations, isValidLang } from "@/lib/translations";
import { safeGetItem, safeSetItem } from "@/lib/safe-storage";

interface TranslationCtx {
  lang: LangCode;
  t: T;
  setLang: (code: LangCode) => void;
}

const Ctx = createContext<TranslationCtx | null>(null);

const LS_KEY = "acc_lang";

function detectLang(urlLang: string | null): LangCode {
  if (urlLang && isValidLang(urlLang)) return urlLang;
  // Accès tolérant : sur certains mobiles, lire le storage peut lever une
  // exception (cf. safe-storage). On ne doit jamais crasher ici car ce code
  // tourne dans l'initialiseur useState (au premier rendu).
  const stored = safeGetItem(LS_KEY);
  if (stored && isValidLang(stored)) return stored;
  return "fr";
}

export function TranslationProvider({
  children,
  urlLang,
  forcedLang,
}: {
  children: ReactNode;
  urlLang: string | null;
  /** Si défini, force la langue (ex. back-office logisticien toujours en français). */
  forcedLang?: LangCode;
}) {
  const [lang, setLangState] = useState<LangCode>(() =>
    forcedLang ?? detectLang(urlLang)
  );

  useEffect(() => {
    if (forcedLang) {
      if (lang !== forcedLang) setLangState(forcedLang);
      return;
    }
    if (urlLang && isValidLang(urlLang) && urlLang !== lang) {
      setLangState(urlLang);
    }
  }, [urlLang, forcedLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback(
    (code: LangCode) => {
      if (forcedLang) return;
      setLangState(code);
      safeSetItem(LS_KEY, code);
    },
    [forcedLang]
  );

  useEffect(() => {
    if (!forcedLang) safeSetItem(LS_KEY, lang);
  }, [lang, forcedLang]);

  const effectiveLang = forcedLang ?? lang;

  return (
    <Ctx.Provider
      value={{ lang: effectiveLang, t: getTranslations(effectiveLang), setLang }}
    >
      {children}
    </Ctx.Provider>
  );
}

const fallback: TranslationCtx = {
  lang: "fr",
  t: getTranslations("fr"),
  setLang: () => {},
};

export function useTranslation(): TranslationCtx {
  const ctx = useContext(Ctx);
  return ctx ?? fallback;
}
