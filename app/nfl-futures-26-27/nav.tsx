"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Standings" },
  { href: "/distribution", label: "Pick distribution" },
  { href: "/model", label: "Model vs field" },
  { href: "/advanced", label: "Advanced" },
  { href: "/side-pot", label: "Side pot" },
  { href: "/admin", label: "Admin" },
];

export function PoolNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="pool-nav">
      <div className="inner">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          // Standings owns the entrant pages too, so it stays lit while reading one.
          const active = t.href === "" ? path === base || path.startsWith(`${base}/entrants`) : path.startsWith(href);
          return (
            <Link key={t.href} href={href} className={active ? "active" : ""}>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
