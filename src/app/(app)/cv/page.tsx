import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CvStudio from "@/components/cv/CvStudio";

export default async function CvPage({ searchParams }: { searchParams: { job?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: cv }] = await Promise.all([
    supabase.from("profiles").select("ai_consent_at").eq("id", user.id).single(),
    supabase.from("cv_profiles").select("id, created_at, target_role, parsed_json, storage_path").eq("is_active", true).maybeSingle(),
  ]);

  // Dari Dashboard: /cv?job=<id> langsung membuka Studio perbaikan untuk lowongan itu
  let initialImprove: { id: string; label: string } | null = null;
  const jobId = searchParams.job;
  if (cv && jobId && /^[0-9a-f-]{36}$/i.test(jobId)) {
    const { data: j } = await supabase.from("job_listings").select("id, title, company_name").eq("id", jobId).maybeSingle();
    if (j) initialImprove = { id: j.id, label: `${j.title} · ${j.company_name}` };
  }

  return (
    <CvStudio
      userId={user.id}
      hasConsent={!!profile?.ai_consent_at}
      cv={cv ? { id: cv.id, created_at: cv.created_at, target_role: cv.target_role, parsed: cv.parsed_json ?? {}, storagePath: cv.storage_path } : null}
      initialImprove={initialImprove}
    />
  );
}
