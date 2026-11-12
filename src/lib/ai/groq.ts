import type { z } from "zod";
import { AiHttpError } from "./errors";

// Semua kebutuhan LLM (parsing CV, cover letter, klasifikasi email HR) lewat satu modul ini.
// Groq memakai format yang kompatibel dengan OpenAI, jadi cukup fetch tanpa SDK.
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const MAX_RETRIES = 2;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Opts = { temperature?: number; maxTokens?: number; json?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function groqChat(messages: ChatMessage[], opts: Opts = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY belum diisi");

  const body = JSON.stringify({
    model: GROQ_MODEL,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 1500,
    // JSON mode: prompt WAJIB menyebut kata "JSON"
    ...(opts.json && { response_format: { type: "json_object" } }),
  });

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body,
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Groq mengembalikan respons kosong");
      return text;
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const wait = Number(res.headers.get("retry-after")) || 5;
      await sleep(Math.min(wait, 15) * 1000);
      continue;
    }
    throw new AiHttpError("groq", res.status, (await res.text()).slice(0, 300));
  }
}

/** Minta Groq menjawab JSON, lalu validasi dengan skema zod. */
export async function groqJson<S extends z.ZodTypeAny>(
  messages: ChatMessage[],
  schema: S,
  opts: Omit<Opts, "json"> = {}
): Promise<z.infer<S>> {
  const text = await groqChat(messages, { temperature: 0, ...opts, json: true });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Groq tidak mengembalikan JSON yang valid");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error("JSON dari Groq tidak sesuai skema");
  return parsed.data;
}
