"use client";

import { useMemo } from "react";
import { demandHue, hsl, scoreHue, type DashJob, type Sel } from "@/lib/graph";

type Props = {
  skills: { key: string; name: string; demand: number }[];
  jobs: DashJob[];
  edges: [number, number][];
  selected: Sel;
  onSelect: (s: Sel) => void;
};

const W = 640;
const C = W / 2;

/** Versi 2D ringan (SVG) untuk perangkat yang kurang kuat / mobile. Warna: hijau = cocok, merah = kurang cocok. */
export default function NodeGraph2D({ skills, jobs, edges, selected, onSelect }: Props) {
  const { sp, jp } = useMemo(() => {
    const sp = skills.map((_, i) => {
      const a = (i / Math.max(1, skills.length)) * Math.PI * 2 - Math.PI / 2;
      return { a, x: C + Math.cos(a) * 120, y: C + Math.sin(a) * 120 };
    });
    const jp = jobs.map((j, ji) => {
      const conn = edges.filter((e) => e[0] === ji).map((e) => e[1]);
      let a = ji * 2.4;
      if (conn.length) {
        const sx = conn.reduce((s, si) => s + Math.cos(sp[si].a), 0);
        const sy = conn.reduce((s, si) => s + Math.sin(sp[si].a), 0);
        a = Math.atan2(sy, sx) + ((ji % 3) - 1) * 0.14;
      }
      const r = Math.min(285, 165 + (100 - j.score) * 1.4);
      return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r };
    });
    return { sp, jp };
  }, [skills, jobs, edges]);

  const maxDemand = Math.max(0, ...skills.map((s) => s.demand));

  // node yang menyala sesuai pilihan
  const hiSkills = new Set<number>();
  const hiJobs = new Set<number>();
  if (selected?.k === "job") {
    const ji = jobs.findIndex((j) => j.id === selected.id);
    hiJobs.add(ji);
    edges.forEach(([a, b]) => a === ji && hiSkills.add(b));
  } else if (selected?.k === "skill") {
    const si = skills.findIndex((s) => s.key === selected.key);
    hiSkills.add(si);
    edges.forEach(([a, b]) => b === si && hiJobs.add(a));
  }
  const dim = !!selected;
  const press = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <svg className="g-svg" viewBox={`0 0 ${W} ${W}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Grafik node skill dan lowongan">
      <rect width={W} height={W} fill="transparent" onClick={() => onSelect(null)} />
      <circle cx={C} cy={C} r={120} className="ring" />
      <circle cx={C} cy={C} r={200} className="ring" />
      <circle cx={C} cy={C} r={285} className="ring" />
      {skills.map((_, i) => (
        <line key={"c" + i} className="ln" x1={C} y1={C} x2={sp[i].x} y2={sp[i].y} style={{ opacity: dim ? 0.05 : 0.16 }} />
      ))}
      {edges.map(([a, b], i) => {
        const on = (selected?.k === "job" && hiJobs.has(a)) || (selected?.k === "skill" && hiSkills.has(b));
        return (
          <line
            key={"e" + i}
            className="ln"
            x1={jp[a].x}
            y1={jp[a].y}
            x2={sp[b].x}
            y2={sp[b].y}
            style={{ stroke: hsl(scoreHue(jobs[a].score)), opacity: on ? 0.95 : dim ? 0.05 : 0.3 }}
          />
        );
      })}
      <circle className="nd" cx={C} cy={C} r={11} />
      <text x={C} y={C + 26} textAnchor="middle" className="on">KAMU</text>

      {skills.map((s, i) => {
        const on = !dim || hiSkills.has(i);
        const color = hsl(demandHue(s.demand, maxDemand));
        const pick = () => onSelect({ k: "skill", key: s.key });
        return (
          <g key={s.key} role="button" tabIndex={0} aria-label={`Skill ${s.name}`} className={on ? "on" : ""} style={{ opacity: on ? 1 : 0.18 }} onClick={pick} onKeyDown={press(pick)}>
            <circle className="nd" cx={sp[i].x} cy={sp[i].y} r={6} style={{ fill: color, stroke: color }} />
            <text x={sp[i].x + 10} y={sp[i].y + 4}>{s.name}</text>
          </g>
        );
      })}

      {jobs.map((j, i) => {
        const on = !dim || hiJobs.has(i);
        const color = hsl(scoreHue(j.score));
        const size = 7 + Math.max(0, j.score - 40) / 10;
        const pick = () => onSelect({ k: "job", id: j.id });
        const { x, y } = jp[i];
        return (
          <g key={j.id} role="button" tabIndex={0} aria-label={`${j.title}, ${Math.round(j.score)} persen`} className={on ? "on" : ""} style={{ opacity: on ? 1 : 0.18 }} onClick={pick} onKeyDown={press(pick)}>
            <polygon className="nd" points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`} style={{ fill: color, stroke: color }} />
            <text x={x + size + 4} y={y + 4} style={{ fill: color }}>{Math.round(j.score)}%</text>
          </g>
        );
      })}
    </svg>
  );
}
