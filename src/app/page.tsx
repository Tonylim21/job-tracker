import { redirect } from "next/navigation";

// Middleware mengarahkan user yang belum login ke /login.
export default function Home() {
  redirect("/dashboard");
}
