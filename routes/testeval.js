import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Funktion um Satz zu schreiben
async function doEval(question, temperature) {
  const prompt = question + `   Antworte kurz und prägnant. Antworte nur als Text, nicht als HTML oder Makrdown.`
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [{ role: "user", content: prompt }],
    temperature: temperature, 
  });
  return response.choices[0].message.content;
}

// Route für Satz-Generierung
router.post("/getEval", async (req, res) => {
  try {
    const sentence = await doEval(req.body.question, req.body.temperature);
    res.json({ sentence });
  } catch (error) {
    console.error("Fehler beim Generieren der Evaluation:", error);
    res.status(500).send("Fehler beim Generieren der Evaluation.");
  }
});

export default router;
