import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The EDH Survey — Extravaganza",
  description: "What 358 Commander players said about how they got into the format and how they play it.",
};

export default function EdhLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
