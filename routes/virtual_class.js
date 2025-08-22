import express from "express";
const router = express.Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vision API Feedback einer Person
async function doVisionFeedback(imageBase64, characterProfile) {
  const prompt = `Du bist folgende Person: 
${characterProfile}

Du erhältst von deiner Lehrperson das beigelegte Unterrichtsmaterial. Schaue es dir genau an und gib eine authentische Rückmeldung, wie du dieses Material erlebt hast und wie gut du damit arbeiten könntest.

Wichtig:
- Analysiere ALLES: Text, Layout, Bilder, Diagramme, Farben, Struktur
- Gib nur dann kritisches Feedback, wenn das Material tatsächlich problematisch für dich ist
- Wenn das Material für dich gut funktioniert, sage das auch ehrlich
- Sei konstruktiv: Erkläre konkret, was dir hilft oder schadet
- Berücksichtige visuelle Aspekte (Schriftgröße, Übersichtlichkeit, Diagramme etc.)
- Deine Antwort soll nicht mehr als 200 Wörter umfassen
- Antworte natürlich und authentisch, nicht übertrieben dramatisch

Schaue dir das Material jetzt genau an und gib dein Feedback:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageBase64
            }
          }
        ]
      }
    ],
    max_tokens: 300
  });
  return response.choices[0].message.content;
}

// Route für Vision-basiertes Feedback
router.post("/getFeedback", async (req, res) => {
  try {
    const { imageBase64, characterProfile } = req.body;
    if (!imageBase64 || !characterProfile) {
      return res.status(400).json({ error: "Bild oder Charakterprofil fehlt" });
    }
    console.log("Verarbeite Feedback für Charakter...");
    const content = await doVisionFeedback(imageBase64, characterProfile);
    res.json({ content });
  } catch (error) {
    console.error("Fehler beim Vision-Feedback:", error);
    res.status(500).json({ error: "Fehler bei der Analyse: " + error.message });
  }
});

export default router;