import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// Funktion für LLM-Anfrage (mit und ohne Kontext)
async function LLMtext(assistant_id, prompt) {
  console.log("In LLMtext(): ", assistant_id)
  // Variante ohne Kontext
  if (assistant_id == "kein") {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
    });
    return response.choices[0].message.content;
  }
  // Variante mit Kontext
  else {
    try {
      const thread = await openai.beta.threads.create();
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: prompt
      });
      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistant_id
      });
      if (run.status === 'completed') {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const message = messages.data[0];
        let text_content = message.content[0].text.value;
        const annotations = message.content[0].text.annotations;
        const source_mapping = {};
        const sources = [];
        const unique_sources = new Map();
        for (let i = 0; i < annotations.length; i++) {
          const annotation = annotations[i];
          if (annotation.file_citation) {
            const citation = annotation.file_citation;
            const file_info = await openai.files.retrieve(citation.file_id);
            const source_key = file_info.filename;
            if (!unique_sources.has(source_key)) {
              const source_num = unique_sources.size + 1;
              unique_sources.set(source_key, source_num);
              sources.push(`[${source_num}] ${file_info.filename}`);
            }
            const source_num = unique_sources.get(source_key);
            source_mapping[annotation.text] = `[${source_num}]`;
          }
        }
        for (const [old_annotation, new_ref] of Object.entries(source_mapping)) {
          text_content = text_content.replace(old_annotation, new_ref);
        }
        text_content = text_content.replace(/【\d+:\d+†[^】]*】/g, (match) => {
          const filename_match = match.match(/†([^】]+)】/);
          if (filename_match) {
            const filename = filename_match[1];
            if (!unique_sources.has(filename)) {
              const source_num = unique_sources.size + 1;
              unique_sources.set(filename, source_num);
              sources.push(`[${source_num}] ${filename}`);
              return `[${source_num}]`;
            } else {
              const source_num = unique_sources.get(filename);
              return `[${source_num}]`;
            }
          }
          return '';
        });
        text_content = text_content.replace(/\*\*(.*?)\*\*/g, '<h4>$1</h4>');
        if (sources.length > 0) {
          const sourceList = sources.map(source => `<li>${source}</li>`).join('\n');
          text_content += `\n\n<h4>Quellenverzeichnis</h4>\n<ul>\n${sourceList}\n</ul>`;
        }
        return text_content;
      } else {
        console.error('Run status:', run.status);
        return "error with vector store\n\n"
      }
    } catch (error) {
      console.error('Vector Store Error:', error);
      return "error with vector store\n\n"
    }
  }
}


// Funktion um Frage zu erstellen
async function doQuestion(properties, language, assistant_id) {
  const prompt = `Erstelle eine anspruchsvolle Prüfungsfrage, die in maximal 5 Minuten beantwortet werden kann.

Zielgruppe: 18-jährige Schüler eines Gymnasiums.

Die Frage muss die folgenden Lernziele sinnvoll und inhaltlich verknüpfen:

Lernziele:
${properties}

### WICHTIG:
- Nimm zuerst die beigelegten Skripte und Fachbücher als Quelle und erst wenn die nicht ergiebig sind andere Quellen.
- **Erstelle genau EINE zusammenhängende Frage, die die angegebenen Lernziele kombiniert.**  
- **Die Frage soll ein tiefes Verständnis erfordern und thematisch logisch aufgebaut sein.**  
- **Vermeide isolierte Teilfragen oder Aufzählungen.** Formuliere die Frage so, dass alle Lernziele aufeinander aufbauen oder zusammenhängen.  
- **Formuliere die Frage in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  
- **Gib nur die Frage zurück – ohne Erklärungen, Einleitungen oder Hinweise zur Antwort.**`;
  const result = await LLMtext(assistant_id, prompt);
  return result
}


// Funktion um eigene Antwort zu überprüfen
async function checkAIAnswer(answerText, questionText, language, assistant_id) {
  console.log(language);
  const prompt = `Du bist ein Lehrer. Bewerte bitte die folgende Schülerantwort auf die gestellte Frage.
Frage: ${questionText}

Schülerantwort: ${answerText}

Beurteile die Antwort fair, sachlich und präzise:
- Nimm zuerst die beigelegten Skripte und Fachbücher als Quelle und erst wenn die nicht ergiebig sind andere Quellen.
- Ist die Antwort inhaltlich korrekt?
- Welche Aspekte fehlen oder sind unvollständig?
- Falls falsch, erkläre warum und was richtig wäre.
- Gib nur Rückmeldungen auf die Antwort, keine allgemeinen Lerntipps. 
- **Formuliere die Antwort in der Sprache: ${language}.** Achte darauf, dass die gesamte Ausgabe ausschließlich in dieser Sprache erfolgt.  

Gib eine kurze Rückmeldung (max. 5 Sätze), die dem Schüler hilft, sich zu verbessern. Sei wohlwollend und motivierend.`;

  const result = await LLMtext(assistant_id, prompt);
  return result

  // const response = await openai.chat.completions.create({
  //   model: "gpt-4o",
  //   messages: [{ role: "user", content: prompt }],
  //   temperature: 0.4, // Weniger Kreativität, mehr Präzision
  // });
  // return response.choices[0].message.content;
}


// Funktion um Skript zu schreiben
async function doScript(properties, wordcount, language, assistant_id) {
  const prompt = `Schreibe einen verständlichen Erklärungstext, der die folgenden Lernziele vollständig und korrekt abdeckt:

  Lernziele:
  ${properties} 
  
  Anforderungen an den Text:
  - Nimm zuerst die beigelegten Skripte und Fachbücher als Quelle und erst wenn die nicht ergiebig sind andere Quellen.
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
  const result = await LLMtext(assistant_id, prompt);
  return result
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

// Funktion um Podcast-Text zu schreiben
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
    const { properties, language, assistant_id } = req.body;
    const result = await doQuestion(properties, language, assistant_id);
    res.json({ question: result });
  } catch (error) {
    console.error("Fehler beim Erstellen der Frage:", error);
    res.status(500).send("Fehler beim Erstellen der Frage.");
  }
});

// Route für Antwort überprüfen
router.post("/checkAnswer", async (req, res) => {
  try {
    const { answer, question, language, assistant_id } = req.body;
    const feedback = await checkAIAnswer(answer, question, language, assistant_id);
    res.json({ feedback });
  } catch (error) {
    console.error("Fehler beim Überprüfen der Antwort:", error);
    res.status(500).send("Fehler beim Überprüfen der Antwort.");
  }
});

// Route um Skript zu schreiben
router.post("/getScript", async (req, res) => {
  try {
    const { properties, wordcount, language, assistant_id } = req.body;
    const result = await doScript(properties, wordcount, language, assistant_id);
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

// Route um Podcast-Text zu erstellen
router.post("/getPodcastText", async (req, res) => {
  try {
    const { scriptText, language } = req.body;
    const data = await doPodcastText(scriptText, language);
    res.json(data);
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
