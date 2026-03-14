import { Router } from "express";
import axios from "axios";
import xml2js from "xml2js";
import { callAI } from "../aiCall.js";

const router = Router();

// Diese Site verwendet die Stufe "stark" (gpt-4.1 / Sonnet / qwen2.5:14b)
const DEFAULT_MODEL = "openai/gpt-4.1";
const TEMPERATURE = 0.6;

// Funktion um Zusammenfassung zu erstellen
async function doSummary(text, words, lang, providerModel) {
  const prompt = `Schreibe eine prägnante Zusammenfassung welche die Inhalte und Schlussfolgerungen der folgenden Abstracts enthält:
    ${text}

    WICHTIG:
    - Analysiere genau und präzise, achte auf logische Zusammenhänge
    - Die Zusammenfassung muss auf den angegebenen Abstracts basieren, füge kein weiteres Wissen hinzu
    - Gib nur die Zusammenfassung zurück, ohne einleitenden Worte
    - Die Zusammenfassung soll ungefähr ${words} Worte umfassen
    - Schreibe die gesamte Zusammenfassung in der Sprache ${lang}
    `;
  return await callAI(prompt, providerModel, TEMPERATURE, 2000);
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
      return res.json({ abstracts: [] });
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

// Route für Zusammenfassung
router.post("/getSummary", async (req, res) => {
  try {
    const { text, words, lang, providerModel = DEFAULT_MODEL } = req.body;
    const result = await doSummary(text, words, lang, providerModel);
    res.json({ summary: result });
  } catch (error) {
    console.error("Fehler beim Erstellen der Zusammenfassung:", error);
    res.status(500).send("Fehler beim Erstellen der Zusammenfassung.");
  }
});

export default router;
