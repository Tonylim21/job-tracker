import { normSkill } from "@/lib/skills";

export type DashJob = {
  id: string;
  title: string;
  company: string;
  source: string;
  score: number; // Match Score 0-100
  sim: number; // cosine mentah
  remote: boolean;
  location: string | null;
  url: string;
  matched: string[];
  missing: string[];
};

export type Sel = { k: "job"; id: string } | { k: "skill"; key: string } | null;

export type Graph = {
  skills: { key: string; name: string; demand: number }[]; // demand = jumlah lowongan teratas yang memintanya
  edges: [number, number][]; // [indeks lowongan, indeks skill]
};

/** Node skill = skill di CV (yang paling sering diminta lowongan didahulukan); garis = skill lowongan yang cocok. */
export function buildGraph(cvSkills: string[], jobs: { matched: string[] }[], maxSkills = 14): Graph {
  const byKey = new Map<string, string>();
  for (const s of cvSkills) {
    const k = normSkill(s);
    if (k && !byKey.has(k)) byKey.set(k, s);
  }

  const demand = new Map<string, number>();
  for (const j of jobs) {
    for (const m of j.matched) {
      const k = normSkill(m);
      if (byKey.has(k)) demand.set(k, (demand.get(k) ?? 0) + 1);
    }
  }

  const keys = Array.from(byKey.keys())
    .sort((a, b) => (demand.get(b) ?? 0) - (demand.get(a) ?? 0))
    .slice(0, maxSkills);
  const skills = keys.map((k) => ({ key: k, name: byKey.get(k) ?? k, demand: demand.get(k) ?? 0 }));
  const idx = new Map(keys.map((k, i) => [k, i] as [string, number]));

  const edges: [number, number][] = [];
  jobs.forEach((j, ji) => {
    const seen = new Set<number>();
    for (const m of j.matched) {
      const si = idx.get(normSkill(m));
      if (si !== undefined && !seen.has(si)) {
        seen.add(si);
        edges.push([ji, si]);
      }
    }
  });
  return { skills, edges };
}

// ----- Warna: hijau = sangat cocok / dekat pusat, merah = kurang cocok / jauh -----
/** Match Score -> hue HSL: 45 atau kurang = merah (0), 85 atau lebih = hijau (120). */
export function scoreHue(score: number): number {
  const t = Math.max(0, Math.min(1, (score - 45) / 40));
  return Math.round(t * 120);
}
/** Skill: makin banyak lowongan yang memintanya, makin hijau (kuning 60 sampai hijau 120). */
export function demandHue(demand: number, max: number): number {
  return max <= 0 ? 90 : Math.round(60 + (Math.min(demand, max) / max) * 60);
}
export const hsl = (h: number, s = 90, l = 55) => `hsl(${h} ${s}% ${l}%)`;
