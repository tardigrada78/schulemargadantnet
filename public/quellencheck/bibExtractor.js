/**
 * bibExtractor.js
 * Finds and parses the bibliography / Literaturverzeichnis section.
 *
 * Handles both German APA (Fussnoten style) and English APA (Klammern style):
 *   German: "Ratzesberger, P. (2019). Plastik. Reclam."
 *   German: "Agroscope. (o.J.). Kompost... Abgerufen am ... von https://..."
 *   English: "ALLEN, K.-A. (2021). Psychology of belonging. Routledge."
 *   English: "Ofcom. (2024). Title. https://... [accessed DATE]"
 */

import { pageToText, groupByLines } from './pdfParser.js';

// ─── Patterns ────────────────────────────────────────────────────────────────

// Headings that introduce a bibliography section
const BIB_HEADING = /(Literatur|Quellen)verzeichnis|References|Bibliography|Bücher|Literatur\b/i;

// A bibliography entry starts with an author token, followed by ". (" or " (" then a date
// Handles:
//   "Ratzesberger, P. (2019)"   → Nachname, V. (Jahr)
//   "ALLEN, K.-A. (2021)"       → NACHNAME, V. (Jahr)
//   "Agroscope. (o.J.)"         → Institution. (o.J.)
//   "t3n (2020)"                → Institution (Jahr)
//   "Alleman et al. (12.03.2024)" → et al. with date
//   "Luo Yiqi, X. Z. (2006)"    → multi-name
const ENTRY_START = /^([A-ZÄÖÜ\u00C0-\u024F][^\n]{3,80}?)\s*(?:\.\s*\(|\s\()(\d{1,2}\.\d{1,2}\.)?(\d{4}|o\.?\s*J\.?|n\.?\s*d\.?)\s*\)/m;

// Year pattern (matches inside parentheses)
const YEAR_IN_PARENS = /\((?:\d{1,2}\.\d{1,2}\.)?(\d{4}|o\.?\s*J\.?|n\.?\s*d\.?)\)/;

// URL pattern
const URL_START = /https?:\/\//;

// Marks end of URL
const URL_END_MARKERS = /(\s\[accessed|\s\(accessed|\s\[abgerufen|\s\(abgerufen|\s\n[A-ZÄÖÜ\u00C0-\u024F])/i;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find the page index where the bibliography starts.
 * Searches from the back of the document.
 *
 * @param {import('./pdfParser').PageData[]} pages
 * @returns {number}  Page index (0-based), or -1 if not found
 */
export function findBibStart(pages) {
  for (let i = pages.length - 1; i >= 0; i--) {
    const text = pageToText(pages[i]);
    if (BIB_HEADING.test(text)) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract all bibliography entries from pages starting at bibStartIdx.
 *
 * @param {import('./pdfParser').PageData[]} pages
 * @param {number} bibStartIdx
 * @returns {BibEntry[]}
 *
 * @typedef {Object} BibEntry
 * @property {string} autor       - Raw author string from entry
 * @property {string} autorNorm   - Normalized (lowercase first token) for matching
 * @property {string} jahr        - Normalized year string ("2020", "oJ", etc.)
 * @property {string} jahrRaw     - Raw year as found in text
 * @property {string|null} url    - Extracted URL, or null
 * @property {'internet'|'buch'} typ
 * @property {string} volltext    - Full entry text (truncated)
 */
export function extractBibliography(pages, bibStartIdx) {
  if (bibStartIdx < 0) return [];

  // Build a single text string from all bibliography pages
  // Use '\n' between lines, '\n\n' between pages
  const bibText = pages
    .slice(bibStartIdx)
    .map(p => pageToText(p))
    .join('\n\n');

  const entries = parseBibText(bibText);
  // Weniger als 3 Treffer: kein APA-Verzeichnis «Autor (Jahr)» → Chicago-Stil versuchen
  if (entries.length < 3) {
    const chicago = parseChicagoBib(pages, bibStartIdx);
    if (chicago.length > entries.length) return chicago;
  }
  return entries;
}

// ─── Internal parsing ─────────────────────────────────────────────────────────

function parseBibText(text) {
  // Split into candidate entries by finding all ENTRY_START positions
  const positions = [];
  const re = new RegExp(ENTRY_START.source, 'gm');
  let m;
  while ((m = re.exec(text)) !== null) {
    // Skip entries that start with "Abbildung" (figure captions)
    const firstWord = m[0].trim().split(/\s/)[0];
    if (/^Abbildung/i.test(firstWord)) continue;
    positions.push(m.index);
  }

  if (!positions.length) return [];

  const entries = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : text.length;
    const entryRaw = text.slice(start, end);
    const entry = parseEntry(entryRaw);
    if (entry) entries.push(entry);
  }

  return entries;
}

/**
 * Baut die URL aus dem Rohtext zusammen. URLs sind im PDF oft über Zeilen umgebrochen,
 * danach folgt aber Fremdtext (nächster Satz, Seitenzahl). Darum wird Token für Token
 * angehängt und bei typischem Fremdtext abgebrochen.
 */
function cleanUrl(urlRaw) {
  const tokens = urlRaw.split(/\s+/).filter(Boolean);
  let url = tokens[0];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[(\[]/.test(t)) break;                                        // "(o.J.)", "[accessed"
    if (/^[A-ZÄÖÜ][a-zäöüéèß'’-]+[.,:]?$/.test(t)) break;               // Wort wie "Hromatka," oder "Abgerufen"
    if (/^(?:am|von|from|on|accessed|retrieved)$/i.test(t)) break;
    const endsLikeUrl = /(?:\/|\.[a-z]{2,5})$/i.test(url);
    const nextIsAuthor = !tokens[i + 1] || /^[A-ZÄÖÜ][a-zäöüéèß'’-]+,/.test(tokens[i + 1]);
    if (/^\d{1,3}$/.test(t) && nextIsAuthor) break;                    // Seitenzahl vor dem nächsten Eintrag
    if (/^\d+(?:\.\d+)+$/.test(t) && endsLikeUrl) break;               // Kapitelnummer wie "6.2"
    url += t;
  }
  url = url.replace(/[A-Z][A-Za-z'’-]+,\s?[A-Z]\.?.*$/, '');                     // angeklebter Autorenname
  url = url.split(/\.\((?:o\.\s?J\.|n\.d\.|\d{4})/)[0];               // "…/romberg.(o.J.)…"
  const second = url.slice(8).search(/https?:\/\//i);                  // zweite URL im selben Eintrag
  if (second >= 0) url = url.slice(0, second + 8);
  return url
    .replace(/(\.(?:pdf|html?|php|aspx?))\d[\d.]*$/i, '$1')                // angeklebte Kapitelnummer
    .replace(/[?&](?:trackingtoken|utm_[a-z]+|fbclid|gclid)=[^&]*/gi, '')
    .replace(/[.,;)\]]+$/, '');
}

function parseEntry(raw) {
  // Normalize whitespace but preserve line structure for URL parsing
  const text = raw.trim();
  if (!text) return null;

  // ── Extract author ─────────────────────────────────────────────────────────
  // Everything before the first ". (" or " (" is the author
  let autor = '';
  const autorMatch = text.match(/^(.+?)(?:\.\s*\(|\s\()/);
  if (autorMatch) {
    autor = autorMatch[1].trim();
  } else {
    // Fallback: first line
    autor = text.split('\n')[0].trim();
  }

  // ── Extract year ───────────────────────────────────────────────────────────
  let jahrRaw = '';
  const yearMatch = text.match(YEAR_IN_PARENS);
  if (yearMatch) {
    jahrRaw = yearMatch[1].trim();
  }

  // ── Extract URL ────────────────────────────────────────────────────────────
  let url = null;
  const urlStartMatch = URL_START.exec(text);
  if (urlStartMatch) {
    let urlRaw = text.slice(urlStartMatch.index);

    // Trim everything after end markers
    const endMatch = URL_END_MARKERS.exec(urlRaw);
    if (endMatch) {
      urlRaw = urlRaw.slice(0, endMatch.index);
    }

    url = cleanUrl(urlRaw);
    // Strip any remaining [accessed...] or (accessed...) that got attached without space
    url = url.replace(/\[accessed.*/i, '').replace(/\(accessed.*/i, '')
             .replace(/\[abgerufen.*/i, '').replace(/\(abgerufen.*/i, '');

    // Sanity check: URL must contain a dot
    if (!url.includes('.')) url = null;
  }

  const typ = url ? 'internet' : 'buch';

  return {
    autor,
    autorNorm: normalizeAuthor(autor),
    jahr: normalizeYear(jahrRaw),
    jahrRaw,
    url,
    typ,
    volltext: text.slice(0, 200).replace(/\n/g, ' ')
  };
}

// ─── Chicago-Stil (Notes & Bibliography) ──────────────────────────────────────
// Einträge: «Nachname, Vorname. Titel. Verlag, Jahr.» oder «„Titel“. Zugegriffen 25. Oktober 2026. https://…»
// Einträge sind durch einen grösseren Zeilenabstand getrennt (kein «(Jahr)» in Klammern).

function lineText(line) {
  let t = '';
  line.forEach((item, i) => {
    if (i > 0) {
      const prev = line[i - 1];
      if (item.x - (prev.x + (prev.width || 0)) > 1) t += ' ';
    }
    t += item.str;
  });
  return t.trim();
}

/** Normalisierter Titel für den Vergleich mit Fussnoten (Kleinbuchstaben, nur Buchstaben/Ziffern). */
export function normalizeTitle(raw) {
  return (raw || '').toLowerCase().replace(/[^a-zäöüéèàß0-9]+/g, ' ').trim();
}

function parseChicagoBib(pages, bibStartIdx) {
  const rawEntries = [];
  let current = null;
  let stop = false;

  for (const page of pages.slice(bibStartIdx)) {
    const lines = groupByLines(page.items, 2)
      .map(l => ({ y: l[0].y, text: lineText(l) }))
      .filter(l => l.text && !/^\d{1,3}$/.test(l.text)); // Seitenzahlen weg
    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).sort((a, b) => a - b);
    const normalGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;

    lines.forEach((l, i) => {
      if (stop) return;
      if (/^Abbildungsverzeichnis\b/i.test(l.text)) { stop = true; return; }
      if (i === 0 && BIB_HEADING.test(l.text) && l.text.length < 40) return; // Überschrift
      // Neuer Eintrag: erster Eintrag, grösserer Abstand, oder Seitenanfang nach abgeschlossenem Eintrag
      const bigGap = i > 0 && lines[i - 1].y - l.y > normalGap * 1.25;
      const newPage = i === 0 && current && /[.)]$/.test(current);
      if (!current || bigGap || newPage) {
        if (current) rawEntries.push(current);
        current = l.text;
      } else {
        current += ' ' + l.text;
      }
    });
  }
  if (current) rawEntries.push(current);

  return rawEntries.map(parseChicagoEntry).filter(Boolean);
}

function parseChicagoEntry(text) {
  // URL: ab «http» bis Eintragsende, Zeilenumbrüche entfernen
  let url = null;
  const urlStart = text.search(/https?:\/\//i);
  if (urlStart >= 0) {
    url = text.slice(urlStart).replace(/\s+/g, '').replace(/[.,;)\]]+$/, '');
    if (!url.includes('.')) url = null;
  }
  const rest = urlStart >= 0 ? text.slice(0, urlStart) : text;

  // Titel: in «„…“» oder erster Satz nach dem Autor
  const quoted = rest.match(/„([^“]+)“/);
  let autor = '';
  let titel = '';
  if (quoted) {
    titel = quoted[1];
    const before = rest.slice(0, quoted.index).replace(/[.,\s]+$/, '');
    // Ohne Autor vor dem Titel: Herausgeber/Organisation steht oft danach («„Titel“. Schweizerische Vogelwarte, o. J.»)
    const org = rest.slice(quoted.index + quoted[0].length).match(/^[.\s]*([A-ZÄÖÜ][^,.]*?)\s*(?:,|\.)/)?.[1] || '';
    autor = before || (/^Zugegriffen/.test(org) ? '' : org);
  } else {
    // Autor endet beim ersten Punkt, der nicht zu einer Initiale oder Abkürzung gehört
    const re = /\.\s+/g;
    let m, authorEnd = -1;
    while ((m = re.exec(rest)) !== null) {
      const before = rest.slice(0, m.index);
      const afterText = rest.slice(m.index + m[0].length);
      // weitere Initiale folgt («J. K. Rowling») oder Abkürzung wie «u. a.» → Autor geht weiter
      if ((/(?:^|[\s-])[A-ZÄÖÜ]$/.test(before) && /^[A-ZÄÖÜ]\.\s/.test(afterText)) || /(?:^|\s)(?:u|a)$/.test(before)) continue;
      authorEnd = m.index;
      break;
    }
    autor = authorEnd >= 0 ? rest.slice(0, authorEnd) : '';
    const afterAuthor = authorEnd >= 0 ? rest.slice(authorEnd + 1).trim() : rest;
    titel = afterAuthor.split(/\.\s/)[0].replace(/\.$/, '');
  }
  if (!titel) return null;

  // Jahr: letzte Jahreszahl ausserhalb von «Zugegriffen …»
  const withoutAccess = rest.replace(/„[^“]+“/g, '').replace(/Zugegriffen\s+\d{1,2}\.\s+\p{L}+\s+\d{4}/gu, '');
  const years = withoutAccess.match(/\b(?:1[5-9]|20)\d{2}\b/g);
  const jahrRaw = years ? years[years.length - 1] : 'o. J.';

  return {
    autor,
    autorNorm: normalizeAuthor(autor),
    jahr: normalizeYear(jahrRaw),
    jahrRaw,
    url,
    typ: url ? 'internet' : 'buch',
    volltext: text.slice(0, 200),
    titel,
    titelNorm: normalizeTitle(titel)
  };
}

// ─── Normalization helpers (also exported for use in matcher) ─────────────────

/**
 * Normalize an author string to a lowercase key for fuzzy matching.
 * Extracts the family name (first main token before comma, dot, or space).
 *
 * Examples:
 *   "Ratzesberger, P."  → "ratzesberger"
 *   "ALLEN, K.-A."      → "allen"
 *   "t3n"               → "t3n"
 *   "Agroscope"         → "agroscope"
 *   "Simply Science"    → "simply"
 *   "Baumeister and Leary" → "baumeister"
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeAuthor(raw) {
  if (!raw) return '';
  // Remove trailing punctuation, take first token
  const cleaned = raw.trim().replace(/[.,;:]+$/, '');
  const first = cleaned.split(/[,\s&]/)[0];
  return first.toLowerCase().replace(/[^a-zäöüß0-9]/gi, '').trim();
}

/**
 * Normalize a year string to a simple comparable value.
 *
 * Examples:
 *   "2020"        → "2020"
 *   "12.03.2024"  → "2024"
 *   "o.J."        → "oj"
 *   "o. J."       → "oj"
 *   "n.d."        → "oj"
 *   "n. d."       → "oj"
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeYear(raw) {
  if (!raw) return '';
  const clean = raw.replace(/\s/g, '').toLowerCase();
  // Extract 4-digit year (may be inside a date like 12.03.2024)
  const m = clean.match(/(\d{4})/);
  if (m) return m[1];
  // o.J. / n.d. variants
  if (/^o\.?j\.?$/.test(clean) || /^n\.?d\.?$/.test(clean)) return 'oj';
  return clean;
}
