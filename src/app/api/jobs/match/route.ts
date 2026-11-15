import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normSkill as norm } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kalibrasi Match Score: skor = (cos - FLOOR) / SPAN * 100, dibatasi 0-100.
// Nilai awal ini PERKIRAAN untuk gemini-embedding-001; atur lewat .env.local setelah melihat sebaran angka "cos".
const FLOOR = Number.parseFloat(process.env.MATCH_SCORE_FLOOR ?? "") || 0.45;
const SPAN = Number.parseFloat(process.env.MATCH_SCORE_SPAN ?? "") || 0.25;

type MatchRow = {
  job_id: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  apply_url: string;
  source: string;
  similarity: number;
  match_score: number;
};

// GET /api/jobs/match?limit=20  -> lowongan paling cocok dengan CV aktif user
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));

  const { data: cv } = await supabase
    .from("cv_profiles")
    .select("id, parsed_json")
    .eq("is_active", true)
    .maybeSingle();
  if (!cv) return NextResponse.json({ error: "Belum ada CV aktif. Unggah CV terlebih dahulu." }, { status: 404 });

  // RLS tetap berlaku (security invoker): hanya CV milik user yang bisa dipakai
  const { data: rows, error } = await supabase.rpc("match_jobs_for_cv", {
    p_cv_id: cv.id,
    p_limit: limit,
    p_floor: FLOOR,
    p_span: SPAN,
  });
  if (error) {
    console.error("[jobs/match] rpc", error);
    return NextResponse.json({ error: "Gagal menghitung kecocokan (cek migration match_jobs)." }, { status: 500 });
  }
  const matches = (rows ?? []) as MatchRow[];

  // Skill yang diminta tiap lowongan vs skill di CV
  const ids = matches.map((m) => m.job_id);
  const reqById = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: reqs } = await supabase.from("job_listings").select("id, requirements_json").in("id", ids);
    for (const r of reqs ?? []) {
      reqById.set(r.id, ((r.requirements_json as { skills?: string[] } | null)?.skills ?? []).slice(0, 20));
    }
  }
  const cvSkills = new Set(((cv.parsed_json as { skills?: string[] } | null)?.skills ?? []).map(norm));

  return NextResponse.json({
    cvId: cv.id,
    matches: matches
      .filter((m) => /^https?:\/\//i.test(m.apply_url)) // hanya tautan http(s)
      .map((m) => {
        const skills = reqById.get(m.job_id) ?? [];
        return {
          ...m,
          matched: skills.filter((s) => cvSkills.has(norm(s))),
          missing: skills.filter((s) => !cvSkills.has(norm(s))),
        };
      }),
  });
}
