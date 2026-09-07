import express from "express";
import multer from "multer";
import fs from "fs";
import { callAI } from "../aiCall.js";

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 25 * 1024 * 1024 } });

// Realtime-Modell für das Live-Gespräch (Alias; bei Ablehnung "gpt-realtime-2.1" verwenden)
const REALTIME_MODEL = "gpt-realtime";
// Modell zum Auswerten des hochgeladenen PDF (aiConfig-Stufe "stark")
const PDF_MODEL = "anthropic/claude-sonnet-4-5";

// Route: PDF (Poster/Arbeit) hochladen und von einer KI zu einem Dossier auswerten
router.post("/analyse", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Kein PDF erhalten." });
    }
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Bitte ein PDF hochladen." });
    }

    const base64 = fs.readFileSync(req.file.path).toString("base64");
    const documents = [{ name: req.file.originalname, mediaType: "application/pdf", base64 }];

    const prompt = `Analysiere das beigefügte PDF (ein wissenschaftliches Poster oder eine Maturaarbeit/Facharbeit einer Schülerin oder eines Schülers).
Erstelle ein sachliches Dossier als Fliesstext für eine Prüferin oder einen Prüfer, gegliedert nach diesen Punkten:
- Titel & Fragestellung
- Wissenschaftlicher Kontext
- Methoden & Versuchsdetails
- Datenverarbeitung & Auswertung
- Ethische Aspekte
- Ökologische Aspekte
- Einsatz von KI
- Arbeitsorganisation in der Gruppe (falls erkennbar)
- Ergebnisse & Schlussfolgerungen
- Mögliche Schwachstellen und Nachfragepunkte für das Fachgespräch

Stütze dich ausschliesslich auf den Inhalt des PDF, erfinde nichts. Wenn zu einem Punkt nichts im PDF steht, vermerke das ausdrücklich.
Antworte in Fliesstext ohne Markdown-Formatierung.`;

    const dossier = await callAI(prompt, PDF_MODEL, 0.3, 1800, null, documents);
    res.json({ dossier });
  } catch (error) {
    console.error("Fehler bei der PDF-Auswertung:", error);
    res.status(500).json({ error: "Fehler beim Auswerten des PDF." });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

// Route für Realtime-Live-Gespräch: erzeugt einen kurzlebigen Client-Key
router.post("/realtimeSession", async (req, res) => {
  try {
    const { dossier, voice, voiceProfile, profileText } = req.body;
    if (!dossier || dossier.trim() === "") {
      return res.status(400).json({ error: "Auswertung des PDF fehlt!" });
    }

    const instructions = `Du bist Prüferin in einem Fachgespräch (Gymnasium) und führst mit einer Kandidatin oder einem Kandidaten ein Gespräch über deren eigenes wissenschaftliches Poster bzw. deren eigene Arbeit. Sprich auf Hochdeutsch.
Ziel: herausfinden, ob die Person ihr eigenes Werk wirklich versteht und selbst erarbeitet hat.
Ablauf: Begrüsse die Kandidatin oder den Kandidaten kurz und stelle dann sofort die erste Frage zur Arbeit. Stelle immer nur eine Frage auf einmal, höre die Antwort an, gehe darauf ein, hake bei Lücken, Unklarheiten oder Fehlern sachlich nach.
Decke nach und nach diese Aspekte ab: wissenschaftlicher Kontext und Fragestellung, Methoden- und Versuchsdetails, ethische Aspekte, ökologische Aspekte, Datenverarbeitung und Auswertung, Einsatz von KI bei der Arbeit, Arbeitsorganisation in der Gruppe (nur falls die Arbeit in einer Gruppe entstanden ist) sowie weitere sinnvolle Nachfragepunkte.
Sprich natürlich und gesprochen, halte deine Redebeiträge kurz.
Du darfst jederzeit unterbrochen werden – hör dann sofort auf zu sprechen und geh auf den Einwurf ein.
Das Gespräch dauert rund 6 bis 8 Minuten. Wenn die Zeit ungefähr um ist oder die Aspekte abgedeckt sind, beende das Gespräch mit einer kurzen mündlichen Gesamtrückmeldung (was war gut, wo sind Lücken).
Bleib durchgehend in der Rolle und brich sie nicht.

Grundlage (aus dem eingereichten PDF von einer KI zusammengefasst):
${dossier}

Charakter der Prüferin: ${profileText || "sachlich und fair"}
Sprechweise: ${voiceProfile || "natürlich und der Situation angemessen"}`;

    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          audio: {
            output: { voice: voice || "ash" },
            input: {
              transcription: { model: "gpt-4o-mini-transcribe", language: "de" },
              turn_detection: { type: "semantic_vad", interrupt_response: true, create_response: true },
            },
          },
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Fehler bei der Realtime-Session:", data);
      return res.status(500).json({ error: "Fehler beim Erstellen der Realtime-Session." });
    }

    res.json({ value: data.value, model: REALTIME_MODEL });
  } catch (error) {
    console.error("Fehler bei der Realtime-Session:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Realtime-Session." });
  }
});

export default router;
