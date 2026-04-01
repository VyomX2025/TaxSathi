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

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { code?: number; message?: string; status?: string };
};

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

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing API Key");
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are TAXsathi, an Indian tax expert.

User input:
${message}

Respond in format:

Summary:
Estimated Tax:
Tax Saving Opportunities:
Missing Information:
Action Steps:
`,
                },
              ],
            },
          ],
        }),
      },
    );

    let data: GeminiGenerateContentResponse;
    try {
      data = (await response.json()) as GeminiGenerateContentResponse;
    } catch (parseErr) {
      console.error(
        "[tax-agent] Failed to parse Gemini response as JSON:",
        parseErr,
      );
      throw parseErr;
    }

    console.log("Gemini RAW:", JSON.stringify(data));

    if (!response.ok) {
      console.error("[tax-agent] Gemini HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: data,
      });
      throw new Error(`Gemini API HTTP ${response.status}`);
    }

    if (data.error) {
      console.error("[tax-agent] Gemini error field:", data.error);
      throw new Error(data.error.message ?? "Gemini API error");
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from AI";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error("FULL ERROR:", error);
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
