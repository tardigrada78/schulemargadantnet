// Erlaubt Chatten mit einer RAG-Datenbank via Google Vertex AI Search
// Version mit direktem REST API Call für Summary Support

import express from 'express';

const router = express.Router();

router.post("/getChat", async (req, res) => {
  const chatContent = req.body.chatContent;
  const dataStoreId = req.body.dataStoreId;
  const language = req.body.language;

  // Konfiguration
  const projectId = "schule-margadant-net";
  const location = "global";
  const servingConfigId = "default_config";

  try {
    // Google Auth Token holen (verwendet Application Default Credentials)
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    // API Endpoint
    const url = `https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/${servingConfigId}:search`;

    // Request Body
    const requestBody = {
      query: chatContent,
      pageSize: 10,
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount: 5,
          includeCitations: true,
          modelPromptSpec: {
            preamble: `Answer exclusively in ${language}. You are a helpful assistant for high school students. 
            Give a precise, profound and complete answer. Answer only the question and primarily use the given documents. 
            Answer only as text, without markdown or HTML.`
          },
          useSemanticChunks: true
        }
      }
    };

    // API Call
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Verarbeite die Antwort
    let summaryText = "";
    const sources = [];

    if (data.summary && data.summary.summaryText) {
      summaryText = data.summary.summaryText;

      // Sammle Quellenangaben
      if (data.summary.summaryWithMetadata && data.summary.summaryWithMetadata.references) {
        for (const ref of data.summary.summaryWithMetadata.references) {
          const title = ref.title || "";
          const uri = ref.uri || "";
          const filename = uri.split('/').pop() || uri;

          if (ref.chunkContents) {
            for (const chunk of ref.chunkContents) {
              const page = chunk.pageIdentifier || "";
              if (page) {
                sources.push({
                  title: title,
                  filename: filename,
                  page: page
                });
              }
            }
          }
        }
      }
    }

    // Zähle wie viele [1] es im Text gibt
    const citationCount = (summaryText.match(/\[1\]/g) || []).length;

    // Begrenze die Quellen auf die Anzahl der Zitate im Text
    const limitedSources = sources.slice(0, citationCount);

    // Ersetze alle [1] durch Platzhalter, dann durch Nummern
    let modifiedText = summaryText;
    for (let i = 1; i <= citationCount; i++) {
      modifiedText = modifiedText.replace('[1]', `<<CITE${i}>>`, 1);
    }

    // Dann Platzhalter durch finale Nummern ersetzen
    for (let i = 1; i <= citationCount; i++) {
      modifiedText = modifiedText.replace(`<<CITE${i}>>`, `[${i}]`);
    }

    // Erstelle Quellenangaben-Array
    const formattedSources = limitedSources.map((source, index) => {
      return `[${index + 1}] ${source.title} (${source.filename}). Page ${source.page}`;
    });

    // Sende Antwort zurück
    res.json({
      chatAnswer: modifiedText,
      sources: formattedSources
    });

  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: "An error occurred while processing your request",
      details: error.message
    });
  }
});

export default router;