// Helper pdf-parse@1.1.1. Import langsung ke lib/ menghindari bug pdf-parse yang membaca
// file test saat di-import dari entry utama (error ENOENT di bundling Next.js).

export function isPdf(buffer: Buffer): boolean {
  // Cek magic bytes; jangan percaya Content-Type dari client
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
  const pdf = await pdfParse(buffer);
  return pdf.text.replace(/\u0000/g, "").trim();
}
