import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  GoogleGenerativeAIResponseError,
} from "@google/generative-ai";
import type { EnhancedGenerateContentResponse } from "@google/generative-ai";
import { NextResponse } from "next/server";

import { getGeminiApiKey } from "@/lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 60;

const ERROR_FALLBACK_TEXT = `
Summary: Error processing request
Estimated Tax: N/A
Tax Saving Opportunities: N/A
Missing Information: Please retry
Action Steps: Try again later
`.trim();

function logFullGeminiResponse(
  response: EnhancedGenerateContentResponse,
  text: string,
) {
  const payload = {
    text,
    candidates: response.candidates,
    promptFeedback: response.promptFeedback,
    usageMetadata: response.usageMetadata,
  };
  try {
    console.log(
      "[tax-agent] Gemini full response:",
      JSON.stringify(payload, null, 2),
    );
  } catch {
    console.log("[tax-agent] Gemini text:", text);
    console.log("[tax-agent] Gemini candidates:", response.candidates);
    console.log("[tax-agent] Gemini promptFeedback:", response.promptFeedback);
    console.log("[tax-agent] Gemini usageMetadata:", response.usageMetadata);
  }
}

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
      throw new Error("Missing API Key");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `
You are TAXsathi, an Indian tax expert.

User input:
${message.trim()}

Respond clearly:

Summary:
Estimated Tax:
Tax Saving Opportunities:
Missing Information:
Action Steps:
`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    logFullGeminiResponse(response, text);

    if (!text) {
      console.warn("[tax-agent] Empty text from Gemini; returning fallback.");
      return NextResponse.json({ text: ERROR_FALLBACK_TEXT });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[tax-agent] API ERROR:", error);

    if (error instanceof GoogleGenerativeAIFetchError) {
      console.error("[tax-agent] Fetch error:", {
        status: error.status,
        statusText: error.statusText,
        message: error.message,
      });
    } else if (error instanceof GoogleGenerativeAIResponseError) {
      console.error("[tax-agent] Response error:", {
        message: error.message,
        response: error.response,
      });
    } else if (error instanceof Error) {
      console.error("[tax-agent] Error message:", error.message);
      console.error("[tax-agent] Error stack:", error.stack);
    }

    return NextResponse.json({ text: ERROR_FALLBACK_TEXT });
  }
}
