import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedTexts } from "@/lib/ai/embeddings";
import { fetchJooble, fetchJSearch, fetchRemoteOK, type NormalizedJob } from "@/lib/jobs/sources";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  q: z.string().trim().min(2).max(80).default("software engineer"),
  location: z.string().trim().min(2).max(80).default("Indonesia"),
  // batas embedding per panggilan, karena kuota gratis Gemini terbatas
  maxEmbed: z.number().int().min(0).max(50).default(25),
});

const cut = (s: string | null, n: number) => (s == null ? null : s.slice(0, n));

export async function POST(req: Request) {
  // Boleh dipanggil user yang login, atau cron dengan CRON_SECRET.
  const isCron =
    !!process.env.CRON_SECRET && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parameter tidak valid", details: parsed.error.flatten() }, { status: 400 });
  }
  const { q, location, maxEmbed } = parsed.data;

  // 1. Ambil dari semua sumber secara paralel; satu sumber gagal tidak membatalkan yang lain
  const names = ["jooble", "jsearch", "remoteok"] as const;
  const enabled = { jooble: !!process.env.JOOBLE_API_KEY, jsearch: !!process.env.RAPIDAPI_KEY, remoteok: true };
  const settled = await Promise.allSettled([fetchJooble(q, location), fetchJSearch(q, location), fetchRemoteOK(q)]);

  const sources = settled.map((r, i) => ({
    source: names[i],
    fetched: r.status === "fulfilled" ? r.value.length : 0,
    ...(!enabled[names[i]] && { note: "API key belum diisi, dilewati" }),
    ...(r.status === "rejected" && { error: r.reason instanceof Error ? r.reason.message : "gagal" }),
  }));

  const unique = new Map<string, NormalizedJob>();
  for (const r of settled) {
    if (r.status === "fulfilled") for (const j of r.value) unique.set(`${j.source}:${j.external_id}`, j);
  }
  const jobs = [...unique.values()];

  // 2. Simpan; baris yang sudah ada (source + external_id sama) dilewati
  const admin = createAdminClient();
  let inserted = 0;
  if (jobs.length > 0) {
    const rows = jobs.map((j) => ({
      external_id: j.external_id.slice(0, 255),
      source: j.source,
      title: j.title.slice(0, 255),
      company_name: j.company_name.slice(0, 255),
      location: cut(j.location, 255),
      is_remote: j.is_remote,
      job_type: cut(j.job_type, 50),
      description: j.description || j.title,
      requirements_json: { skills: j.skills },
      apply_url: j.apply_url,
      salary_range: cut(j.salary_range, 100),
      posted_at: j.posted_at,
    }));
    const { data, error } = await admin
      .from("job_listings")
      .upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[jobs/fetch] upsert", error);
      return NextResponse.json({ error: "Gagal menyimpan lowongan", detail: error.message }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }

  // 3. Buat embedding untuk lowongan yang belum punya (termasuk sisa panggilan sebelumnya)
  let embedded = 0;
  let embedError: string | undefined;
  if (maxEmbed > 0) {
    const { data: pending } = await admin
      .from("job_listings")
      .select("id, title, company_name, description, requirements_json")
      .is("job_embedding", null)
      .order("created_at", { ascending: false })
      .limit(maxEmbed);

    if (pending && pending.length > 0) {
      try {
        const vectors = await embedTexts(
          pending.map((p) =>
            [
              p.title,
              p.company_name,
              ((p.requirements_json as { skills?: string[] } | null)?.skills ?? []).join(", "),
              p.description,
            ].join("\n")
          )
        );
        for (let i = 0; i < pending.length; i += 10) {
          const results = await Promise.all(
            pending.slice(i, i + 10).map((p, k) =>
              admin.from("job_listings").update({ job_embedding: JSON.stringify(vectors[i + k]) }).eq("id", p.id)
            )
          );
          embedded += results.filter((r) => !r.error).length;
        }
      } catch (e) {
        console.error("[jobs/fetch] embedding", e);
        embedError = "Embedding gagal. Cek GEMINI_API_KEY, atau kuota gratis Gemini sedang habis (coba lagi beberapa menit lagi atau kecilkan maxEmbed).";
      }
    }
  }

  const { count } = await admin
    .from("job_listings")
    .select("id", { count: "exact", head: true })
    .is("job_embedding", null);

  return NextResponse.json({
    q,
    location,
    sources,
    inserted,
    embedded,
    embeddingsPending: count ?? 0,
    ...(embedError && { embedError }),
  });
}
