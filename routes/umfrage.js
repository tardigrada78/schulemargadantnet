import { Router } from 'express';
import Anthropic from "@anthropic-ai/sdk";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Erstellt Personen
async function generatePerson(participants_women, participants_men, participants_age_min, participants_age_max) {
    const genderRand = Math.random();
    const geschlecht = genderRand < participants_women ? "Frau" :
        genderRand < (participants_women + participants_men) ? "Mann" : "unbestimmt";
    const alter = Math.floor(Math.random() * (participants_age_max - participants_age_min)) + participants_age_min;
    const prompt = `
    Erstelle eine realistische virtuelle Person mit einer einzigartigen, vielfältigen und glaubwürdigen Persönlichkeit.
    Diese Person soll eine Umfrage ausfüllen und repräsentiert ein breites Spektrum der Gesellschaft – von konservativ bis progressiv, von wohlhabend bis prekär, von freundlich bis problematisch.
    Erstelle eine abwechslungsreiche Beschreibung, die sich deutlich von anderen unterscheidet, mit realistischen Widersprüchen und Ecken & Kanten – keine idealisierten Personen.

    Gib die Antwort AUSSCHLIESSLICH als Klartext im folgenden Zeilenformat zurück:
    - Jede Abschnittsüberschrift steht auf einer eigenen Zeile und endet mit einem Doppelpunkt, ohne weiteren Text.
    - Jedes Merkmal steht auf einer eigenen Zeile im Format "Label: Wert".
    - Keine Markdown-Formatierung, keine Sternchen, keine Emojis, kein Einleitungs- oder Schlusstext.

    Verwende genau diese Struktur und Labels:

    Grunddaten:
    Name: ein realistischer Vorname und Nachname passend zu Geschlecht, Alter und sozialem Hintergrund
    Geschlecht: ${geschlecht}
    Alter: ${alter}
    Wohnort: eine plausible Region in der Schweiz (z. B. Grossstadt, Vorort, Land, finanzstarker oder ärmerer Kanton)

    Sozialer Hintergrund:
    Bildungsstand: variiere stark – von Schulabbrecher bis Hochschulabschluss
    Beruf oder Ausbildung: falls in Ausbildung eine realistische Schul-/Studienrichtung, falls berufstätig ein passender Beruf
    Einkommen: sehr niedrig / niedrig / mittel / hoch / sehr hoch – passend zur Lebenssituation
    Wohnsituation: Eigenheim, Mietwohnung, WG, betreutes Wohnen oder prekäres Umfeld
    Familienstand: ledig, verheiratet, geschieden, verwitwet, in einer toxischen Beziehung oder alleinerziehend

    Persönliche Eigenschaften:
    Interessen und Hobbys: variiere stark – von Sport, Gaming, Technik, Kunst, Politik, Reisen bis zu problematischen Hobbys (z. B. Glücksspiel, Verschwörungstheorien, exzessives Feiern)
    Charakter: berücksichtige auch negative Eigenschaften (z. B. impulsiv, egoistisch, misstrauisch, nachtragend, kontrollierend, pessimistisch)
    Gesundheit: gesund, aber auch mögliche Herausforderungen (z. B. Angststörungen, Burnout, körperliche Einschränkungen, Suchtprobleme, Schulden)
    Soziale Kontakte: grosse Freundesgruppe, Einzelgänger, sozial unsicher, vereinsamt oder in toxischem Umfeld

    Weltanschauung & Meinung:
    Politische & gesellschaftliche Ansichten: variiere stark – von extrem konservativ bis links-progressiv, von unpolitisch bis radikal, auch mögliche Vorurteile oder Verschwörungsglauben
    Einstellung zu Umfragethemen: klare Positionen zu Umwelt, Digitalisierung, sozialer Gerechtigkeit, Konsumverhalten, Migration, Impfungen – vermeide stereotype Antworten
    Umgang mit Konflikten: sachlich, emotional, aggressiv, defensiv oder ignorant

    Verwende genau das vorgegebene Geschlecht und Alter, auch wenn die Person atypisch jung oder alt ist.
    `;

    const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        temperature: 1.0, // Höhere Temperatur für mehr Vielfalt
        messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text.trim();
}

// Lässt Personen Umfrage beantworten
async function answerSurvey(person, question, isOpen, options) {
    let prompt;
    if (isOpen) {
        prompt = `Basierend auf der folgenden virtuellen Person:

        ${person}

        Beantworte die folgende offene Frage aus der Perspektive dieser Person:

        Frage: ${question}

        Dies simuliert eine schriftliche Umfrage. Antworte knapp und sachlich in maximal einem Satz.
        Kein Plauderton, keine Anrede, keine Einleitung, keine Gedankenstriche oder Lacher – nur die reine Antwort, passend zur Persönlichkeit der Person.
        `;
    } else {
        prompt = `Basierend auf der folgenden virtuellen Person:

        ${person}

        Beantworte die folgende geschlossene Frage aus der Perspektive dieser Person.

        Frage: ${question}

        Antwortmöglichkeiten: ${options}

        Gib als Antwort ausschließlich eine der vorgegebenen Optionen zurück, ohne zusätzlichen Text oder Erklärungen.
        `;
    }

    const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 150,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
    });

    return response.content[0].text.trim();
}

// Schreibt Report
async function generateSurveyReport(surveyResults) {
    let reportText = "Hier sind die Antworten auf die Umfrage:\n\n";
    for (let i = 0; i < surveyResults.length; i++) {
        let [, , questionIndex, question, answer] = surveyResults[i];
        if (!reportText.includes(`Frage ${questionIndex + 1}:`)) {
            reportText += `Frage ${questionIndex + 1}: ${question}\nAntworten:\n`;
        }
        reportText += `- ${answer}\n`;
    }

    const prompt = `
    Erstelle eine verständliche Zusammenfassung der folgenden Umfrageergebnisse:

    ${reportText}

    Fasse die Haupttendenzen und auffälligen Unterschiede zusammen, ohne Antworten zu wiederholen.
    Nutze klare Sprache und fasse es in 5-7 Sätzen zusammen.
    Antworte in reinem Fliesstext ohne jede Formatierung: keine Überschriften, keine Rauten (#), keine Sternchen (**), keine Aufzählungszeichen.
    `;

    const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
    });
    return response.content[0].text.trim();
}

// Route für das Generieren einer Person
router.post('/person', async (req, res) => {
    try {
        const { participants_women, participants_men, participants_age_min, participants_age_max } = req.body;
        const person = await generatePerson(participants_women, participants_men, participants_age_min, participants_age_max);
        res.json({ person });
    } catch (error) {
        console.error("❌ Fehler bei der Personenerstellung:", error);
        res.status(500).json({ error: "Fehler beim Erstellen der Person." });
    }
});

// Route für doe Beantwortung einer einzelnen Frage
router.post('/answer', async (req, res) => {
    try {
        const { person, question, isOpen, options } = req.body;
        const answer = await answerSurvey(person, question, isOpen, options);
        res.json({ answer });
    } catch (error) {
        console.error("❌ Fehler bei der Beantwortung der Frage:", error);
        res.status(500).json({ error: "Fehler beim Beantworten der Frage." });
    }
});

// Route für den Report
router.post('/report', async (req, res) => {
    const { surveyResults } = req.body; 
    if (!surveyResults || surveyResults.length === 0) {
        return res.status(400).json({ error: "❌ Keine Umfrage-Daten erhalten!" });
    }
    try {
        const summary = await generateSurveyReport(surveyResults);
        res.json({ report: summary });
    } catch (error) {
        console.error("❌ Fehler beim Generieren des Reports:", error);
        res.status(500).json({ error: "Fehler beim Generieren des Reports." });
    }
});

export default router;
