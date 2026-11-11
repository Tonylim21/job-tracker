"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "register";

const COPY = {
  login: {
    chap: "Bab I / II",
    eyebrow: "BAB I — MASUK",
    lede: "Lamaran, jadwal, dan balasan HR tersimpan rapi dalam satu peta node.",
  },
  register: {
    chap: "Bab II / II",
    eyebrow: "BAB II — DAFTAR",
    lede: "Hubungkan CV, biarkan AI mencocokkan, lalu lihat node lowonganmu saling terhubung.",
  },
};

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Email atau kata sandi salah.";
  if (m.includes("not confirmed")) return "Email belum dikonfirmasi. Cek kotak masuk kamu.";
  if (m.includes("already registered")) return "Email ini sudah terdaftar. Coba masuk.";
  if (m.includes("provider")) return "Login Google belum diaktifkan di Supabase.";
  if (m.includes("password")) return "Kata sandi belum memenuhi syarat (minimal 8 karakter).";
  return "Terjadi kesalahan: " + message;
}

const emit = (name: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

export default function AuthView({
  mode,
  next = "/dashboard",
  initialError,
}: {
  mode: Mode;
  next?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(initialError ? "Login gagal. Coba lagi." : "");

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const c = COPY[mode];

  // Scene 3D di layout mendengarkan event ini (lihat AuthScene.tsx)
  useEffect(() => {
    emit("cn:turn", mode);
  }, [mode]);
  useEffect(() => {
    const vals = mode === "login" ? [email, password] : [name, email, password];
    emit("cn:reveal", vals.filter((v) => v.trim()).length / vals.length);
  }, [mode, name, email, password]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    if (!formRef.current?.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    setBusy(true);
    const supabase = createClient();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg(friendlyError(error.message));
        setBusy(false);
        return;
      }
      emit("cn:warp");
      router.replace(safeNext);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name.trim() }, // dibaca trigger handle_new_user
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) {
      setMsg(friendlyError(error.message));
      setBusy(false);
      return;
    }
    if (data.session) {
      emit("cn:warp");
      router.replace(safeNext);
      router.refresh();
    } else {
      setMsg("Akun dibuat. Cek email untuk konfirmasi, lalu masuk.");
      setBusy(false);
    }
  }

  async function google() {
    setMsg("");
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}` },
    });
    if (error) setMsg(friendlyError(error.message));
  }

  return (
    <main className="stage">
      <header className="top">
        <span className="brand">
          CareerNode<i>/ connecting your skills</i>
        </span>
        <span className="chap">{c.chap}</span>
      </header>

      <section>
        <p className="eyebrow">{c.eyebrow}</p>
        <h1>
          {mode === "login" ? (
            <>
              Lanjutkan
              <br />
              <em>ceritamu.</em>
            </>
          ) : (
            <>
              Mulai bab
              <br />
              <em>yang baru.</em>
            </>
          )}
        </h1>
        <p className="lede">{c.lede}</p>
      </section>

      <section className="panel">
        <nav className="tabs" aria-label="Masuk atau daftar">
          <Link href="/login" aria-current={mode === "login" ? "page" : undefined}>
            Masuk
          </Link>
          <Link href="/register" aria-current={mode === "register" ? "page" : undefined}>
            Daftar
          </Link>
        </nav>

        <form ref={formRef} onSubmit={onSubmit} noValidate>
          {mode === "register" && (
            <div>
              <label htmlFor="name">Nama lengkap</label>
              <input id="name" type="text" autoComplete="name" placeholder="Nama kamu" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" placeholder="nama@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password">Kata sandi</label>
            <div className="pw">
              <input
                id="password"
                type={showPw ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                placeholder={mode === "register" ? "Minimal 8 karakter" : "••••••••"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="reveal" aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
                {showPw ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Memproses…" : mode === "login" ? "Masuk →" : "Buat akun →"}
          </button>
          <div className="or">ATAU</div>
          <button className="btn alt" type="button" onClick={google}>
            {mode === "login" ? "Lanjut dengan Google" : "Daftar dengan Google"}
          </button>
        </form>
        <p className="status" role="status" aria-live="polite">
          {msg}
        </p>
      </section>

      <footer className="foot">Connecting your skills to the right node.</footer>
    </main>
  );
}
