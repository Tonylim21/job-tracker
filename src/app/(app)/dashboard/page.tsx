import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadMatches } from "@/lib/matching";
import DashboardView from "@/components/dashboard/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [result, { data: apps }] = await Promise.all([
    loadMatches(supabase, 14),
    supabase.from("applications").select("job_id, status"),
  ]);

  const rows = apps ?? [];
  const stats = {
    total: rows.length,
    interview: rows.filter((a) => a.status === "interview").length,
    rejected: rows.filter((a) => a.status === "rejected").length,
    offered: rows.filter((a) => a.status === "offered").length,
  };

  return (
    <DashboardView
      userId={user.id}
      hasCv={result.status !== "no_cv"}
      error={result.status === "error" ? result.message : undefined}
      cvSkills={result.status === "ok" ? result.cvSkills : []}
      jobs={
        result.status === "ok"
          ? result.matches.map((m) => ({
              id: m.job_id,
              title: m.title,
              company: m.company_name,
              source: m.source,
              score: m.match_score,
              sim: m.similarity,
              remote: m.is_remote,
              location: m.location,
              url: m.apply_url,
              matched: m.matched,
              missing: m.missing,
            }))
          : []
      }
      stats={stats}
      appliedJobIds={rows.map((a) => a.job_id).filter((id): id is string => !!id)}
    />
  );
}
