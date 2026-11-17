import { Router } from "express";
const router = Router();
import { callAI } from "../aiCall.js";

// Funktion um Satz zu schreiben
async function doEval(question, temperature) {
  const prompt = question + `   Antworte kurz und prägnant. Antworte nur als Text, nicht als HTML oder Makrdown.`
  return await callAI(prompt, "anthropic/claude-haiku-4-5-20251001", temperature, 1000);
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
