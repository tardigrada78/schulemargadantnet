// Zentrale KI-Konfiguration
// Jede Site verwendet entweder Stufe "stark" oder "schnell"

export const AI_TIERS = {
  stark: {
    label: "Stark",
    models: [
      { value: "openai/gpt-4.1",                        label: "OpenAI GPT-4.1" },
      { value: "anthropic/claude-sonnet-4-5",           label: "Anthropic Sonnet" },
      { value: "ollama/qwen3.5:9b",                     label: "Ollama qwen3.5:9b (lokal)" },
    ],
  },
  schnell: {
    label: "Schnell",
    models: [
      { value: "openai/gpt-4.1-nano",                    label: "OpenAI GPT-4.1-nano" },
      { value: "anthropic/claude-haiku-4-5-20251001",    label: "Anthropic Haiku" },
      { value: "ollama/qwen3.5:9b",                      label: "Ollama qwen3.5:9b (lokal)" },
    ],
  },
};

// Standardmodell pro Stufe (erstes in der Liste)
export function getDefaultModel(tier) {
  return AI_TIERS[tier].models[0].value;
}
