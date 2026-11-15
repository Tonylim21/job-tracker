"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CvImprove from "./CvImprove";

type ParsedCv = {
  headline?: string | null;
  skills?: string[];
  experience?: { company?: string | null; title?: string | null; start?: string | null; end?: string | null }[];
  education?: { institution?: string | null; degree?: string | null }[];
  projects?: { name?: string | null }[];
};
type CvRow = { id: string; created_at: string; target_role: string | null; parsed: ParsedCv };
type Match = {
  job_id: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  apply_url: string;
  source: string;
  similarity: number;
  match_score: number;
  matched: string[];
  missing: string[];
};

const SOURCE_LABEL: Record<string, string> = { remoteok: "Remote OK", jooble: "Jooble", jsearch: "JSearch" };
const MAX_BYTES = 5 * 1024 * 1024;

export default function CvStudio({ userId, hasConsent, cv }: { userId: string; hasConsent: boolean; cv: CvRow | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(hasConsent);
  const [showConsent, setShowConsent] = useState(false);
  const [agree, setAgree] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState(cv?.target_role ?? "");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [msg, setMsg] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [improve, setImprove] = useState<{ id: string; label: string } | null>(null);

  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/jobs/match?limit=20", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Gagal memuat kecocokan.");
        setMatches([]);
      } else {
        setMatches(data.matches ?? []);
      }
    } catch {
      setMsg("Gagal menghubungi server.");
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => {
    if (cv?.id) loadMatches();
  }, [cv?.id, loadMatches]);

  // ESC menutup modal
  useEffect(() => {
    if (!showConsent) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowConsent(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConsent]);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setMsg("File harus berformat PDF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setMsg("Ukuran file maksimal 5 MB.");
      return;
    }
    setMsg("");
    setFile(f);
  }

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setMsg("Membaca CV… (bisa 10–30 detik)");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (role.trim()) fd.append("targetRole", role.trim());
      const res = await fetch("/api/cv/parse", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? `Gagal memproses CV (${res.status}).`);
        if (data.code === "consent_required") {
          setConsent(false);
          setAgree(false);
          setShowConsent(true);
        }
        return;
      }
      setMsg("CV berhasil dibaca. Menghitung kecocokan…");
      setFile(null);
      router.refresh(); // muat ulang data server; useEffect memanggil loadMatches saat cv.id berubah
    } catch {
      setMsg("Gagal menghubungi server.");
    } finally {
      setBusy(false);
    }
  }

  function upload() {
    if (!file) {
      setMsg("Pilih file PDF CV terlebih dahulu.");
      return;
    }
    if (!consent) {
      setAgree(false);
      setShowConsent(true);
      return;
    }
    void doUpload();
  }

  async function acceptConsent() {
    const { error } = await createClient()
      .from("profiles")
      .update({ ai_consent_at: new Date().toISOString() })
      .eq("id", userId);
    setShowConsent(false);
    if (error) {
      setMsg("Gagal menyimpan persetujuan: " + error.message + " (sudah menjalankan migration ai_consent?)");
      return;
    }
    setConsent(true);
    await doUpload();
  }

  async function refreshJobs() {
    setFetching(true);
    setMsg("Mengambil lowongan terbaru…");
    try {
      const q = (role.trim() || cv?.parsed.headline || "software engineer").slice(0, 80);
      const res = await fetch("/api/jobs/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error ?? "Gagal mengambil lowongan.");
        return;
      }
      setMsg(
        `Lowongan baru: ${d.inserted}. Embedding dibuat: ${d.embedded}.` +
          (d.embeddingsPending > 0 ? ` ${d.embeddingsPending} lagi menunggu: jalankan lagi.` : "") +
          (d.embedError ? ` ${d.embedError}` : "")
      );
      await loadMatches();
    } catch {
      setMsg("Gagal menghubungi server.");
    } finally {
      setFetching(false);
    }
  }

  const p = cv?.parsed;

  return (
    <>
      <div className="cv-head">
        <p className="eyebrow">CV STUDIO</p>
        <h1>
          Cocokkan CV-mu
          <br />
          <em>dengan node.</em>
        </h1>
      </div>

      <div className="cv-grid">
        <section>
          <div className="box">
            <p className="k">{cv ? "Ganti CV" : "Unggah CV"}</p>
            <div
              className={`drop${over ? " over" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                pick(e.dataTransfer.files?.[0]);
              }}
            >
              {file ? <b>{file.name}</b> : <b>Seret PDF ke sini atau klik untuk memilih</b>}
              PDF berbasis teks (bukan hasil scan), maksimal 5 MB
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => pick(e.target.files?.[0])} />
            </div>
            <label className="k" htmlFor="role">
              Posisi target (opsional)
            </label>
            <input id="role" className="inp" value={role} maxLength={80} placeholder="mis. Fullstack Developer" onChange={(e) => setRole(e.target.value)} />
            <button className="btn" onClick={upload} disabled={busy || !file}>
              {busy ? "Memproses…" : "Proses CV →"}
            </button>
            <p className="msg" role="status" aria-live="polite">
              {msg}
            </p>
          </div>

          {p && (
            <div className="box">
              <p className="k">CV aktif{p.headline ? ` · ${p.headline}` : ""}</p>
              {!!p.skills?.length && (
                <>
                  <p className="k">Skill terdeteksi</p>
                  <p className="tags">{p.skills.map((s) => <em key={s}>{s}</em>)}</p>
                </>
              )}
              {!!p.experience?.length && (
                <>
                  <p className="k">Pengalaman</p>
                  <ul className="list">
                    {p.experience.slice(0, 5).map((e, i) => (
                      <li key={i}>
                        <b>{e.title ?? "—"}</b> · {e.company ?? "—"} ({e.start ?? "?"} – {e.end ?? "?"})
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!!p.education?.length && (
                <>
                  <p className="k">Pendidikan</p>
                  <ul className="list">
                    {p.education.slice(0, 3).map((e, i) => (
                      <li key={i}>
                        <b>{e.degree ?? "—"}</b> · {e.institution ?? "—"}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!!p.projects?.length && (
                <>
                  <p className="k">Proyek</p>
                  <ul className="list">
                    {p.projects.slice(0, 5).map((pr, i) => (
                      <li key={i}>{pr.name ?? "—"}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </section>

        <section>
          <div className="box">
            <div className="sec-head">
              <p className="k" style={{ margin: 0 }}>Match Score</p>
              <button className="btn alt" onClick={refreshJobs} disabled={fetching || !cv}>
                {fetching ? "Mengambil…" : "Perbarui lowongan"}
              </button>
            </div>

            {!cv && <p className="hint">Unggah CV untuk melihat lowongan yang paling cocok.</p>}
            {cv && loadingMatches && !matches && <p className="hint">Menghitung kecocokan…</p>}
            {cv && matches && matches.length === 0 && (
              <p className="hint">
                Belum ada lowongan yang punya embedding. Klik “Perbarui lowongan”, lalu ulangi sampai tidak ada yang menunggu.
              </p>
            )}

            {matches?.map((m) => (
              <article className="mrow" key={m.job_id}>
                <div className="mhead">
                  <div>
                    <p className="mtitle">{m.title}</p>
                    <p className="msub">
                      {m.company_name} · {m.is_remote ? "Remote" : m.location ?? "—"} · via {SOURCE_LABEL[m.source] ?? m.source}
                    </p>
                  </div>
                  <div className="mscore">
                    {Math.round(m.match_score)}%<small>cos {m.similarity.toFixed(3)}</small>
                  </div>
                </div>
                <div className="sbar" style={{ ["--w" as string]: `${Math.round(m.match_score)}%` }} />
                {(m.matched.length > 0 || m.missing.length > 0) && (
                  <p className="tags" style={{ marginBottom: 10 }}>
                    {m.matched.map((s) => (
                      <em key={"o" + s} className="ok">{s}</em>
                    ))}
                    {m.missing.map((s) => (
                      <em key={"m" + s} className="no">{s}</em>
                    ))}
                  </p>
                )}
                <a href={m.apply_url} target="_blank" rel="noopener noreferrer">
                  Buka lowongan ↗
                </a>
                <button className="linkbtn" onClick={() => setImprove({ id: m.job_id, label: `${m.title} · ${m.company_name}` })}>
                  Sesuaikan CV →
                </button>
              </article>
            ))}

            {matches && matches.length > 0 && (
              <p className="note">
                Match Score adalah estimasi kemiripan semantik CV dan lowongan, bukan penilaian ATS. Angka “cos” adalah
                nilai mentahnya, dipakai untuk mengkalibrasi skor. Garis padat = skill yang sudah kamu punya, putus-putus = belum terdeteksi di CV.
              </p>
            )}
          </div>
        </section>
      </div>

      {improve && <CvImprove key={improve.id} jobId={improve.id} jobLabel={improve.label} onClose={() => setImprove(null)} />}

      {showConsent && (
        <div className="modal-back" onClick={() => setShowConsent(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="consent-title" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">PRIVASI & DATA</p>
            <h2 id="consent-title">Sebelum CV-mu diproses</h2>
            <ul>
              <li><b>Teks CV lengkap</b> (termasuk nama dan kontak) dikirim ke <b>Groq</b> untuk diubah menjadi data terstruktur.</li>
              <li>Hanya <b>ringkasan skill, pengalaman, dan proyek</b> (tanpa nama, email, telepon) dikirim ke <b>Google Gemini</b> untuk menghitung kecocokan. Layanan gratis Gemini dapat memakai data masukan untuk meningkatkan produk Google.</li>
              <li>File PDF disimpan di penyimpanan privat Supabase milikmu. Fitur hapus CV akan ditambahkan di pengaturan.</li>
              <li>Hasil AI bisa keliru. Periksa kembali sebelum dipakai melamar.</li>
            </ul>
            <label>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Saya mengerti dan menyetujui pemrosesan CV saya oleh layanan AI di atas.
            </label>
            <div className="acts">
              <button className="btn alt" onClick={() => setShowConsent(false)}>Batal</button>
              <button className="btn" disabled={!agree} onClick={acceptConsent}>Setuju & lanjut</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
