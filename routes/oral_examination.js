import express from "express";
const router = express.Router();

// Realtime-Modell für das Live-Gespräch (Alias; bei Ablehnung "gpt-realtime-2.1" verwenden)
const REALTIME_MODEL = "gpt-realtime";

// Route für Realtime-Live-Gespräch: erzeugt einen kurzlebigen Client-Key
router.post("/realtimeSession", async (req, res) => {
  try {
    const { examContent, voice, voiceProfile, profileText } = req.body;
    if (!examContent || examContent.trim() === "") {
      return res.status(400).json({ error: "Prüfungsstoff fehlt!" });
    }

    const instructions = `Du bist Prüferin in einer mündlichen Prüfung (Gymnasium, Grundlagenfach) und führst ein Prüfungsgespräch auf Hochdeutsch.
Ablauf: Begrüsse den Prüfling kurz und stelle dann sofort die erste Frage zum Prüfungsstoff. Stelle immer nur eine Frage auf einmal, höre die Antwort an, gehe darauf ein, hake bei Lücken oder Fehlern nach und korrigiere sachlich. Frage nach und nach weitere Aspekte des Stoffs ab.
Sprich natürlich und gesprochen, halte deine Redebeiträge kurz.
Du darfst jederzeit unterbrochen werden – hör dann sofort auf zu sprechen und geh auf den Einwurf ein.
Die Prüfung dauert rund 5 Minuten. Wenn die Zeit ungefähr um ist oder der Stoff abgedeckt ist, beende das Gespräch mit einer kurzen mündlichen Gesamtrückmeldung (was war gut, wo sind Lücken).
Bleib durchgehend in der Rolle und brich sie nicht.

Prüfungsstoff:
${examContent}

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
