import { PDFParse } from "pdf-parse";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 12_000;

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5 MB." },
        { status: 400 },
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { error: "Only PDF files are supported here. Use .txt in the browser." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    parser = new PDFParse({ data: buffer });
    const textResult = await parser.getText();
    let text = (textResult.text ?? "").trim();

    if (!text) {
      return NextResponse.json(
        { error: "No readable text found in this PDF." },
        { status: 422 },
      );
    }

    if (text.length > MAX_CHARS) {
      text = `${text.slice(0, MAX_CHARS)}\n\n... [truncated for length]`;
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error("extract-text error:", error);
    return NextResponse.json(
      { error: "Could not extract text from this PDF." },
      { status: 500 },
    );
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }
}
