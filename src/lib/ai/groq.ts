import type { z } from "zod";
import { AiHttpError } from "./errors";

// Semua kebutuhan LLM (parsing CV, cover letter, klasifikasi email HR) lewat satu modul ini.
// Groq memakai format yang kompatibel dengan OpenAI, jadi cukup fetch tanpa SDK.
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// llama-3.3-70b-versatile dipensiunkan Groq pada 16 Agu 2026. Model bisa diganti lewat GROQ_MODEL;
// kalau model ditolak karena sudah tidak ada, kode otomatis mencoba model berikutnya di bawah ini.
const FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const CONFIGURED = process.env.GROQ_MODEL?.trim();
const CANDIDATES = Array.from(new Set([CONFIGURED, ...FALLBACK_MODELS].filter((m): m is string => !!m)));
export const GROQ_MODEL = CANDIDATES[0];

const MAX_RETRIES = 2;
let activeModel: string | null = null; // model yang terakhir berhasil (per instance server)

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type Opts = { temperature?: number; maxTokens?: number; json?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isModelGone = (status: number, detail: string) =>
  status === 404 || (status === 400 && /decommission|does not exist|model_not_found/i.test(detail));

function buildBody(model: string, messages: ChatMessage[], opts: Opts) {
  return JSON.stringify({
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    // Pada model reasoning (gpt-oss), token "berpikir" ikut dihitung di batas ini
    max_completion_tokens: opts.maxTokens ?? 2000,
    ...(model.startsWith("openai/gpt-oss") && { reasoning_effort: "low" }),
    // JSON mode: prompt WAJIB menyebut kata "JSON"
    ...(opts.json && { response_format: { type: "json_object" } }),
  });
}

export async function groqChat(messages: ChatMessage[], opts: Opts = {}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY belum diisi");

  const order = activeModel ? [activeModel, ...CANDIDATES.filter((m) => m !== activeModel)] : CANDIDATES;
  let lastGone: AiHttpError | null = null;

  for (const model of order) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: buildBody(model, messages, opts),
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });

      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Groq mengembalikan respons kosong");
        activeModel = model;
        return text;
      }

      const detail = (await res.text()).slice(0, 300);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const wait = Number(res.headers.get("retry-after")) || 5;
        await sleep(Math.min(wait, 15) * 1000);
        continue;
      }
      if (isModelGone(res.status, detail)) {
        console.warn(`[groq] model "${model}" tidak tersedia, mencoba model berikutnya`);
        lastGone = new AiHttpError("groq", res.status, detail);
        break; // lanjut ke model berikutnya
      }
      throw new AiHttpError("groq", res.status, detail);
    }
  }
  throw lastGone ?? new Error("Tidak ada model Groq yang tersedia");
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
    // Beberapa model membungkus JSON dengan teks lain: ambil blok { ... } terluar
    const m = text.match(/\{[\s\S]*\}/);
    try {
      json = m ? JSON.parse(m[0]) : undefined;
    } catch {
      json = undefined;
    }
  }
  if (json === undefined) throw new Error("Groq tidak mengembalikan JSON yang valid");
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error("JSON dari Groq tidak sesuai skema");
  return parsed.data;
}
