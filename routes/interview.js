import express from "express";
const router = express.Router();
import { callAI } from "../aiCall.js";
import { geminiImage, geminiSpeech } from "../geminiCall.js";

// Realtime-Modell für das Live-Gespräch (Alias; bei Ablehnung "gpt-realtime-2.1" verwenden)
const REALTIME_MODEL = "gpt-realtime";

// Textmodell für Person, Antworten und Stimmenprofil
const TEXT_MODEL = "anthropic/claude-haiku-5-5";

// Zuordnung der OpenAI-Stimmen (Dropdown, Realtime) zu Gemini-Stimmen (Sprachausgabe im Textmodus)
const GEMINI_VOICES = {
  alloy: "Zephyr",
  ash: "Charon",
  ballad: "Sulafat",
  coral: "Aoede",
  echo: "Puck",
  sage: "Kore",
  shimmer: "Leda",
  verse: "Fenrir",
  marin: "Achernar",
  cedar: "Orus",
};

// Erstellt Interview-Person
async function generatePerson(properties) {
  const prompt = `Gib eine präzise Personenbeschreibung mit Fokus auf Charaktereigenschaften an.\n
    Überschreite dabei aber nicht 150 Wörter. Berücksichtige stark die folgenden Eigenschaften:\n${properties}`;
  return await callAI(prompt, TEXT_MODEL, 0.8, 3000);
}

// Befragt Interview-Person
async function askPerson(properties, question) {
  const prompt = `Die folgende Person beantwortet diese Interviewfrage mit höchstens 150 Wörtern.\n
    Frage:\n"${question}"\n\n
    Person:\n${properties}\n`;
  return await callAI(prompt, TEXT_MODEL, 0.8, 3000);
}

// Erstellt Portrait-Foto
async function getPicture(description) {
  const gptprompt = `Erstelle ein hochauflösendes (1024×1024), fotorealistisches Porträt basierend auf folgender Beschreibung:

    "${description}"

    Vorgaben:
    - Extrem realistische Details: sichtbare Hautstruktur, feine Haarsträhnen, realistische Lichtreflexionen.
    - Natürliche Ausstrahlung: authentische Mimik und dezente Gesichtsausdrücke.
    - Beleuchtung wie bei professionellen Porträtshootings: weiches Schlüssellicht, sanfte Schatten, subtile Hintergrundbeleuchtung für Tiefenwirkung.
    - Schärfentiefe: Fokus auf das Gesicht, weicher Bokeh-Hintergrund.
    - Hintergrund: dezent und thematisch passend, ohne ablenkende Elemente.
    - Kein übermäßiges Glätten oder künstliche Filter– absolute Echtheit.
    - Keine Schrift, Logos oder grafischen Overlays.
    - Komposition: zentriert, harmonisch und ausgewogen, als würde es ein Profi-Fotograf rahmen.
    `;

  try {
    return await geminiImage(gptprompt);
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    throw new Error("Fehler beim Generieren des Bildes.");
  }
}

// Audio-Ausgabe
async function generateSpeech(story, voice, voiceProfile) {
  try {
    return await geminiSpeech(story, voiceProfile, GEMINI_VOICES[voice] || "Charon");
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// Erstellt Stimmenprofil
async function doVoiceProfile(interviewPerson) {
  const prompt = `Erstelle eine Instruktion in einem Satz für die Stimmausgabe dieser Person. 
    Der Satz wird von einer KI für die Stimmausgabe verwendet. 
    Beschreibe ausschliesslich klangliche und stimmliche Elemente, keine Inhalte.

    Person: 
    "${interviewPerson.person}"`;
  return await callAI(prompt, TEXT_MODEL, 0.6, 2000);
}

// Routen

// Route für Person generieren
router.post("/startInterview", async (req, res) => {
  try {
    const { properties } = req.body;
    if (!properties || properties.trim() === "") {
      return res.status(400).json({ error: "Eigenschaften fehlen!" });
    }
    const person = await generatePerson(properties);
    res.json({ person });
  } catch (error) {
    console.error("Fehler beim Generieren der Person:", error);
    res.status(500).send("Fehler beim Generieren der Person.");
  }
});

// Route für Fragen beantworten
router.post("/askPerson", async (req, res) => {
  try {
    const { properties, question } = req.body;
    if (!properties || properties.trim() === "") {
      return res.status(400).json({ error: "Eigenschaften fehlen!" });
    }
    const person = await askPerson(properties, question);
    res.json({ person });
  } catch (error) {
    console.error("Fehler beim Befragen der Person:", error);
    res.status(500).send("Fehler beim Befragen der Person.");
  }
});

// Route für Bild
router.post("/generatePicture", async (req, res) => {
  const { description } = req.body;
  try {
    const imageBase64 = await getPicture(description);
    res.json({ image: imageBase64 });
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    res.status(500).send("Fehler beim Generieren des Bildes.");
  }
});

// Route für Audio-Ausgabe
router.post("/getSpeech", async (req, res) => {
  const { story, voice, voiceProfile } = req.body;
  try {
    const speechData = await generateSpeech(story, voice, voiceProfile);
    res.json({ speech: speechData });
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

// Route für Realtime-Live-Gespräch: erzeugt einen kurzlebigen Client-Key
router.post("/realtimeSession", async (req, res) => {
  try {
    const { personDescription, voice, voiceProfile } = req.body;
    if (!personDescription || personDescription.trim() === "") {
      return res.status(400).json({ error: "Personenbeschreibung fehlt!" });
    }

    const instructions = `Du bist die folgende Person und wirst in einem mündlichen Interview befragt.
Sprich natürlich, gesprochen und auf Hochdeutsch. Antworte nicht zu lang.
Du darfst jederzeit unterbrochen werden – hör dann sofort auf zu sprechen und geh auf den Einwurf ein.
Wenn eine Frage unklar ist oder du einen Punkt vertiefen möchtest, stelle der interviewenden Person auch mal selbst eine kurze Rückfrage.
Bleib durchgehend in der Rolle und brich sie nicht.

Person:
${personDescription}

Sprechweise: ${voiceProfile || "natürlich und der Person angemessen"}`;

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

// Route um Stimmenprofil zu generieren
router.post("/getVoiceProfile", async (req, res) => {
  try {
    const { interviewPerson } = req.body;
    const voiceProfile = await doVoiceProfile(interviewPerson);
    res.json({ voiceProfile });
  } catch (error) {
    console.error("Fehler beim Generieren des Stimmenprofils:", error);
    res.status(500).send("Fehler beim Generieren des timmenprofils.");
  }
});

export default router;
