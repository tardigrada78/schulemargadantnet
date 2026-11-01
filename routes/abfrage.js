import { Router } from "express";
import { callAI } from "../aiCall.js";

const router = Router();

const MODEL = "anthropic/claude-haiku-5-5";

// Schwierigkeitsstufen 1-7 (Index 3 = Gymnasium)
const LEVELS = [
  "sehr simpel, ein Einstieg ins Thema: Grundbegriffe und Alltagswissen, kein Vorwissen nötig",
  "sehr einfach: grundlegende Begriffe und Zusammenhänge, deutlich unter Gymnasialniveau",
  "einfach: Stufe vor dem Gymnasium (Sekundarstufe I), Basiswissen zum Thema",
  "Gymnasium",
  "anspruchsvolles Gymnasium: Zusammenhänge erklären und Gelerntes anwenden",
  "sehr anspruchsvoll: vertieftes Verständnis, Transfer und Begründungen auf Maturitätsniveau",
  "höchste Stufe: Detailwissen, wie es in der Abschlussprüfung im Schwerpunktfach verlangt wird",
];

router.post("/question", async (req, res) => {
  try {
    const { topic, language, level, previousQuestions } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: "topic erforderlich." });
    }

    const languageName = language === "de" ? "Deutsch" : "Englisch";
    const levelText = LEVELS[Math.round(level) - 1] || LEVELS[3];
    const previous = Array.isArray(previousQuestions) ? previousQuestions : [];

    let prompt = `Erstelle eine Frage, die in einem Satz beantwortet werden kann, zu folgendem Thema bzw. folgenden Lernzielen. Stufe: ${levelText}.

Thema/Lernziele:
"""
${topic}
"""

Anforderungen:
- Die Frage ist fachlich korrekt, eindeutig formuliert und prüft genau einen Aspekt des Themas.
- Die Frage entspricht genau der genannten Stufe (nicht leichter, nicht schwerer) und verlangt kein Fachwissen ausserhalb der Lernziele.
- Die Frage ist so gestellt, dass die richtige Antwort in einem einzigen Satz gegeben werden kann.
- Formuliere die Frage auf ${languageName}.
- Gib NUR die Frage zurück: keine Antwort, keine Einleitung, keine Nummerierung, keine Anführungszeichen.`;

    if (previous.length > 0) {
      prompt += `

Folgende Fragen wurden bereits gestellt:
${previous.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Die neue Frage darf nicht gleich oder zu ähnlich zu einer dieser Fragen sein. Wähle einen anderen Aspekt des Themas.`;
    }

    // Höheres Token-Limit, da Claude 5.x vor der Antwort nachdenken kann
    const question = (await callAI(prompt, MODEL, 0.8, 2000)).trim();
    res.json({ question });
  } catch (error) {
    console.error("❌ Abfrage-Fehler:", error);
    res.status(500).json({ error: "Fehler bei der Fragegenerierung." });
  }
});

export default router;
