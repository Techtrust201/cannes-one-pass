"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type LangCode, type T, getTranslations, isValidLang } from "@/lib/translations";

interface TranslationCtx {
  lang: LangCode;
  t: T;
  setLang: (code: LangCode) => void;
}

const Ctx = createContext<TranslationCtx | null>(null);

const LS_KEY = "acc_lang";

function detectLang(urlLang: string | null): LangCode {
  if (urlLang && isValidLang(urlLang)) return urlLang;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(LS_KEY);
    if (stored && isValidLang(stored)) return stored;
  }
  return "fr";
}

export function TranslationProvider({
  children,
  urlLang,
}: {
  children: ReactNode;
  urlLang: string | null;
}) {
  const [lang, setLangState] = useState<LangCode>(() => detectLang(urlLang));

  useEffect(() => {
    if (urlLang && isValidLang(urlLang) && urlLang !== lang) {
      setLangState(urlLang);
    }
  }, [urlLang]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLang = useCallback((code: LangCode) => {
    setLangState(code);
    localStorage.setItem(LS_KEY, code);
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_KEY, lang);
  }, [lang]);

  return (
    <Ctx.Provider value={{ lang, t: getTranslations(lang), setLang }}>
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
