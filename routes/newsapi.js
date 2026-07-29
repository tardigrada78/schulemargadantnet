import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
import NewsAPI from "newsapi"; // https://newsapi.org/
const newsapi = new NewsAPI(process.env.NEWS_API_KEY);
import moment from "moment";

// Erstellt KI-Wochenschau
async function doSummary(data) {
  const prompt = `Du erhältst aktuelle News-Artikel. Erstelle einen packenden Radio-Podcast-Beitrag von maximal 250 Wörtern.

Anforderungen:
- Fokussiere dich auf die wichtigsten und bedeutendsten News
- Nenne konkrete Zahlen, Namen und Entdeckungen – keine vagen Formulierungen
- Kurze, aktive Sätze – kein akademischer Stil
- Keine Füllsätze ("Diese Entwicklungen zeigen...", "Es bleibt abzuwarten...")
- Kein Titel, keine Formatierung, kein Abschlusssatz mit Metakommentar
- Nur fliessender Text, der direkt vorgetragen werden kann
- Schreibe auf Deutsch

Artikel:
${data}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text.trim();
}

// Erstellt Podcast
async function doPodcast(data) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      instructions:
        "Sprich mit einer klaren, selbstbewussten Stimme, in zügigem, aber gleichmäßigem Tempo, mit einem sachlichen und dennoch enthusiastischen Ton, der Spannung und Relevanz vermittelt, während du präzise und auf den Punkt berichtest.",
      input: data,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// Sammelt Science-News mit Fokus auf Biologie, dann andere Naturwissenschaften, Medizin und Technik
router.get("/getScienceNews", async (req, res) => {
  try {
    const startData = moment().subtract(3, "days").format("YYYY-MM-DD");
    const keywords = [
      // Biologie (höchste Priorität)
      "biology", "genetics", "DNA", "evolution", "ecology", "biodiversity",
      "molecular biology", "cell biology", "biotechnology",

      // Andere Naturwissenschaften
      "chemistry", "physics", "astronomy", "geology", "climate science",
      "environmental science", "marine science", "neuroscience",

      // Medizin
      "medical research", "pharmaceutical", "drug discovery", "disease", "treatment",

      // Technik
      "renewable energy", "space technology"
    ].join(" OR ");
    console.log("API:", process.env.NEWS_API_KEY)
    const response = await newsapi.v2.everything({
      q: keywords,
      from: startData,
      sortBy: "relevancy",
      language: "en",
      pageSize: 100
    });
    res.json(response);
  } catch (error) {
    console.error("Error fetching science news:", error);
    res.status(500).json({ error: "Failed to fetch science news" });
  }
});


// Sammelt AI-News
router.get("/getAINews", async (req, res) => {
  try {
    const startData = moment().subtract(3, "days").format("YYYY-MM-DD");
    const keywords = [
      "AI in biology", "AI education", "AI in schools"
    ].join(" OR ");

    const response = await newsapi.v2.everything({
      q: `${keywords} -cybersecurity -hack -threat -attack -breach`,
      from: startData,
      sortBy: "relevancy",
      language: "en",
      pageSize: 100
    });
    res.json(response);
  } catch (error) {
    console.error("Error fetching AI news:", error);
    res.status(500).json({ error: "Failed to fetch AI news" });
  }
});


// Sammelt globale News zu Politik und wichtigen Ereignissen
router.get("/getglobalNews", async (req, res) => {
  try {
    const startData = moment().subtract(3, "days").format("YYYY-MM-DD");
    const keywords = [
      "global politics", "international relations", "world leaders",
      "diplomatic crisis", "trade war", "summit",
      "government collapse", "military conflict",
      "peace agreement", "economic crisis", "inflation", "recession",
      "currency crisis", "natural disaster",
      "climate change", "pandemic", "humanitarian crisis",
      "refugee crisis", "international law", "UN Security Council",
      "G7", "G20", "BRICS", "NATO", "EU politics"
    ].join(" OR ");

    const response = await newsapi.v2.everything({
      q: `(${keywords}) -local -city -county -municipal -entertainment -celebrity -gossip -fashion`,
      from: startData,
      sortBy: "relevancy",
      language: "en",
      pageSize: 100
    });
    res.json(response);
  } catch (error) {
    console.error("Error fetching global news:", error);
    res.status(500).json({ error: "Failed to fetch global news" });
  }
});


// Route für KI-Zusammenfassung
router.post("/getSummary", async (req, res) => {
  const { data } = req.body;
  try {
    const summary = await doSummary(data);
    res.json({ summary });
  } catch (error) {
    console.error("Fehler beim Generieren der Zusammenfassung:", error);
    res.status(500).send("Fehler beim Generieren der Zusammenfassung.");
  }
});

// Route für Podcast
router.post("/getPodcast", async (req, res) => {
  const { data } = req.body;
  try {
    const speech = await doPodcast(data); // Base64-String
    res.json({ speech }); // JSON mit Base64-String zurückgeben
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

export default router;
