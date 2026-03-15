import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Du bist ein Experte für Ökobilanzen (Life Cycle Assessment) und hilfst Schülern,
die Umweltwirkung von Produkten zu verstehen.

Deine Aufgabe: Analysiere ein Produkt und zerlege es in 3–5 sinnvolle Teilkomponenten.
Für jede Teilkomponente und jede der 5 Dimensionen liefere einen realistischen Schätzwert.

Dimensionen:
- klima:     kg CO₂-Äquivalente (Treibhausgase über gesamten Lebenszyklus)
- wasser:    Liter Wasserverbrauch (inkl. virtuellem Wasser)
- land:      m² Flächenverbrauch (Anbau, Abbau, Produktion)
- transport: Punkte 1–100 (gewichteter Transportaufwand, 100 = sehr hoher globaler Transport)
- recycling: Score 1–10 (10 = vollständig recyclierbar, 1 = nicht recyclierbar)

Für jede Dimension:
- rohwert:     Zahl (physikalischer Wert gemäss Einheit oben)
- einheit:     passende Einheit als String
- quelle:      "ki-recherche" wenn auf bekannten Studien/Daten basiert, sonst "ki-annahme"
- begruendung: 1–2 Sätze, verständlich für Schüler (14–18 Jahre)

WICHTIG: Antworte AUSSCHLIESSLICH als gültiges JSON ohne Markdown-Backticks oder zusätzlichen Text.
Das JSON muss exakt dieser Struktur entsprechen:

{
  "produkt": "Produktname",
  "teilkomponenten": [
    {
      "name": "Name der Teilkomponente",
      "anteil": "kurze Beschreibung (z.B. '~30g Kunststoffverpackung')",
      "dimensionen": {
        "klima":     { "rohwert": 0.8,  "einheit": "kg CO₂eq", "quelle": "ki-recherche", "begruendung": "..." },
        "wasser":    { "rohwert": 48,   "einheit": "Liter",    "quelle": "ki-recherche", "begruendung": "..." },
        "land":      { "rohwert": 0.05, "einheit": "m²",       "quelle": "ki-annahme",   "begruendung": "..." },
        "transport": { "rohwert": 25,   "einheit": "Punkte",   "quelle": "ki-annahme",   "begruendung": "..." },
        "recycling": { "rohwert": 9,    "einheit": "Score",    "quelle": "ki-recherche", "begruendung": "..." }
      }
    }
  ]
}`;

function buildUserPrompt(produktName, anzahl) {
  return `Analysiere folgendes Produkt für eine Ökobilanz: "${produktName}"

Zerlege es in genau ${anzahl} sinnvolle Teilkomponenten (z.B. Verpackung, Inhalt/Rohstoff, Produktion, Transport, Entsorgung).
Schätze für jede Teilkomponente alle 5 Dimensionen mit realistischen Werten.

Gib nur das JSON zurück, ohne zusätzlichen Text oder Markdown.`;
}

// Route für Produktanalyse
router.post("/analyse", async (req, res) => {
  try {
    const { produktName, websuche, anzahlKomponenten } = req.body;
    const anzahl = Math.min(Math.max(parseInt(anzahlKomponenten) || 4, 1), 10);

    if (!produktName) {
      return res.status(400).json({ error: "Kein Produktname erhalten." });
    }

    const tools = websuche
      ? [{ type: "web_search_20250305", name: "web_search" }]
      : [];

    const messageParams = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(produktName, anzahl) }],
    };

    if (tools.length > 0) {
      messageParams.tools = tools;
    }

    const response = await client.messages.create(messageParams);

    // Text aus dem Content extrahieren (ggf. nach Web-Search-Tool-Use)
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) {
      return res.status(500).json({ error: "Keine Textantwort von der KI erhalten." });
    }

    // JSON aus Antwort extrahieren (robust gegen eventuelle Markdown-Reste)
    const rawText = textBlock.text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Kein JSON in Antwort gefunden:", rawText);
      return res.status(500).json({ error: "KI-Antwort konnte nicht als JSON geparst werden." });
    }

    const analyseDaten = JSON.parse(jsonMatch[0]);
    res.json(analyseDaten);

  } catch (error) {
    console.error("Fehler bei der Ökobilanz-Analyse:", error);
    res.status(500).json({ error: "Fehler bei der Analyse." });
  }
});

export default router;