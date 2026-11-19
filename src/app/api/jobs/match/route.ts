import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadMatches } from "@/lib/matching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/jobs/match?limit=20  -> lowongan paling cocok dengan CV aktif user
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 20));
  const res = await loadMatches(supabase, limit);

  if (res.status === "no_cv") {
    return NextResponse.json({ error: "Belum ada CV aktif. Unggah CV terlebih dahulu." }, { status: 404 });
  }
  if (res.status === "error") return NextResponse.json({ error: res.message }, { status: 500 });
  return NextResponse.json({ cvId: res.cvId, matches: res.matches });
}
