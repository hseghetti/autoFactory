export interface OllamaResult {
  success: boolean;
  text: string;
  error?: string;
}

/**
 * Calls a local Ollama model via its HTTP API (POST /api/generate).
 * Used for the low-cost local reasoning steps (planning, UX validation).
 */
export async function callOllama(params: {
  model: string;
  prompt: string;
  host?: string;
}): Promise<OllamaResult> {
  const host = params.host ?? process.env.OLLAMA_HOST ?? "http://localhost:11434";

  try {
    const response = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: params.model, prompt: params.prompt, stream: false }),
    });

    if (!response.ok) {
      return {
        success: false,
        text: "",
        error: `Ollama HTTP ${response.status}: ${await response.text()}`,
      };
    }

    const data = (await response.json()) as { response?: string };
    return { success: true, text: data.response ?? "" };
  } catch (error) {
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
