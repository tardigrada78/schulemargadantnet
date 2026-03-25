import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const LANG_CONFIG = {
  de: {
    name: "Deutsch",
    annotationRule: `Schreibe ALLE Inhaltswörter (Nomen, Verben, Adjektive, Adverbien) im Format [Wort](English).
Beispiel: "Der Drache lebt im dunklen Wald." → "Der [Drache](dragon) [lebt](lives) im [dunklen](dark) [Wald](forest)."
Artikel, Präpositionen und Konjunktionen bleiben als normaler Text. Das Wort erscheint NUR in eckigen Klammern – niemals auch noch davor oder danach.`,
    annotationReminder: `Format-Erinnerung: Alle Nomen, Verben, Adjektive, Adverbien müssen als [Wort](English) stehen. Beispiel: "[Drache](dragon) [lebt](lives) im [Wald](forest)"`,
    titleLanguage: "Deutsch",
    ttsInstructions:
      "Speak clearly in German, slowly and expressively, suitable for language learners. Use a voice for telling fairytales.",
  },
  en: {
    name: "Englisch",
    annotationRule: `Write ALL content words (nouns, verbs, adjectives, adverbs) in the format [word](Deutsch).
Example: "The dragon lives in the dark forest." → "The [dragon](Drache) [lives](lebt) in the [dark](dunklen) [forest](Wald)."
Articles, prepositions and conjunctions remain as plain text. The word appears ONLY in square brackets – never also before or after them.`,
    annotationReminder: `Format reminder: All nouns, verbs, adjectives, adverbs must be written as [word](Deutsch). Example: "[dragon](Drache) [lives](lebt) in the [forest](Wald)"`,
    titleLanguage: "English",
    ttsInstructions:
      "Speak clearly in English, slowly and expressively, suitable for language learners. Use a voice for telling fairytales.",
  },
  fr: {
    name: "Französisch",
    annotationRule: `Écris TOUS les mots de contenu (noms, verbes, adjectifs, adverbes) au format [mot](Deutsch).
Exemple: "Le dragon vit dans une sombre forêt." → "Le [dragon](Drache) [vit](lebt) dans une [sombre](dunkle) [forêt](Wald)."
Contractions : écris-les SANS espace entre l'apostrophe et le crochet : l'[enfant](Kind), d'[accord](einverstanden), j'[aime](liebe).
Articles, prépositions et conjonctions restent en texte ordinaire. Le mot n'apparaît QUE dans les crochets.`,
    annotationReminder: `Rappel de format : Tous les noms, verbes, adjectifs, adverbes au format [mot](Deutsch). Contractions sans espace : l'[enfant](Kind). Exemple : "[dragon](Drache) [vit](lebt) dans la [forêt](Wald)"`,
    titleLanguage: "Französisch",
    ttsInstructions:
      "Speak clearly in French, slowly and expressively, suitable for language learners. Use a voice for telling fairytales.",
  },
  it: {
    name: "Italienisch",
    annotationRule: `Scrivi TUTTE le parole di contenuto (sostantivi, verbi, aggettivi, avverbi) nel formato [parola](Deutsch).
Esempio: "Il drago vive nel bosco oscuro." → "Il [drago](Drache) [vive](lebt) nel [bosco](Wald) [oscuro](dunkel)."
Articoli, preposizioni e congiunzioni rimangono come testo normale. La parola appare SOLO nelle parentesi quadre – mai anche prima o dopo.`,
    annotationReminder: `Promemoria formato: Tutti i sostantivi, verbi, aggettivi, avverbi nel formato [parola](Deutsch). Esempio: "[drago](Drache) [vive](lebt) nel [bosco](Wald)"`,
    titleLanguage: "Italienisch",
    ttsInstructions:
      "Speak clearly in Italian, slowly and expressively, suitable for language learners. Use a voice for telling fairytales.",
  },
  zh: {
    name: "Chinesisch",
    annotationRule: `Schreibe jede chinesische Vokabel im Format [汉字](Deutsch).
Beispiel: "龙住在黑暗的森林里。" → "[龙](Drache)[住](wohnt)在[黑暗](dunklen)的[森林](Wald)里。"
Jede bedeutungstragende Vokabel erscheint NUR in eckigen Klammern – niemals auch noch davor oder danach.`,
    annotationReminder: `Format-Erinnerung: Jede chinesische Vokabel muss als [汉字](Deutsch) stehen. Beispiel: "[龙](Drache)[住](wohnt)在[森林](Wald)里"`,
    titleLanguage: "Chinesisch",
    ttsInstructions:
      "Speak in very clear standard Chinese for students learning Chinese. Use a voice for telling fairytales. Speak slowly and clearly with appropriate pauses.",
  },
};

const LEVEL_CONFIG = {
  1: "Sprachniveau A1: sehr einfacher Wortschatz, kurze und klare Sätze, nur grundlegende alltägliche Wörter.",
  2: "Sprachniveau B1: mittlerer Wortschatz, flüssige und abwechslungsreiche Sätze.",
  3: "Deutlich über C2: sehr eloquenter, vielseitiger, präziser und literarischer Wortschatz; raffinierte Satzstrukturen; so anspruchsvoll, dass auch Muttersprachler gefordert werden.",
};

// continue story by 1-3 sentences
async function getContinuation(language, level, seedText, storyPlain = null, hint = null) {
  const lang = LANG_CONFIG[language];
  const levelDesc = LEVEL_CONFIG[level];

  const isStart = !storyPlain;
  const contextStory = storyPlain || seedText;

  const systemMessage = `Du bist ein kreativer Geschichtenerzähler, der unterhaltsame Geschichten auf ${lang.name} schreibt.
Sprachniveau: ${levelDesc}
${lang.annotationRule}
Schreibe den neuen Abschnitt als Fließtext (keine Zeilenumbrüche pro Wort).
Gib NUR den neuen Abschnitt aus (1–3 Sätze), nicht die bisherige Geschichte.`;

  let userMessage;
  if (isStart) {
    userMessage = `Führe diese Geschichte auf ${lang.name} um 1–3 Sätze weiter:\n\n"${seedText}"\n\n${lang.annotationReminder}`;
  } else {
    userMessage = `Bisherige Geschichte:\n"${contextStory}"\n\nHinweis für Fortsetzung: ${hint || "(kein Hinweis, einfach kohärent weiterführen)"}\n\nSchreibe die nächsten 1–3 Sätze kohärent im gleichen Stil.\n${lang.annotationReminder}`;
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content.trim();
}

// generate title
async function getTitle(storyPlain, language) {
  const lang = LANG_CONFIG[language];

  const systemMessage = `Du bist ein kreativer Autor, der treffende Titel für Geschichten erstellt.
Erstelle einen einzigartigen, prägnanten Titel (max. 5 Wörter) auf ${lang.titleLanguage}.
Gib nur den Titel aus, ohne Anführungszeichen oder Erklärungen.`;

  const userMessage = `Erstelle einen Titel für diese Geschichte:\n\n"${storyPlain}"`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
  });

  return response.choices[0].message.content.trim();
}

// generate speech audio
async function getSpeech(storyPlain, language) {
  const lang = LANG_CONFIG[language];

  const mp3 = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "nova",
    instructions: lang.ttsInstructions,
    input: storyPlain,
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  const base64Audio = buffer.toString("base64");
  return `data:audio/mpeg;base64,${base64Audio}`;
}

// route: start story
router.post("/start", async (req, res) => {
  const { language, level, seedText } = req.body;
  if (!language || !level || !seedText) {
    return res.status(400).json({ error: "language, level und seedText erforderlich." });
  }
  try {
    const continuation = await getContinuation(language, parseInt(level), seedText);
    res.json({ continuation });
  } catch (error) {
    console.error("Fehler beim Starten der Geschichte:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Geschichte." });
  }
});

// route: continue story
router.post("/continue", async (req, res) => {
  const { language, level, storyPlain, hint } = req.body;
  if (!language || !level || !storyPlain) {
    return res.status(400).json({ error: "language, level und storyPlain erforderlich." });
  }
  try {
    const continuation = await getContinuation(language, parseInt(level), null, storyPlain, hint);
    res.json({ continuation });
  } catch (error) {
    console.error("Fehler beim Fortsetzen der Geschichte:", error);
    res.status(500).json({ error: "Fehler beim Fortsetzen der Geschichte." });
  }
});

// route: title
router.post("/title", async (req, res) => {
  const { storyPlain, language } = req.body;
  if (!storyPlain || !language) {
    return res.status(400).json({ error: "storyPlain und language erforderlich." });
  }
  try {
    const title = await getTitle(storyPlain, language);
    res.json({ title });
  } catch (error) {
    console.error("Fehler beim Generieren des Titels:", error);
    res.status(500).json({ error: "Fehler beim Generieren des Titels." });
  }
});

// route: speech
router.post("/speech", async (req, res) => {
  const { storyPlain, language } = req.body;
  if (!storyPlain || !language) {
    return res.status(400).json({ error: "storyPlain und language erforderlich." });
  }
  try {
    const speech = await getSpeech(storyPlain, language);
    res.json({ speech });
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

export default router;
