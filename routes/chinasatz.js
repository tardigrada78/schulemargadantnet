import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Funktion um Satz zu schreiben
async function doSentence() {
  const prompt = `Schreibe einen kreativen, abwechslungsreichen und interessanten Satz mit dem Wortschatz von HSK1 für einen Anfänger in Chinesisch. Achte darauf, dass die Sätze nicht immer gleich beginnen.

    ### **Anforderungen:**
    - Vermeide häufige Satzanfänge wie "我和朋友..." oder "我在学校..."
    - Nutze mindestens **6 verschiedene Wörter** aus der folgenden Liste:
      我, 我们, 你, 他, 她, 这, 那, 哪, 哪儿, 谁, 什么, 多少, 几, 怎么, 怎么样, 一, 二, 三, 四, 五, 六, 七, 八, 九, 十, 个, 岁, 本, 些, 块, 不, 没, 很, 太, 都, 一点儿, 和, 在, 的, 了, 吗, 呢, 喂, 家, 学校, 饭店, 商店, 医院, 中国, 北京, 上, 下, 前面, 后面, 里, 今天, 明天, 昨天, 上午, 中午, 下午, 年, 月, 号, 星期, 点, 分钟, 现在, 时候, 爸爸, 妈妈, 儿子, 女儿, 老师, 学生, 同学, 朋友, 医生, 先生, 小姐, 衣服, 水, 菜, 米饭, 水果, 苹果, 茶, 杯子, 钱, 飞机, 出租车, 电视, 电脑, 电影, 天气, 猫, 狗, 东西, 人, 名字, 书, 汉语, 字, 桌子, 椅子, Verb, 谢谢, 不客气, 再见, 请, 对不起, 没关系, 是, 有, 看, 听, 说, 读, 写, 看见, 叫, 来, 回, 去, 吃, 喝, 睡觉, 打电话, 做, 买, 开, 坐, 住, 学习, 工作, 下雨, 爱, 喜欢, 想, 认识, 会, 能, 好, 大, 小, 多, 少, 冷, 热, 高兴, 漂亮。
    - **Satzlänge:** Zwischen **15 und 30 Zeichen**.
    - Der Satz soll eine kleine **Alltagsszene, eine unerwartete Situation oder einen Dialog** darstellen.
    - Nutze verschiedene Satzstrukturen, z. B. Fragen, Befehle oder indirekte Aussagen.
    - Schreibe den Satz direkt auf Chinesisch ohne zusätzliche Erklärungen oder Übersetzungen.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-nano",
    messages: [{ role: "user", content: prompt }],
    temperature: 1.0, // Erhöht die Kreativität und Variation
    max_tokens: 50, // Begrenzt die Länge, um präzise Antworten zu erhalten
  });
  return response.choices[0].message.content;
}

// Funktion um Audioausgabe zu erstellen
async function getSpeech(story) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      instructions: "Speak in a very clear standard Chinese language for students learning Chinese. Use a voice for telling fairytales.",
      input: story,
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64Audio = buffer.toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("Fehler bei der Sprachsynthese:", error);
    throw new Error("Fehler beim Generieren der Sprachdatei.");
  }
}

// Funktion für Übersetzung
async function doTranslation(sentence) {
  const prompt = `Übersetze den folgenden chinesischen Satz auf Deutsch:

    ${sentence}
    
    Wichtig:
    - Übersetze Wort für Wort, auch wenn dabei Verständlichkeit und Grammatik leiden`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-nano",
    messages: [{ role: "user", content: prompt }],
    // temperature: 0.8,
  });
  return response.choices[0].message.content;
}

// Route für Satz-Generierung
router.post("/sentence", async (req, res) => {
  try {
    const sentence = await doSentence();
    res.json({ sentence });
  } catch (error) {
    console.error("Fehler beim Generieren des Satzes:", error);
    res.status(500).send("Fehler beim Generieren des Satzes.");
  }
});

// Route für Audioausgabe
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

// Route für Übersetzung
router.post("/getTranslation", async (req, res) => {
  try {
    const { sentence } = req.body;
    const translation = await doTranslation(sentence);
    res.json({ translation });
  } catch (error) {
    console.error("Fehler beim Überprüfen der Antwort:", error);
    res.status(500).send("Fehler beim Überprüfen der Antwort.");
  }
});

export default router;
