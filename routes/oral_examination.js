import { Router } from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const router = Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024 } });


// Erstellt Prüfungsfrage als Text
async function doQuestion(questionContent) {
  const prompt = `Erstelle eine Prüfungsfrage zu diesem Lernstoff:
    ${questionContent}

    WICHTIG:
    - Schreibe eine klare Frage in einem Satz
    - Die Frage muss klar zum Thema passen. Falls das Thema sehr gross ist, wähle einen Bereich aus
    - Die Frage muss von einem Schüler des Gymnasiums Grundlagenfach beantwortbar sein
    - Die Frage sollte in maximal 5 Minuten beantwortbar sein
    - Die Frage wird für eine mündliche Prüfung verwendet. Schreibe also prägnant und vermeide komplizierte Satzstrukturen.
    `;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}

// Erstellt Antwort als Text
async function doChat(chatContent, questionAI, profileText) {
  const prompt = `Antworte auf diese Prüfungsantwort:
    ${chatContent}

    wobei dies die Prüfungsfrage war:
    ${questionAI}

    dein Charakter ist der folgende. Berücksichtige ihn in einem realistischen Ausmass.
    ${profileText}

    WICHTIG:
    - Die Antwort sollte die Anforderungen eines Gymnasialschülers im Grundlagenfach erfüllen
    - Gib eine prägnante fachliche Rückmeldung
    - Verliere dich nicht in Details
    - Schweife nicht ab mit allgemein Ratschlägen und Kommentaren
    - Beginne mit einer Gesamteinschätzung, erzähle dann das Positive und am Ende was verbessert werden kann
    `;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}


// Generiert Audio aus Text
async function doAudio(content, voice, voiceProfile) {
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


// Route für Textchat
router.post("/getQuestion", async (req, res) => {
  try {
    const { questionContent } = req.body;
    const result = await doQuestion(questionContent);
    res.json({ chatAnswer: result });
  } catch (error) {
    console.error("Fehler beim Schreiben der Frage", error);
    res.status(500).send("Fehler beim Schreiben der Frage.");
  }
});

// Route für Textchat
router.post("/getChat", async (req, res) => {
  try {
    const { chatContent, questionAI, profileText } = req.body;
    const result = await doChat(chatContent, questionAI, profileText);
    res.json({ chatAnswer: result });
  } catch (error) {
    console.error("Fehler beim Schreiben des Chats", error);
    res.status(500).send("Fehler beim Schreiben des Chats.");
  }
});

// Route für Audio
router.post("/getAudio", async (req, res) => {
  const { content, voice, voiceProfile } = req.body;
  try {
    const dataAudio = await doAudio(content, voice, voiceProfile);
    res.json({ audio: dataAudio });
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

// Route für Sprachtranskription
router.post("/transcribe", upload.single('audio'), async (req, res) => {
  let tempFilePath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine Audio-Datei empfangen" });
    }
    tempFilePath = req.file.path;
    const extension = req.file.originalname.split('.').pop() || 'webm';
    const renamedPath = tempFilePath + '.' + extension;
    try {
      fs.copyFileSync(tempFilePath, renamedPath);
      tempFilePath = renamedPath;
    } catch (copyError) {
      console.error("Fehler beim Kopieren:", copyError);
    }
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1"
    });
    res.json({ transcript: transcription.text });
  } catch (error) {
    console.error("❌ Transkription-Fehler:", error.message);
    res.status(500).json({ error: `Transkription fehlgeschlagen: ${error.message}` });
  } finally {
    // Cleanup - beide möglichen Dateien löschen
    [req.file?.path, tempFilePath].forEach(path => {
      if (path && fs.existsSync(path)) {
        try {
          fs.unlinkSync(path);
        } catch (deleteError) {
          console.error("Fehler beim Löschen:", deleteError);
        }
      }
    });
  }
});

export default router;