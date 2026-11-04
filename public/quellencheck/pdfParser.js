/**
 * pdfParser.js
 * Wraps pdfjs-dist (loaded as global via CDN script tag).
 * Extracts text items with position data from each page.
 *
 * Key insight from testing:
 * - Normal text: height ~12pt
 * - Superscript footnote refs: height ~8pt
 * - Footnote label numbers at bottom: height ~6.5pt
 * - Page height (A4): ~842pt
 */

/** @returns {import('pdfjs-dist')} */
const pdfjsLib = () => globalThis.pdfjsLib;

/**
 * Load a PDF from a File object.
 * Returns an array of PageData objects (one per page).
 *
 * @param {File} file
 * @returns {Promise<PageData[]>}
 *
 * @typedef {Object} TextItem
 * @property {string} str   - The text string
 * @property {number} x     - X position (left edge, in points)
 * @property {number} y     - Y position (baseline, in points; 0 = bottom of page)
 * @property {number} height - Font height in points
 * @property {number} width  - Text width in points
 *
 * @typedef {Object} PageData
 * @property {number} pageNum
 * @property {TextItem[]} items - All non-empty text items, sorted top-to-bottom then left-to-right
 * @property {number} pageHeight
 * @property {number} pageWidth
 */
export async function loadPdf(file) {
  const lib = pdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter(item => item.str && item.str.trim().length > 0)
      .map(item => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: item.height || Math.abs(item.transform[3]),
        width: item.width
      }))
      // Sort top-to-bottom (highest y = top of page), then left-to-right
      .sort((a, b) => b.y - a.y || a.x - b.x);

    pages.push({
      pageNum,
      items,
      pageHeight: viewport.height,
      pageWidth: viewport.width
    });
  }

  return pages;
}

/**
 * Group a list of items into lines by proximity of y-coordinates.
 * Returns an array of lines (each line = array of items sorted left-to-right).
 * Lines are sorted top-to-bottom (highest y first).
 *
 * @param {TextItem[]} items
 * @param {number} tolerance  Max y-difference to consider same line (default 2pt)
 * @returns {TextItem[][]}
 */
export function groupByLines(items, tolerance = 2) {
  if (!items.length) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines = [];
  let currentLine = [sorted[0]];
  let lineY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - lineY) <= tolerance) {
      currentLine.push(sorted[i]);
    } else {
      lines.push(currentLine.sort((a, b) => a.x - b.x));
      currentLine = [sorted[i]];
      lineY = sorted[i].y;
    }
  }
  if (currentLine.length) {
    lines.push(currentLine.sort((a, b) => a.x - b.x));
  }

  return lines;
}

/**
 * Calculate the median of a numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
export function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Reconstruct readable text from a page's items.
 * Uses position gaps to decide whether to insert a space between items.
 * Lines are separated by '\n'.
 *
 * When a gap > 2pt exists between the end of one item and the start of the next,
 * and neither item already has a trailing/leading space, a space is inserted.
 * This handles PDFs where words are stored as separate items without explicit spaces.
 *
 * @param {PageData} pageData
 * @returns {string}
 */
export function pageToText(pageData) {
  const lines = groupByLines(pageData.items);
  return lines
    .map(line => {
      let text = '';
      for (let i = 0; i < line.length; i++) {
        const item = line[i];
        if (i === 0) {
          text += item.str;
        } else {
          const prev = line[i - 1];
          const prevEnd = prev.x + (prev.width || 0);
          const gap = item.x - prevEnd;
          // Insert space if there is a visible gap between items and
          // the strings themselves don't already carry a space
          if (gap > 2 && !prev.str.endsWith(' ') && !item.str.startsWith(' ')) {
            text += ' ';
          }
          text += item.str;
        }
      }
      return text;
    })
    .join('\n');
}

/**
 * Get plain concatenated text (for simple regex matching).
 * Items joined with space, collapsed whitespace.
 *
 * @param {TextItem[]} items
 * @returns {string}
 */
export function itemsToFlat(items) {
  return items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
}
