import express from "express";

import chinastory from "./routes/chinastory.js";
import chinasatz from "./routes/chinasatz.js";
import factcheck from "./routes/factcheck.js";
import umfrage from "./routes/umfrage.js";
import interview from "./routes/interview.js";
import tutor from "./routes/tutor.js";
import abstracts from "./routes/abstracts.js";
import oralexamination from "./routes/oral_examination.js";
import news from "./routes/newsapi.js"; // not linked in schule.margadant.net 
import overview from "./routes/overview.js"; // not linked in schule.margadant.net 
import feedback from "./routes/feedback.js"; // in all pages, allowes feedback-form
// add new routes here


const app = express();
app.use(express.json());
app.use(express.static("public")); // 💡 Statische Dateien aus "public" freigeben


app.use("/chinastory", chinastory);
app.use("/chinasatz", chinasatz);
app.use("/factcheck", factcheck);
app.use("/umfrage", umfrage);
app.use("/interview", interview);
app.use("/tutor", tutor);
app.use("/abstracts", abstracts);
app.use("/oralexamination", oralexamination);
app.use("/news", news);
app.use("/overview", overview);
app.use("/feedback", feedback);
// add new routes here


app.get('/test-tutor', async (req, res) => {
    console.log("Test-Route wurde aufgerufen");
    await doScript("test properties", 100, "de");
    res.send("Test completed - check console");
});

console.log("Server gestartet um:", new Date().toISOString());


app.listen(3000, () => {
  console.log("Server läuft auf Port 3000");
});
