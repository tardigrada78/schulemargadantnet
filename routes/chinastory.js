import { Router } from "express";
const router = Router();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import pinyin from "tiny-pinyin"; // https://github.com/creeperyang/pinyin/blob/master/README_EN.md

// create story
async function getStory() {
  const systemMessage = `Du bist ein kreativer Geschichtenerzähler, der unterhaltsame Geschichten auf Chinesisch verfasst.
    Deine Aufgabe ist es, eine originelle, kurzweilige Geschichte mit einem großen Wortschatz aus HSK1 zu schreiben. 
    Die Geschichte soll sich um Erwachsene und Tiere, nicht um Kinder handeln. 
    Halte die Geschichte lebendig, aber achte darauf, dass sie genau den vorgegebenen Formatierungsregeln entspricht.

    Zu verwendender Wortschatz (Empfehlung):
    我, 我们, 你, 他, 她, 这, 那, 哪, 哪儿, 谁, 什么, 多少, 几, 怎么, 怎么样, 一, 二, 三, 四, 五, 六, 七, 八, 九, 十, 个, 岁, 本, 些, 块, 不, 没, 很, 太, 都, 一点儿, 和, 在, 的, 了, 吗, 呢, 喂, 家, 学校, 饭店, 商店, 医院, 中国, 北京, 上, 下, 前面, 后面, 里, 今天, 明天, 昨天, 上午, 中午, 下午, 年, 月, 号, 星期, 点, 分钟, 现在, 时候, 爸爸, 妈妈, 儿子, 女儿, 老师, 学生, 同学, 朋友, 医生, 先生, 小姐, 衣服, 水, 菜, 米饭, 水果, 苹果, 茶, 杯子, 钱, 飞机, 出租车, 电视, 电脑, 电影, 天气, 猫, 狗, 东西, 人, 名字, 书, 汉语, 字, 桌子, 椅子, Verb, 谢谢, 不客气, 再见, 请, 对不起, 没关系, 是, 有, 看, 听, 说, 读, 写, 看见, 叫, 来, 回, 去, 吃, 喝, 睡觉, 打电话, 做, 买, 开, 坐, 住, 学习, 工作, 下雨, 爱, 喜欢, 想, 认识, 会, 能, 好, 大, 小, 多, 少, 冷, 热, 高兴, 漂亮
    
    Format:
    - Schreibe jedes chinesische Wort auf eine eigene Zeile.
    - Schreibe direkt nach jedem chinesischen Wort die deutsche Übersetzung in Klammern.
    - Beende jeden Satz mit einem Punkt.`;

  const userMessage = `Schreibe eine unterhaltsame Geschichte auf Chinesisch mit großem Wortschatz aus HSK1.
    Jedes Wort soll in einer neuen Zeile stehen.
    Nach jedem Wort soll die deutsche Übersetzung in Klammern stehen.
    Jeder Satz endet mit einem Punkt.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature: 0.8,
  });

  return response.choices[0].message.content;
}

// generate title
async function getTitle(story) {
  const systemMessage = `Du bist ein kreativer Autor, der treffende und abwechslungsreiche Titel für Geschichten erstellt.
    Deine Aufgabe ist es, einen einfallsreichen, aber prägnanten Titel für die folgende Geschichte zu generieren.
    
    Anforderungen:
    - Der Titel soll maximal fünf Wörter lang sein.
    - Er soll die Hauptidee oder das spannendste Element der Geschichte widerspiegeln.
    - Vermeide generische oder sich wiederholende Titel.
    - Gib nur den Titel aus, ohne Anführungszeichen oder zusätzliche Erklärungen.`;

  const userMessage = `Erstelle einen einzigartigen, prägnanten Titel für diese Geschichte:
    
    "${story}"`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
  });
  return response.choices[0].message.content.trim();
}

// generate picture
async function getPicture(story) {
  const gptprompt = `Erstelle eine einzelne, künstlerische Illustration basierend auf folgender chinesischen Geschichte:

    "${story}"

    Vorgaben:
    - Stil: Traditionelle chinesische Tuschmalerei (Shuǐmòhuà) modern interpretiert – fließende Pinselstriche, aber mit zeitgenössischen Elementen und Perspektiven.
    - Charaktere: Elegante, stilisierte chinesische Personen mit expressiven Gesichtern, traditionelle Proportionen aber moderne Kleidung oder Mischung aus historisch-modernen Elementen.
    - Linienführung: Charakteristische schwarze Tuschlinien verschiedener Stärken, von feinen Details bis zu kräftigen, ausdrucksstarken Konturen.
    - Farbpalette: Zurückhaltende, aber ausdrucksvolle Farben – Tuschechwarz, warme Erdtöne, sanfte Akzente in Rot, Gold oder Blau, mit modernen Farbverläufen.
    - Komposition: Asymmetrische Balance nach klassischen chinesischen Prinzipien, aber mit modernen räumlichen Konzepten und Perspektiven.
    - Umgebung: Mischung aus traditionellen chinesischen Elementen (Bambus, Berge, Wasser) und modernen urbanen Details (Hochhäuser im Nebel, moderne Architektur mit traditionellen Dächern).
    - Textur: Sichtbare Pinselstruktur und Papierqualität, aber digital verfeinert mit modernen Schattierungstechniken.
    - Atmosphäre: Poetische Stimmung mit Nebel, sanften Übergängen und dem charakteristischen "leeren Raum" der chinesischen Malerei, aber mit modernen Lichtsetzungen.
    - Keine sichtbaren Texte, Kalligrafie nur als dekoratives Element falls passend.
    - Zeitgenössische Interpretation: Moderne Gegenstände oder Situationen nahtlos in den traditionellen Malstil integriert.`;

  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: gptprompt,
      n: 1,
      size: "1024x1024",
    });
    return response.data[0].b64_json;
  } catch (error) {
    console.error("Fehler beim Generieren des Bildes:", error);
    throw new Error("Fehler beim Generieren des Bildes.");
  }
}

// generate speech audio output
async function getSpeech(story) {
  try {
    const mp3 = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      instructions:
        "Speak in a very clear standard Chinese language for students learning Chinese. Use a voice for telling fairytales.",
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

// route to translates Chinese to Pinyin
router.post("/convert", (req, res) => {
  const { text } = req.body;
  if (pinyin.isSupported() && text) {
    const pinyinText = pinyin.convertToPinyin(text, null, true);
    res.json({ pinyin: pinyinText });
  } else {
    res.status(400).json({ error: "Invalid input or Pinyin not supported" });
  }
});

export default router;
