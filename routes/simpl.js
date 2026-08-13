import express from "express";
const router = express.Router();
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post("/simplify", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Kein Text angegeben." });
  }

  const prompt = `Verwandle den folgenden Text in Leichte Sprache. 
Halte dich strikt an diese Richtlinien:
- Verwende vorzugsweise aktive Formulierungen. Schreibe möglichst positiv, vermeide doppelte Verneinungen.
- Schließe alle Menschen mit ein und verwende gendergerechte Sprache.
- Vermeide Formulierungen, die kulturelles oder sprachliches Wissen voraussetzen oder die Fähigkeit erfordern, «zwischen den Zeilen zu lesen».
- Verwende keine langen, komplizierten Sätze mit vielen Einschüben und Nebensätzen.
- Nutze einfache Worte, die möglichst geläufig, konkret und bekannt sind. Vermeide Akronyme, Abkürzungen, Fremd- und Fachbegriffe. Wenn das nicht möglich ist, erkläre diese.
- Unterteile lange zusammengesetzte Wörter für eine bessere Lesbarkeit mit Bindestrichen.
- Verwende das gleiche Wort oder Bild für die gleiche Sache.
- Ordne die Informationen in einer logischen Reihenfolge an. Vermeide Wiederholungen.
- Gliedere den Text mit Überschriften, Absätzen und Aufzählungen. 
- Schreibe jeden Satz in eine neue Zeile.
- Verwende das geläufige Format (z.B. Telefonnummern unterteilen).
- Schreibe Ziffern statt Zahlwörter.

Text:
${text}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const simplifiedText = msg.content[0].text;
    res.json({ simplifiedText });
  } catch (error) {
    console.error("Error calling Anthropic API:", error);
    res.status(500).json({ error: "Fehler bei der Verarbeitung des Textes." });
  }
});

export default router;