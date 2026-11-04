// Zugriff auf wissenschaftliche Quellen (DOI, PubMed, PMC) über offene Schnittstellen.
// Europe PMC (Abstract, bei Open Access Volltext) → Crossref (Abstract) → PubMed efetch (Abstract).
// Keine Schlüssel nötig; NCBI erlaubt ohne Key 3 Anfragen/s, daher Drosselung pro Host.

import * as cheerio from "cheerio";

const UA = "Quellencheck/1.0 (Schulprojekt)";
const EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest";

// ─── Drosselung pro Host (mind. 350 ms Abstand) ───────────────────────────────

const lastCall = new Map();

async function throttledFetch(url, options = {}, gapMs = 350) {
  const host = new URL(url).host;
  const prev = lastCall.get(host) || Promise.resolve();
  const slot = prev.then(() => new Promise((r) => setTimeout(r, gapMs)));
  lastCall.set(host, slot);
  await prev;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal, headers: { "User-Agent": UA, ...(options.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Kennung aus URL erkennen ─────────────────────────────────────────────────

/**
 * @param {string} url
 * @returns {{type:'doi'|'pmid'|'pmcid', id:string}|null}
 */
export function extractIdentifier(url) {
  const pmc = url.match(/ncbi\.nlm\.nih\.gov\/(?:pmc\/)?articles\/(PMC\d+)/i);
  if (pmc) return { type: "pmcid", id: pmc[1].toUpperCase() };

  const pmid = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (pmid) return { type: "pmid", id: pmid[1] };

  const doi = url.match(/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+)/i);
  if (doi) return { type: "doi", id: doi[1].replace(/[.,;:)]+$/, "") };

  return null;
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function stripTags(s) {
  return cheerio.load(`<div>${(s || "").replace(/></g, "> <")}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

function buildText(title, abstract, body) {
  return [title && `Titel: ${title}`, abstract && `Abstract: ${abstract}`, body].filter(Boolean).join("\n\n");
}

async function getJson(url) {
  const r = await throttledFetch(url);
  if (!r.ok) return null;
  return r.json();
}

// ─── Europe PMC ───────────────────────────────────────────────────────────────

function epmcQuery({ type, id }) {
  if (type === "doi") return `DOI:"${id}"`;
  if (type === "pmid") return `EXT_ID:${id} AND SRC:MED`;
  return `PMCID:${id}`;
}

async function fromEuropePmc(ident) {
  const data = await getJson(`${EPMC}/search?query=${encodeURIComponent(epmcQuery(ident))}&format=json&resultType=core`);
  const rec = data?.resultList?.result?.[0];
  if (!rec) return null;

  const title = stripTags(rec.title);
  const abstract = stripTags(rec.abstractText);

  if (rec.isOpenAccess === "Y" && rec.pmcid) {
    const r = await throttledFetch(`${EPMC}/${rec.pmcid}/fullTextXML`);
    if (r.ok) {
      const $ = cheerio.load(await r.text(), { xmlMode: true });
      const body = $("body p, body title")
        .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean)
        .join("\n");
      if (body.length > 500) return { text: buildText(title, abstract, body), source: "fulltext" };
    }
  }
  if (abstract.length > 100) return { text: buildText(title, abstract), source: "abstract" };
  return null;
}

// ─── Crossref (nur DOI) ───────────────────────────────────────────────────────

async function fromCrossref(doi) {
  const data = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  const m = data?.message;
  const abstract = stripTags(m?.abstract);
  if (abstract.length > 100) return { text: buildText(m.title?.[0], abstract), source: "abstract" };
  return null;
}

// ─── PubMed efetch (nur PMID) ─────────────────────────────────────────────────

async function fromPubmed(pmid) {
  const r = await throttledFetch(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`
  );
  if (!r.ok) return null;
  const text = (await r.text()).trim();
  return text.length > 200 ? { text, source: "abstract" } : null;
}

/**
 * Holt Titel + Abstract bzw. Volltext zu einer Kennung.
 * @param {{type:string,id:string}} ident
 * @returns {Promise<{text:string, source:'fulltext'|'abstract'}|null>}
 */
export async function fetchScholarly(ident) {
  try {
    const epmc = await fromEuropePmc(ident);
    if (epmc) return epmc;
    if (ident.type === "doi") return await fromCrossref(ident.id);
    if (ident.type === "pmid") return await fromPubmed(ident.id);
  } catch {
    /* Fehler → Aufrufer versucht die Webseite */
  }
  return null;
}
