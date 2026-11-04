/**
 * textContext.js
 * Extracts the text passage that belongs to a citation.
 *
 * For each citation marker (superscript number or bracket), we find
 * the text that comes before it — from the start of the paragraph
 * or from the previous citation marker, whichever is closer.
 *
 * Strategy:
 *   - Reconstruct a clean text for each page from the main-text items
 *     (excluding footnote area items).
 *   - For footnote superscripts: use position (x, y) to locate the
 *     insertion point in the text stream.
 *   - For bracket citations: the match offset is known from regex.
 *   - Walk backwards from the marker to find the text segment.
 */

import { groupByLines, pageToText } from './pdfParser.js';
import { getFootnoteBoundary } from './styleDetector.js';

/**
 * Build a clean, ordered text from the main-text area of a page.
 * Returns both the plain string and a mapping from character positions
 * to approximate x/y coordinates (for locating superscripts).
 *
 * @param {import('./pdfParser').PageData} page
 * @returns {{ text: string, items: import('./pdfParser').TextItem[] }}
 */
export function buildMainText(page) {
  const boundary = getFootnoteBoundary(page);
  const mainItems = page.items.filter(i => i.y > boundary);

  // Group items into visual lines (tolerance=5 so superscripts at ~y+4 land in their line),
  // then flatten: groupByLines returns lines top-to-bottom, items within each line left-to-right.
  // This ensures a superscript at y=581 is grouped with normal text at y=577 and sorted
  // to its correct x-position (after "Preis"), not placed between two text lines.
  const lines = groupByLines(mainItems, 5);
  const sortedItems = lines.flat();

  return { text: joinItems(sortedItems).text, items: sortedItems };
}

/**
 * Join items to text. A space is inserted only where the PDF shows a visible gap,
 * so words that the PDF splits into several items ("Lebensb" + "ereich") stay intact.
 * Superscripts and line changes always get a space.
 *
 * @param {import('./pdfParser').TextItem[]} items
 * @returns {{ text: string, starts: number[] }}  starts[i] = character offset of items[i]
 */
export function joinItems(items) {
  let text = '';
  const starts = [];
  items.forEach((item, i) => {
    if (i > 0) {
      const prev = items[i - 1];
      const gap = item.x - (prev.x + (prev.width || 0));
      const sameLine = Math.abs(item.y - prev.y) <= 5;
      const superscript = item.height < 9 || prev.height < 9;
      if (!sameLine || superscript || gap > 1) text += ' ';
    }
    starts.push(text.length);
    text += item.str;
  });
  return { text, starts };
}

/**
 * Find the character offset of a superscript in the page text.
 * We locate the superscript item by position, then find nearby text.
 *
 * @param {import('./pdfParser').PageData} page
 * @param {{ num: number, x: number, y: number }} superscript
 * @param {string} pageText  Output of buildMainText for this page
 * @param {import('./pdfParser').TextItem[]} items  Main text items
 * @returns {number}  Character offset in pageText, or -1 if not found
 */
export function findSuperscriptOffset(page, superscript, pageText, items) {
  const numStr = String(superscript.num);

  // Find items near the superscript position (within 3pt)
  const nearItems = items.filter(
    i =>
      Math.abs(i.x - superscript.x) < 3 &&
      Math.abs(i.y - superscript.y) < 3 &&
      i.str.trim() === numStr
  );

  if (!nearItems.length) {
    // Fallback: find any item matching the number at small height near expected position
    const candidates = items.filter(
      i => i.str.trim() === numStr && i.height < 9.0
    );
    if (candidates.length) {
      nearItems.push(candidates[0]);
    }
  }

  if (!nearItems.length) return -1;

  const targetItem = nearItems[0];

  return joinItems(items).starts[items.indexOf(targetItem)];
}

/**
 * Extract the text context for a citation at the given character offset.
 *
 * Searches backwards from `offset` to find the start of the text segment:
 *   - Start of a paragraph (double newline or gap in y-coordinates)
 *   - Previous citation position
 *   - At most MAX_CHARS characters back
 *
 * Returns the text from that start to the offset, cleaned up.
 *
 * @param {string} text           Full page text (main area)
 * @param {number} offset         Position of the citation marker
 * @param {number[]} otherOffsets Positions of other citations on this page
 * @param {number} [maxChars=600]
 * @returns {string}
 */
export function extractContext(text, offset, otherOffsets = [], maxChars = 600) {
  if (offset < 0) return '';

  // Find the closest previous boundary
  const searchFrom = Math.max(0, offset - maxChars);
  const segment = text.slice(searchFrom, offset);

  // Find the best starting point within the segment
  let startIdx = 0;

  // Option 1: paragraph break (double newline)
  const paraBreak = segment.lastIndexOf('\n\n');
  if (paraBreak !== -1) {
    startIdx = Math.max(startIdx, paraBreak + 2);
  }

  // Option 1b: single newline followed by uppercase (new paragraph in single-\n text)
  // Find the LAST such occurrence before offset
  if (startIdx === 0) {
    const newlineBeforeUpper = [...segment.matchAll(/\n(?=[A-ZÄÖÜ\u00C0-\u024F])/g)];
    if (newlineBeforeUpper.length) {
      const last = newlineBeforeUpper[newlineBeforeUpper.length - 1];
      startIdx = Math.max(startIdx, last.index + 1);
    }
  }

  // Option 2: previous citation in this page (offset relative to searchFrom)
  for (const otherOffset of otherOffsets) {
    if (otherOffset < offset) {
      const relativePos = otherOffset - searchFrom;
      if (relativePos > 0 && relativePos > startIdx) {
        startIdx = relativePos;
      }
    }
  }

  // Option 3: sentence boundary as fallback (after a period + space/newline)
  // Only use if we didn't find a better boundary
  if (startIdx === 0) {
    // Look for ". " or ".\n" followed by a capital letter (= new sentence)
    const sentenceStart = findLastSentenceStart(segment);
    if (sentenceStart > 0) startIdx = sentenceStart;
  }

  const cleaned = cleanContextText(segment.slice(startIdx));
  // Zu kurzer Kontext (z.B. direkt nach einem Absatzbeginn): ein Stück weiter zurückgehen
  if (cleaned.length < 30 && startIdx > 0) return cleanContextText(segment.slice(-300));
  return cleaned;
}

/**
 * Find the start of the last complete sentence in the text.
 * Returns the index where the sentence starts.
 */
function findLastSentenceStart(text) {
  // Find all ". " or ".\n" patterns, return the last one that is followed by uppercase
  let lastIdx = 0;
  const re = /[.!?]\s+(?=[A-ZÄÖÜ\u00C0-\u024F])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    lastIdx = m.index + m[0].length;
  }
  return lastIdx;
}

/**
 * Clean up extracted context text.
 * - Collapse whitespace/newlines to single spaces
 * - Remove leading/trailing whitespace
 * - Remove superscript number artifacts (isolated digits)
 */
export function cleanContextText(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    // Remove leading superscript number artifacts (isolated digits at start of context)
    .replace(/^\d{1,3}\s+/, '')
    .trim();
}

/**
 * Add text context to all footnote references on a page.
 *
 * @param {import('./pdfParser').PageData} page
 * @param {import('./footnoteExtractor').FootnoteRef[]} refsOnPage  Refs for this page only
 * @returns {import('./footnoteExtractor').FootnoteRef[]}  Refs with .context filled in
 */
export function addContextToFootnoteRefs(page, refsOnPage) {
  const { text, items } = buildMainText(page);

  // Resolve character offsets for each ref
  const refsWithOffsets = refsOnPage.map(ref => ({
    ...ref,
    _offset: findSuperscriptOffset(page, ref, text, items)
  }));

  // Sorted by offset ascending
  refsWithOffsets.sort((a, b) => a._offset - b._offset);
  const offsets = refsWithOffsets.map(r => r._offset);

  return refsWithOffsets.map((ref, i) => {
    const context = extractContext(text, ref._offset, offsets.slice(0, i));
    return { ...ref, context };
  });
}

/**
 * Add text context to all bracket citations on a page.
 * Uses pageToText() — same format as bracketExtractor uses for offset calculation.
 *
 * @param {import('./pdfParser').PageData} page
 * @param {import('./bracketExtractor').BracketCitation[]} citsOnPage
 * @returns Citations with .context added
 */
export function addContextToBrackets(page, citsOnPage) {
  // Must use the same text format as bracketExtractor.js (pageToText)
  const text = pageToText(page);

  const sorted = [...citsOnPage].sort((a, b) => a.charOffset - b.charOffset);
  const offsets = sorted.map(c => c.charOffset);

  return sorted.map((cit, i) => {
    const context = extractContext(text, cit.charOffset, offsets.slice(0, i));
    return { ...cit, context };
  });
}
