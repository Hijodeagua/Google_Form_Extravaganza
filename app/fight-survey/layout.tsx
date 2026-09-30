import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Could you beat it in a fight? — Extravaganza",
  description: "Fifteen animals, unarmed and then with a knife. What people think they could take, read live from the poll sheet.",
};

export default function FightLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
