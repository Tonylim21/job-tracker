import { createClient } from "@supabase/supabase-js";

// HANYA untuk kode server (API route, cron). Melewati RLS, jadi jangan pernah
// di-import dari Client Component dan jangan beri prefix NEXT_PUBLIC_ pada key-nya.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
