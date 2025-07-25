import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Funktion um Frage zu erstellen
async function doQuestion(properties, language) {
  const prompt = `Erstelle eine anspruchsvolle Prüfungsfrage, die in etwa 5 Minuten beantwortet werden kann.

Zielgruppe: 18-jährige Schüler eines Gymnasiums.

Die Frage muss die folgenden Lernziele sinnvoll und inhaltlich verknüpfen:

Lernziele:
${properties}

### WICHTIG:
- **Erstelle genau EINE zusammenhängende Frage, die die angegebenen Lernziele kombiniert.**  
- **Die Frage soll ein tiefes Verständnis erfordern und thematisch logisch aufgebaut sein.**  
- **Vermeide isolierte Teilfragen oder Aufzählungen.** Formuliere die Frage so, dass alle Lernziele aufeinander aufbauen oder zusammenhängen.  
- **Formuliere die Frage in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  
- **Gib nur die Frage zurück – ohne Erklärungen, Einleitungen oder Hinweise zur Antwort.**`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}

// Funktion um eigene Antwort zu überprüfen
async function checkAIAnswer(answerText, questionText, language) {
  console.log(language);
  const prompt = `Du bist ein Lehrer. Bewerte bitte die folgende Schülerantwort auf die gestellte Frage.
Frage: ${questionText}

Schülerantwort: ${answerText}

Beurteile die Antwort fair, sachlich und präzise:
- Ist die Antwort inhaltlich korrekt?
- Welche Aspekte fehlen oder sind unvollständig?
- Falls falsch, erkläre warum und was richtig wäre.
- Gib nur Rückmeldungen auf die Antwort, keine allgemeinen Lerntipps. 
- **Formuliere die Antwort in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  

Gib eine kurze Rückmeldung (max. 5 Sätze), die dem Schüler hilft, sich zu verbessern. Sei wohlwollend und motivierend.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4, // Weniger Kreativität, mehr Präzision
  });
  return response.choices[0].message.content;
}

// Funktion um Skript zu schreiben
async function doScript(properties, wordcount, language) {
  const prompt = `Schreibe einen verständlichen Erklärungstext, der die folgenden Lernziele vollständig und korrekt abdeckt:

  Lernziele:
  ${properties}
  
  Anforderungen an den Text:
  - Nutze präzises Fachvokabular, das auch von 18-jährigen Gymnasialschülern verstanden werden kann.
  - Der Text soll fachlich korrekt, sprachlich ansprechend und motivierend geschrieben sein.
  - Gliedere den Text logisch und klar in Abschnitte, die thematisch sinnvoll gegliedert sind.
  - Nutze passende Zwischenüberschriften, um die Struktur deutlich zu machen.
  - Ziel: Der Text soll inhaltlich fundiert sein, aber so formuliert, dass Schülerinnen und Schüler ihn eigenständig verstehen können.
  - **Der Text soll möglichst genau ${wordcount} Wörter umfassen. Akzeptable Abweichung: +/- 5%.**
  - **Falls der Text nach der ersten Erstellung zu kurz oder zu lang ist, passe ihn bitte an, um die Vorgabe von ${wordcount} Wörtern einzuhalten.**  
  - **Formuliere den gesamten Text in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  
  
  WICHTIG:
  - Gib den Text ausschließlich als valides HTML zurück, das direkt in eine Webseite oder ein Word-Dokument eingefügt werden kann.
  - Verwende dabei nur folgende HTML-Elemente:
    - <h4> für Zwischenüberschriften
    - <p> für Absätze
    - <ul> und <ol> für Aufzählungen, falls sinnvoll
  - Vermeide jegliche Einleitung, Erklärung oder Kommentare vor und nach dem HTML.
  - Gib ausschließlich den reinen HTML-Code zurück — keine Formatierungen außerhalb von HTML, keine Backticks.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}

// Funktion um Diagramm zu erstellen
async function doDiagram(scriptText, language) {
  const prompt = `Erstelle ein präzises, verständliches Flowchart-Diagramm basierend auf folgendem Text:

  ${scriptText}
  
  ### WICHTIG:
  - Nutze ausschließlich das Mermaid-Format (kein Markdown, keine Kommentare, keine zusätzlichen Erklärungen).
  - Beginne den Code direkt mit "flowchart TD", ohne Einleitungen oder Beschreibungen.
  - Strukturiere das Diagramm so, dass es logisch aufgebaut und verständlich ist.
  - Verwende sinnvolle Verbindungen zwischen den Knoten.
  - Formuliere die gesamte Ausgabe in der Sprache: ${language}.
  - Gib nur den reinen Diagramm-Code zurück, ohne JSON-Struktur oder Schlüssel.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });

  const diagramCode = response.choices[0].message.content.trim();
  const cleanedCode = diagramCode.replace(/```mermaid|```/g, "").trim();
  return cleanedCode;
}

// Funktion um Skript zu schreiben
async function doPodcastText(scriptText, language) {
  const prompt = `Formuliere einen spannenden Podcast aus dem folgenden Inhalt: 
  
  ${scriptText}
  
  Wichtig:
  - **Formuliere den gesamten Text in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  
  - Der Text wird von einer Person gelesen. Schreibe keine Dialoge. 
  - Schreibe nur den Podcast-Text, vermeide Regieanweisungen oder Layoutangaben wie "Titel". 
  - Der fachliche Inhalt muss erhalten bleiben.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
  });
  return response.choices[0].message.content;
}

//  Funktion um Audio für Podcast zu erstellen
async function doPodcastAudio(podcastText) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      instructions: "Sprich mit einer klaren, dynamischen Stimme, in lebendigem, mittlerem Tempo, mit einer begeisterten und mitreißenden Tonlage, die Neugier weckt und komplexe Themen spannend und zugänglich erscheinen lässt.",
      input: podcastText,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// Routes

// Route für Frage erstellen
router.post("/getQuestion", async (req, res) => {
  try {
    const { properties, language } = req.body;
    const result = await doQuestion(properties, language);
    res.json({ question: result });
  } catch (error) {
    console.error("Fehler beim Erstellen der Frage:", error);
    res.status(500).send("Fehler beim Erstellen der Frage.");
  }
});

// Route für Antwort überprüfen
router.post("/checkAnswer", async (req, res) => {
  try {
    const { answer, question, language } = req.body;
    const feedback = await checkAIAnswer(answer, question, language);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim Überprüfen der Antwort:", error);
    res.status(500).send("Fehler beim Überprüfen der Antwort.");
  }
});

// Route um Skript zu schreiben
router.post("/getScript", async (req, res) => {
  try {
    const { properties, wordcount, language } = req.body;
    const result = await doScript(properties, wordcount, language);
    res.json({ text: result });
  } catch (error) {
    console.error("Fehler beim Erstellen des Skripts:", error);
    res.status(500).send("Fehler beim Erstellen des Skripts.");
  }
});

// Route um Mermaid-Diagramm zu zeichnen
router.post("/getDiagram", async (req, res) => {
  try {
    const { scriptText, language } = req.body;
    const result = await doDiagram(scriptText, language);
    res.send(result); // Antworte mit einem reinen String statt JSON
  } catch (error) {
    console.error("Fehler beim Erstellen des Diagramms:", error);
    res.status(500).send("Fehler beim Erstellen des Diagramms.");
  }
});

// Route um Podcast-Text zu Ersellen
router.post("/getPodcastText", async (req, res) => {
  try {
    const { scriptText, language } = req.body;
    const data = await doPodcastText(scriptText, language);
    res.json( data );
  } catch (error) {
    console.error("Fehler beim Erstellen des Podcasts:", error);
    res.status(500).send("Fehler beim Erstellen des Podcasts.");
  }
});

// Route um Popdcast Audio zu erstellen
router.post("/getPodcastAudio", async (req, res) => {
  const { podcastText } = req.body;
  try {
    const data = await doPodcastAudio(podcastText);
    res.json({ speech: data });
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

export default router;
