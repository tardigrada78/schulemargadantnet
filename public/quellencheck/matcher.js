/**
 * matcher.js
 * Matches in-text citations (footnotes or brackets) to bibliography entries.
 *
 * Uses fuzzy matching to handle deviations common in student papers:
 *   - Missing year → match by author only
 *   - Author with full first name instead of initial
 *   - Author name in different order (first name first vs. last name first)
 *   - Year as date format "12.03.2024" vs. "2024"
 *   - "o.J." vs. "o. J." vs. "n.d."
 */

import { normalizeAuthor, normalizeTitle } from './bibExtractor.js';

/**
 * @typedef {Object} Assignment
 * @property {string} refLabel    - Citation label shown to user (e.g. "¹" or "(Allen, 2020)")
 * @property {string} refAutor    - Author from citation
 * @property {string} refJahr     - Year from citation
 * @property {string} context     - Extracted text context
 * @property {number} pageNum     - PDF page
 * @property {import('./bibExtractor').BibEntry|null} bibEntry  - Matched bibliography entry
 * @property {boolean} matched    - Whether a match was found
 */

/**
 * Match footnote references to bibliography entries.
 *
 * @param {import('./footnoteExtractor').FootnoteRef[]} refs
 * @param {import('./bibExtractor').BibEntry[]} bibliography
 * @returns {Assignment[]}
 */
export function matchFootnotes(refs, bibliography) {
  const chicago = bibliography.some(e => e.titelNorm);
  return refs.flatMap(ref => {
    const def = ref.def;
    if (!def) {
      return {
        refLabel: String(ref.num),
        refAutor: `(Fussnote ${ref.num}, Definition nicht gefunden)`,
        refJahr: '',
        context: ref.context || '',
        pageNum: ref.pageNum,
        bibEntry: null,
        matched: false
      };
    }

    const make = bibEntry => ({
      refLabel: String(ref.num),
      refAutor: def.autor,
      refJahr: def.jahrRaw,
      context: ref.context || '',
      pageNum: ref.pageNum,
      bibEntry,
      matched: bibEntry !== null
    });

    if (chicago) {
      // Chicago-Kurzbelege: eine Fussnote kann mehrere Quellen enthalten → je Quelle eine Zuordnung
      const found = matchChicago(def.fullText, bibliography);
      return found.length ? found.map(make) : [make(null)];
    }

    return [make(findBestMatch(def.autorNorm, def.jahr, bibliography))];
  });
}

/**
 * Chicago-Kurzbelege («„Titel“.», «Autor, Titel, S. 12», mehrere Belege mit «;») den
 * Literatureinträgen über den Kurztitel zuordnen. Der Kurztitel ist der Anfang des vollen Titels.
 *
 * @param {string} fullText  Text der Fussnote
 * @param {import('./bibExtractor').BibEntry[]} bibliography
 * @returns {import('./bibExtractor').BibEntry[]}  Gefundene Einträge (ohne Duplikate)
 */
function matchChicago(fullText, bibliography) {
  const found = [];
  for (const part of fullText.split(';')) {
    const quoted = part.match(/„([^“]+)“/);
    let autor = '';
    let title = '';
    if (quoted) {
      title = quoted[1];
      autor = part.slice(0, quoted.index).replace(/[,\s]+$/, '');
    } else {
      const comma = part.indexOf(',');
      if (comma < 0) continue;
      autor = part.slice(0, comma);
      title = part.slice(comma + 1).trim().split(/[,.(]/)[0];
    }
    const t = normalizeTitle(title);
    if (t.length < 4) continue;

    let candidates = bibliography.filter(e => e.titelNorm && (e.titelNorm.startsWith(t) || t.startsWith(e.titelNorm)));
    if (candidates.length > 1 && autor) {
      const a = normalizeAuthor(autor);
      const byAuthor = candidates.filter(e => e.autorNorm === a || (e.autor || '').toLowerCase().includes(autor.toLowerCase()));
      if (byAuthor.length) candidates = byAuthor;
    }
    if (candidates.length && !found.includes(candidates[0])) found.push(candidates[0]);
  }
  return found;
}

/**
 * Match bracket citations to bibliography entries.
 *
 * @param {import('./bracketExtractor').BracketCitation[]} citations
 * @param {import('./bibExtractor').BibEntry[]} bibliography
 * @returns {Assignment[]}
 */
export function matchBrackets(citations, bibliography) {
  return citations.map(cit => {
    const bibEntry = findBestMatch(cit.autorNorm, cit.jahr, bibliography);

    return {
      refLabel: cit.fullMatch,
      refAutor: cit.autorRaw,
      refJahr: cit.jahrRaw,
      context: cit.context || '',
      pageNum: cit.pageNum,
      bibEntry,
      matched: bibEntry !== null
    };
  });
}

/**
 * Find the best matching bibliography entry for a given author + year.
 *
 * Matching levels (in order of preference):
 *   1. Exact: authorNorm === entryAuthorNorm AND year matches
 *   2. Author prefix: one starts with the other AND year matches
 *   3. Year-agnostic: author matches regardless of year (for missing/wrong year)
 *   4. Partial: entry author contains citation author token (for institutional names)
 *
 * @param {string} autorNorm  Normalized author from citation
 * @param {string} jahr       Normalized year from citation
 * @param {import('./bibExtractor').BibEntry[]} bibliography
 * @returns {import('./bibExtentry').BibEntry|null}
 */
function findBestMatch(autorNorm, jahr, bibliography) {
  if (!autorNorm || !bibliography.length) return null;

  // Helper: do years match?
  const yearsMatch = (a, b) => {
    if (!a || !b) return false; // both must be present for year matching
    return a === b;
  };

  // Helper: do authors match?
  const authorsMatch = (norm, entry) => {
    const entryNorm = entry.autorNorm;
    if (!entryNorm || !norm) return false;

    // Exact
    if (norm === entryNorm) return true;

    // One is prefix of the other (handles abbreviations and multi-word names)
    if (norm.startsWith(entryNorm) || entryNorm.startsWith(norm)) return true;

    // Handle "et al." citations: citation uses first author's name
    // e.g. "Schmidt et al." → norm is "schmidt", entry might be "Schmidt, B., Rose, A.L."
    // In that case, the entry starts with the same family name
    if (entry.autor) {
      const entryFirstToken = normalizeAuthor(entry.autor);
      if (norm === entryFirstToken) return true;
    }

    // Handle institutional names with multiple words
    // e.g. citation "Universität Bern" → norm "universität", entry "Universität Bern, o.J."
    // or citation "t3n" in "t3n (2020)" → norm "t3n"
    if (norm.length >= 3 && entry.autor && entry.autor.toLowerCase().includes(norm)) {
      return true;
    }

    return false;
  };

  // Level 1: Author + Year exact
  for (const entry of bibliography) {
    if (authorsMatch(autorNorm, entry) && yearsMatch(jahr, entry.jahr)) {
      return entry;
    }
  }

  // Level 2: Author match only (year missing or wrong in citation)
  if (autorNorm) {
    const authorCandidates = bibliography.filter(e => authorsMatch(autorNorm, e));
    if (authorCandidates.length === 1) {
      return authorCandidates[0]; // Unique author match → accept
    }
    if (authorCandidates.length > 1 && jahr) {
      // Multiple author matches → use year to disambiguate
      const withYear = authorCandidates.filter(e => yearsMatch(jahr, e.jahr));
      if (withYear.length) return withYear[0];
      // Give up on year disambiguation, return first author match
      return authorCandidates[0];
    }
  }

  return null;
}

/**
 * Extract unique bibliography entries that have no matching citation.
 * Useful for debug output.
 *
 * @param {import('./bibExtractor').BibEntry[]} bibliography
 * @param {Assignment[]} assignments
 * @returns {import('./bibExtractor').BibEntry[]}
 */
export function findUnmatchedBibEntries(bibliography, assignments) {
  const matchedEntries = new Set(
    assignments.filter(a => a.bibEntry).map(a => a.bibEntry)
  );
  return bibliography.filter(e => !matchedEntries.has(e));
}
