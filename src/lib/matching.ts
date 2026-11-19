import type { SupabaseClient } from "@supabase/supabase-js";
import { normSkill } from "@/lib/skills";

// Kalibrasi Match Score: skor = (cos - FLOOR) / SPAN * 100, dibatasi 0-100.
// Nilai awal ini PERKIRAAN untuk gemini-embedding-001; atur lewat .env.local setelah melihat sebaran angka "cos".
const FLOOR = Number.parseFloat(process.env.MATCH_SCORE_FLOOR ?? "") || 0.45;
const SPAN = Number.parseFloat(process.env.MATCH_SCORE_SPAN ?? "") || 0.25;

export type Match = {
  job_id: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  apply_url: string;
  source: string;
  similarity: number;
  match_score: number;
  matched: string[]; // skill lowongan yang ada di CV
  missing: string[]; // skill lowongan yang belum terdeteksi di CV
};

type Row = Omit<Match, "matched" | "missing">;

export type MatchResult =
  | { status: "no_cv" }
  | { status: "error"; message: string }
  | { status: "ok"; cvId: string; cvSkills: string[]; matches: Match[] };

/** Lowongan paling cocok untuk CV aktif user (RLS berlaku lewat client yang dipakai). */
export async function loadMatches(supabase: SupabaseClient, limit: number): Promise<MatchResult> {
  const { data: cv } = await supabase.from("cv_profiles").select("id, parsed_json").eq("is_active", true).maybeSingle();
  if (!cv) return { status: "no_cv" };
  const cvSkills = ((cv.parsed_json as { skills?: string[] } | null)?.skills ?? []).filter(Boolean);

  const { data: rows, error } = await supabase.rpc("match_jobs_for_cv", {
    p_cv_id: cv.id,
    p_limit: limit,
    p_floor: FLOOR,
    p_span: SPAN,
  });
  if (error) {
    console.error("[matching] rpc", error);
    return { status: "error", message: "Gagal menghitung kecocokan (cek migration match_jobs)." };
  }

  const list = ((rows ?? []) as Row[]).filter((m) => /^https?:\/\//i.test(m.apply_url)); // hanya tautan http(s)
  const ids = list.map((m) => m.job_id);
  const reqById = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: reqs } = await supabase.from("job_listings").select("id, requirements_json").in("id", ids);
    for (const r of reqs ?? []) {
      reqById.set(r.id, ((r.requirements_json as { skills?: string[] } | null)?.skills ?? []).slice(0, 20));
    }
  }

  const have = new Set(cvSkills.map(normSkill));
  const matches = list.map((m): Match => {
    const skills = reqById.get(m.job_id) ?? [];
    return {
      ...m,
      matched: skills.filter((s) => have.has(normSkill(s))),
      missing: skills.filter((s) => !have.has(normSkill(s))),
    };
  });
  return { status: "ok", cvId: cv.id, cvSkills, matches };
}
