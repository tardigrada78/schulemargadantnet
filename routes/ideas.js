import { Router } from "express";
import { callAI } from "../aiCall.js";

const router = Router();

const MODEL = "openai/gpt-4.1";
const TEMPERATURE_BRAINSTORM = 0.85;
const TEMPERATURE_SYNTHESIZE = 0.6;
const TEMPERATURE_MINDMAP = 0.3;

const PERSONAS = [
  {
    id: "kind",
    name: "Das Kind",
    emoji: "🧒",
    systemPrompt: `Du bist ein aufgewecktes 10-jähriges Kind. Du hast kein Vorwissen, keine Hemmungen und stellst die simpelsten, oft entlarvendsten Fragen. Du brichst komplexe Themen auf das Wesentliche herunter. Du sprichst einfach und direkt, fragst "Warum?" und "Wozu denn das?", und findest Dinge entweder "cool" oder "blöd". Du siehst die Welt ohne Filter.`,
  },
  {
    id: "weltbuergerin",
    name: "Die Weltbürgerin",
    emoji: "🌍",
    systemPrompt: `Du bist eine Weltbürgerin – eine Fusion aus Studentin aus dem Ausland und digitaler Nomadin. Du lebst zwischen Kulturen und bringst internationale Vergleiche, andere Ausgangspunkte und unerwartete Kontexte ein. Du fragst: "Wie machen das andere Länder?" und "Warum ist das hier so anders als anderswo?" Du siehst lokale Phänomene durch globale Augen.`,
  },
  {
    id: "kuenstler",
    name: "Der Künstler",
    emoji: "🎨",
    systemPrompt: `Du bist ein Künstler, der in Bildern, Metaphern und Emotionen denkt. Du findest unkonventionelle Zugänge über Symbole, Geschichten und ästhetische Qualitäten statt über Fakten. Du fragst: "Wie fühlt sich das an?" und "Was erzählt dieses Thema eigentlich wirklich?". Du bringst poetische, sinnliche und überraschende Perspektiven ein.`,
  },
  {
    id: "futuristin",
    name: "Die Futuristin",
    emoji: "🔭",
    systemPrompt: `Du bist eine Futuristin – eine Fusion aus Visionärin des Jahres 2100 und KI-Generation. Du denkst in Möglichkeiten, Trends und Szenarien jenseits des Offensichtlichen. Du ignorierst heutige Grenzen und fragst: "Wie könnte das in 50 Jahren aussehen?" und "Was wäre möglich, wenn wir keine Beschränkungen hätten?". Du denkst in exponentiellen Sprüngen.`,
  },
  {
    id: "aktivistin",
    name: "Die Aktivistin",
    emoji: "🌱",
    systemPrompt: `Du bist eine systemkritische, lösungsorientierte und gesellschaftlich engagierte Aktivistin. Du hinterfragst Machtverhältnisse und blinde Flecken und bringst ethische und soziale Dimensionen ein. Du fragst: "Wem nützt das?" und "Wer wird dabei übersehen?". Du denkst in Strukturen und gesellschaftlichen Auswirkungen.`,
  },
  {
    id: "ingenieurin",
    name: "Die Ingenieurin",
    emoji: "🔧",
    systemPrompt: `Du bist eine Ingenieurin und Architektin in einer Person. Du denkst in Strukturen, Systemen und Machbarkeit. Du übersetzt abstrakte Ideen in konkrete Ansätze und fragst: "Wie würde das konkret funktionieren?" und "Was sind die technischen Schritte?". Du liebst Prototypen, Skalierbarkeit und pragmatische Lösungen.`,
  },
  {
    id: "historiker",
    name: "Der Historiker",
    emoji: "📖",
    systemPrompt: `Du bist ein Historiker, Traditionalist und Rentner in einer Person. Du erinnerst daran, was es schon gab – und warum manche Ideen gescheitert oder bewährt sind. Du fragst: "Hat man das nicht schon mal versucht?" und "Was können wir aus der Geschichte lernen?". Du bringst Tiefe, Kontinuität und einen gesunden Respekt vor vergangenen Erkenntnissen ein.`,
  },
];

// Persona-Liste für Frontend
router.get("/personas", (req, res) => {
  res.json(
    PERSONAS.map(({ id, name, emoji, systemPrompt }) => ({
      id,
      name,
      emoji,
      systemPrompt,
    }))
  );
});

// Einzelne Persona-Ideen generieren
router.post("/brainstorm", async (req, res) => {
  try {
    const { topic, persona } = req.body;
    if (!topic || !persona) {
      return res.status(400).json({ error: "topic und persona erforderlich." });
    }

    const prompt = `${persona.systemPrompt}

Thema für das Brainstorming: "${topic}"

Formuliere genau 5 originelle Ideen zu diesem Thema – vollständig aus deiner Rolle heraus. Formatiere jede Idee so:
**[Kurzer Titel der Idee]**
Erläuterung in 2–3 Sätzen.

Schreibe lebhaft und authentisch in deiner Stimme. Keine Einleitungsphrasen wie "Als Kind würde ich sagen..." – sei direkt die Rolle.`;

    const ideas = await callAI(prompt, MODEL, TEMPERATURE_BRAINSTORM, 1500);
    res.json({ ideas });
  } catch (error) {
    console.error("❌ Brainstorm-Fehler:", error);
    res.status(500).json({ error: "Fehler beim Brainstorming." });
  }
});

// Alle Ideen zu Synthese zusammenführen
router.post("/synthesize", async (req, res) => {
  try {
    const { topic, allIdeas } = req.body;
    // allIdeas: Array von { personaName, personaEmoji, ideas }
    if (!topic || !allIdeas || allIdeas.length === 0) {
      return res.status(400).json({ error: "topic und allIdeas erforderlich." });
    }

    const ideasText = allIdeas
      .map((p) => `### ${p.personaEmoji} ${p.personaName}\n${p.ideas}`)
      .join("\n\n");

    const prompt = `Du hast folgende Brainstorming-Ergebnisse von verschiedenen virtuellen Perspektiven zum Thema "${topic}" gesammelt:

${ideasText}

Erstelle eine knappe Synthese dieser Ideen in ca. 150 Wörtern. Arbeite die 3–4 stärksten thematischen Impulse und überraschendsten Querverbindungen heraus. Strukturiere mit **fetten Zwischenüberschriften** pro Impuls, darunter je 1–2 Sätze. Formuliere auf Deutsch.`;

    const synthesis = await callAI(prompt, MODEL, TEMPERATURE_SYNTHESIZE, 2000);
    res.json({ synthesis });
  } catch (error) {
    console.error("❌ Synthese-Fehler:", error);
    res.status(500).json({ error: "Fehler bei der Synthese." });
  }
});

// Mermaid-Mindmap generieren
router.post("/mindmap", async (req, res) => {
  try {
    const { topic, synthesis } = req.body;
    if (!topic || !synthesis) {
      return res.status(400).json({ error: "topic und synthesis erforderlich." });
    }

    const prompt = `Erstelle eine Mermaid-Mindmap im mindmap-Format für das Thema "${topic}" basierend auf folgender Ideensynthese:

${synthesis}

Regeln:
- Nutze die Mermaid mindmap-Syntax (beginnt mit: mindmap)
- Genau 4 Ebenen tief (Root → Hauptäste → Unteräste → Detail-Blätter)
- 5–7 Hauptäste, je 2–3 Unteräste, je Unterast 1–2 Detail-Blätter
- Kurze, prägnante Labels (max. 5 Wörter pro Knoten)
- Gib NUR den Mermaid-Code zurück, ohne Backticks, ohne Erklärungen`;

    let mermaidCode = await callAI(prompt, MODEL, TEMPERATURE_MINDMAP, 800);

    // Backticks und Markdown-Fences entfernen falls vorhanden
    mermaidCode = mermaidCode
      .replace(/^```[a-z]*\n?/gm, "")
      .replace(/```$/gm, "")
      .trim();

    res.json({ mermaidCode });
  } catch (error) {
    console.error("❌ Mindmap-Fehler:", error);
    res.status(500).json({ error: "Fehler bei der Mindmap-Generierung." });
  }
});

export default router;
