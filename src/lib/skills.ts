// Menyamakan penulisan skill: "React.js" == "React", "Node.js" == "node", "Postgres" == "PostgreSQL"
const ALIAS: Record<string, string> = { postgres: "postgresql", k8s: "kubernetes", golang: "go" };

export function normSkill(s: string): string {
  let k = s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
  if (k.length > 4 && k.endsWith("js")) k = k.slice(0, -2);
  return ALIAS[k] ?? k;
}
