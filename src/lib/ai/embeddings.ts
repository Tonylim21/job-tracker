import { AiHttpError } from "./errors";

// Embedding via Google Gemini API (tier gratis), lewat REST tanpa SDK.
// Catatan: text-embedding-004 sudah dimatikan Google (14 Jan 2026). Penggantinya
// gemini-embedding-001 mendukung output 768 dimensi lewat outputDimensionality,
// jadi kolom VECTOR(768) di database tetap dipakai.
export const EMBEDDING_DIM = 768;
const MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";

const BATCH_SIZE = 25; // dibuat kecil karena kuota gratis terbatas
const MAX_CHARS = 2500; // ~600 token per teks; batas model 2048 token
const MAX_RETRIES = 2;

// RETRIEVAL_DOCUMENT untuk lowongan, RETRIEVAL_QUERY untuk CV (CV "mencari" lowongan)
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// gemini-embedding-001 hanya otomatis ter-normalisasi pada 3072 dimensi; untuk 768 harus manual.
function l2normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function embedBatch(texts: string[], task: EmbedTask): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY belum diisi");

  const body = JSON.stringify({
    requests: texts.map((t) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text: t.slice(0, MAX_CHARS) }] },
      taskType: task,
      outputDimensionality: EMBEDDING_DIM,
    })),
  });

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body,
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      }
    );

    if (res.ok) {
      const data = (await res.json()) as { embeddings?: { values: number[] }[] };
      const list = data.embeddings ?? [];
      if (list.length !== texts.length) throw new Error("Jumlah embedding dari Gemini tidak sesuai");
      return list.map((e) => {
        if (e.values.length !== EMBEDDING_DIM) {
          throw new Error(`Dimensi embedding ${e.values.length} != ${EMBEDDING_DIM}`);
        }
        return l2normalize(e.values);
      });
    }

    // 429 = kuota gratis habis sementara; tunggu lalu coba lagi
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(8000 * (attempt + 1));
      continue;
    }
    throw new AiHttpError("gemini", res.status, (await res.text()).slice(0, 300));
  }
}

/** Embedding untuk banyak teks (dibagi per BATCH_SIZE). Hasil berurutan sama dengan input. */
export async function embedTexts(inputs: string[], task: EmbedTask = "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(inputs.slice(i, i + BATCH_SIZE), task)));
  }
  return out;
}
