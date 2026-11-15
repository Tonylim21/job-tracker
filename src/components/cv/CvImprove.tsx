"use client";

import { useEffect, useRef, useState } from "react";
import { diffWords } from "@/lib/diff";

type Suggestion = {
  id: string;
  section: string;
  label: string;
  before: string;
  after: string;
  reason: string;
  keywords: string[];
};
type Result = {
  suggestions: Suggestion[];
  missingSkills: string[];
  tips: string[];
  dropped: number;
};

export default function CvImprove({ jobId, jobLabel, onClose }: { jobId: string; jobLabel: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });

    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const res = await fetch("/api/cv/improve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(d.error ?? `Gagal membuat saran (${res.status}).`);
        else setData(d as Result);
      } catch {
        if (!cancelled) setError("Gagal menghubungi server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  function copy(id: string, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(id);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => setError("Gagal menyalin. Salin manual dari teks di atas."));
  }

  return (
    <section className="studio" ref={ref} aria-live="polite">
      <div className="studio-head">
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>STUDIO PERBAIKAN CV</p>
          <h2>{jobLabel}</h2>
        </div>
        <button className="btn alt" onClick={onClose}>Tutup</button>
      </div>

      {loading && <p className="hint">Menyusun saran… (bisa 10–30 detik)</p>}
      {error && <p className="msg">{error}</p>}

      {data && (
        <>
          {data.missingSkills.length > 0 && (
            <>
              <p className="k">Skill yang diminta tapi belum terdeteksi di CV-mu</p>
              <p className="tags" style={{ marginBottom: 6 }}>
                {data.missingSkills.map((s) => (
                  <em key={s} className="no">{s}</em>
                ))}
              </p>
              <p className="note" style={{ marginTop: 0, marginBottom: 18 }}>
                Tambahkan hanya jika kamu memang punya pengalamannya.
              </p>
            </>
          )}

          {data.tips.length > 0 && (
            <>
              <p className="k">Tips</p>
              <ul className="list">
                {data.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </>
          )}

          {data.suggestions.length === 0 && !loading && (
            <p className="hint">Poin CV-mu sudah cukup sesuai dengan lowongan ini, tidak ada perubahan yang disarankan.</p>
          )}

          {data.suggestions.map((s) => (
            <article className="sug" key={s.id}>
              <p className="label">{s.label}</p>
              <p className="diff">
                {diffWords(s.before, s.after).map((p, i) => (
                  <span key={i} className={`d-${p.type}`}>
                    {p.text}{" "}
                  </span>
                ))}
              </p>
              <p className="cleantext">{s.after}</p>
              {s.reason && <p className="reason">{s.reason}</p>}
              {s.keywords.length > 0 && (
                <p className="tags" style={{ marginBottom: 10 }}>
                  {s.keywords.map((k) => (
                    <em key={k} className="ok">{k}</em>
                  ))}
                </p>
              )}
              <button className="btn alt" onClick={() => copy(s.id, s.after)}>
                {copied === s.id ? "Tersalin ✓" : "Salin teks baru"}
              </button>
            </article>
          ))}

          <p className="note">
            Ini hanya saran dan belum mengubah CV-mu. Salin teks yang kamu setujui ke CV aslimu. Periksa kembali setiap
            kalimat: AI tidak boleh menambah fakta, dan saran yang memuat angka baru otomatis dibuang
            {data.dropped > 0 ? ` (${data.dropped} saran dibuang)` : ""}. Ekspor CV baru ke PDF menyusul di Phase 5.
          </p>
        </>
      )}
    </section>
  );
}
