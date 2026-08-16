import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { callAI } from "../aiCall.js";
import { getReferenceDocuments } from "../referenceDocs.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data/journals");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sanitizeSegment(str) {
  return String(str || "").replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 50).toLowerCase();
}

function getFilePath(department, code) {
  return path.join(DATA_DIR, sanitizeSegment(department), `${sanitizeSegment(code)}.json`);
}

function loadProject(department, code) {
  const filePath = getFilePath(department, code);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }
  return {
    code: sanitizeSegment(code),
    department: sanitizeSegment(department),
    title: "",
    description: "",
    members: [],
    timeline: { start: "2026-04-20", end: "2026-12-15", presentation: "2027-01-19" },
    timelineEntries: [],
    journalEntries: [],
    chatHistory: [],
  };
}

// Ungeschütztes Read-Modify-Write: gleichzeitige Speicherungen können sich überschreiben (kein Locking).
function saveProject(project) {
  const filePath = getFilePath(project.department, project.code);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), "utf-8");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function callClaude(prompt, maxTokens = 400, documents = []) {
  return callAI(prompt, "anthropic/claude-haiku-4-5-20251001", 0.5, maxTokens, null, documents);
}

// Liste bestehender Abteilungen (für das Dropdown/Datalist beim Login)
router.get("/departments", (req, res) => {
  try {
    const dirs = fs.readdirSync(DATA_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    res.json({ departments: dirs });
  } catch (error) {
    console.error("Fehler beim Laden der Abteilungen:", error);
    res.status(500).json({ error: "Fehler beim Laden der Abteilungen." });
  }
});

// Projekt laden oder neu anlegen
router.post("/load", (req, res) => {
  try {
    const { code, department } = req.body;
    if (!code || code.trim() === "") {
      return res.status(400).json({ error: "Kein Gruppencode angegeben." });
    }
    if (!department || department.trim() === "") {
      return res.status(400).json({ error: "Keine Abteilung angegeben." });
    }
    const project = loadProject(department, code);
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
    const { code, department, title, description, members, timeline } = req.body;
    const project = loadProject(department, code);
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
    const { code, department, entry } = req.body;
    const project = loadProject(department, code);
    const newEntry = {
      id: generateId(),
      date: new Date().toISOString().slice(0, 10),
      contents: entry.contents || {},
      obstacles: entry.obstacles || "",
      planning: entry.planning || {},
      aiFeedback: null,
      teacherComment: { status: null, text: "" },
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

// Journaleintrag aktualisieren (Autosave während der Bearbeitung)
router.post("/updateEntry", (req, res) => {
  try {
    const { code, department, entryId, entry } = req.body;
    const project = loadProject(department, code);
    const existing = project.journalEntries.find((e) => e.id === entryId);
    if (!existing) return res.status(404).json({ error: "Eintrag nicht gefunden." });
    if (entry.contents !== undefined) existing.contents = entry.contents;
    if (entry.obstacles !== undefined) existing.obstacles = entry.obstacles;
    if (entry.planning !== undefined) existing.planning = entry.planning;
    saveProject(project);
    res.json({ entry: existing });
  } catch (error) {
    console.error("Fehler beim Aktualisieren:", error);
    res.status(500).json({ error: "Fehler beim Aktualisieren des Eintrags." });
  }
});

// Zeitplaneintrag hinzufügen
router.post("/addTimelineEntry", (req, res) => {
  try {
    const { code, department, entry } = req.body;
    const project = loadProject(department, code);
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
    const { code, department, id } = req.body;
    const project = loadProject(department, code);
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
    const { code, department, entryId } = req.body;
    const project = loadProject(department, code);
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

// LP-Kommentar zu einem Journaleintrag setzen
router.post("/setTeacherComment", (req, res) => {
  try {
    const { code, department, entryId, status, text } = req.body;
    const project = loadProject(department, code);
    const entry = project.journalEntries.find((e) => e.id === entryId);
    if (!entry) return res.status(404).json({ error: "Eintrag nicht gefunden." });
    const current = entry.teacherComment || { status: null, text: "" };
    entry.teacherComment = {
      status: status !== undefined ? (status || null) : current.status,
      text: text !== undefined ? text : current.text,
    };
    saveProject(project);
    res.json({ teacherComment: entry.teacherComment });
  } catch (error) {
    console.error("Fehler beim LP-Kommentar:", error);
    res.status(500).json({ error: "Fehler beim Speichern des Kommentars." });
  }
});

// KI-Übersicht (Zeitplan + Journal)
router.post("/aiOverview", async (req, res) => {
  try {
    const { code, department } = req.body;
    const project = loadProject(department, code);

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
    const { code, department } = req.body;
    const project = loadProject(department, code);

    const journalSummary = project.journalEntries
      .map((e) => {
        const c = Object.entries(e.contents).map(([n, t]) => `${n}: ${t}`).join("; ");
        const p = Object.entries(e.planning).map(([n, pl]) => `${n}: ${pl.text} (bis ${pl.dueDate})`).join("; ");
        return `Datum ${e.date}:\n  Inhalte: ${c || "(leer)"}\n  Stolpersteine: ${e.obstacles || "(keine)"}\n  Planung: ${p || "(keine)"}`;
      })
      .join("\n\n");

    const timelineSummary = project.timelineEntries
      .map((e) => `KW ${e.weekFrom}–${e.weekTo}: ${e.process}`)
      .join(", ");

    const prompt = `Du bist ein hilfreicher Schulberater. Analysiere die Arbeitsjournal-Einträge dieser Schülergruppe. Antworte auf Deutsch in maximal 150 Wörtern. Beurteile: Verständlichkeit, Detailgrad, Vollständigkeit, Regelmässigkeit, Arbeitsteilung.

Nutze primär die folgenden Quellen: das Arbeitsjournal, den Projekt-Zeitplan sowie die beigefügten Referenzdokumente (schulische Leitfäden). Belege deine Aussagen mit der jeweiligen Quelle (z.B. Journaleintrag-Datum oder Dokumentname). Weiche nur auf Allgemeinwissen aus, wenn die Antwort in diesen Quellen nicht enthalten ist.

Projekt: ${project.title || "(kein Titel)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}
Zeitrahmen: ${project.timeline.start} bis ${project.timeline.end}, Präsentation: ${project.timeline.presentation}

Zeitplan: ${timelineSummary || "Keine Einträge"}

Journaleinträge (gesamter bisheriger Verlauf):
${journalSummary || "Keine Einträge vorhanden."}`;

    const feedback = await callClaude(prompt, 600, getReferenceDocuments());
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim KI-Journal:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Journal-Rückmeldung." });
  }
});

// KI-Rückmeldung Projekt-Zeitplan
router.post("/aiTimeline", async (req, res) => {
  try {
    const { code, department } = req.body;
    const project = loadProject(department, code);

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
    const { code, department, message } = req.body;
    const project = loadProject(department, code);

    const historyStr = project.chatHistory
      .map((h) => `${h.role === "user" ? "Schüler*in" : "KI"}: ${h.content}`)
      .join("\n");

    const journalSummary = project.journalEntries
      .map((e) => {
        const c = Object.entries(e.contents).map(([n, t]) => `${n}: ${t}`).join("; ");
        const p = Object.entries(e.planning).map(([n, pl]) => `${n}: ${pl.text} (bis ${pl.dueDate})`).join("; ");
        return `Datum ${e.date}:\n  Inhalte: ${c || "(leer)"}\n  Stolpersteine: ${e.obstacles || "(keine)"}\n  Planung: ${p || "(keine)"}`;
      })
      .join("\n\n");

    const timelineSummary = project.timelineEntries
      .map((e) => `KW ${e.weekFrom}–${e.weekTo}: ${e.process}`)
      .join(", ");

    const prompt = `Du bist ein hilfreicher Schulberater für eine Schüler-Projektarbeit. Fokussiere auf die nächsten konkreten Arbeitsschritte. Antworte auf Deutsch in 2–4 kurzen Sätzen.

Nutze primär die folgenden Quellen: das Arbeitsjournal, den Projekt-Zeitplan sowie die beigefügten Referenzdokumente (schulische Leitfäden). Belege deine Aussagen mit der jeweiligen Quelle (z.B. Journaleintrag-Datum oder Dokumentname). Weiche nur auf Allgemeinwissen aus, wenn die Antwort in diesen Quellen nicht enthalten ist.

Projekt: ${project.title || "(kein Titel)"}
Mitglieder: ${project.members.join(", ") || "(keine)"}
Zeitrahmen: ${project.timeline.start} bis ${project.timeline.end}, Präsentation: ${project.timeline.presentation}

Zeitplan: ${timelineSummary || "Keine Einträge"}

Journaleinträge (gesamter bisheriger Verlauf):
${journalSummary || "Keine Einträge vorhanden."}

Chatverlauf:
${historyStr || "(noch kein Verlauf)"}

Neue Nachricht: ${message}`;

    const answer = await callClaude(prompt, 400, getReferenceDocuments());

    // Projekt kurz vor dem Speichern nochmals frisch laden: der KI-Aufruf oben dauert
    // mehrere Sekunden, in denen z.B. ein anderes Gruppenmitglied ebenfalls chatten
    // oder das Journal bearbeiten könnte. Ohne diesen Re-Read würde unser Save den
    // zwischenzeitlichen Stand überschreiben und Nachrichten gingen verloren.
    const freshProject = loadProject(department, code);
    freshProject.chatHistory.push({ role: "user", content: message });
    freshProject.chatHistory.push({ role: "assistant", content: answer });
    if (freshProject.chatHistory.length > 20) {
      freshProject.chatHistory = freshProject.chatHistory.slice(-20);
    }
    saveProject(freshProject);

    res.json({ answer });
  } catch (error) {
    console.error("Fehler beim Chat:", error);
    res.status(500).json({ error: "Fehler beim Chat." });
  }
});

export default router;
