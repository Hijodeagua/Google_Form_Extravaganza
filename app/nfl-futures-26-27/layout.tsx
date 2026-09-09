import type { Metadata } from "next";
import { PoolNav } from "./nav";

export const metadata: Metadata = {
  title: "NFL Futures 2026-27 — Extravaganza",
  description: "Live standings for the 2026-27 NFL futures pool, graded against the season and against the model.",
};

export default function PoolLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PoolNav base="/nfl-futures-26-27" />
      {children}
    </>
  );
}
