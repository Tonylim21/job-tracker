import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppTabs from "@/components/app/AppTabs";
import SignOutButton from "@/components/SignOutButton";
import "@/styles/app.css";

// Topbar + tab navigasi untuk semua halaman setelah login.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: cv }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("cv_profiles").select("id").eq("is_active", true).maybeSingle(),
  ]);

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="app">
        <header className="bar">
          <span className="brand">CareerNode</span>
          <div className="chips">
            <span className="chip">
              <span className={cv ? "dot" : "dot off"} />
              CV: {cv ? "AKTIF" : "BELUM ADA"}
            </span>
            <span className="chip" title="Sinkronisasi Gmail dibuat di Phase 6">
              <span className="dot off" />
              Gmail: BELUM TERHUBUNG
            </span>
            <span className="chip">{profile?.full_name ?? user.email}</span>
            <SignOutButton />
          </div>
        </header>
        <AppTabs />
        {children}
      </div>
    </>
  );
}
