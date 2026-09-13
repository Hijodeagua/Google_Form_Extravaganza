"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Pick distribution" },
  { href: "/model", label: "Tre model picks" },
];

export function PoolNav({ base }: { base: string }) {
  const path = usePathname();
  return (
    <nav className="pool-nav">
      <div className="inner">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          const active = t.href === "" ? path === base : path.startsWith(href);
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
