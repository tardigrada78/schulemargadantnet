import { Router } from "express";
import axios from "axios";
import xml2js from "xml2js";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const router = Router();

// Funktion um Zusammenfassung zu erstellen
async function doSummary(text, words, lang) {
  const prompt = `Schreibe eine prägnante Zusammenfassung welche die Inhalte und Schlussfolgerungen der folgenden Abstracts enthält:
    ${text}

    WICHTIG:
    - Analysiere genau und präzise, achte auf logische Zusammenhänge
    - Die Zusammenfassung muss auf den angegebenen Abstracts basieren, füge kein weiteres Wissen hinzu
    - Gib nur die Zusammenfassung zurück, ohne einleitenden Worte
    - Die Zusammenfassung soll ungefähr ${words} Worte umfassen
    - Schreibe die gesamte Zusammenfassung in der Sprache ${lang}
    `;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}

// Suche PubMed
router.get("/search", async (req, res) => {
  const { term, abstractsNum } = req.query;
  try {
    // Schritt 1: Suche
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      term
    )}&retmax=${abstractsNum}&retmode=json`;
    const searchResponse = await axios.get(searchUrl);
    const idList = searchResponse.data.esearchresult.idlist;
    if (!idList || idList.length === 0) {
      console.log("Keine PubMed IDs gefunden.");
      return res.json({ abstracts: [] }); // Frühzeitig abbrechen
    }
    // Schritt 2: Abstracts holen
    const ids = idList.join(",");
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml`;
    const fetchResponse = await axios.get(fetchUrl);
    // Schritt 3: XML parsen
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(fetchResponse.data);
    const articles = result?.PubmedArticleSet?.PubmedArticle || [];
    const abstracts = [];
    for (const article of articles) {
      const pmid = article.MedlineCitation[0].PMID[0]._;
      const abstractObj = article.MedlineCitation[0].Article[0].Abstract;
      const abstractText = abstractObj ? abstractObj[0].AbstractText.map((t) => t._ || t).join(" ") : null;
      // nur längere Abstracts
      if (abstractText && abstractText.length > 50) {
        abstracts.push({
          pmid: `<a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank">${pmid}</a>`,
          abstractText,
        });
      }
    }
    res.json({ abstracts });
  } catch (err) {
    console.error("PubMed API Fehler:", err);
    res.status(500).json({ error: "PubMed Anfrage fehlgeschlagen: " + err.message });
  }
});

// Route für Zusammenfassung zu schreiben
router.post("/getSummary", async (req, res) => {
  try {
    const { text, words, lang } = req.body;
    const result = await doSummary(text, words, lang);
    res.json({ summary: result });
  } catch (error) {
    console.error("Fehler beim Erstellen der Zusammenfassung:", error);
    res.status(500).send("Fehler beim Erstellen der Zusammenfassung.");
  }
});

export default router;
