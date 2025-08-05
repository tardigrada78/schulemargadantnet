// JavaScript Funktionen für KI-Lern-Tutor

// Funktion um Lernziele zu erfassen
export function processObjectives() {
  const textarea = document.getElementById("assesssmentStatements");
  const linesArray = textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const select = document.getElementById("objectivesSelect");
  select.innerHTML = "";
  linesArray.forEach((item, index) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
  const invisibleDiv = document.getElementById("invisible"); // vereinfachen
  invisibleDiv.style.display = "block";
}

// Funktion um Antwort zu überprüfen
export async function checkAnswer(answerText, questionText, language, assistant_id) {
  document.getElementById("progressDiv").innerHTML = `<p>⚙️ Überprüfe Antwort...</p>`;
  try {
    let response = await fetch(`/tutor/checkAnswer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answer: answerText,
        question: questionText,
        language: language,
        assistant_id: assistant_id
      }),
    });
    let result = await response.json();
    document.getElementById("progressDiv").innerHTML = ``;
    document.getElementById("resultDiv").innerHTML = "<h2>Rückmeldung auf die Antwort</h2>" + result.feedback;
  } catch (error) {
    console.error("Fehler beim Überprüfen der Antwort:", error);
    document.getElementById("progressDiv").innerHTML = `<p>❌ Fehler beim Überprüfen der Antwort.</p>`;
  }
}

// Funktion zum Generieren der Word-Datei direkt im Browser
export async function generateWordFile(textData, selected) {
  const selectedList = selected.map(
    // Lernziele
    (item) =>
      new docx.Paragraph({
        text: "- " + item,
        spacing: { after: 100 },
      })
  );
  const doc = new docx.Document({
    sections: [
      {
        properties: {},
        children: [
          new docx.Paragraph({
            text: "Skript zu den Lernzielen",
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          }),
          ...selectedList,
          new docx.Paragraph({
            spacing: { after: 300 },
          }),
          ...textData,
        ],
      },
    ],
  });
  const blob = await docx.Packer.toBlob(doc);
  saveAs(blob, "Skript.docx");
}

// Funktion um HTML-String in docx.js Paragraphen umzuwandeln
export function generateDocxElementsFromHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const elements = Array.from(doc.body.children);
  let docxElements = [];
  elements.forEach((el) => {
    switch (el.tagName.toUpperCase()) {
      case "H1":
        docxElements.push(
          new docx.Paragraph({
            text: el.textContent,
            heading: docx.HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          })
        );
        break;
      case "H4":
        docxElements.push(
          new docx.Paragraph({
            text: el.textContent,
            heading: docx.HeadingLevel.HEADING_2,
            spacing: { after: 300 },
          })
        );
        break;
      case "P":
        docxElements.push(
          new docx.Paragraph({
            text: el.textContent,
            spacing: { after: 200 },
          })
        );
        break;
      case "UL": // Ungeordnete Liste
        Array.from(el.children).forEach((li) => {
          docxElements.push(
            new docx.Paragraph({
              text: "• " + li.textContent,
              spacing: { after: 100 },
            })
          );
        });
        break;
      case "OL": // Geordnete Liste
        Array.from(el.children).forEach((li, index) => {
          docxElements.push(
            new docx.Paragraph({
              text: index + 1 + ". " + li.textContent,
              spacing: { after: 100 },
            })
          );
        });
        break;
      default:
        // Falls unbekanntes Element: als einfacher Absatz behandeln
        docxElements.push(
          new docx.Paragraph({
            text: el.textContent,
            spacing: { after: 200 },
          })
        );
    }
  });
  return docxElements;
}


// Funktion um Mermaid-Diagramm zu erstellen
export async function openMermaidLive(mermaidCode) {
  if (!mermaidCode || typeof mermaidCode !== "string") {
    alert("❌ Fehler: Kein gültiger Diagramm-Code erhalten.");
    return;
  }
  mermaidCode = mermaidCode.replace(/```mermaid|```/g, "").trim();
  const graphContainer = document.getElementById("mermaid");
  graphContainer.innerHTML = `<div class="mermaid">${mermaidCode}</div>`;
  const innerMermaidDiv = graphContainer.querySelector(".mermaid");
  try {
    await mermaid.run({ nodes: [innerMermaidDiv] });
  } catch (error) {
    console.error("Mermaid-Render-Fehler:", error);
    alert("❌ Fehler beim Rendern des Diagramms: " + error.message);
  }
}


// Funktion zum Generieren eines PDF-Dokuments aus HTML-Inhalt
export async function generatePdfFile(htmlString, selected) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const contentDiv = document.createElement("div");
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    body { background: white; color: black; }
    h1, h2, h3, h4, h5, h6 { color: orange; }
    p, ul, ol, li { color: black; }
  `;
  contentDiv.appendChild(styleElement);
  const titleElement = document.createElement("h1");
  titleElement.textContent = "Skript zu den Lernzielen";
  contentDiv.appendChild(titleElement);
  const selectedList = document.createElement("ul");
  selected.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    selectedList.appendChild(li);
  });
  contentDiv.appendChild(selectedList);
  contentDiv.innerHTML += doc.body.innerHTML;
  const options = {
    margin: 0.5,
    filename: "Skript.pdf",
    html2canvas: { scale: 2 },
    jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
  };
  await html2pdf().from(contentDiv).set(options).save();
}

// Funktion um Sprachausgabe zu generieren
export async function generatePodcastAudio(podcastText) {
  let response = await fetch("/tutor/getPodcastAudio", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ podcastText }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fehler beim Generieren der Sprachdatei: ${errorText}`);
  }
  let data = await response.json();
  return data.speech;
}
