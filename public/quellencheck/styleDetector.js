/**
 * styleDetector.js
 * Detects the citation style used in a document: 'fussnoten' or 'klammern'.
 *
 * Fussnoten: Superscript numbers in main text, footnote definitions at page bottom
 * Klammern: (Author, Year) or (Author, Year, S. X) inline in text
 */

import { groupByLines, median } from './pdfParser.js';

/**
 * Detect citation style from the main-text pages (before bibliography).
 *
 * @param {import('./pdfParser').PageData[]} pages  All pages
 * @param {number} bibStartIdx  Index of bibliography start page (-1 if unknown)
 * @returns {'fussnoten'|'klammern'}
 */
export function detectStyle(pages, bibStartIdx) {
  const mainPages = pages.slice(
    0,
    bibStartIdx > 0 ? bibStartIdx : pages.length
  );

  // Check the first few pages (up to 8) for signals
  const checkPages = mainPages.slice(0, Math.min(8, mainPages.length));

  let footnoteScore = 0;
  let bracketScore = 0;

  for (const page of checkPages) {
    // ── Signal 1: Superscript numbers (height < 9pt, normal text ~12pt) ──────
    const superscripts = findSuperscripts(page);
    if (superscripts.length > 0) {
      footnoteScore += superscripts.length * 2;
    }

    // ── Signal 2: Footnote definitions at bottom of page ─────────────────────
    const footnoteLabels = findFootnoteLabels(page);
    if (footnoteLabels.length > 0) {
      footnoteScore += footnoteLabels.length * 3;
    }

    // ── Signal 3: Bracket citations ───────────────────────────────────────────
    const text = page.items.map(i => i.str).join(' ');
    // Matches (Author, Year) or (Author, Year, S. X) or (Author & Author, Year)
    // Author must start with uppercase; Year is 4 digits or o.J.
    const bracketMatches = text.match(
      /\([A-ZÄÖÜ\u00C0-\u024F][^,()]{1,60},\s*(\d{4}|o\.J\.|n\.d\.)/g
    );
    if (bracketMatches) {
      bracketScore += bracketMatches.length;
    }
  }

  return footnoteScore >= bracketScore ? 'fussnoten' : 'klammern';
}

/**
 * Find superscript numbers on a page (footnote references in main text).
 * Superscripts have height < 9pt (vs normal ~12pt).
 * They are in the main text area, not the footnote area at the bottom.
 *
 * @param {import('./pdfParser').PageData} page
 * @returns {Array<{num: number, x: number, y: number}>}
 */
export function findSuperscripts(page) {
  // Only look in the main text area (above footnote boundary)
  const footnoteBoundary = getFootnoteBoundary(page);
  const mainItems = page.items.filter(i => i.y > footnoteBoundary);

  // Use tolerance=5 so superscripts (y ~4pt above baseline) group with their text line
  const lines = groupByLines(mainItems, 5);
  const superscripts = [];

  for (const line of lines) {
    const heights = line.map(i => i.height).filter(h => h > 0);
    if (!heights.length) continue;

    // Use median of the LARGER heights (non-superscript items) as the line's base height
    // Filter out items that are themselves small candidates
    const normalHeights = heights.filter(h => h > 9.0);
    const baseH = normalHeights.length > 0 ? median(normalHeights) : median(heights);

    for (const item of line) {
      const trimmed = item.str.trim();
      if (!trimmed) continue;

      const isNumeric = /^\d{1,3}$/.test(trimmed);
      // Superscript: height clearly smaller than normal text on this line
      // Fixed threshold 9pt works because we know superscripts are ~8pt
      const isSmall = item.height < 9.0;
      // And it should be meaningfully smaller than the line's base height
      const isSmallerThanBase = baseH < 1 || item.height < baseH * 0.82;

      if (isNumeric && isSmall && isSmallerThanBase) {
        superscripts.push({
          num: parseInt(trimmed, 10),
          x: item.x,
          y: item.y,
          lineY: median(line.filter(i => i.height > 9).map(i => i.y))
        });
      }
    }
  }

  return superscripts;
}

/**
 * Find footnote label numbers at the bottom of a page.
 * These are smaller than superscripts (h ~6.5pt) and below the main text.
 *
 * @param {import('./pdfParser').PageData} page
 * @returns {Array<{num: number, x: number, y: number}>}
 */
export function findFootnoteLabels(page) {
  // Look in the bottom 30% of the page
  const bottomThreshold = page.pageHeight * 0.30;
  const bottomItems = page.items.filter(i => i.y < bottomThreshold);

  const labels = [];
  for (const item of bottomItems) {
    const trimmed = item.str.trim();
    if (/^\d{1,3}$/.test(trimmed) && item.height < 7.5) {
      labels.push({
        num: parseInt(trimmed, 10),
        x: item.x,
        y: item.y
      });
    }
  }

  return labels;
}

/**
 * Determine the Y-coordinate boundary between main text and footnote area.
 * Items above this boundary are in the main text; below are footnotes.
 *
 * Strategy:
 * 1. Find footnote label numbers (h < 7.5, bottom 40% of page)
 * 2. Take the highest (max y) such label + one line height = boundary
 * 3. Fallback: 20% of page height from bottom
 *
 * @param {import('./pdfParser').PageData} page
 * @returns {number}  Y coordinate of the boundary
 */
export function getFootnoteBoundary(page) {
  const labels = findFootnoteLabels(page);
  if (labels.length > 0) {
    const maxLabelY = Math.max(...labels.map(l => l.y));
    // Add ~20pt buffer above the highest label
    return maxLabelY + 20;
  }
  // Fallback: bottom 15% of page is footnote area
  return page.pageHeight * 0.15;
}
