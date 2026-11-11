import AuthScene from "@/components/auth/AuthScene";

// Scene 3D hidup di layout, jadi tidak di-reset saat pindah /login <-> /register.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthScene />
      <div className="grain" aria-hidden="true" />
      {children}
    </>
  );
}
