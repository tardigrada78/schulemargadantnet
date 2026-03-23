mermaid.initialize({ startOnLoad: false, theme: "dark" });

let PERSONAS = [];

// Personas vom Server laden und Grid aufbauen
async function loadPersonas() {
  const res = await fetch("/ideas/personas");
  PERSONAS = await res.json();
  renderPersonaCheckboxes();
}

function renderPersonaCheckboxes() {
  const grid = document.getElementById("personasGrid");
  grid.innerHTML = "";

  PERSONAS.forEach((p) => {
    const label = document.createElement("label");
    label.className = "persona-check-label checked";
    label.htmlFor = `persona-${p.id}`;

    label.innerHTML = `
      <input type="checkbox" id="persona-${p.id}" value="${p.id}" checked />
      <div class="persona-check-info">
        <span class="persona-check-title">${p.emoji} ${p.name}</span>
      </div>
    `;

    const cb = label.querySelector("input");
    cb.addEventListener("change", () => {
      label.classList.toggle("checked", cb.checked);
    });

    grid.appendChild(label);
  });
}

function setAll(checked) {
  document.querySelectorAll("#personasGrid input[type='checkbox']").forEach((cb) => {
    cb.checked = checked;
    cb.closest("label").classList.toggle("checked", checked);
  });
}
window.setAll = setAll;

function getSelectedPersonas() {
  const checked = [...document.querySelectorAll("#personasGrid input[type='checkbox']:checked")].map(
    (cb) => cb.value
  );
  return PERSONAS.filter((p) => checked.includes(p.id));
}

function createPersonaCard(persona) {
  const card = document.createElement("div");
  card.className = "persona-card";
  card.id = `card-${persona.id}`;
  card.innerHTML = `
    <div class="persona-card-header">
      <span>${persona.emoji}</span>
      <span>${persona.name}</span>
      <span class="spinner" id="spinner-${persona.id}"></span>
    </div>
    <div class="persona-card-body" id="body-${persona.id}" style="color:#555; font-style:italic;">lädt…</div>
  `;
  return card;
}

function updatePersonaCard(persona, ideas) {
  const spinner = document.getElementById(`spinner-${persona.id}`);
  const body = document.getElementById(`body-${persona.id}`);
  if (spinner) spinner.remove();
  if (body) {
    body.style.color = "";
    body.style.fontStyle = "";
    body.innerHTML = renderMarkdown(ideas);
  }
}

// Einfaches Markdown → HTML (bold, listen, zeilenumbrüche)
function renderMarkdown(text) {
  const lines = text.split("\n");
  const out = [];
  let inList = false;

  for (let line of lines) {
    line = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Bold
    line = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic (single *)
    line = line.replace(/\*(.+?)\*/g, "<em>$1</em>");

    const listMatch = line.match(/^(\s*[-*]|\s*\d+\.)\s+(.*)/);
    if (listMatch) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${listMatch[2]}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      if (line.trim() === "") {
        out.push("<br/>");
      } else {
        out.push(`<p>${line}</p>`);
      }
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function setStatus(text) {
  document.getElementById("globalStatus").textContent = text;
}

async function brainstormPersona(topic, persona) {
  const res = await fetch("/ideas/brainstorm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, persona }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data.ideas;
}

async function synthesize(topic, allIdeas) {
  const res = await fetch("/ideas/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, allIdeas }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data.synthesis;
}

async function generateMindmap(topic, synthesis) {
  const res = await fetch("/ideas/mindmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, synthesis }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data.mermaidCode;
}

async function renderMermaid(code) {
  try {
    const id = "mindmap-" + Date.now();
    const { svg } = await mermaid.render(id, code);
    document.getElementById("mindmapDiv").innerHTML = svg;
    document.getElementById("mindmapCode").textContent = code;
    document.getElementById("mindmapBlock").style.display = "";
  } catch (err) {
    console.error("Mermaid-Fehler:", err);
    document.getElementById("mindmapDiv").innerHTML =
      `<p style="color:#f05;">⚠️ Mindmap konnte nicht gerendert werden.</p>` +
      `<pre style="font-size:0.75rem;color:#888;">${code}</pre>`;
    document.getElementById("mindmapCode").textContent = code;
    document.getElementById("mindmapBlock").style.display = "";
  }
}

document.getElementById("startBtn").addEventListener("click", async () => {
  const topic = document.getElementById("topicInput").value.trim();
  if (!topic) {
    alert("Bitte ein Thema eingeben.");
    return;
  }

  const selectedPersonas = getSelectedPersonas();
  if (selectedPersonas.length === 0) {
    alert("Bitte mindestens eine Perspektive auswählen.");
    return;
  }

  // UI zurücksetzen
  const resultsGrid = document.getElementById("resultsGrid");
  resultsGrid.innerHTML = "";
  resultsGrid.style.display = "";
  document.getElementById("synthesisBlock").style.display = "none";
  document.getElementById("mindmapBlock").style.display = "none";
  document.getElementById("startBtn").disabled = true;
  setStatus(`⚙️ ${selectedPersonas.length} Perspektiven werden bearbeitet…`);

  // Cards sofort einblenden
  selectedPersonas.forEach((p) => {
    resultsGrid.appendChild(createPersonaCard(p));
  });

  // Parallele Brainstorm-Calls – jeder aktualisiert seine Card sobald fertig
  const allIdeas = [];
  const promises = selectedPersonas.map((persona) =>
    brainstormPersona(topic, persona)
      .then((ideas) => {
        updatePersonaCard(persona, ideas);
        allIdeas.push({ personaName: persona.name, personaEmoji: persona.emoji, ideas });
      })
      .catch((err) => {
        updatePersonaCard(persona, `❌ Fehler: ${err.message}`);
      })
  );

  await Promise.allSettled(promises);

  if (allIdeas.length === 0) {
    setStatus("❌ Keine Ideen erhalten.");
    document.getElementById("startBtn").disabled = false;
    return;
  }

  // Synthese
  setStatus("🔗 Synthese wird erstellt…");
  let synthesis = "";
  try {
    synthesis = await synthesize(topic, allIdeas);
    const synthBlock = document.getElementById("synthesisBlock");
    document.getElementById("synthesisContent").innerHTML = renderMarkdown(synthesis);
    synthBlock.style.display = "";
  } catch (err) {
    setStatus("❌ Fehler bei der Synthese: " + err.message);
    document.getElementById("startBtn").disabled = false;
    return;
  }

  // Mindmap
  setStatus("🗺️ Mindmap wird generiert…");
  try {
    const mermaidCode = await generateMindmap(topic, synthesis);
    await renderMermaid(mermaidCode);
  } catch (err) {
    setStatus("⚠️ Mindmap-Fehler: " + err.message);
  }

  setStatus("✅ Fertig");
  document.getElementById("startBtn").disabled = false;
});

// Init
loadPersonas();
