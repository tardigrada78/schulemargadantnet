import express from "express";

import chinastory from "./routes/chinastory.js";
import chinasatz from "./routes/chinasatz.js";
import chinachat from "./routes/chinachat.js";
import factcheck from "./routes/factcheck.js";
import umfrage from "./routes/umfrage.js";
import interview from "./routes/interview.js";
import tutor from "./routes/tutor.js";
import abstracts from "./routes/abstracts.js";
import oralexamination from "./routes/oral_examination.js";
import news from "./routes/newsapi.js"; 
import virtualclass from "./routes/virtual_class.js"; 
import testeval from "./routes/testeval.js";
import oekobilanz from "./routes/oekobilanz.js";

import feedback from "./routes/feedback.js"; // in all pages, allowes feedback-form
import ragchat from "./routes/ragchat.js";
import overview from "./routes/overview.js";
import ideas from "./routes/ideas.js";
// add new routes here


const app = express();
// app.use(express.json());
app.use(express.static("public")); // 💡 Statische Dateien aus "public" freigeben
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use("/chinastory", chinastory);
app.use("/chinasatz", chinasatz);
app.use("/chinachat", chinachat);
app.use("/factcheck", factcheck);
app.use("/umfrage", umfrage);
app.use("/interview", interview);
app.use("/tutor", tutor);
app.use("/abstracts", abstracts);
app.use("/oralexamination", oralexamination);
app.use("/news", news);
app.use("/virtualclass", virtualclass);
app.use("/testeval", testeval);
app.use("/oekobilanz", oekobilanz);

app.use("/feedback", feedback);
app.use("/ragchat", ragchat);
app.use("/overview", overview);
app.use("/ideas", ideas);

// add new routes here


console.log("Server gestartet um:", new Date().toISOString());
app.listen(3000, () => {
  console.log("Server läuft auf Port 3000");
});