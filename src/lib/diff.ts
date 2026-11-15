// Diff per kata (LCS), tanpa dependensi. Dipakai untuk menampilkan "sebelum vs sesudah".
export type DiffPart = { type: "same" | "add" | "del"; text: string };

const words = (s: string) => s.split(/\s+/).filter(Boolean);

// Kunci pembanding: samakan tanda hubung/dash Unicode (hasil ekstrak PDF) dan bentuk karakter,
// supaya "10‑table" (U+2011) dan "10-table" tidak dianggap berbeda.
const key = (w: string) => w.normalize("NFKC").replace(/[\u2010-\u2015\u2212]/g, "-");

export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  const ka = a.map(key);
  const kb = b.map(key);
  const n = a.length;
  const m = b.length;

  // tabel LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], w: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += " " + w;
    else parts.push({ type, text: w });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      push("same", b[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("add", b[j++]);
  return parts;
}
