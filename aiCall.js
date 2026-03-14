import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

// Clients
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ollamaClient = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
  apiKey: "ollama",
});

// OpenAI Reasoning-Modelle unterstützen keine Temperatur
function supportsTemperature(model) {
  return !/^o[1-9]/.test(model);
}

/**
 * Universelle KI-Funktion
 * @param {string} prompt      - Der Prompt
 * @param {string} providerModel - z.B. "openai/gpt-4.1", "anthropic/claude-sonnet-4-5", "ollama/qwen2.5:9b"
 * @param {number} temperature - Temperatur (0.0 - 1.0)
 * @param {number} maxTokens   - Maximale Tokens (default: 1000)
 * @returns {Promise<string>}  - Die Antwort als Text
 */
export async function callAI(prompt, providerModel, temperature = 0.6, maxTokens = 1000) {
  const slashIndex = providerModel.indexOf("/");
  const provider = providerModel.slice(0, slashIndex);
  const model = providerModel.slice(slashIndex + 1);

  if (provider === "anthropic") {
    const params = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature,
    };
    const response = await anthropicClient.messages.create(params);
    return response.content[0].text;
  }

  // OpenAI und Ollama verwenden denselben Client-Typ
  const client = provider === "ollama" ? ollamaClient : openaiClient;
  const params = {
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    ...(supportsTemperature(model) && { temperature }),
  };
  const response = await client.chat.completions.create(params);
  return response.choices[0].message.content;
}
