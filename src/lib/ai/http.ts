import { NextResponse } from "next/server";
import { AiHttpError } from "./errors";

/** Mengubah error dari Groq/Gemini menjadi respons HTTP yang jelas. Mengembalikan null bila bukan error AI. */
export function aiErrorResponse(err: unknown): NextResponse | null {
  if (!(err instanceof AiHttpError)) return null;
  const who = err.provider === "groq" ? "Groq" : "Gemini";
  if (err.status === 429) {
    return NextResponse.json({ error: "Kuota gratis AI sedang habis. Coba lagi beberapa menit lagi." }, { status: 429 });
  }
  if (err.status === 401 || err.status === 403) {
    return NextResponse.json({ error: `API key ${who} tidak valid atau tidak punya akses. Cek .env.local lalu restart server.` }, { status: 502 });
  }
  if (err.status === 404) {
    return NextResponse.json({ error: "Model AI tidak ditemukan (kemungkinan sudah dipensiunkan). Cek GROQ_MODEL di .env.local." }, { status: 502 });
  }
  return null;
}
