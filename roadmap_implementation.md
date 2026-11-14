# 🚀 AI Job Tracker - Implementation Roadmap & Progress Tracker (v1.1 Revamped)

> **Theme**: Monochrome Black Vibrant
>
> **Tech Stack**: Next.js 14 (`react@18`), Supabase (`@supabase/ssr` + RLS + `pgvector`), Three.js (`@react-three/fiber@^8`), Tailwind CSS, Chrome Extension (Manifest V3), Gemini Embedding + Groq LLM (tier gratis), Gmail API OAuth.

## 📊 Overall Progress Legend

* [ ] `Unstarted` - Belum dimulai
* [/] `In Progress` - Dalam pengerjaan
* [x] `Completed` - Selesai

---

## 📌 Status Terakhir (14 Nov 2026)

* ✅ Phase 1–2 selesai (kecuali Jooble/JSearch yang menunggu API key). Phase 3: upload CV, parsing Groq, embedding Gemini, rate limit, consent, dan Match Score **sudah berjalan di localhost**.
* 🔄 Studio perbaikan CV dengan Diff View: kode siap, belum diuji. Kalibrasi Match Score: perlu disetel dengan data asli.
* ⏭️ Berikutnya: uji studio → Phase 4 (Dashboard 3D dengan data asli) → Phase 5 (cover letter, ekspor PDF, Chrome extension).

### 🔧 Catatan penyesuaian terhadap kode yang berjalan

* **AI 100% tier gratis**: embedding memakai Gemini `gemini-embedding-001` (768 dimensi; `text-embedding-004` sudah dimatikan Google), LLM memakai Groq `openai/gpt-oss-120b` (`llama-3.3-70b-versatile` dipensiunkan Groq pada 16 Agu 2026). Kolom vektor menjadi `VECTOR(768)` (migration `20261112000000_gemini_768.sql`).

* `@supabase/ssr`: **jangan di-pin ke `^0.3.0`**. Kode auth memakai API `getAll/setAll` yang butuh versi lebih baru; pakai versi yang sekarang terpasang.
* Nama bucket Storage adalah `cvs` (sudah ada di migration dan `/api/cv/parse`), bukan `cvs`.
* Nama RPC adalah `match_jobs_for_cv(p_cv_id, ...)`, bukan `match_jobs`. Skor terkalibrasi ada di migration `20261111000000_match_score.sql`.
* Scene 3D (Login/Register, nanti Dashboard) memakai Three.js langsung di dalam komponen React (`useEffect`), identik dengan prototype desain. React Three Fiber (`<NeuralMatrixCanvas />`) tetap opsional: keputusan di Phase 4.

---

## 🟢 Phase 1: Foundation, Security & Database Setup

> **Goal**: Mengatur environment terisolasi, menginstal dependensi versi kompatibel, serta menerapkan skema DDL Supabase lengkap dengan Row Level Security (RLS).

* [/] **1.1 Next.js 14 & Compatible Stack Initialization**
  * [x] Inisialisasi Next.js 14 spesifik menggunakan `npx create-next-app@14 job-tracker-vibrant --typescript --tailwind --app`.
  * [/] Pin versi dependensi untuk mencegah konflik React 19 / R3F v9 (terpasang tanpa pin; lihat catatan `@supabase/ssr` di atas):
    ```json
    {
      "dependencies": {
        "next": "14.2.x",
        "react": "^18.3.0",
        "react-dom": "^18.3.0",
        "@supabase/supabase-js": "^2.40.0",
        "@supabase/ssr": "^0.3.0",
        "three": "^0.160.0",
        "@react-three/fiber": "^8.15.0",
        "@react-three/drei": "^9.90.0",
        "zod": "^3.22.0",
        "@upstash/ratelimit": "^1.0.0",
        "@upstash/redis": "^1.28.0",
        "lucide-react": "^0.350.0",
        "framer-motion": "^11.0.0"
      }
    }
    ```
  * [ ] (Opsional) Setup tema *Monochrome Black Vibrant* pada `tailwind.config.ts`; sementara token warna ada sebagai CSS variables di `globals.css` (Dark Slate `#050505`, Zinc `#09090b`, Border `#27272a`, Accent White `#ffffff`).

* [x] **1.2 Supabase DDL Execution & RLS Security**
  * [x] Aktifkan ekstensi `uuid-ossp` dan `vector` di Supabase Dashboard.
  * [x] Jalankan DDL SQL lengkap: `profiles`, `user_secrets`, `cv_profiles`, `job_listings`, `applications`, `email_logs`, `followup_schedules`, `skill_gaps`, serta enum `application_status` (termasuk `'shortlisted'` dan `'withdrawn'`).
  * [x] Terapkan RLS policies per `auth.uid()` pada semua tabel dan batasi tabel `user_secrets` khusus untuk **Service Role**.
  * [x] Buat RPC function `match_jobs` / `match_jobs_for_cv` (768 dimensi) dengan skor terkalibrasi; parameter `p_floor`/`p_span` bisa disetel tanpa migration baru.

* [x] **1.3 Environment & Secrets Setup**
  * [x] Buat file `.env.local` dengan variabel:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
    SUPABASE_SERVICE_ROLE_KEY=xxx
    TOKEN_ENCRYPTION_KEY=xxx_32_bytes_secret_key
    GEMINI_API_KEY=xxx
    GROQ_API_KEY=gsk_xxx
    CRON_SECRET=xxx_random_cron_token
    UPSTASH_REDIS_REST_URL=xxx
    UPSTASH_REDIS_REST_TOKEN=xxx
    ```

---

## 🔵 Phase 2: Authentication, Middleware & Job Feed Agregator

> **Goal**: Menyiapkan auth SSR, halaman Login/Register, Supabase session middleware, dan agregation engine lowongan Indonesia & Remote.

* [x] **2.1 Supabase Auth & Session Middleware**
  * [x] Buat `middleware.ts` menggunakan `@supabase/ssr` untuk mereset dan merefresh auth cookies secara otomatis.
  * [x] Buat halaman Auth bertema Monochrome: `/login` dan `/register` dengan integrasi Google OAuth Login.
  * [x] Buat modal *Privacy & User Data Consent* untuk persetujuan pemrosesan CV oleh AI (tersimpan di `profiles.ai_consent_at`, dicek server di `/api/cv/parse`).

* [/] **2.2 Job Board Agregator (Jooble, JSearch & RemoteOK)**
  * [/] Buat service agregator **Jooble API** & **JSearch API** khusus pencarian Indonesia (`country=id`). (kode siap; API key belum diisi/diuji)
  * [x] Buat service **RemoteOK API** dengan atribusi link publik sesuai ToS.
  * [x] Buat Next.js API Route `/api/jobs/fetch` dengan `CONSTRAINT unique_source_extid UNIQUE(source, external_id)` untuk mencegah duplikasi data.
  * [x] Simpan vector embedding lowongan kerja via Gemini `gemini-embedding-001` (768 dimensi).

---

## 🟣 Phase 3: AI CV Parsing, OCR Fallback & Rate Limiting

> **Goal**: Mengelola upload PDF CV, proteksi rate limit, ekstraksi AI, dan penghitungan kecocokan *Match Score*.

* [x] **3.1 Rate Limiting & CV Parsing API**
  * [x] Terapkan Upstash Rate Limit pada route `/api/cv/parse` (maksimal 5 request / jam per IP/User) untuk melindungi kuota gratis Gemini/Groq.
  * [x] Konfigurasi `pdf-parse@1.1.1` di dalam helper `lib/pdf-parser.ts` untuk menghindari bug bundling Next.js.
  * [x] Tambahkan verifikasi teks mentah: Jika hasil ekstrak kosong (PDF hasil scan), kembalikan respons `422 Unprocessable Entity` dengan instruksi OCR / unggah PDF digital.

* [x] **3.2 Embedding Generation & Storage**
  * [x] Ekstrak JSON kualifikasi (`skills`, `experience`, `education`) menggunakan Groq (`openai/gpt-oss-120b`).
  * [x] Buat vector embedding CV menggunakan Gemini `gemini-embedding-001` (768 dimensi) dan simpan ke `cv_profiles`.
  * [x] Simpan dokumen CV ke Supabase Storage Bucket private `cvs`.

* [/] **3.3 AI Match Score & Optimization Studio**
  * [x] Eksekusi pencarian lowongan teratas melalui RPC `match_jobs_for_cv`.
  * [/] Tampilkan hasil kecocokan sebagai **"Match Score"** (bukan ATS score): tampil di CV Studio; kalibrasi `MATCH_SCORE_FLOOR/SPAN` masih perlu disetel dengan data asli.
  * [/] Buat studio perbaikan kata kunci CV berbasis AI dengan tampilan *Diff View* (`/api/cv/improve` + `CvImprove.tsx`; belum diuji).

---

## 🟡 Phase 4: 3D Interactive Dashboard & Responsive Layout

> **Goal**: Membangun visualisasi 3D Node Graph yang responsif dan tidak membebani perangkat seluler.

* [ ] **4.1 Navigation & Main Layout**
  * [ ] Buat Topbar sistem (Status Sync Gmail, CV Aktif, Profil).
  * [ ] Buat Tab Navigation 5 modul (Dashboard 3D, CV Studio, Auto-Apply, Kanban Tracker, Skill Gaps).

* [ ] **4.2 Three.js 3D Skill-to-Job Neural Canvas**
  * [ ] Buat komponen React Three Fiber `<NeuralMatrixCanvas />`.
  * [ ] Muat komponen secara dinamis di Next.js menggunakan `next/dynamic(() => import(...), { ssr: false })`.
  * [ ] Tambahkan *device capability detection*: Tampilkan grafik 3D low-poly / fallback 2D interaktif jika dibuka dari perangkat seluler (mobile).

---

## 🟧 Phase 5: Safe Auto-Fill Engine & Chrome Extension Companion

> **Goal**: Menyediakan fitur bantu pengisian form lamaran yang aman dan tidak melanggar ToS platform kerja.

* [ ] **5.1 Dynamic Cover Letter Generator**
  * [ ] Buat generator Cover Letter terpersonalisasi menggunakan LLM API (Groq).
  * [ ] Export dokumen lamaran ke PDF via `@react-pdf/renderer`.

* [ ] **5.2 Safe Chrome Extension Companion (Manifest V3)**
  * [ ] Buat folder `/extension` dengan `manifest.json` V3.
  * [ ] Tulis `content.js` untuk menginjeksi tombol *"Auto-Fill with JobTracker"* pada DOM form LinkedIn dan Jobstreet.
  * [ ] **Prinsip Keamanan ToS**: Extension hanya mengisi kolom teks (*form auto-fill*). **User harus mengklik tombol Submit secara manual** untuk mencegah pemblokiran akun.

---

## 🔴 Phase 6: Encrypted Gmail OAuth & Protected Email Cron

> **Goal**: Sinkronisasi email masuk HR, penyiapan draft lamaran, dan cron job hemat resource yang aman.

* [ ] **6.1 Encrypted OAuth Token Storage**
  * [ ] Simpan `gmail_refresh_token` pengguna pada tabel `user_secrets` terenkripsi (menggunakan AES-256 via `TOKEN_ENCRYPTION_KEY`).
  * [ ] Batasi fungsionalitas email ke opsi **Create Draft** di akun Gmail pengguna (bukan auto-send langsung).

* [ ] **6.2 Vercel Hobby Protected Cron Sync**
  * [ ] Buat route `/api/cron/sync-gmail` dengan frekuensi harian `0 9 * * *` pada `vercel.json`.
  * [ ] Amankan route cron dengan pengecekan header `req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}``.
  * [ ] Gunakan LLM Intent Classifier untuk mendeteksi intent balasan HR (*Interview Invite*, *Shortlisted*, *Rejection*, *Follow-up*).
  * [ ] Update status lamaran pada tabel `applications` secara otomatis.

---

## ⬛ Phase 7: Skill Gap Analyzer & Portfolio Recommendations

> **Goal**: Analisis agregat kekurangan skill pengguna dibanding kebutuhan industri target.

* [ ] **7.1 Aggregated Skill Analysis**
  * [ ] Ekstrak dan hitung frekuensi kata kunci kualifikasi dari tabel `job_listings.requirements_json`.
  * [ ] Bandingkan dengan skill pengguna dan simpan ke tabel `skill_gaps`.
* [ ] **7.2 Skill Gap UI & Portfolio Action Plan**
  * [ ] Tampilkan indikator *Top Missing Skills* industri.
  * [ ] Berikan rekomendasi *Actionable Micro-Projects* untuk meningkatkan nilai jual portofolio pengguna.

---

## 🏁 Phase 8: Testing, Security Audit & Deployment

* [ ] **8.1 End-to-End Test & Security Check**
  * [ ] Verifikasi seluruh kebijakan RLS Supabase (pastikan data antar pengguna tidak bocor).
  * [ ] Uji alur lengkap: Upload CV → Rate Limit Test → PDF Match → Extension Auto-Fill (Manual Submit) → Cron Sync.
* [ ] **8.2 Vercel Deployment**
  * [ ] Deploy aplikasi ke platform **Vercel** dan atur semua Environment Variables.
  * [ ] Kemas folder Chrome Extension ke format `.zip` untuk pengujian lokal Developer Mode.

---

## 💬 Updated Prompt Sequence for Claude Code

1. **Prompt 1 (Foundation & Security Setup)**:
   > *"Claude, tolong setup Next.js 14 App Router dengan React 18, `@supabase/ssr`, dan Tailwind. Setelah itu jalankan skrip SQL DDL v1.1 yang menyertakan tabel user_secrets, enum status lengkap, RLS policy per user, dan RPC match_jobs terkalibrasi."*

2. **Prompt 2 (Rate Limit & CV Parsing)**:
   > *"Claude, buatkan API Route `/api/cv/parse` yang dilindungi Upstash Rate Limit (max 5 request/jam). Gunakan `pdf-parse@1.1.1` via helper lib lokal, dan berikan error HTTP 422 jika file PDF berupa hasil scan tanpa teks."*

3. **Prompt 3 (Safe Chrome Extension)**:
   > *"Claude, buatkan Chrome Extension Manifest V3 dengan content script yang menginjeksi tombol 'Auto-Fill with JobTracker' di LinkedIn/Jobstreet. Pastikan script HANYA mengisikan data form dan TIDAK melakukan auto-submit secara otomatis."*