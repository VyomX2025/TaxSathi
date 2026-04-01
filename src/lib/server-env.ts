import "server-only";

/**
 * Gemini API key: only `process.env.GEMINI_API_KEY` on the server.
 * Do not add NEXT_PUBLIC_* for this value (would expose the key in the browser).
 */
export function getGeminiApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY;
  return key && key.trim() !== "" ? key.trim() : undefined;
}
