import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

import { getGeminiApiKey } from "@/lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 60;

const FALLBACK_TEXT = `
Summary: Unable to process request
Estimated Tax: N/A
Tax Saving Opportunities: N/A
Missing Information: Try again
Action Steps: Please retry
`.trim();

export async function POST(request: Request) {
  try {
    const { message } = (await request.json()) as { message?: string };

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("API key missing");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
You are TAXsathi, an Indian tax expert.

User input:
${message.trim()}

Return:

Summary:
Estimated Tax:
Tax Saving Opportunities:
Missing Information:
Action Steps:
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim();

    if (!text) {
      return NextResponse.json({ text: FALLBACK_TEXT });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Tax agent error:", error);

    return NextResponse.json({ text: FALLBACK_TEXT });
  }
}
