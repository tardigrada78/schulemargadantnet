import { Router } from "express";
import axios from "axios";
import OpenAI from "openai";
import * as cheerio from "cheerio";

const router = Router();

// API Keys
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_WEB_API_KEY;
const GOOGLE_ENDPOINT = `https://www.googleapis.com/customsearch/v1`;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Funktion für Google Websuche
async function searchWeb(query, numResults) {
  try {
    let allResults = [];
    let start = 1; // Erste Ergebnisseite beginnt bei 1
    let maxPerRequest = 10;
    while (allResults.length < numResults) {
      let resultsToFetch = Math.min(maxPerRequest, numResults - allResults.length);
      const response = await axios.get(GOOGLE_ENDPOINT, {
        params: {
          q: query,
          cx: GOOGLE_CSE_ID,
          key: GOOGLE_API_KEY,
          num: resultsToFetch,
          start: start,
        },
      });
      if (response.data.items) {
        allResults.push(
          ...response.data.items.map((result) => ({
            title: result.title,
            url: result.link,
            snippet: result.snippet,
          }))
        );
      }
      start += maxPerRequest; // Nächste Seite abrufen
      if (!response.data.items || response.data.items.length < resultsToFetch) {
        break; 
      }
    }
    return allResults;
  } catch (error) {
    console.error("Fehler bei der Google-Suche:", error);
    return [];
  }
}

// Funktion zum Abrufen von Webseiten-Inhalten
async function fetchWebsiteContent(url) {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    const $ = cheerio.load(response.data);
    let text = $("p, article").text();
    return text.substring(0, 5000);
  } catch (error) {
    console.error(`Fehler beim Abrufen von ${url}:`, error.message);
    return null;
  }
}

// Funktion zur Bewertung der Übereinstimmung mit GPT-4
async function analyzeFact(originalText, websiteTitle, websiteContent) {
  const systemMessage = `Du bist ein KI-Experte für Faktenüberprüfung. 
    Deine Aufgabe ist es, eine gegebene Aussage mit einem Webseiten-Titel und Webseiten-Text zu vergleichen. 
    Du musst prüfen, ob der Webseiten-Text die Aussage bestätigt, widerlegt oder neutral bleibt. 

    **Wichtige Regeln für deine Analyse:**
    1️⃣ **Der Webseiten-Titel darf nicht allein die Bewertung dominieren.** Falls der Titel die Aussage bestätigt, der Text sie aber widerlegt, dann zähle der Text stärker.
    2️⃣ **Berücksichtige logische Widersprüche.** Eine Webseite kann erst eine Behauptung aufstellen und sie später widerlegen.
    3️⃣ **Achte auf Verneinungen oder einschränkende Formulierungen** ("nicht", "kein", "kaum Beweise").
    4️⃣ Falls der Webseiten-Text **die Aussage widerlegt**, darf "match_percent" NICHT über 30% liegen.
    5️⃣ Falls der Webseiten-Text **die Aussage bestätigt**, MUSS "match_percent" über 70% liegen.
    6️⃣ Falls der Webseiten-Text **keine klare Aussage zur überprüften Behauptung trifft**, muss "match_percent" zwischen 40-60% liegen.
    7️⃣ Falls der Webseiten-Text **nur allgemeine Informationen gibt**, aber nicht direkt auf die Aussage eingeht, setze "match_percent" auf 30% oder niedriger.
    8️⃣ **Die "match_percent"-Bewertung muss zur "reason" passen.** Falls die Reason besagt, dass die Aussage widerlegt wurde, muss "match_percent" unter 30% sein.
    9️⃣ Falls **Titel und Inhalt sich widersprechen**, zähle nur den Inhalt für die Bewertung.

    **WICHTIG: Gib KEINEN Markdown aus. Deine Antwort MUSS exakt diesem JSON-Format entsprechen:**
    {"match_percent": 85, "match_level": "hohe Übereinstimmung", "reason": "Die Aussage wird klar durch wissenschaftliche Studien auf der Webseite bestätigt."}

    Falls deine Antwort kein korrektes JSON ist, **korrigiere sie sofort und gib nur gültiges JSON aus.**`;

  const userMessage = `Hier ist die zu überprüfende Aussage:
    "${originalText}"

    Hier ist der Titel der Webseite:
    "${websiteTitle}"

    Und hier ist der relevante Inhalt der Website:
    "${websiteContent}"

    **Deine Aufgabe:** Bewerte die Übereinstimmung gemäß den obigen Regeln.  
    Falls du feststellst, dass die Aussage widerlegt wird, setze "match_percent" auf maximal 30%.  
    Falls du feststellst, dass die Aussage bestätigt wird, setze "match_percent" auf mindestens 70%.  
    Falls die Bewertung aus der "reason" nicht mit "match_percent" übereinstimmt, korrigiere "match_percent" entsprechend.

    **Gib nur ein JSON-Objekt zurück, ohne zusätzlichen Text oder Markdown.**`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1, // ✅ Sehr niedrige Temperatur für präzisere Antworten
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("Fehler bei GPT-Analyse:", error);
    return {
      match_percent: -0,
      match_level: "keine Übereinstimmung",
      reason: "Fehler beim Verarbeiten der Analyse.",
      title_conflict: false,
    };
  }
}

// Route für Websuche
router.post("/search", async (req, res) => {
  try {
    const { contentText, numResults } = req.body;
    if (!contentText) {
      return res.status(400).json({ error: "Kein Text zur Suche erhalten." });
    }
    const searchResults = await searchWeb(contentText, numResults);
    res.json({ results: searchResults });
  } catch (error) {
    console.error("Fehler bei der Websuche:", error);
    res.status(500).json({ error: "Fehler bei der Websuche." });
  }
});

// Route für Seitenanalyse
router.post("/analyze", async (req, res) => {
  try {
    const { contentText, site } = req.body;
    if (!contentText || !site || !site.url || !site.title) {
      return res.status(400).json({ error: "Ungültige Daten zur Analyse erhalten." });
    }
    let websiteContent = await fetchWebsiteContent(site.url);
    if (!websiteContent) {
      return res.status(404).json({ error: "Website konnte nicht geladen werden." });
    }
    let analysis = await analyzeFact(contentText, site.title, websiteContent);
    res.json({
      title: site.title,
      url: site.url,
      match_percent: analysis.match_percent,
      match_level: analysis.match_level,
      reason: analysis.reason,
    });
  } catch (error) {
    console.error("Fehler bei der Analyse:", error);
    res.status(500).json({ error: "Fehler bei der Analyse." });
  }
});

export default router;
