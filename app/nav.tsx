"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/nfl-futures-26-27", label: "Pick distribution", match: (p: string) => p === "/nfl-futures-26-27" },
  { href: "/nfl-futures-26-27/model", label: "Tre model picks", match: (p: string) => p.startsWith("/nfl-futures-26-27/model") },
  { href: "/edh-survey", label: "EDH survey", match: (p: string) => p.startsWith("/edh-survey") },
  { href: "/fight-survey", label: "Fight poll", match: (p: string) => p.startsWith("/fight-survey") },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="pool-nav">
      <div className="inner">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={t.match(path) ? "active" : ""}>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
