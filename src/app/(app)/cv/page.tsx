import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CvStudio from "@/components/cv/CvStudio";

export default async function CvPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: cv }] = await Promise.all([
    supabase.from("profiles").select("ai_consent_at").eq("id", user.id).single(),
    supabase.from("cv_profiles").select("id, created_at, target_role, parsed_json").eq("is_active", true).maybeSingle(),
  ]);

  return (
    <CvStudio
      userId={user.id}
      hasConsent={!!profile?.ai_consent_at}
      cv={cv ? { id: cv.id, created_at: cv.created_at, target_role: cv.target_role, parsed: cv.parsed_json ?? {} } : null}
    />
  );
}
