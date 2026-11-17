// Gemini REST-Aufrufe für Bild (gemini-nano-banana-2.1) und Sprache (gemini-3.8-flash-tts)

const IMAGE_MODEL = "gemini-nano-banana-2.1";
const TTS_MODEL = "gemini-3.8-flash-tts";

async function geminiRequest(model, body) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini ${model}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function getInlineData(data, errorMessage) {
  const part = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData || p.inline_data
  );
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) throw new Error(errorMessage);
  return inline.data;
}

/**
 * Erzeugt ein quadratisches Bild.
 * @param {string} prompt
 * @returns {Promise<string>} Base64-String (JPEG)
 */
export async function geminiImage(prompt) {
  const data = await geminiRequest(IMAGE_MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1" },
    },
  });
  return getInlineData(data, "Keine Bilddaten in der Antwort.");
}

/**
 * Erzeugt Sprache. Die Stilanweisung steht in einem eigenen Abschnitt,
 * damit sie nicht mitgesprochen wird.
 * @param {string} text - Der zu sprechende Text
 * @param {string} style - Stilanweisung (Englisch empfohlen)
 * @param {string} voiceName - Gemini-Stimme, z.B. "Sulafat"
 * @returns {Promise<string>} Data-URL (audio/wav)
 */
export async function geminiSpeech(text, style, voiceName = "Sulafat") {
  const data = await geminiRequest(TTS_MODEL, {
    contents: [
      {
        parts: [{ text: `#### DIRECTOR NOTES\n${style}\n\n#### TRANSCRIPT\n${text}` }],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });
  // Das Modell liefert bereits ein fertiges WAV
  return `data:audio/wav;base64,${getInlineData(data, "Keine Audiodaten in der Antwort.")}`;
}
