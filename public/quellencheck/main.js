/**
 * main.js
 * Orchestrates the Quellencheck analysis pipeline.
 * Handles file input, runs extraction, renders debug tables.
 */

import { loadPdf } from './pdfParser.js';
import { findBibStart, extractBibliography } from './bibExtractor.js';
import { detectStyle } from './styleDetector.js';
import { extractFootnotes } from './footnoteExtractor.js';
import { extractBrackets } from './bracketExtractor.js';
import { addContextToFootnoteRefs, addContextToBrackets } from './textContext.js';
import { matchFootnotes, matchBrackets } from './matcher.js';
import { runPool } from './pool.js';

// ─── Wire up the trigger from index.html ─────────────────────────────────────
window._triggerAnalysis = async function () {
  const input = document.getElementById('pdfInput');
  if (!input.files.length) {
    setStatus('Bitte zuerst eine PDF-Datei auswählen.');
    return;
  }
  await analyze(input.files[0]);
};

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function analyze(file) {
  const t0 = performance.now();
  hideResults();
  setStatus(`Lade PDF: ${file.name} …`);

  let pages;
  try {
    pages = await loadPdf(file);
  } catch (e) {
    setStatus(`Fehler beim Laden des PDF: ${e.message}`);
    return;
  }

  setStatus(`PDF geladen (${pages.length} Seiten). Analysiere…`);

  // ── Step 1: Find bibliography start ────────────────────────────────────────
  const bibStartIdx = findBibStart(pages);
  if (bibStartIdx < 0) {
    setStatus('⚠ Kein Literaturverzeichnis gefunden. Prüfe ob das PDF ein Quellenverzeichnis enthält.');
  }

  // ── Step 2: Extract bibliography ───────────────────────────────────────────
  const bibliography = extractBibliography(pages, bibStartIdx);

  // ── Step 3: Detect citation style ─────────────────────────────────────────
  const style = detectStyle(pages, bibStartIdx);
  document.getElementById('styleInfo').textContent =
    style === 'fussnoten'
      ? 'Fussnoten (hochgestellte Zahlen)'
      : 'Klammern (Autor, Jahr)';

  // ── Step 4: Extract citations with text context ────────────────────────────
  let assignments = [];

  if (style === 'fussnoten') {
    // ── Primary: footnote superscripts ──────────────────────────────────────
    const { refs } = extractFootnotes(pages, bibStartIdx);
    const refsByPage = groupBy(refs, r => r.pageNum);
    const refsWithContext = [];
    for (const [pageNum, pageRefs] of refsByPage) {
      const page = pages[pageNum - 1];
      if (!page) continue;
      refsWithContext.push(...addContextToFootnoteRefs(page, pageRefs));
    }
    assignments = matchFootnotes(refsWithContext, bibliography);

    // ── Secondary: bracket citations present → format errors ─────────────────
    const bracketCitations = extractBrackets(pages, bibStartIdx);
    if (bracketCitations.length > 0) {
      const citsByPage = groupBy(bracketCitations, c => c.pageNum);
      const citsWithContext = [];
      for (const [pageNum, pageCits] of citsByPage) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        citsWithContext.push(...addContextToBrackets(page, pageCits));
      }
      const bracketAssignments = matchBrackets(citsWithContext, bibliography);
      bracketAssignments.forEach(a => { a.formatError = 'Klammer statt Fussnote'; });
      assignments.push(...bracketAssignments);

      document.getElementById('styleInfo').textContent +=
        ` — ausserdem ${bracketCitations.length} Klammerzitat(e) gefunden (Formatfehler)`;
    }
  } else {
    // ── Primary: bracket citations ───────────────────────────────────────────
    const citations = extractBrackets(pages, bibStartIdx);
    const citsByPage = groupBy(citations, c => c.pageNum);
    const citsWithContext = [];
    for (const [pageNum, pageCits] of citsByPage) {
      const page = pages[pageNum - 1];
      if (!page) continue;
      citsWithContext.push(...addContextToBrackets(page, pageCits));
    }
    assignments = matchBrackets(citsWithContext, bibliography);

    // ── Secondary: footnote superscripts present → format errors ────────────
    const { refs } = extractFootnotes(pages, bibStartIdx);
    if (refs.length > 0) {
      const refsByPage = groupBy(refs, r => r.pageNum);
      const refsWithContext = [];
      for (const [pageNum, pageRefs] of refsByPage) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        refsWithContext.push(...addContextToFootnoteRefs(page, pageRefs));
      }
      const fnAssignments = matchFootnotes(refsWithContext, bibliography);
      fnAssignments.forEach(a => { a.formatError = 'Fussnote statt Klammer'; });
      assignments.push(...fnAssignments);

      document.getElementById('styleInfo').textContent +=
        ` — ausserdem ${refs.length} Fussnotenreferenz(en) gefunden (Formatfehler)`;
    }
  }

  // ── Step 5: Render debug tables ────────────────────────────────────────────
  renderZitate(assignments);
  renderLiteratur(bibliography);
  renderZuordnung(assignments);
  renderURLs(assignments);
  renderWebContent(assignments);
  document.getElementById('results').style.display = '';

  // ── Step 6: Webinhalt laden und mit KI prüfen (parallel, pro URL einmal) ──────
  const webAssignments = assignments.filter(a => a.bibEntry && a.bibEntry.url);
  if (webAssignments.length > 0) {
    await checkWebSources(webAssignments, assignments);
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  setStatus(`Analyse abgeschlossen in ${elapsed}s.`);
}

// ─── Table renderers ──────────────────────────────────────────────────────────

function renderZitate(assignments) {
  const formatErrors = assignments.filter(a => a.formatError).length;
  document.getElementById('citationCount').textContent =
    `${assignments.length} Zitat(e) gefunden` +
    (formatErrors ? ` (davon ${formatErrors} Formatfehler)` : '');

  const tbody = document.querySelector('#tblZitate tbody');
  tbody.innerHTML = '';

  assignments.forEach((a, i) => {
    const tr = tbody.insertRow();
    if (a.formatError) tr.style.background = '#fff8e1';
    td(tr, i + 1);
    td(tr, a.refLabel + (a.refJahr ? ` (${a.refAutor}, ${a.refJahr})` : ` (${a.refAutor})`));
    td(tr, truncate(a.context, 200));
    td(tr, `S. ${a.pageNum}`);
    if (a.formatError) {
      const cell = tr.insertCell();
      cell.style.color = 'darkorange';
      cell.textContent = `⚠ ${a.formatError}`;
    } else {
      td(tr, '');
    }
  });
}

function renderLiteratur(bibliography) {
  document.getElementById('bibCount').textContent =
    `${bibliography.length} Eintrag/Einträge im Literaturverzeichnis`;

  const tbody = document.querySelector('#tblLiteratur tbody');
  tbody.innerHTML = '';

  bibliography.forEach(entry => {
    const tr = tbody.insertRow();
    td(tr, entry.autor);
    td(tr, entry.jahrRaw || entry.jahr);
    td(tr, entry.typ);
    if (entry.url) {
      const cell = tr.insertCell();
      const a = document.createElement('a');
      a.href = entry.url;
      a.target = '_blank';
      a.textContent = truncate(entry.url, 60);
      cell.appendChild(a);
    } else {
      td(tr, '—');
    }
    td(tr, truncate(entry.volltext, 120));
  });
}

function renderZuordnung(assignments) {
  const matched = assignments.filter(a => a.matched).length;
  document.getElementById('matchCount').textContent =
    `${matched} von ${assignments.length} Zitat(en) zugeordnet`;

  const tbody = document.querySelector('#tblZuordnung tbody');
  tbody.innerHTML = '';

  assignments.forEach(a => {
    const tr = tbody.insertRow();
    if (a.formatError) tr.style.background = '#fff8e1';
    td(tr, a.refLabel);
    td(tr, truncate(a.context, 150));
    if (a.bibEntry) {
      td(tr, a.bibEntry.autor + ' (' + (a.bibEntry.jahrRaw || a.bibEntry.jahr) + '): ' +
        truncate(a.bibEntry.volltext, 100));
    } else {
      const cell = tr.insertCell();
      cell.style.color = 'red';
      cell.textContent = '⚠ Kein Match gefunden';
    }
    if (a.formatError) {
      const cell = tr.insertCell();
      cell.style.color = 'darkorange';
      cell.textContent = `⚠ ${a.formatError}`;
    } else {
      td(tr, '');
    }
  });
}

function renderURLs(assignments) {
  const webAssignments = assignments.filter(a => a.bibEntry && a.bibEntry.url);
  document.getElementById('urlCount').textContent =
    `${webAssignments.length} Webquellen-Zitat(e)`;

  const tbody = document.querySelector('#tblURLs tbody');
  tbody.innerHTML = '';

  webAssignments.forEach(a => {
    const tr = tbody.insertRow();
    td(tr, a.refLabel);
    const ctxCell = td(tr, truncate(a.context, 450));
    ctxCell.style.fontSize = '0.8em';
    const cell = tr.insertCell();
    const link = document.createElement('a');
    link.href = a.bibEntry.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = a.bibEntry.url;
    cell.appendChild(link);
  });
}

// ─── Web content fetching + claim verification ────────────────────────────────

const FETCH_PARALLEL = 6;
const FIGURE_CAPTION = /^(?:Figure|Fig\.|Abbildung|Abb\.|Table|Tabelle)\s*\d/i;

// Pro Host immer nur eine Anfrage gleichzeitig (schont Server wie NCBI)
const hostChain = new Map();
function perHost(url, fn) {
  let host = url;
  try { host = new URL(url).host; } catch { /* ungültige URL: eigene Kette */ }
  const run = (hostChain.get(host) || Promise.resolve()).then(fn);
  hostChain.set(host, run.catch(() => {}));
  return run;
}

async function loadPage(url) {
  try {
    const resp = await fetch(`/quellencheck/fetch-url?url=${encodeURIComponent(url)}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.blocked) return { blocked: true, reason: data.reason, text: '' };
    if (data.error) return { blocked: false, reason: data.error, text: '' };
    return { blocked: false, reason: null, text: data.text || '', source: data.source };
  } catch {
    return { blocked: false, reason: 'client-error', text: '' };
  }
}

async function checkClaims(group) {
  const claims = group.items.map((a, i) => ({ id: i, context: a.context }));
  const fail = error => group.items.forEach(a => { a.claimCheck = { degree: 'nicht gestützt', quote: null, error }; });
  try {
    const resp = await fetch('/quellencheck/check-claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webText: group.page.text, claims, source: group.page.source }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return fail(data.error || `http-${resp.status}`);
    group.items.forEach((a, i) => {
      a.claimCheck = data.results.find(r => r.id === i) || { degree: 'nicht gestützt', quote: null, error: 'no-result' };
    });
  } catch {
    fail('client-error');
  }
}

async function checkWebSources(webAssignments, assignments) {
  // Dieselbe URL nur einmal laden und alle Behauptungen dazu in einem KI-Aufruf prüfen
  const groups = [...groupBy(webAssignments, a => a.bibEntry.url)].map(([url, items]) => ({ url, items }));
  let done = 0;

  await runPool(groups, FETCH_PARALLEL, async group => {
    group.page = await perHost(group.url, () => loadPage(group.url));
    group.items.forEach(a => {
      a.webBlocked = group.page.blocked;
      a.webBlockReason = group.page.reason;
      a.webText = group.page.text;
      a.webSource = group.page.source;
    });

    // Abbildungsbeschriftungen sind keine inhaltlichen Behauptungen
    group.items.filter(a => FIGURE_CAPTION.test(a.context)).forEach(a => { a.claimCheck = { degree: 'abbildung', quote: null }; });
    const toCheck = group.items.filter(a => !a.claimCheck);

    if (group.page.text && toCheck.length > 0) {
      renderWebContent(assignments);
      await checkClaims({ ...group, items: toCheck });
    }
    done++;
    setStatus(`Quellen geprüft: ${done}/${groups.length}`);
    renderWebContent(assignments);
  });
}

function renderWebContent(assignments) {
  const webAssignments = assignments.filter(a => a.bibEntry && a.bibEntry.url);
  document.getElementById('webContentCount').textContent =
    `${webAssignments.length} Webquelle(n)`;

  const tbody = document.querySelector('#tblWebContent tbody');
  tbody.innerHTML = '';

  const REASON_LABELS = {
    'robots-wildcard': 'robots.txt verbietet Zugriff (User-agent: *)',
    'robots-ai':       'robots.txt blockiert KI-Bots',
    'x-robots-noai':   'X-Robots-Tag: noai (Header)',
    'meta-noai':       'Meta-Tag noai gefunden',
  };

  const DEGREE_STYLE = {
    'gestützt':       { color: 'green', label: '✓ gestützt' },
    'nicht gestützt': { color: 'red',   label: '✗ nicht gestützt' },
    'nicht belegbar': { color: 'grey',  label: '⚠ nicht belegbar (nur Abstract gelesen) — manuell prüfen' },
    'abbildung':      { color: 'grey',  label: '— Abbildungsbeschriftung, nicht geprüft' },
  };

  webAssignments.forEach(a => {
    const tr = tbody.insertRow();
    td(tr, a.refLabel);
    const ctxCell = td(tr, truncate(a.context, 450));
    ctxCell.style.fontSize = '0.8em';

    // ── Grad der Übereinstimmung ──────────────────────────────────────────────
    const gradCell = tr.insertCell();

    if (a.webBlocked === undefined) {
      gradCell.style.color = 'grey';
      gradCell.textContent = '⏳ Wird geladen…';
    } else if (a.webBlocked) {
      const msg = REASON_LABELS[a.webBlockReason] || `Zugriff blockiert (${a.webBlockReason})`;
      const span = document.createElement('span');
      span.style.color = 'grey';
      span.textContent = `⚠ ${msg} — `;
      gradCell.appendChild(span);
      const link = document.createElement('a');
      link.href = a.bibEntry.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Manuell prüfen';
      gradCell.appendChild(link);
    } else if (a.webBlockReason === 'unreadable') {
      const span = document.createElement('span');
      span.style.color = 'grey';
      span.textContent = '⚠ Seite nicht lesbar (Bot-Schutz, Paywall oder kein HTML) — ';
      gradCell.appendChild(span);
      const link = document.createElement('a');
      link.href = a.bibEntry.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Manuell prüfen';
      gradCell.appendChild(link);
    } else if (a.webBlockReason === 'fetch-failed' || a.webBlockReason === 'client-error' || a.webBlockReason === 'too-large') {
      const span = document.createElement('span');
      span.style.color = 'red';
      span.textContent = '✗ Seite nicht erreichbar — ';
      gradCell.appendChild(span);
      const link = document.createElement('a');
      link.href = a.bibEntry.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Manuell prüfen';
      gradCell.appendChild(link);
    } else if (!a.claimCheck) {
      gradCell.style.color = 'grey';
      gradCell.textContent = '⏳ Wird geprüft…';
    } else if (a.claimCheck.error === 'no-api-key') {
      gradCell.style.color = 'grey';
      gradCell.textContent = '— API-Schlüssel fehlt';
    } else {
      const style = DEGREE_STYLE[a.claimCheck.degree] || { color: 'grey', label: a.claimCheck.degree };
      gradCell.style.color = style.color;
      gradCell.style.fontWeight = 'bold';
      gradCell.textContent = style.label + (a.claimCheck.degree === 'gestützt' && a.webSource === 'abstract' ? ' (laut Abstract)' : '');
      if (a.claimCheck.quote) {
        const details = document.createElement('details');
        details.style.fontWeight = 'normal';
        const summary = document.createElement('summary');
        summary.textContent = 'Fundstelle';
        details.appendChild(summary);
        const p = document.createElement('p');
        p.style.color = '#333';
        p.style.fontStyle = 'italic';
        p.textContent = `„${truncate(a.claimCheck.quote, 300)}"`;
        details.appendChild(p);
        gradCell.appendChild(details);
      }
    }

    // ── Quelle (Link) ─────────────────────────────────────────────────────────
    const linkCell = tr.insertCell();
    const link = document.createElement('a');
    link.href = a.bibEntry.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = truncate(a.bibEntry.url, 50);
    linkCell.appendChild(link);
  });
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function hideResults() {
  document.getElementById('results').style.display = 'none';
}

function td(tr, text) {
  const cell = tr.insertCell();
  cell.textContent = String(text ?? '');
  return cell;
}

function truncate(str, maxLen) {
  if (!str) return '';
  str = str.replace(/\s+/g, ' ').trim();
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
