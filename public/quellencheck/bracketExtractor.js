/**
 * bracketExtractor.js
 * Extracts in-text bracket citations: (Author, Year) or (Author, Year, S. X).
 *
 * Handles all variants from "Quellen zitieren.pdf":
 *   (Pospiech, 2017, S. 143)
 *   (Backhaus & Tuor, 2008, S. 60)
 *   (Schmidt et al., 2020, S. 35)
 *   (t3n, 2020)
 *   (Universität Bern, o. J.)
 *   (Pospiech, 2017, S. 143ff)
 *   Baumeister and Leary (1995)          ← "author before (year)" style
 *   Tajfel and Turner's (1986)           ← possessive form
 *   (Universität Zürich, 2017, S. 3; APA, 2010, S. 198)  ← multiple sources
 */

/**
 * @typedef {Object} BracketCitation
 * @property {string} autorRaw   - Author as found in text (may include "& Name" or "et al.")
 * @property {string} autorNorm  - Normalized first author token (lowercase)
 * @property {string} jahrRaw    - Year as found in text
 * @property {string} jahr       - Normalized year
 * @property {string} seite      - Page reference if any ("143", "143ff", etc.)
 * @property {string} fullMatch  - The full citation string as found
 * @property {number} pageNum    - Page number in PDF (1-based)
 * @property {number} charOffset - Character offset in page text
 */

import { pageToText } from './pdfParser.js';
import { normalizeAuthor, normalizeYear } from './bibExtractor.js';

// Main bracket citation pattern
// Matches: (Author[, Year][, S. X])
// Also handles multiple authors separated by &, "and", or "et al."
// And multiple citations separated by ;
const BRACKET_PATTERN =
  /\(([A-ZÄÖÜ\u00C0-\u024F][^()]{2,120}?,\s*(?:\d{4}|o\.?\s*J\.?|n\.?\s*d\.?)[^()]{0,40})\)/g;

// "Author (Year)" pattern — author before parenthesized year
const AUTHOR_BEFORE_YEAR =
  /([A-ZÄÖÜ\u00C0-\u024F][a-zäöüß\u00C0-\u024F]+(?:\s+and\s+[A-ZÄÖÜ\u00C0-\u024F][a-zäöüß\u00C0-\u024F]+)?(?:'s)?)\s+\((\d{4})\)/g;

// Page reference pattern within citation
const PAGE_REF = /S\.\s*([\dff]+)/i;

// Year pattern within citation content
// NOTE: n\. (dot required) prevents "nd" in "and" from matching as "n.d."
const YEAR_IN_CONTENT = /(\d{4}|o\.?\s*J\.?|n\.\s*d\.?)/;

/**
 * Extract all bracket citations from the main text pages.
 *
 * @param {import('./pdfParser').PageData[]} pages  All pages
 * @param {number} bibStartIdx  Start of bibliography (to exclude bib pages)
 * @returns {BracketCitation[]}
 */
export function extractBrackets(pages, bibStartIdx) {
  const mainPages = pages.slice(
    0,
    bibStartIdx > 0 ? bibStartIdx : pages.length
  );

  const citations = [];

  for (const page of mainPages) {
    const text = pageToText(page);
    const pageCitations = extractFromText(text, page.pageNum);
    citations.push(...pageCitations);
  }

  return citations;
}

/**
 * Extract bracket citations from a single text string.
 *
 * @param {string} text
 * @param {number} pageNum
 * @returns {BracketCitation[]}
 */
function extractFromText(text, pageNum) {
  const citations = [];

  // ── Pattern 1: Standard (Author, Year[, S. X]) ────────────────────────────
  BRACKET_PATTERN.lastIndex = 0;
  let m;
  while ((m = BRACKET_PATTERN.exec(text)) !== null) {
    const inner = m[1];

    // Handle multiple citations separated by semicolon: (Zürich, 2017, S. 3; APA, 2010)
    const parts = inner.split(/;\s*/);
    for (const part of parts) {
      const cit = parseCitationPart(part.trim(), m[0], m.index, pageNum);
      if (cit) citations.push(cit);
    }
  }

  // ── Pattern 2: "Author (Year)" form ──────────────────────────────────────
  AUTHOR_BEFORE_YEAR.lastIndex = 0;
  while ((m = AUTHOR_BEFORE_YEAR.exec(text)) !== null) {
    const autor = m[1].replace(/'s$/, '').trim(); // remove possessive
    const jahr = m[2];

    // Only add if not already captured by pattern 1
    const alreadyCaptured = citations.some(
      c => c.charOffset >= m.index - 5 && c.charOffset <= m.index + 5
    );
    if (!alreadyCaptured) {
      citations.push({
        autorRaw: autor,
        autorNorm: normalizeAuthor(autor),
        jahrRaw: jahr,
        jahr: normalizeYear(jahr),
        seite: '',
        fullMatch: m[0],
        pageNum,
        charOffset: m.index
      });
    }
  }

  return citations;
}

/**
 * Parse a single citation part (possibly from a multi-source bracket).
 */
function parseCitationPart(part, fullMatch, offset, pageNum) {
  // Extract year
  const yearMatch = YEAR_IN_CONTENT.exec(part);
  if (!yearMatch) return null;

  const jahrRaw = yearMatch[1].trim();

  // Extract author: everything before the year and its comma
  let autorPart = part.slice(0, yearMatch.index).replace(/,\s*$/, '').trim();
  if (!autorPart) return null;

  // Extract page reference
  const pageMatch = PAGE_REF.exec(part);
  const seite = pageMatch ? pageMatch[1] : '';

  return {
    autorRaw: autorPart,
    autorNorm: normalizeAuthor(autorPart),
    jahrRaw,
    jahr: normalizeYear(jahrRaw),
    seite,
    fullMatch,
    pageNum,
    charOffset: offset
  };
}
