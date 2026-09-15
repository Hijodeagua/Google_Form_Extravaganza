import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NFL Futures 2026-27 — Extravaganza",
  description: "How the room split on the 2026-27 NFL futures pool, and what the model picked.",
};

export default function PoolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
