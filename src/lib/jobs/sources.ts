// Adapter sumber lowongan: Jooble, JSearch (RapidAPI), RemoteOK.
// Skema respons tiap API ditulis dari dokumentasi publik dan BELUM diuji dengan key asli:
// kalau ada field yang berbeda, cukup sesuaikan fungsi map di bawah.

export type JobSource = "jooble" | "jsearch" | "remoteok";

export type NormalizedJob = {
  source: JobSource;
  external_id: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  job_type: string | null;
  description: string;
  apply_url: string;
  salary_range: string | null;
  posted_at: string | null;
  skills: string[];
};

type Raw = Record<string, unknown>;
const TIMEOUT_MS = 10_000;
const MAX_PER_SOURCE = 50;

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const orNull = (s: string) => (s ? s : null);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

function toIso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function salary(min: number, max: number, currency: string): string | null {
  if (!min && !max) return null;
  const range = min && max ? `${min}–${max}` : String(min || max);
  return `${currency ? currency + " " : ""}${range}`;
}

// Ekstraksi skill sederhana (tanpa LLM) untuk requirements_json dan Skill Gap Analyzer nanti.
const SKILLS: [string, string][] = [
  ["React.js", "react(?:\\.?js)?"], ["Next.js", "next\\.?js"], ["TypeScript", "typescript"],
  ["JavaScript", "javascript"], ["Node.js", "node(?:\\.?js)?"], ["Laravel", "laravel"],
  ["PHP", "php"], ["Flutter", "flutter"], ["Dart", "dart"], ["MySQL", "mysql"],
  ["PostgreSQL", "postgres(?:ql)?"], ["Firebase", "firebase"], ["Docker", "docker"],
  ["Git", "git(?:hub|lab)?"], ["Python", "python"], ["Java", "java"], ["Kotlin", "kotlin"],
  ["Golang", "golang"], ["AWS", "aws"], ["Kubernetes", "kubernetes|k8s"], ["Redis", "redis"],
  ["GraphQL", "graphql"], ["Tailwind CSS", "tailwind(?:\\s?css)?"], ["Vue.js", "vue(?:\\.?js)?"],
  ["Angular", "angular"], ["MongoDB", "mongo(?:db)?"], ["Supabase", "supabase"],
  ["CI/CD", "ci\\s?/\\s?cd"], ["REST API", "rest(?:ful)?\\s?api"],
];
const SKILL_RES = SKILLS.map(
  ([name, pat]) => [name, new RegExp(`(?<![a-z0-9])(?:${pat})(?![a-z0-9])`, "i")] as const
);
export function extractSkills(text: string): string[] {
  return SKILL_RES.filter(([, re]) => re.test(text)).map(([name]) => name);
}

const isRemoteText = (s: string) => /\bremote\b|\bwfh\b|work from home/i.test(s);
const valid = (j: NormalizedJob) => !!(j.external_id && j.title && j.apply_url);

// ---------- Jooble ----------
export async function fetchJooble(q: string, location: string): Promise<NormalizedJob[]> {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) return [];
  const res = await fetch(`https://jooble.org/api/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: q, location, page: 1 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Jooble HTTP ${res.status}`);
  const data = (await res.json()) as { jobs?: Raw[] };
  return (data.jobs ?? [])
    .slice(0, MAX_PER_SOURCE)
    .map((j): NormalizedJob => {
      const title = str(j.title);
      const loc = str(j.location);
      const description = stripHtml(str(j.snippet));
      return {
        source: "jooble",
        external_id: str(j.id) || str(j.link),
        title,
        company_name: str(j.company) || "Tidak disebutkan",
        location: orNull(loc),
        is_remote: isRemoteText(`${title} ${loc}`),
        job_type: orNull(str(j.type)),
        description,
        apply_url: str(j.link),
        salary_range: orNull(str(j.salary)),
        posted_at: toIso(j.updated),
        skills: extractSkills(`${title} ${description}`),
      };
    })
    .filter(valid);
}

// ---------- JSearch (RapidAPI) ----------
export async function fetchJSearch(q: string, location: string): Promise<NormalizedJob[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];
  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", `${q} in ${location}`);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("country", "id");
  url.searchParams.set("date_posted", "month");
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`JSearch HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Raw[] };
  return (data.data ?? [])
    .slice(0, MAX_PER_SOURCE)
    .map((j): NormalizedJob => {
      const title = str(j.job_title);
      const description = stripHtml(str(j.job_description));
      const loc = [str(j.job_city), str(j.job_state), str(j.job_country)].filter(Boolean).join(", ");
      return {
        source: "jsearch",
        external_id: str(j.job_id),
        title,
        company_name: str(j.employer_name) || "Tidak disebutkan",
        location: orNull(loc),
        is_remote: Boolean(j.job_is_remote),
        job_type: orNull(str(j.job_employment_type)),
        description,
        apply_url: str(j.job_apply_link),
        salary_range: salary(num(j.job_min_salary), num(j.job_max_salary), str(j.job_salary_currency)),
        posted_at: toIso(j.job_posted_at_datetime_utc),
        skills: extractSkills(`${title} ${description}`),
      };
    })
    .filter(valid);
}

// ---------- RemoteOK ----------
// ToS RemoteOK: tautan ke halaman lowongan asli (kita simpan di apply_url) dan sebutkan
// "Remote OK" sebagai sumber di UI. Respons berisi lowongan terbaru; kita filter lokal.
export async function fetchRemoteOK(q: string): Promise<NormalizedJob[]> {
  const res = await fetch("https://remoteok.com/api", {
    headers: { "User-Agent": "CareerNode/0.1 (personal job tracker)", Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RemoteOK HTTP ${res.status}`);
  const data = (await res.json()) as Raw[];
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  return data
    .filter((j) => j.id !== undefined && j.position) // elemen pertama = pemberitahuan legal
    .map((j): NormalizedJob => {
      const title = str(j.position);
      const description = stripHtml(str(j.description));
      const tags = Array.isArray(j.tags) ? j.tags.map(str).join(" ") : "";
      return {
        source: "remoteok",
        external_id: str(j.id) || str(j.slug),
        title,
        company_name: str(j.company) || "Tidak disebutkan",
        location: str(j.location) || "Remote",
        is_remote: true,
        job_type: "remote",
        description,
        apply_url: str(j.url),
        salary_range: salary(num(j.salary_min), num(j.salary_max), "USD"),
        posted_at: toIso(j.date),
        skills: extractSkills(`${title} ${tags} ${description}`),
      };
    })
    .filter((j) => {
      const hay = `${j.title} ${j.skills.join(" ")} ${j.description}`.toLowerCase();
      return words.length === 0 || words.some((w) => hay.includes(w));
    })
    .slice(0, MAX_PER_SOURCE)
    .filter(valid);
}
