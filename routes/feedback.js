import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();  // lädt die Variablen aus .env
const router = express.Router();
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: !['localhost', '127.0.0.1', 'sr45.firestorm.ch'].includes(process.env.SMTP_HOST)
  }
});

transporter.verify(function(error, success) {
  if (error) {
    console.log("SMTP connection error:", error);
  } else {
    console.log("SMTP server is ready to take our messages");
  }
});

router.post("/send-feedback", express.urlencoded({ extended: true }), async (req, res) => {
  const { pageUrl, message } = req.body;
  try {
    await transporter.sendMail({
      from: `"Web‑Feedback" <${process.env.SMTP_USER}>`,
      to: "daniel.margadant@gmail.com",
      subject: `Feedback schule.margadant.net zu ${pageUrl}`,
      text: message,
    });
    res.send("Danke für dein Feedback!");
  } catch (err) {
    console.error("Fehler beim Versenden der Feedback‑Mail:", err);
    console.log("User:", process.env.SMTP_USER);
    console.log("Host:", process.env.SMTP_HOST);
    console.log("Error details:", err.message);
    res.status(500).send("Fehler beim Senden.");
  }
});
 
export default router;