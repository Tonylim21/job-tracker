import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Next.js 14: cookies() sinkron. (Di Next 15+ jadi async: pakai `await cookies()`)
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Dipanggil dari Server Component: abaikan, session di-refresh oleh middleware.
          }
        },
      },
    }
  );
}
