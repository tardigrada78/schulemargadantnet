import { Router } from 'express';
import OpenAI from "openai";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Erstellt Personen
async function generatePerson(participants_women, participants_men, participants_age_min, participants_age_max) {
    const genderRand = Math.random();
    const geschlecht = genderRand < participants_women ? "Frau" :
        genderRand < (participants_women + participants_men) ? "Mann" : "unbestimmt";
    const alter = Math.floor(Math.random() * (participants_age_max - participants_age_min)) + participants_age_min;
    console.log(alter)
    const prompt = `
    Erstelle eine realistische virtuelle Person mit einer einzigartigen, vielfältigen und glaubwürdigen Persönlichkeit. 
    Diese Person soll eine Umfrage ausfüllen und repräsentiert ein breites Spektrum der Gesellschaft – von konservativ bis progressiv, von wohlhabend bis prekär, von freundlich bis problematisch.
    
    ---
    ### 🔹 Grunddaten:
    - Geschlecht: ${geschlecht} - Berücksichtige das Geschlecht bei der Beschreibung der Person.
    - Alter: ${alter} - Verwende genau dieses Alter für die Beschreibung der Person, auch wenn die Person atypisch jung oder alt ist.
    - Name: Ein realistischer Vorname passend zum Geschlecht, Alter und sozialem Hintergrund.
    - Wohnort: Eine plausible Region in der Schweiz (z. B. Großstadt, Vorort, Land, finanzstarker oder ärmerer Kanton).
    
    ---
    ### 🔹 Sozialer Hintergrund:
    - Bildungsstand: Variiere stark – von Schulabbrecher bis Hochschulabschluss.
    - Beruf oder Ausbildung: Falls in Ausbildung, gib eine realistische Schul-/Studienrichtung an. Falls berufstätig, wähle einen passenden Beruf (z. B. Akademiker, Handwerker, Dienstleister, Arbeitsloser).
    - Einkommen: Sehr niedrig / niedrig / mittel / hoch / sehr hoch – passend zur Lebenssituation.
    - Wohnsituation: Eigenheim, Mietwohnung, WG, betreutes Wohnen, prekäres Umfeld.
    - Familienstand: Ledig, verheiratet, geschieden, verwitwet, in einer toxischen Beziehung, alleinerziehend.
    
    ---
    ### 🔹 Persönliche Eigenschaften:
    - Interessen und Hobbys: Variiere stark – von Sport, Gaming, Technik, Kunst, Politik, Reisen bis hin zu eher problematischen Hobbys (z. B. Glücksspiel, Verschwörungstheorien, Exzessives Feiern).
    - Charakter: Keine idealisierten Personen! Berücksichtige auch negative Eigenschaften (z. B. impulsiv, egoistisch, misstrauisch, nachtragend, kontrollierend, pessimistisch).
    - Psychische & körperliche Gesundheit: Gesund, aber auch mögliche Herausforderungen (z. B. Angststörungen, Burnout, körperliche Einschränkungen, Suchtprobleme, Schulden).
    - Soziale Kontakte: Große Freundesgruppe, Einzelgänger, sozial unsicher, vereinsamt, in toxischem Umfeld.
    
    ---
    ### 🔹 Weltanschauung & Meinung:
    - Politische & gesellschaftliche Ansichten: Variiere stark – von extrem konservativ bis links-progressiv, von unpolitisch bis radikal. Berücksichtige auch mögliche Vorurteile oder Verschwörungsglauben.
    - Einstellung zu typischen Umfragethemen (z. B. Umwelt, Digitalisierung, soziale Gerechtigkeit, Konsumverhalten, Migration, Impfungen): Beziehe klare Positionen und vermeide stereotype Antworten.
    - Umgang mit Konflikten & Meinungsverschiedenheiten: Sachlich, emotional, aggressiv, defensiv, ignorant?
    
    ---
    💡 Erstelle eine abwechslungsreiche, glaubwürdige Beschreibung, die sich deutlich von anderen unterscheidet.  
    Die Person soll authentisch klingen, als wäre sie eine echte Umfrageteilnehmerin mit realistischen Widersprüchen und Ecken & Kanten.
    `;
    
    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: prompt }],
        temperature: 1.0 // Höhere Temperatur für mehr Vielfalt
    });
        return response.choices[0].message.content;
}

// Lässt Personen Umfrage beantworten
async function answerSurvey(person, question, isOpen, options) {
    let prompt;
    if (isOpen) {
        prompt = `Basierend auf der folgenden virtuellen Person:

        ${person}

        Beantworte die folgende offene Frage aus der Perspektive dieser Person:

        Frage: ${question}

        Antwort:
        Gib eine prägnante, aber realistische Antwort, die zu den Eigenschaften, Interessen und der Persönlichkeit der Person passt.
        Die Antwort umfasst maximal 50 Wörter.
        Schreibe nur die Antwort, ohne einleitende Worte wie "Antwort:".
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

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
    });

    return response.choices[0].message.content.trim();
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

    // OpenAI-Prompt für eine Zusammenfassung
    const prompt = `
    Erstelle eine verständliche Zusammenfassung der folgenden Umfrageergebnisse:

    ${reportText}

    Fasse die Haupttendenzen und auffälligen Unterschiede zusammen, ohne Antworten zu wiederholen.
    Nutze klare Sprache und fasse es in 5-7 Sätzen zusammen.
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
    });
    return response.choices[0].message.content;
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
