import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import NewsAPI from "newsapi"; // https://newsapi.org/
const newsapi = new NewsAPI(process.env.NEWS_API_KEY);
import moment from "moment";

// Erstellt KI-Wochenschau
async function doSummary(data) {
  const prompt = `Du erhältst eine Sammlung von aktuellen News-Artikeln. 
  Erstelle eine kompakte Wochenschau, die die wichtigsten Highlights der letzten Tage zusammenfasst. 
  Die Übersicht soll prägnant und leicht lesbar sein, ohne dass wichtige Themen ausgelassen werden. 

  Fokus:
  - Gliedere den Text thematisch.
  - Erwähne Hauptthemen, Entdeckungen, Ereignisse oder relevante Entwicklungen.
  - Fasse alles zu einem flüssigen Text zusammen, der als Rückblick und Übersicht dient.
  - Schreibe kein Schlusswort in Form von so etwas wie "Diese Entwicklungen...". 
  - Füge keine Titel oder andere Formatierungen hinzu. Schreibe auf Deutsch in einer wissenschaftich präzisen, aber lebendigen Sprache. 
  - Schreibe den Text so, dass er als Podcast vorgetragen werden kann. 

  Artikel:
  ${data}
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content.trim();
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
