export const runtime = "nodejs";

export const maxDuration = 60;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

const FALLBACK_TEXT = `Summary: Server error fixed soon
Estimated Tax: N/A
Tax Saving Opportunities: N/A
Missing Information: Retry
Action Steps: Try again`;

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
      throw new Error("Missing GEMINI_API_KEY");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
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
    });

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    if (!response.ok) {
      console.error("Gemini ERROR:", data);
      throw new Error("Gemini failed");
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    console.error("FINAL ERROR:", error);

    return new Response(
      JSON.stringify({
        text: FALLBACK_TEXT,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
}
