import express from "express";
const router = express.Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Realtime-Modell für das Live-Gespräch (Alias; bei Ablehnung "gpt-realtime-2.1" verwenden)
const REALTIME_MODEL = "gpt-realtime";

// Erstellt Interview-Person
async function generatePerson(properties) {
  const prompt = `Gib eine präzise Personenbeschreibung mit Fokus auf Charaktereigenschaften an.\n
    Überschreite dabei aber nicht 150 Wörter. Berücksichtige stark die folgenden Eigenschaften:\n${properties}`;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });
  return response.choices[0].message.content;
}

// Befragt Interview-Person
async function askPerson(properties, question) {
  const prompt = `Die folgende Person beantwortet diese Interviewfrage mit höchstens 150 Wörtern.\n
    Frage:\n"${question}"\n\n
    Person:\n${properties}\n`;
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
  });
  return response.choices[0].message.content;
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
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: gptprompt,
      n: 1,
      size: "1024x1024",
    });
    return response.data[0].b64_json;
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    throw new Error("Fehler beim Generieren des Bildes.");
  }
}

// Audio-Ausgabe
async function generateSpeech(story, voice, voiceProfile) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voice,
      instructions: voiceProfile,
      input: story,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
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
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
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
