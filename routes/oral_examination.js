import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Erstellt Frage
async function doQuestion(content) {
  const prompt = `Erstelle eine Prüfungsfrage für eine mündliche Prüfung an einem Gymnasium. 
  Erstelle eine kreative, aber gut lösbare Frage. Verwende nicht das gesamte Thema sondern wähle clever einen Aspekt aus. 
  Nenne die Erwarungen an die Antwort. Der generierte Text soll kurz und prägnant sein, maximal 50 Wörter. 
  Verwende eine eindeutige und klare Sprache ohne Titel und Formatierung: Der Output wird später gesprochen wiedergegeben. 
  Sprich den Prüfling direkt an (also "du" anstatt "der Schüler").
  Die Frage soll dieses Thema umfassen: ${content}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "user", content: prompt }
    ],
    temperature: 0.8,
  });
  return response.choices[0].message.content;
}

// Erstellt Audio-Ausgabe
async function doAudio(content, voice, voiceProfile) {
  console.log(content, voice, voiceProfile)
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice,
      instructions: voiceProfile,
      input: content,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// Route für Frage
router.post("/getQuestion", async (req, res) => {
  try {
    const { properties } = req.body;
    const response = await doQuestion(properties);
    res.json({ question: response });
  } catch (error) {
    console.error("Fehler beim Generieren der Frage:", error);
    res.status(500).send("Fehler beim Generieren der Frage.");
  }
});

// Route für Audioausgabe
router.post("/getAudio", async (req, res) => {
  const { content, voice, voiceProfile } = req.body;
  try {
    const dataAudio = await doAudio(content, voice, voiceProfile); // Base64-String
    res.json({ audio: dataAudio });
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});


export default router;
