import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

// Placeholder: dipakai untuk menguji auth + RLS. Dashboard 3D menyusul di langkah berikutnya.
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>
      <p className="eyebrow">CAREERNODE · DASHBOARD</p>
      <h1 style={{ fontSize: 56, marginBottom: 16 }}>
        Halo, <em>{profile?.full_name ?? "…"}</em>
      </h1>
      <div className="box">
        <p className="hint">
          Auth dan database terhubung. Profil dibaca lewat RLS: {profile?.email ?? "profil belum ada"}
        </p>
      </div>
      <div style={{ marginTop: 16 }}>
        <SignOutButton />
      </div>
    </main>
  );
}
