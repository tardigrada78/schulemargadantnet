import express from "express";
const router = express.Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Erstellt Feedback einer Person
async function doFeedback(auftrag, characterProfile) {
const prompt = `Du bist folgende Person: 
  ${characterProfile}

  Du erhältst von deiner Lehrperson den beigelegten Auftrag. Fühle dich in deine Person ein und gib eine authentische Rückmeldung, 
  wie du diesen Auftrag erlebt hast und wie gut du ihn erfüllen konntest. 

  Wichtig:
  - Gib nur dann kritisches Feedback, wenn der Auftrag tatsächlich problematisch für dich ist
  - Wenn der Auftrag für dich gut funktioniert, sage das auch ehrlich
  - Sei konstruktiv: Erkläre konkret, was dir geholfen oder geschadet hat
  - Deine Antwort soll nicht mehr als 200 Wörter umfassen
  - Fasse den Auftrag nicht noch einmal zusammen
  - Antworte natürlich und authentisch, nicht übertrieben dramatisch

  Auftrag:
   \n${auftrag}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Korrigiert: gpt-4o-mini statt gpt-5-mini
    messages: [{ role: "user", content: prompt }],
  });
  return response.choices[0].message.content;
}

// Route für Feedback einer Person generieren
router.post("/getFeedback", async (req, res) => {
  try {
    const { properties, characterProfile } = req.body;
    // if (!properties || properties.trim() === "") {
    //   return res.status(400).json({ error: "Eigenschaften fehlen!" });
    // }
    const content = await doFeedback(properties, characterProfile);
    res.json({ content });
  } catch (error) {
    console.error("Fehler beim Erstellen des Feedbacks:", error);
    res.status(500).send("Fehler beim Erstellen des Feedbacks.");
  }
});

export default router;