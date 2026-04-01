"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  sections?: TaxSections;
  attachmentLabel?: string;
};

const MAX_DOC_CHARS = 12_000;

function truncateDoc(text: string) {
  const t = text.trim();
  if (t.length <= MAX_DOC_CHARS) return t;
  return `${t.slice(0, MAX_DOC_CHARS)}\n\n... [truncated for length]`;
}

async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isTxt =
    file.type === "text/plain" ||
    name.endsWith(".txt") ||
    name.endsWith(".text");

  if (isTxt) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(truncateDoc(String(reader.result ?? "")));
      reader.onerror = () => reject(new Error("Could not read this text file."));
      reader.readAsText(file);
    });
  }

  const isPdf =
    file.type === "application/pdf" || name.endsWith(".pdf");

  if (isPdf) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/extract-text", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as { text?: string; error?: string };
    if (!response.ok || !data.text) {
      throw new Error(data.error || "Could not extract text from this PDF.");
    }
    return truncateDoc(data.text);
  }

  throw new Error("Use a .pdf or .txt file.");
}

type TaxSections = {
  summary?: string;
  estimatedTax?: string;
  taxSaving?: string;
  missingInfo?: string;
  actionSteps?: string;
};

const prompts = [
  "I earn 12L salary, what tax do I pay?",
  "What deductions can I claim?",
  "Help me with GST filing",
];

function parseTaxSections(text: string): TaxSections {
  const sectionMap: Record<string, keyof TaxSections> = {
    Summary: "summary",
    "Estimated Tax": "estimatedTax",
    "Tax Saving Opportunities": "taxSaving",
    "Missing Information": "missingInfo",
    "Action Steps": "actionSteps",
  };

  const lines = text.split("\n");
  const parsed: TaxSections = {};
  let currentKey: keyof TaxSections | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const matchedHeader = Object.keys(sectionMap).find((header) =>
      line.startsWith(`${header}:`),
    );

    if (matchedHeader) {
      currentKey = sectionMap[matchedHeader];
      const firstContent = line.replace(`${matchedHeader}:`, "").trim();
      parsed[currentKey] = firstContent ? firstContent : "";
      continue;
    }

    if (currentKey) {
      parsed[currentKey] = `${parsed[currentKey] ?? ""}${parsed[currentKey] ? "\n" : ""}${line}`.trim();
    }
  }

  return parsed;
}

function formatInr(value: string) {
  const digits = value.replace(/[^\d.]/g, "");
  const amount = Number.parseFloat(digits);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [attachment, setAttachment] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasStarted = messages.length > 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const placeholder = useMemo(
    () => prompts[Math.floor(Math.random() * prompts.length)],
    [],
  );

  async function sendMessage(messageText?: string) {
    const typed = (messageText ?? input).trim();
    const hasDoc = Boolean(attachment?.text);
    if ((!typed && !hasDoc) || loading || extracting) return;

    const display =
      typed ||
      "Please review the attached document for tax-related insights.";

    const payload =
      hasDoc && attachment
        ? `${display}\n\n--- Document: ${attachment.name} ---\n${attachment.text}`
        : display;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: display,
      attachmentLabel: attachment?.name,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachment(null);
    setLoading(true);

    try {
      const response = await fetch("/api/tax-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: payload }),
      });
      const data = (await response.json()) as {
        response?: string;
        error?: string;
      };

      if (!response.ok || !data.response) {
        throw new Error(data.error || "Failed to get a response.");
      }

      const aiText = data.response.trim();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: aiText,
          sections: parseTaxSections(aiText),
        },
      ]);
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Summary: Unable to process the request.\nEstimated Tax: N/A\nTax Saving Opportunities: N/A\nMissing Information: Please retry with your income details.\nAction Steps: ${fallback}`,
          sections: {
            summary: "Unable to process the request.",
            estimatedTax: "N/A",
            taxSaving: "N/A",
            missingInfo: "Please retry with your income details.",
            actionSteps: fallback,
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileError("File too large. Maximum size is 5 MB.");
      return;
    }

    setFileError(null);
    setExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      setAttachment({ name: file.name, text });
    } catch (error) {
      setAttachment(null);
      setFileError(
        error instanceof Error ? error.message : "Could not read this file.",
      );
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,_#ffffff_0%,_#eef1f5_40%,_#e7ebf0_100%)] text-zinc-900">
      <main className="mx-auto flex h-screen w-full max-w-5xl flex-col px-4 pb-6 pt-6 sm:px-6">
        <section className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/60 shadow-[0_12px_50px_rgba(15,17,21,0.09)] backdrop-blur-2xl">
          <header className="border-b border-zinc-200/70 px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              TAXsathi
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">
              AI Tax Agent for India
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              File taxes, save money, and stay compliant in minutes
            </p>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            {!hasStarted && (
              <div className="fade-up mx-auto mt-8 max-w-2xl rounded-3xl border border-white/70 bg-white/70 p-8 text-center shadow-[0_8px_32px_rgba(16,24,40,0.08)] backdrop-blur-xl">
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
                  Plan taxes with confidence
                </h2>
                <p className="mt-3 text-zinc-600">
                  Ask anything about income tax, deductions, GST basics, or
                  compliance for individuals and MSMEs.
                </p>
                <div className="mt-6 flex flex-col gap-3 text-left">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-2xl border border-zinc-200/70 bg-white/90 px-4 py-3 text-sm text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`fade-up flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-3xl px-5 py-4 shadow-[0_4px_24px_rgba(15,17,21,0.08)] ${
                      message.role === "user"
                        ? "bg-zinc-900 text-white"
                        : "border border-white/70 bg-white/80 text-zinc-800 backdrop-blur-xl"
                    }`}
                  >
                    {message.role === "user" && message.attachmentLabel && (
                      <p className="mb-2 text-xs text-white/70">
                        Attachment · {message.attachmentLabel}
                      </p>
                    )}
                    {message.role === "assistant" && message.sections ? (
                      <div className="space-y-3">
                        {message.sections.summary && (
                          <div className="rounded-2xl bg-zinc-100/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Summary
                            </p>
                            <p className="mt-1 text-sm">{message.sections.summary}</p>
                          </div>
                        )}

                        {message.sections.estimatedTax && (
                          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Estimated Tax
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-900">
                              {formatInr(message.sections.estimatedTax)}
                            </p>
                          </div>
                        )}

                        {message.sections.taxSaving && (
                          <div className="rounded-2xl bg-emerald-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Tax Saving Opportunities
                            </p>
                            <p className="mt-1 text-sm whitespace-pre-wrap text-emerald-900">
                              {message.sections.taxSaving}
                            </p>
                          </div>
                        )}

                        {message.sections.actionSteps && (
                          <div className="rounded-2xl bg-zinc-100/90 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                              Action Steps
                            </p>
                            <p className="mt-1 text-sm whitespace-pre-wrap">
                              {message.sections.actionSteps}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content}
                      </p>
                    )}
                  </div>
                </article>
              ))}

              {loading && (
                <div className="fade-up flex justify-start">
                  <div className="rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-[0_4px_24px_rgba(15,17,21,0.08)] backdrop-blur-xl">
                    <div className="flex items-center gap-2 text-zinc-500">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />
                      <span className="ml-1 text-sm">TAXsathi is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <form
            onSubmit={onSubmit}
            className="border-t border-zinc-200/70 bg-white/65 p-4 backdrop-blur-xl sm:p-5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,text/plain,application/pdf"
              className="hidden"
              onChange={onFileSelected}
            />
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
              {attachment && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200/80 bg-white/90 px-4 py-2 text-sm text-zinc-700 shadow-sm">
                  <span className="truncate">
                    <span className="font-medium text-zinc-900">Attached</span>{" "}
                    · {attachment.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="shrink-0 rounded-xl px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    Remove
                  </button>
                </div>
              )}
              {fileError && (
                <p className="text-sm text-red-600">{fileError}</p>
              )}
              <div className="flex items-end gap-3">
                <button
                  type="button"
                  title="Attach PDF or text"
                  disabled={loading || extracting}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white/90 text-lg text-zinc-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {extracting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                  ) : (
                    "📎"
                  )}
                </button>
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  placeholder={placeholder}
                  rows={1}
                  disabled={loading || extracting}
                  className="max-h-40 min-h-12 flex-1 resize-y rounded-2xl border border-zinc-200 bg-white/85 px-4 py-3 text-sm text-zinc-900 shadow-inner outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={
                    loading ||
                    extracting ||
                    (!input.trim() && !attachment?.text)
                  }
                  className="rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                PDF or .txt up to 5 MB — text is sent with your message to the
                AI (not stored).
              </p>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
