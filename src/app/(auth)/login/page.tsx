import AuthView from "@/components/auth/AuthView";

// Next.js 14: searchParams berupa objek biasa (di Next 15+ menjadi Promise).
export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return <AuthView mode="login" next={searchParams.next} initialError={searchParams.error} />;
}
