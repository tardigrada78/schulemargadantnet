import { Router } from "express";
const router = Router();
import { callAI } from "../aiCall.js";
import { geminiImage, geminiSpeech } from "../geminiCall.js";

// create story
async function getStory() {
  const systemMessage = `Du bist ein kreativer Geschichtenerzähler, der unterhaltsame Geschichten auf Chinesisch verfasst.
    Deine Aufgabe ist es, eine originelle, kurzweilige Geschichte mit einem abwechslungsreichen Wortschatz aus HSK1 zu schreiben. 
    Die Geschichte soll sich um Erwachsene und Tiere, nicht um Kinder handeln. 
    Halte die Geschichte lebendig, aber achte darauf, dass sie genau den vorgegebenen Formatierungsregeln entspricht.
  
    Format:
    - Schreibe jedes chinesische Wort auf eine eigene Zeile.
    - Schreibe direkt nach jedem chinesischen Wort die deutsche Übersetzung in Klammern.
    - Beende jeden Satz mit einem Punkt.`;

  const userMessage = `Schreibe eine unterhaltsame Geschichte auf Chinesisch mit großem Wortschatz aus HSK1.
    Jedes Wort soll in einer neuen Zeile stehen.
    Nach jedem Wort soll die deutsche Übersetzung in Klammern stehen.
    Jeder Satz endet mit einem Punkt.`;

  return await callAI(`${systemMessage}\n\n${userMessage}`, "anthropic/claude-sonnet-5-5", 0.8, 6000);
}

// generate title
async function getTitle(story) {
  const systemMessage = `Du bist ein kreativer Autor, der treffende und abwechslungsreiche Titel für Geschichten erstellt.
    Deine Aufgabe ist es, einen einfallsreichen, aber prägnanten Titel für die folgende Geschichte zu generieren.
    
    Anforderungen:
    - Der Titel soll maximal fünf Wörter lang sein.
    - Er soll die Hauptidee oder das spannendste Element der Geschichte widerspiegeln.
    - Vermeide generische oder sich wiederholende Titel.
    - Schreibe den Titel auf Deutsch.
    - Gib nur den Titel aus, ohne Anführungszeichen oder zusätzliche Erklärungen.`;

  const userMessage = `Erstelle einen einzigartigen, prägnanten Titel für diese Geschichte:
    
    "${story}"`;
  return (await callAI(`${systemMessage}\n\n${userMessage}`, "anthropic/claude-haiku-5-5", 0.7, 2000)).trim();
}

// generate picture
async function getPicture(story) {
  const gptprompt = `Erstelle eine einzelne, künstlerische Illustration basierend auf folgender chinesischen Geschichte:

    "${story}"

    Vorgaben:
    - Stil: Traditionelle chinesische Tuschmalerei (Shuǐmòhuà) modern interpretiert – fließende Pinselstriche, aber mit zeitgenössischen Elementen und Perspektiven.
    - Farbe: Bewahre den historischen und traditionellen Stil, verwende aber Farben.
    - Keine sichtbaren Texte, Kalligrafie nur als dekoratives Element falls passend.
    - Zeitgenössische Interpretation: Moderne Gegenstände oder Situationen nahtlos in den traditionellen Malstil integriert.
    - Charaktere und Umgebung: Zeichne nur Tiere und Personen welche in der Geschichte vorkommen. 
    - Setze die in der Geschichte erwähnte Umgebung in eine modernes chinesische Variante.`;

  try {
    return await geminiImage(gptprompt);
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    throw new Error("Fehler beim Generieren des Bildes.");
  }
}

// generate speech audio output
async function getSpeech(story) {
  try {
    const instructions =
      "Style: very clear standard Mandarin Chinese for students learning Chinese, the voice of a calm fairytale narrator. Speak slowly and clearly with appropriate pauses.";
    return await geminiSpeech(story, instructions, "Sulafat");
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// route for story
router.post("/", async (req, res) => {
  try {
    const story = await getStory();
    res.json({ story });
  } catch (error) {
    console.error("Fehler beim Generieren der Geschichte:", error);
    res.status(500).send("Fehler beim Generieren der Geschichte.");
  }
});

// route for title
router.post("/title", async (req, res) => {
  const { story } = req.body;
  try {
    const title = await getTitle(story);
    res.json({ title });
  } catch (error) {
    console.error("Fehler beim Generieren des Titels:", error);
    res.status(500).send("Fehler beim Generieren des Titels.");
  }
});

// route for picture
router.post("/picture", async (req, res) => {
  const { story } = req.body;
  try {
    const imageBase64 = await getPicture(story);
    res.json({ image: imageBase64 });
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    res.status(500).json({ error: "Fehler beim Generieren des Bildes." });
  }
});

// route for speech audio output
router.post("/speech", async (req, res) => {
  const { story } = req.body;
  try {
    const speechData = await getSpeech(story); // Base64-String
    res.json({ speech: speechData }); // JSON mit Base64-String zurückgeben
  } catch (error) {
    console.error("Fehler beim Generieren der Sprachdatei:", error);
    res.status(500).json({ error: "Fehler beim Generieren der Sprachdatei." });
  }
});

export default router;
