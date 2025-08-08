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
  const invisibleDiv = document.getElementById("invisible");
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


// Verbesserte Funktion zum Generieren eines PDF-Dokuments aus HTML-Inhalt
export async function generatePdfFile(htmlString, selected) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const contentDiv = document.createElement("div");

  // Umfassende PDF-spezifische Styles
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    @page {
      margin: 2cm;
      size: A4;
    }
    
    body { 
      background: white !important; 
      color: black !important; 
      font-family: Arial, sans-serif;
      font-size: 12pt;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    
    .pdf-title {
      background-color: #ff6600 !important;
      color: white !important;
      padding: 20px !important;
      margin: 0 0 20px 0 !important;
      text-align: center !important;
      font-size: 24pt !important;
      font-weight: bold !important;
      border-radius: 8px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    .pdf-objectives {
      background-color: #f5f5f5 !important;
      border-left: 4px solid #ff6600 !important;
      padding: 15px !important;
      margin: 20px 0 !important;
      border-radius: 4px !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    
    .pdf-objectives h2 {
      color: #ff6600 !important;
      margin-top: 0 !important;
      font-size: 16pt !important;
    }
    
    .pdf-objectives ul {
      margin: 10px 0 !important;
      padding-left: 20px !important;
    }
    
    .pdf-objectives li {
      color: #333 !important;
      margin: 8px 0 !important;
      list-style-type: disc !important;
      list-style-position: outside !important;
    }
    
    h1, h2, h3, h4, h5, h6 { 
      color: #ff6600 !important; 
      margin: 20px 0 10px 0 !important;
      page-break-after: avoid !important;
    }
    
    h1 { font-size: 20pt !important; }
    h2 { font-size: 18pt !important; }
    h3 { font-size: 16pt !important; }
    h4 { font-size: 14pt !important; }
    
    p { 
      color: black !important; 
      margin: 10px 0 !important;
      text-align: justify !important;
      orphans: 3;
      widows: 3;
    }
    
    ul, ol { 
      color: black !important; 
      margin: 10px 0 !important;
      padding-left: 20px !important;
    }
    
    li { 
      color: black !important; 
      margin: 5px 0 !important;
      list-style-type: disc !important;
      list-style-position: outside !important;
    }
    
    ol li {
      list-style-type: decimal !important;
    }
    
    strong, b {
      color: #ff6600 !important;
      font-weight: bold !important;
    }
    
    em, i {
      font-style: italic !important;
    }
    
    /* Verhindert Seitenumbrüche in ungünstigen Bereichen */
    .pdf-content {
      page-break-inside: avoid !important;
    }
  `;

  contentDiv.appendChild(styleElement);

  // Titel mit Orange-Hintergrund
  const titleElement = document.createElement("div");
  titleElement.className = "pdf-title";
  titleElement.textContent = "Skript zu den Lernzielen";
  contentDiv.appendChild(titleElement);

  // Lernziele-Bereich mit Hintergrund
  const objectivesContainer = document.createElement("div");
  objectivesContainer.className = "pdf-objectives";

  const objectivesTitle = document.createElement("h2");
  objectivesTitle.textContent = "Erfasste Lernziele";
  objectivesContainer.appendChild(objectivesTitle);

  const selectedList = document.createElement("ul");
  selected.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    selectedList.appendChild(li);
  });
  objectivesContainer.appendChild(selectedList);
  contentDiv.appendChild(objectivesContainer);

  // Content-Bereich
  const contentSection = document.createElement("div");
  contentSection.className = "pdf-content";
  contentSection.innerHTML = doc.body.innerHTML;
  contentDiv.appendChild(contentSection);

  // Verbesserte PDF-Optionen
  const options = {
    margin: [0.8, 0.6, 0.8, 0.6], // top, left, bottom, right in inches
    filename: "Skript.pdf",
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      width: 794, // A4 width in pixels at 96 DPI
      height: 1123 // A4 height in pixels at 96 DPI
    },
    jsPDF: {
      unit: "in",
      format: "a4",
      orientation: "portrait",
      compress: true
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy']
    }
  };

  try {
    await html2pdf().from(contentDiv).set(options).save();
  } catch (error) {
    console.error("Fehler beim PDF-Export:", error);
    alert("Fehler beim Erstellen der PDF-Datei. Bitte versuchen Sie es erneut.");
  }
}