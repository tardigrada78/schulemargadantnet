import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callAI } from "../aiCall.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data/journals");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitizeCode(code) {
  return code.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 50).toLowerCase();
}

function getFilePath(code) {
  return path.join(DATA_DIR, `${sanitizeCode(code)}.json`);
}

function loadProject(code) {
  const filePath = getFilePath(code);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return {
    code: sanitizeCode(code),
    title: "",
    description: "",
    members: [],
    timeline: { start: "2026-04-20", end: "2026-12-15", presentation: "2027-01-19" },
    timelineEntries: [],
    journalEntries: [],
    chatHistory: [],
  };
}

function saveProject(project) {
  fs.writeFileSync(getFilePath(project.code), JSON.stringify(project, null, 2), "utf-8");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function callClaude(prompt, maxTokens = 400) {
  return callAI(prompt, "anthropic/claude-haiku-4-5-20251001", 0.5, maxTokens);
}

// Projekt laden oder neu anlegen
router.post("/load", (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.trim() === "") {
      return res.status(400).json({ error: "Kein Gruppencode angegeben." });
    }
    const project = loadProject(code);
    saveProject(project);
    res.json({ project });
  } catch (error) {
    console.error("Fehler beim Laden:", error);
    res.status(500).json({ error: "Fehler beim Laden des Projekts." });
  }
});

// Projektdaten speichern
router.post("/saveProject", (req, res) => {
  try {
    const { code, title, description, members, timeline } = req.body;
    const project = loadProject(code);
    project.title = title ?? project.title;
    project.description = description ?? project.description;
    if (members !== undefined) {
      project.members = Array.isArray(members)
        ? members
        : members.split(",").map((m) => m.trim()).filter(Boolean);
    }
    if (timeline) project.timeline = { ...project.timeline, ...timeline };
    saveProject(project);
    res.json({ project });
  } catch (error) {
    console.error("Fehler beim Speichern:", error);
    res.status(500).json({ error: "Fehler beim Speichern." });
  }
});

// Journaleintrag hinzufügen
router.post("/addEntry", (req, res) => {
  try {
    const { code, entry } = req.body;
    const project = loadProject(code);
    const newEntry = {
      id: generateId(),
      date: new Date().toISOString().slice(0, 10),
      contents: entry.contents || {},
      obstacles: entry.obstacles || "",
      planning: entry.planning || {},
      aiFeedback: null,
      createdAt: new Date().toISOString(),
    };
    project.journalEntries.unshift(newEntry);
    saveProject(project);
    res.json({ entry: newEntry });
  } catch (error) {
    console.error("Fehler beim Hinzufügen:", error);
    res.status(500).json({ error: "Fehler beim Hinzufügen des Eintrags." });
  }
});

// Zeitplaneintrag hinzufügen
router.post("/addTimelineEntry", (req, res) => {
  try {
    const { code, entry } = req.body;
    const project = loadProject(code);
    const newEntry = {
      id: generateId(),
      process: entry.process || "",
      weekFrom: parseInt(entry.weekFrom),
      weekTo: parseInt(entry.weekTo),
      color: entry.color || "#4CAF50",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    project.timelineEntries.push(newEntry);
    saveProject(project);
    res.json({ entry: newEntry });
  } catch (error) {
    console.error("Fehler beim Hinzufügen:", error);
    res.status(500).json({ error: "Fehler beim Hinzufügen des Zeitplaneintrags." });
  }
});

// Zeitplaneintrag löschen
router.post("/deleteTimelineEntry", (req, res) => {
  try {
    const { code, id } = req.body;
    const project = loadProject(code);
    project.timelineEntries = project.timelineEntries.filter((e) => e.id !== id);
    saveProject(project);
    res.json({ ok: true });
  } catch (error) {
    console.error("Fehler beim Löschen:", error);
    res.status(500).json({ error: "Fehler beim Löschen." });
  }
});

// KI-Feedback für einen Journaleintrag
router.post("/aiFeedback", async (req, res) => {
  try {
    const { code, entryId } = req.body;
    const project = loadProject(code);
    const entry = project.journalEntries.find((e) => e.id === entryId);
    if (!entry) return res.status(404).json({ error: "Eintrag nicht gefunden." });

    const contentsStr = Object.entries(entry.contents)
      .map(([name, text]) => `${name}: ${text}`)
      .join("\n");
    const planningStr = Object.entries(entry.planning)
      .map(([name, p]) => `${name}: ${p.text} (bis ${p.dueDate})`)
      .join("\n");

    const prompt = `Du bist ein hilfreicher Schulberater. Analysiere diesen Arbeitsjournal-Eintrag einer Schülergruppe. Antworte auf Deutsch in maximal 80 Wörtern. Gliedere klar in zwei Teile:

**Teil 1 – Journaleintrag:** Verständlichkeit, Detailgrad, Vollständigkeit.
**Teil 2 – Projekt:** Zeitplanung, Arbeitsteilung, Stolpersteine, Erfolgsaussichten.

Projekt: ${project.title || "(kein Titel)"}
Beschreibung: ${project.description || "(keine Beschreibung)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}
Datum: ${entry.date}
Bearbeitete Inhalte:
${contentsStr || "(leer)"}
Stolpersteine: ${entry.obstacles || "(keine)"}
Detailplanung:
${planningStr || "(keine)"}`;

    const feedback = await callClaude(prompt, 400);
    entry.aiFeedback = feedback;
    saveProject(project);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim KI-Feedback:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Rückmeldung." });
  }
});

// KI-Übersicht (Zeitplan + Journal)
router.post("/aiOverview", async (req, res) => {
  try {
    const { code } = req.body;
    const project = loadProject(code);

    const journalSummary = project.journalEntries
      .slice(0, 5)
      .map((e) => {
        const c = Object.entries(e.contents)
          .map(([n, t]) => `${n}: ${t}`)
          .join("; ");
        return `${e.date}: ${c} | Stolpersteine: ${e.obstacles}`;
      })
      .join("\n");

    const timelineSummary = project.timelineEntries
      .map((e) => `KW ${e.weekFrom}–${e.weekTo}: ${e.process}`)
      .join(", ");

    const prompt = `Du bist ein hilfreicher Schulberater. Analysiere den Projektstand dieser Schülergruppe. Antworte auf Deutsch in maximal 150 Wörtern. Beurteile: Was fehlt? Ist der Plan realistisch? Optimierungsvorschläge?

Projekt: ${project.title || "(kein Titel)"}
Beschreibung: ${project.description || "(keine)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}
Zeitrahmen: ${project.timeline.start} bis ${project.timeline.end}, Präsentation: ${project.timeline.presentation}

Zeitplan: ${timelineSummary || "Keine Einträge"}

Letzte Journaleinträge:
${journalSummary || "Keine Einträge"}`;

    const feedback = await callClaude(prompt, 600);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim KI-Überblick:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Übersicht." });
  }
});

// KI-Rückmeldung Journal (alle Einträge)
router.post("/aiJournal", async (req, res) => {
  try {
    const { code } = req.body;
    const project = loadProject(code);

    const journalSummary = project.journalEntries
      .slice(0, 8)
      .map((e) => {
        const c = Object.entries(e.contents).map(([n, t]) => `${n}: ${t}`).join("; ");
        const p = Object.entries(e.planning).map(([n, pl]) => `${n}: ${pl.text} (bis ${pl.dueDate})`).join("; ");
        return `Datum ${e.date}:\n  Inhalte: ${c || "(leer)"}\n  Stolpersteine: ${e.obstacles || "(keine)"}\n  Planung: ${p || "(keine)"}`;
      })
      .join("\n\n");

    const prompt = `Du bist ein hilfreicher Schulberater. Analysiere die Arbeitsjournal-Einträge dieser Schülergruppe. Antworte auf Deutsch in maximal 150 Wörtern. Beurteile: Verständlichkeit, Detailgrad, Vollständigkeit, Regelmässigkeit, Arbeitsteilung.

Projekt: ${project.title || "(kein Titel)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}

Journaleinträge:
${journalSummary || "Keine Einträge vorhanden."}`;

    const feedback = await callClaude(prompt, 600);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim KI-Journal:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Journal-Rückmeldung." });
  }
});

// KI-Rückmeldung Projekt-Zeitplan
router.post("/aiTimeline", async (req, res) => {
  try {
    const { code } = req.body;
    const project = loadProject(code);

    const timelineSummary = project.timelineEntries
      .map((e) => `KW ${e.weekFrom}–${e.weekTo}: ${e.process}`)
      .join(", ");

    const prompt = `Du bist ein hilfreicher Schulberater. Analysiere den Projekt-Zeitplan dieser Schülergruppe. Antworte auf Deutsch in maximal 150 Wörtern. Beurteile: Ist der Zeitplan realistisch? Gibt es Lücken oder Engpässe? Optimierungsvorschläge für die Planung?

Projekt: ${project.title || "(kein Titel)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}
Projektstart: ${project.timeline.start}
Projektabgabe: ${project.timeline.end}
Präsentation: ${project.timeline.presentation}

Zeitplan-Einträge: ${timelineSummary || "Keine Einträge vorhanden."}`;

    const feedback = await callClaude(prompt, 600);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim KI-Zeitplan:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Zeitplan-Rückmeldung." });
  }
});

// Chat
router.post("/chat", async (req, res) => {
  try {
    const { code, message } = req.body;
    const project = loadProject(code);

    const historyStr = project.chatHistory
      .map((h) => `${h.role === "user" ? "Schüler*in" : "KI"}: ${h.content}`)
      .join("\n");

    const prompt = `Du bist ein hilfreicher Schulberater für eine Schüler-Projektarbeit. Fokussiere auf die nächsten konkreten Arbeitsschritte. Antworte auf Deutsch in 2–4 kurzen Sätzen.

Projekt: ${project.title || "(kein Titel)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}

Chatverlauf:
${historyStr || "(noch kein Verlauf)"}

Neue Nachricht: ${message}`;

    const answer = await callClaude(prompt, 400);

    project.chatHistory.push({ role: "user", content: message });
    project.chatHistory.push({ role: "assistant", content: answer });
    if (project.chatHistory.length > 20) {
      project.chatHistory = project.chatHistory.slice(-20);
    }
    saveProject(project);

    res.json({ answer });
  } catch (error) {
    console.error("Fehler beim Chat:", error);
    res.status(500).json({ error: "Fehler beim Chat." });
  }
});

export default router;
