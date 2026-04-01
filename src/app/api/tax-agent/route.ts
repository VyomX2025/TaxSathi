import { getGeminiApiKey } from "@/lib/server-env";

export const runtime = "nodejs";

export const maxDuration = 60;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

const FALLBACK_ERROR_TEXT = `Summary: Server error
Estimated Tax: N/A
Tax Saving Opportunities: N/A
Missing Information: Retry
Action Steps: Try again later`;

const GEMINI_REST_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

type GeminiRestResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: unknown;
  error?: { code?: number; message?: string; status?: string };
};

function buildPrompt(message: string) {
  return `
You are TAXsathi, an Indian tax expert.

User input:
${message}

Respond in this format:

Summary:
Estimated Tax:
Tax Saving Opportunities:
Missing Information:
Action Steps:
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: unknown };
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required." }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const url = new URL(GEMINI_REST_URL);
    url.searchParams.set("key", apiKey);

    const prompt = buildPrompt(message);

    const geminiRes = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const rawBody = await geminiRes.text();

    if (!geminiRes.ok) {
      console.error(
        "[tax-agent] Gemini REST error:",
        geminiRes.status,
        geminiRes.statusText,
        rawBody,
      );
      throw new Error(`Gemini API ${geminiRes.status}: ${rawBody.slice(0, 500)}`);
    }

    let data: GeminiRestResponse;
    try {
      data = JSON.parse(rawBody) as GeminiRestResponse;
    } catch (parseErr) {
      console.error("[tax-agent] Invalid JSON from Gemini:", rawBody);
      throw parseErr;
    }

    if (data.error) {
      console.error("[tax-agent] Gemini error field:", data.error);
      throw new Error(data.error.message ?? "Gemini API error");
    }

    console.log("[tax-agent] Gemini full REST response:", rawBody);

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";

    const trimmed = text.trim();

    console.log("[tax-agent] Gemini response text:", trimmed);

    if (!trimmed) {
      console.warn("[tax-agent] Empty Gemini text; returning fallback JSON.");
      return new Response(JSON.stringify({ text: FALLBACK_ERROR_TEXT }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ text: trimmed }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error("[tax-agent] FULL ERROR:", error);
    if (error instanceof Error) {
      console.error("[tax-agent] message:", error.message);
      console.error("[tax-agent] stack:", error.stack);
    }

    return new Response(JSON.stringify({ text: FALLBACK_ERROR_TEXT }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  }
}
