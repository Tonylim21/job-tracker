"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildGraph, hsl, scoreHue, type DashJob, type Sel } from "@/lib/graph";
import NodeGraph2D from "./NodeGraph2D";

// Three.js hanya dimuat di browser (tidak ikut di-render di server)
const NodeGraph3D = dynamic(() => import("./NodeGraph3D"), {
  ssr: false,
  loading: () => <div className="g-msg">Memuat grafik 3D…</div>,
});

type Props = {
  userId: string;
  hasCv: boolean;
  error?: string;
  cvSkills: string[];
  jobs: DashJob[];
  stats: { total: number; interview: number; rejected: number; offered: number };
  appliedJobIds: string[];
};

const SOURCE_LABEL: Record<string, string> = { remoteok: "Remote OK", jooble: "Jooble", jsearch: "JSearch" };

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const f = (t: number) => {
      start = start ?? t;
      const p = Math.min((t - start) / 900, 1);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

export default function DashboardView({ userId, hasCv, error, cvSkills, jobs, stats, appliedJobIds }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState<Sel>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "2d" | null>(null);
  const [applied, setApplied] = useState<Set<string>>(() => new Set(appliedJobIds));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const graph = useMemo(() => buildGraph(cvSkills, jobs), [cvSkills, jobs]);
  const graphable = hasCv && jobs.length > 0;

  // Perangkat lemah / mobile -> mulai dengan versi 2D ringan; bisa diganti manual
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    // Hanya HP/tablet dan perangkat yang benar-benar lemah yang mulai di mode 2D; laptop biasa dapat 3D
    const weak =
      window.innerWidth < 820 ||
      window.matchMedia("(pointer: coarse)").matches ||
      (nav.deviceMemory ?? 8) <= 2 ||
      (navigator.hardwareConcurrency ?? 8) <= 2;
    setMode(weak ? "2d" : "3d");
  }, []);

  const selJob = sel?.k === "job" ? jobs.find((j) => j.id === sel.id) ?? null : null;
  const selSkill = sel?.k === "skill" ? graph.skills.find((s) => s.key === sel.key) ?? null : null;

  const visibleJobs = useMemo(() => {
    if (sel?.k !== "skill") return jobs;
    const si = graph.skills.findIndex((s) => s.key === sel.key);
    const ids = new Set(graph.edges.filter((e) => e[1] === si).map((e) => jobs[e[0]].id));
    return jobs.filter((j) => ids.has(j.id));
  }, [sel, jobs, graph]);

  async function markApplied(job: DashJob) {
    setBusy(true);
    setMsg("");
    const { error: err } = await createClient()
      .from("applications")
      .insert({
        user_id: userId,
        job_id: job.id,
        company_name: job.company.slice(0, 255),
        job_title: job.title.slice(0, 255),
        job_url: job.url,
        status: "applied",
        match_score: job.score,
        applied_via: "manual",
      });
    setBusy(false);
    if (err && err.code !== "23505") {
      setMsg("Gagal menyimpan: " + err.message);
      return;
    }
    setApplied((prev) => new Set(prev).add(job.id));
    setMsg("Dicatat sebagai sudah dilamar.");
    router.refresh(); // perbarui angka statistik
  }

  return (
    <div className="dash-grid">
      <section className="graph" id="graph">
        <div className="g-cap">
          <p className="eyebrow">PETA NODE</p>
          <h1>
            Skillmu,
            <br />
            <em>terhubung.</em>
          </h1>
        </div>

        {graphable && mode === "3d" && (
          <NodeGraph3D skills={graph.skills} jobs={jobs} edges={graph.edges} selected={sel} hoverJobId={hoverId} onSelect={setSel} onFail={() => setMode("2d")} />
        )}
        {graphable && mode === "2d" && (
          <NodeGraph2D skills={graph.skills} jobs={jobs} edges={graph.edges} selected={sel} onSelect={setSel} />
        )}
        {!hasCv && (
          <div className="g-msg">
            <div>
              Unggah CV untuk membentuk peta node-mu.
              <br />
              <br />
              <Link className="btn" href="/cv" style={{ display: "inline-block", width: "auto", padding: "12px 18px" }}>
                Ke CV Studio →
              </Link>
            </div>
          </div>
        )}
        {hasCv && jobs.length === 0 && (
          <div className="g-msg">
            <div>
              {error ?? "Belum ada lowongan yang cocok."}
              <br />
              <br />
              <Link className="btn" href="/cv" style={{ display: "inline-block", width: "auto", padding: "12px 18px" }}>
                Perbarui lowongan di CV Studio →
              </Link>
            </div>
          </div>
        )}

        <div className="g-legend">
          <span>● skill &nbsp; ◆ lowongan</span>
          <span className="g-grad" aria-hidden="true" />
          <span>merah = kurang cocok · hijau = sangat cocok · dekat pusat = lebih cocok</span>
        </div>
        {graphable && (
          <button className="g-mode" onClick={() => setMode((m) => (m === "3d" ? "2d" : "3d"))}>
            {mode === "3d" ? "Mode 2D" : "Mode 3D"}
          </button>
        )}
      </section>

      <aside>
        <div className="stats">
          <div className="stat"><b><CountUp value={stats.total} /></b><span>Dilamar</span></div>
          <div className="stat"><b><CountUp value={stats.interview} /></b><span>Wawancara</span></div>
          <div className="stat"><b><CountUp value={stats.rejected} /></b><span>Ditolak</span></div>
          <div className="stat"><b><CountUp value={stats.offered} /></b><span>Penawaran</span></div>
        </div>

        <div className="box" aria-live="polite">
          {!sel && (
            <>
              <p className="k">Detail node</p>
              <p className="hint" style={{ fontSize: 14 }}>
                Klik node lowongan (◆) atau skill (●) di peta, atau pilih dari daftar. Garis yang menyala menunjukkan skill mana yang terhubung.
              </p>
            </>
          )}

          {selSkill && (
            <>
              <p className="k">Skill node</p>
              <h2>{selSkill.name}</h2>
              <p className="hint" style={{ margin: "10px 0 16px", fontSize: 14 }}>
                Diminta oleh {visibleJobs.length} dari {jobs.length} lowongan teratas.
              </p>
              <button className="btn alt" onClick={() => setSel(null)}>Lepas pilihan</button>
            </>
          )}

          {selJob && (
            <>
              <p className="k">Job node · via {SOURCE_LABEL[selJob.source] ?? selJob.source}</p>
              <h2>{selJob.title}</h2>
              <p className="msub" style={{ marginTop: 6 }}>
                {selJob.company} · {selJob.remote ? "Remote" : selJob.location ?? "—"}
              </p>
              <div className="dscore">
                <span style={{ color: hsl(scoreHue(selJob.score)) }}>{Math.round(selJob.score)}%</span>
                <i style={{ ["--w" as string]: `${Math.round(selJob.score)}%`, ["--c" as string]: hsl(scoreHue(selJob.score)) }} />
              </div>
              {selJob.matched.length > 0 && (
                <>
                  <p className="k">Skill cocok</p>
                  <p className="tags">{selJob.matched.map((s) => <em key={s} className="ok">{s}</em>)}</p>
                </>
              )}
              {selJob.missing.length > 0 && (
                <>
                  <p className="k">Belum terdeteksi di CV</p>
                  <p className="tags">{selJob.missing.map((s) => <em key={s} className="no">{s}</em>)}</p>
                </>
              )}
              <div className="acts-col">
                <a className="btn" href={selJob.url} target="_blank" rel="noopener noreferrer">Buka lowongan ↗</a>
                <Link className="btn alt" href={`/cv?job=${selJob.id}`}>Sesuaikan CV →</Link>
                <button className="btn alt" disabled={busy || applied.has(selJob.id)} onClick={() => markApplied(selJob)}>
                  {applied.has(selJob.id) ? "Sudah dilamar ✓" : busy ? "Menyimpan…" : "Tandai sudah dilamar"}
                </button>
                <button className="btn alt" onClick={() => setSel(null)}>Lepas pilihan</button>
              </div>
              <p className="msg">{msg}</p>
            </>
          )}
        </div>

        <div className="box">
          <p className="k">{sel?.k === "skill" ? `Lowongan yang meminta ${selSkill?.name ?? ""}` : "Lowongan paling cocok"}</p>
          <div className="feed" onPointerLeave={() => setHoverId(null)}>
            {visibleJobs.length === 0 && <p className="hint" style={{ fontSize: 14 }}>Belum ada lowongan.</p>}
            {visibleJobs.map((j) => (
              <button
                key={j.id}
                className={`frow${sel?.k === "job" && sel.id === j.id ? " on" : ""}`}
                onClick={() => setSel({ k: "job", id: j.id })}
                onPointerEnter={() => setHoverId(j.id)}
              >
                <b style={{ color: hsl(scoreHue(j.score)) }}>{Math.round(j.score)}%</b>
                <span>
                  {j.title} · {j.company}
                  <small>{SOURCE_LABEL[j.source] ?? j.source}{applied.has(j.id) ? " · sudah dilamar" : ""}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
