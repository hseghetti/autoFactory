export interface OllamaResult {
  success: boolean;
  text: string;
  error?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

interface OllamaGenerateResponse {
  response?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
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

    const data = (await response.json()) as OllamaGenerateResponse;
    return {
      success: true,
      text: data.response ?? "",
      tokensIn: data.prompt_eval_count,
      tokensOut: data.eval_count,
      // total_duration is in nanoseconds.
      durationMs: data.total_duration !== undefined ? Math.round(data.total_duration / 1e6) : undefined,
    };
  } catch (error) {
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
