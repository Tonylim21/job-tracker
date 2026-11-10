// Import langsung ke lib/ menghindari bug pdf-parse@1.1.1 yang mencoba membaca
// file test saat di-import dari entry utama (error ENOENT di Next.js).
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
