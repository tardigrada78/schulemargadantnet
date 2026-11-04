/**
 * footnoteExtractor.js
 * Extracts footnote citations from PDFs using position/height data.
 *
 * Key finding from pdfjs-dist analysis:
 *   - Normal text:        height = 12pt
 *   - Superscript refs:   height = 8pt  (in main text, y slightly above line)
 *   - Footnote labels:    height = 6.5pt (at page bottom, y < ~200)
 *   - Footnote text:      height = 10pt  (at page bottom)
 *
 * Algorithm:
 *   Per page:
 *   1. Split into main-text area and footnote area using getFootnoteBoundary()
 *   2. Find footnote definitions in the bottom area (num + text)
 *   3. Find superscript references in the main text (small height + numeric)
 *   4. Combine: each superscript num → has a footnote definition
 */

import { groupByLines, median } from './pdfParser.js';
import { findSuperscripts, findFootnoteLabels, getFootnoteBoundary } from './styleDetector.js';
import { normalizeAuthor, normalizeYear } from './bibExtractor.js';

/**
 * @typedef {Object} FootnoteDef
 * @property {number} num        - Footnote number
 * @property {string} autor      - Author from footnote text (e.g. "Plastipol")
 * @property {string} autorNorm  - Normalized author
 * @property {string} jahr       - Year (e.g. "2021")
 * @property {string} jahrRaw
 * @property {string} title      - Rest of footnote text after "Autor, Jahr, "
 * @property {string} fullText   - Complete footnote text
 * @property {boolean} isBuch    - True if has "S. X" page reference
 * @property {string} seite      - Page reference if isBuch
 * @property {number} pageNum    - PDF page where this footnote is defined
 */

/**
 * @typedef {Object} FootnoteRef
 * @property {number} num        - Footnote number
 * @property {number} x          - X position
 * @property {number} y          - Y position of superscript
 * @property {number} lineY      - Y of the text line it belongs to
 * @property {number} pageNum    - PDF page number
 * @property {FootnoteDef|null} def  - Matched footnote definition
 */

/**
 * Extract all footnote references and their definitions from the main text.
 *
 * @param {import('./pdfParser').PageData[]} pages
 * @param {number} bibStartIdx
 * @returns {{refs: FootnoteRef[], defs: Map<number, FootnoteDef>}}
 */
export function extractFootnotes(pages, bibStartIdx) {
  const mainPages = pages.slice(
    0,
    bibStartIdx > 0 ? bibStartIdx : pages.length
  );

  const allDefs = new Map(); // num → FootnoteDef (most recent wins if duplicate)
  const allRefs = [];

  for (const page of mainPages) {
    const boundary = getFootnoteBoundary(page);

    // ── 1. Extract footnote definitions from the bottom area ─────────────────
    const pageDefs = extractFootnoteDefs(page, boundary);
    for (const def of pageDefs) {
      allDefs.set(def.num, def);
    }

    // ── 2. Find superscript references in main text ───────────────────────────
    const superscripts = findSuperscripts(page);
    for (const sup of superscripts) {
      allRefs.push({
        ...sup,
        pageNum: page.pageNum,
        def: null // filled in after
      });
    }
  }

  // ── 3. Match refs to defs ──────────────────────────────────────────────────
  for (const ref of allRefs) {
    ref.def = allDefs.get(ref.num) || null;
  }

  // Sort refs by page, then by y (top to bottom), then x
  allRefs.sort((a, b) =>
    a.pageNum - b.pageNum ||
    b.y - a.y ||
    a.x - b.x
  );

  return { refs: allRefs, defs: allDefs };
}

/**
 * Extract footnote definitions from the bottom area of a page.
 * Format: "1 Plastipol, 2021, Warum wird kunststoff..."
 * or:     "9 Ratzesberger, 2019, S. 30"
 *
 * @param {import('./pdfParser').PageData} page
 * @param {number} boundary  Y threshold; items below this are in footnote area
 * @returns {FootnoteDef[]}
 */
function extractFootnoteDefs(page, boundary) {
  // Get items in the footnote area (y below boundary)
  const fnItems = page.items.filter(i => i.y < boundary);
  if (!fnItems.length) return [];

  // Group into lines
  const lines = groupByLines(fnItems, 2);

  // Each footnote def starts with a label number item (h < 7.5)
  const defs = [];
  let currentNum = null;
  let currentTextParts = [];

  for (const line of lines) {
    // Check if this line starts a new footnote definition
    const firstItem = line[0];
    const startsWithLabel =
      firstItem &&
      /^\d{1,3}$/.test(firstItem.str.trim()) &&
      firstItem.height < 7.5;

    if (startsWithLabel) {
      // Save previous def if any
      if (currentNum !== null) {
        const def = buildFootnoteDef(currentNum, currentTextParts.join(''), page.pageNum);
        if (def) defs.push(def);
      }
      // Start new def
      currentNum = parseInt(firstItem.str.trim(), 10);
      // Rest of line (skip the label item)
      currentTextParts = [line.slice(1).map(i => i.str).join('')];
    } else if (currentNum !== null) {
      // Continuation line for current footnote
      currentTextParts.push(line.map(i => i.str).join(''));
    }
  }

  // Don't forget the last one
  if (currentNum !== null) {
    const def = buildFootnoteDef(currentNum, currentTextParts.join(' '), page.pageNum);
    if (def) defs.push(def);
  }

  return defs;
}

/**
 * Parse the text of a footnote definition.
 * Format: "Autor, Jahr, Titel" or "Autor, Jahr, S. X"
 *
 * @param {number} num
 * @param {string} text  Combined text of footnote (without the leading number)
 * @param {number} pageNum
 * @returns {FootnoteDef|null}
 */
function buildFootnoteDef(num, text, pageNum) {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return null;

  // Split by comma to get autor, jahr, rest
  const parts = t.split(',').map(s => s.trim());
  if (parts.length < 2) {
    // Minimal fallback: just use first part as author
    return {
      num,
      autor: parts[0] || '',
      autorNorm: normalizeAuthor(parts[0] || ''),
      jahr: '',
      jahrRaw: '',
      title: '',
      fullText: t,
      isBuch: false,
      seite: '',
      pageNum
    };
  }

  const autor = parts[0];

  // Year: try second part first, then look for 4-digit number
  let jahrRaw = '';
  let jahrPartIdx = 1;
  const yearMatch = parts[1].match(/^(\d{4}|o\.?\s*J\.?|n\.?\s*d\.?)$/i);
  if (yearMatch) {
    jahrRaw = parts[1];
    jahrPartIdx = 2;
  } else {
    // Maybe year is embedded in part 1 (e.g. "Autor, 2021 Titel")
    const embeddedYear = t.match(/,\s*(\d{4}|o\.J\.)/i);
    if (embeddedYear) jahrRaw = embeddedYear[1];
  }

  // Rest is the title / page reference
  const restParts = parts.slice(jahrPartIdx);
  const title = restParts.join(', ').trim();

  // Check for page reference (Buch)
  const pageRefMatch = title.match(/^S\.\s*([\d]+(?:f{1,2})?)/i);
  const isBuch = !!pageRefMatch;
  const seite = pageRefMatch ? pageRefMatch[1] : '';

  return {
    num,
    autor,
    autorNorm: normalizeAuthor(autor),
    jahr: normalizeYear(jahrRaw),
    jahrRaw,
    title,
    fullText: t,
    isBuch,
    seite,
    pageNum
  };
}
