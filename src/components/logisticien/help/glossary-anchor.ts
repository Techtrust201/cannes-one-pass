/** Événement personnalisé : ouvrir un lexique `<details>` par son id DOM. */
export const GLOSSARY_OPEN_EVENT = "cannes-one-pass:glossary-open";

export function glossaryHash(id: string): string {
  return `#${id.replace(/^#/, "")}`;
}

export function parseGlossaryIdFromHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "").trim();
  return raw.startsWith("lexique") ? raw : null;
}

/** Ouvre le lexique, met à jour le hash et fait défiler jusqu’à l’élément. */
export function openGlossaryById(
  id: string,
  opts: { focus?: boolean; replaceHash?: boolean } = {}
): boolean {
  const cleanId = id.replace(/^#/, "");
  const el = document.getElementById(cleanId);
  if (!el || el.tagName !== "DETAILS") return false;
  const details = el as HTMLDetailsElement;

  details.open = true;
  const hash = glossaryHash(cleanId);
  if (opts.replaceHash !== false) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, "", url);
  }

  el.scrollIntoView({ behavior: "smooth", block: "start" });

  if (opts.focus !== false) {
    const summary = details.querySelector("summary");
    if (summary instanceof HTMLElement) {
      if (!summary.hasAttribute("tabindex")) summary.tabIndex = 0;
      summary.focus({ preventScroll: true });
    }
  }

  window.dispatchEvent(
    new CustomEvent(GLOSSARY_OPEN_EVENT, { detail: { id: cleanId } })
  );
  return true;
}
