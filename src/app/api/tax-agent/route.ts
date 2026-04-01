export const runtime = "nodejs";

export const maxDuration = 60;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
} as const;

const FALLBACK_TEXT = `Summary: Server error
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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: message }],
            },
          ],
        }),
      },
    );

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    console.log("FULL GEMINI RESPONSE:", data);

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error("FINAL ERROR:", err);

    return new Response(
      JSON.stringify({
        text: FALLBACK_TEXT,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  }
}
