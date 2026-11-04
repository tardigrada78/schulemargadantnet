import { Router } from "express";
import * as cheerio from "cheerio";
import { callAI } from "../aiCall.js";
import { extractIdentifier, fetchScholarly } from "./scholarly.js";

const router = Router();

const MODEL = "anthropic/claude-haiku-5-5";

function jsonResponse(res, data, status = 200) {
  res.status(status).json(data);
}

// AI bot user-agents to check in robots.txt
const AI_BOTS = new Set([
  'gptbot', 'ccbot', 'anthropic-ai', 'claude-web', 'chatgpt-user',
  'perplexitybot', 'cohere-ai', 'diffbot', 'facebookbot', 'google-extended',
  'omgilibot', 'img2dataset', 'ai2bot', 'amazonbot',
]);

// ─── robots.txt parser (RFC 9309) ─────────────────────────────────────────────

function pathMatchesRule(targetPath, rulePath) {
  if (rulePath === '') return false; // empty Disallow = allow all
  // Convert robots.txt wildcard (*) and end-anchor ($) to regex
  const escaped = rulePath
    .replace(/[.+^{}()|[\]\\]/g, '\\$&') // escape regex special chars except * and $
    .replace(/\*/g, '.*');
  const pattern = escaped.endsWith('\\$')
    ? '^' + escaped.slice(0, -2) + '$'
    : '^' + escaped;
  try {
    return new RegExp(pattern).test(targetPath);
  } catch {
    return targetPath.startsWith(rulePath);
  }
}

function evaluateGroup(agents, rules, targetPath) {
  const isWildcard = agents.includes('*');
  const isAiBot = agents.some(a => AI_BOTS.has(a));
  if (!isWildcard && !isAiBot) return null;

  // Collect all matching rules, pick the most specific (longest path wins)
  const matching = rules.filter(r => pathMatchesRule(targetPath, r.path));
  if (matching.length === 0) return null;

  matching.sort((a, b) => b.path.length - a.path.length);
  const winner = matching[0];

  if (winner.type === 'disallow') {
    return isAiBot ? 'robots-ai' : 'robots-wildcard';
  }
  return null; // Allow wins
}

function parseRobotsBlocked(robotsText, targetUrl) {
  const targetPath = new URL(targetUrl).pathname || '/';
  const lines = robotsText.split(/\r?\n/);

  let currentAgents = [];
  let currentRules = [];
  let inGroup = false;

  function flush() {
    if (currentAgents.length === 0) return null;
    return evaluateGroup(currentAgents, currentRules, targetPath);
  }

  for (const raw of lines) {
    const line = raw.split('#')[0].trim();

    if (line === '') {
      const result = flush();
      if (result) return { blocked: true, reason: result };
      currentAgents = [];
      currentRules = [];
      inGroup = false;
      continue;
    }

    const lower = line.toLowerCase();

    if (lower.startsWith('user-agent:')) {
      const agent = line.slice('user-agent:'.length).trim().toLowerCase();
      if (!inGroup || currentRules.length > 0) {
        // Start a new group (either fresh start, or rules already seen)
        if (inGroup && currentRules.length > 0) {
          const result = flush();
          if (result) return { blocked: true, reason: result };
        }
        currentAgents = [agent];
        currentRules = [];
        inGroup = true;
      } else {
        // Still collecting agents for this group
        currentAgents.push(agent);
      }
    } else if (lower.startsWith('disallow:')) {
      const p = line.slice('disallow:'.length).trim();
      currentRules.push({ type: 'disallow', path: p });
    } else if (lower.startsWith('allow:')) {
      const p = line.slice('allow:'.length).trim();
      currentRules.push({ type: 'allow', path: p });
    }
    // Ignore Crawl-delay, Sitemap, etc.
  }

  // Evaluate final group (no trailing blank line)
  const result = flush();
  if (result) return { blocked: true, reason: result };

  return { blocked: false };
}

// ─── HTML to plain text ────────────────────────────────────────────────────────

function htmlToText(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  $('script, style, noscript, nav, footer, aside, form, iframe, svg, [role="navigation"], [aria-hidden="true"]').remove();
  // Cookie-/Consent-Banner entfernen, aber nie die Hauptstruktur
  $('[id*="cookie" i], [class*="cookie" i], [class*="consent" i]').each((_, el) => {
    if (!/^(html|body|main|article)$/i.test(el.tagName) && $(el).text().length < 3000) $(el).remove();
  });
  $('br').replaceWith('\n');
  $('p, div, li, h1, h2, h3, h4, h5, h6, tr, section, article, blockquote').append('\n');

  // Hauptinhalt bevorzugen, sofern er genug Text enthält
  let root = $('body');
  for (const sel of ['main', 'article']) {
    const el = $(sel).first();
    if (el.length && el.text().length >= 500) { root = el; break; }
  }
  const text = root.text().replace(/[ \t\u00a0]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return title && !text.startsWith(title) ? `${title}\n\n${text}` : text;
}

// Bot-Schutzseiten (Cloudflare, NCBI usw.) erkennen: kurzer Text oder typische Meldung
const BOT_WALL = /cookies must be enabled|checking your browser|enable javascript|javascript is (?:disabled|required)|just a moment|access denied|verify you are (?:a )?human|captcha|attention required|are you a robot|request blocked/i;

function looksLikeBotWall(text) {
  return text.length < 300 || (text.length < 2000 && BOT_WALL.test(text));
}

// ─── noai meta-tag check ──────────────────────────────────────────────────────

function checkMetaRestrictions(html) {
  // Match <meta name="robots" content="..."> in any attribute order
  const patterns = [
    /<meta\s[^>]*name\s*=\s*["'](?:robots|ai-content-usage)["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<meta\s[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["'](?:robots|ai-content-usage)["'][^>]*>/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const content = m[1].toLowerCase();
      if (content.includes('noai') || content.includes('noimageai')) return 'meta-noai';
    }
  }
  return null;
}

// ─── /api/fetch-url handler ───────────────────────────────────────────────────

async function handleFetchUrl(req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return jsonResponse(res, { error: 'missing-url' }, 400);
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return jsonResponse(res, { error: 'invalid-url' }, 400);
  }
  if (parsedTarget.protocol !== 'http:' && parsedTarget.protocol !== 'https:') {
    return jsonResponse(res, { error: 'invalid-url' }, 400);
  }

  // ── Step 0: Wissenschaftliche Quellen (DOI, PubMed, PMC) über offene APIs ───
  const ident = extractIdentifier(targetUrl);
  if (ident) {
    const sch = await fetchScholarly(ident);
    if (sch) return jsonResponse(res, { blocked: false, text: sch.text, source: sch.source, url: targetUrl });
  }

  // ── Step 1: Fetch robots.txt ────────────────────────────────────────────────
  const robotsUrl = `${parsedTarget.origin}/robots.txt`;
  let robotsText = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(robotsUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Quellencheck/1.0' },
    });
    clearTimeout(timer);
    if (r.ok) robotsText = await r.text();
  } catch { /* timeout or network error → proceed as allowed */ }

  // ── Step 2: Parse robots.txt ────────────────────────────────────────────────
  if (robotsText) {
    const { blocked, reason } = parseRobotsBlocked(robotsText, targetUrl);
    if (blocked) {
      return jsonResponse(res, { blocked: true, reason, url: targetUrl });
    }
  }

  // ── Step 3: Fetch the page ──────────────────────────────────────────────────
  let pageHtml, xRobotsTag = '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(targetUrl, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Quellencheck/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    const contentLength = parseInt(r.headers.get('content-length') || '0', 10);
    if (contentLength > 5 * 1024 * 1024) {
      return jsonResponse(res, { blocked: false, error: 'too-large', url: targetUrl });
    }

    const contentType = r.headers.get('content-type') || '';
    if (contentType && !/text\/html|xhtml|text\/plain/i.test(contentType)) {
      return jsonResponse(res, { blocked: false, error: 'unreadable', url: targetUrl });
    }
    xRobotsTag = r.headers.get('x-robots-tag') || '';
    pageHtml = await r.text();
  } catch (e) {
    return jsonResponse(res, { blocked: false, error: 'fetch-failed', message: e.message, url: targetUrl });
  }

  // ── Step 4: Check X-Robots-Tag header ──────────────────────────────────────
  const xLower = xRobotsTag.toLowerCase();
  if (xLower.includes('noai') || xLower.includes('noimageai')) {
    return jsonResponse(res, { blocked: true, reason: 'x-robots-noai', url: targetUrl });
  }

  // ── Step 5: Check meta robots in HTML ──────────────────────────────────────
  const metaReason = checkMetaRestrictions(pageHtml);
  if (metaReason) {
    return jsonResponse(res, { blocked: true, reason: metaReason, url: targetUrl });
  }

  // ── Step 6: Return plain text ───────────────────────────────────────────────
  const text = htmlToText(pageHtml);
  if (looksLikeBotWall(text)) {
    return jsonResponse(res, { blocked: false, error: 'unreadable', url: targetUrl });
  }
  return jsonResponse(res, { blocked: false, text, source: 'web', url: targetUrl });
}

// ─── Relevante Passagen auswählen ─────────────────────────────────────────────

const MAX_TEXT_CHARS = 15000;

// Kurze Texte bleiben ganz. Bei langen Texten: Anfang (Titel/Abstract) plus die Absätze,
// die die meisten Stichwörter aus den Behauptungen enthalten (Originalreihenfolge).
function selectPassages(text, claims, maxChars = MAX_TEXT_CHARS) {
  if (text.length <= maxChars) return text;

  const words = new Set(
    claims.flatMap((c) => c.context.toLowerCase().match(/[a-zäöüéèàß0-9]{5,}/g) || [])
  );
  const head = text.slice(0, 1500);
  const paras = text.slice(1500).split(/\n+/).map((t, i) => ({ t, i })).filter((p) => p.t.trim().length > 40);
  paras.forEach((p) => {
    const low = p.t.toLowerCase();
    p.score = [...words].filter((w) => low.includes(w)).length;
  });

  let used = head.length;
  const chosen = [];
  for (const p of [...paras].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (p.score === 0 || used + p.t.length > maxChars) continue;
    chosen.push(p);
    used += p.t.length + 1;
  }
  chosen.sort((a, b) => a.i - b.i);
  return head + '\n[…]\n' + chosen.map((p) => p.t).join('\n');
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, ''));
  }
}

// ─── Behauptungen gegen Webinhalt prüfen (mehrere pro Seite in einem Aufruf) ──

async function handleCheckClaims(req, res) {
  const { webText, claims, source } = req.body || {};
  if (!webText || !Array.isArray(claims) || claims.length === 0) {
    return jsonResponse(res, { error: 'missing-fields' }, 400);
  }

  const text = selectPassages(webText, claims);
  const onlyAbstract = source === 'abstract';

  const prompt = `Du bist ein präziser Quellenprüfer. Antworte ausschliesslich mit validem JSON, ohne Markdown-Codeblock.

Webinhalt der Quelle${onlyAbstract ? ' (nur Titel und Abstract verfügbar)' : ''}:
${text}

Behauptungen aus dem zu prüfenden Dokument:
${claims.map((c) => `[${c.id}] ${c.context}`).join('\n')}

Entscheide für jede Behauptung, ob sie durch den Webinhalt gestützt wird, und zitiere die relevante Textstelle:
- "gestützt": Der Webinhalt enthält die Behauptung direkt oder sinngemäss (auch mit anderer Formulierung).
- "nicht gestützt": Der Webinhalt enthält die Behauptung nicht oder nur eine entfernte Verbindung dazu.

Antwort ausschliesslich als JSON-Array mit einem Eintrag pro Behauptung: [{"id":<Nummer>,"degree":"gestützt"|"nicht gestützt","quote":"relevante Textstelle aus dem Webinhalt oder null"}]`;

  let byId = new Map();
  let error = null;
  try {
    const raw = (await callAI(prompt, MODEL, 0, Math.min(8000, 1500 + 700 * claims.length))).trim();
    const parsed = parseJson(raw);
    byId = new Map((Array.isArray(parsed) ? parsed : [parsed]).map((r) => [String(r.id), r]));
  } catch (e) {
    error = e.message;
  }

  const results = claims.map((c) => {
    const r = byId.get(String(c.id));
    let degree = r?.degree === 'gestützt' ? 'gestützt' : 'nicht gestützt';
    // Bei reinem Abstract ist «nicht gestützt» nicht aussagekräftig
    if (degree === 'nicht gestützt' && onlyAbstract && !error) degree = 'nicht belegbar';
    return { id: c.id, degree, quote: r?.quote ?? null, ...(error && { error }) };
  });
  return jsonResponse(res, { results });
}

router.get("/fetch-url", (req, res) => {
  handleFetchUrl(req, res).catch(e => jsonResponse(res, { error: 'internal', message: e.message }, 500));
});

router.post("/check-claims", (req, res) => {
  handleCheckClaims(req, res).catch(e => jsonResponse(res, { error: 'internal', message: e.message }, 500));
});

export default router;
