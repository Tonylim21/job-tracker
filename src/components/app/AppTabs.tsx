"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string | null; label: string }[] = [
  { href: "/dashboard", label: "1 Dashboard 3D" },
  { href: "/cv", label: "2 CV Studio" },
  { href: null, label: "3 Auto-Apply" }, // belum dibuat
  { href: null, label: "4 Kanban" },
  { href: null, label: "5 Skill Gaps" },
];

export default function AppTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Navigasi utama">
      {TABS.map((t) =>
        t.href ? (
          <Link key={t.label} href={t.href} aria-current={pathname.startsWith(t.href) ? "page" : undefined}>
            {t.label}
          </Link>
        ) : (
          <span key={t.label} className="soon" aria-disabled="true" title="Segera hadir">
            {t.label}
          </span>
        )
      )}
    </nav>
  );
}
