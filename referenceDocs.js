import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "data/docs_pu");

let cachedDocs = null;

export function getReferenceDocuments() {
  if (cachedDocs) return cachedDocs;
  try {
    cachedDocs = fs.readdirSync(DOCS_DIR)
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => ({
        name: f,
        mediaType: "application/pdf",
        base64: fs.readFileSync(path.join(DOCS_DIR, f)).toString("base64"),
      }));
  } catch (error) {
    console.error("Fehler beim Laden der Referenzdokumente:", error);
    cachedDocs = [];
  }
  return cachedDocs;
}
