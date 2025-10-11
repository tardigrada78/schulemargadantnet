import { Router } from "express";
import multer from "multer";
import fs from "fs";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const router = Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024 } });


// Erstellt Antwort als Text
async function doChat(chatContent, chatProtocol) {
  const prompt = `Antworte auf diese Chat-Nachricht:
    ${chatContent}

    Berücksichtige den bisherigen Chatverlauf für das weitere Gespräch:
    ${chatProtocol}

    WICHTIG:
    - Antworte ausschliesslich auf Chinesisch, mit chinesischen Schriftzeichen
    - Gib keine generellen Antworten, sondern gehe auf die Chat-Nachricht ein
    - Dein Chatpartner ist ein Anfänger im Lernen von Chinesisch
    - Schreibe kurze und einfache Sätze
    - Halte dich kurz, antworte mit maximal 50 Zeichen
    - Verwende ein klares und sehr einfaches Vokabular. Orientiere dich an HSK1.
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
router.post("/getChat", async (req, res) => {
  try {
    const { chatContent, chatProtocol } = req.body;
    const result = await doChat(chatContent, chatProtocol);
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
      model: "whisper-1",
      language: "zh"
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