import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are TAXsathi, an expert Indian tax consultant AI helping individuals and MSMEs.

Your responsibilities:

* Understand user's income and financial data
* Estimate tax liability (old vs new regime if possible)
* Suggest deductions (80C, 80D, HRA, business expenses)
* Identify missing inputs
* Provide clear next steps

Respond STRICTLY in this structured format:

Summary:
Estimated Tax:
Tax Saving Opportunities:
Missing Information:
Action Steps:`;

export async function POST(request: Request) {
  try {
    const { message } = (await request.json()) as { message?: string };

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server configuration error. Missing GEMINI_API_KEY." },
        { status: 500 },
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const result = await model.generateContent([
      SYSTEM_PROMPT,
      `User input: ${message.trim()}`,
    ]);

    const text = result.response.text()?.trim();
    if (!text) {
      return NextResponse.json(
        { error: "No response generated. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error("Tax agent error:", error);
    return NextResponse.json(
      {
        error:
          "TAXsathi is temporarily unavailable. Please try again in a moment.",
      },
      { status: 500 },
    );
  }
}
