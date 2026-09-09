import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Form Extravaganza",
  description: "Live results tracking for friend-group prediction pools run through Google Forms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap top-inner">
            <Link className="brand" href="/">
              <span className="em" />
              Extravaganza
            </Link>
            <span className="brand sub">Form-driven trackers</span>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="site">
          <div className="wrap inner">
            Responses are read straight from the Google Form&apos;s sheet and re-read hourly. Outcomes are entered by hand
            as the season resolves; anything still undecided shows as pending, never as a miss. No analytics, and no
            entrant name ever leaves this page.
          </div>
        </footer>
      </body>
    </html>
  );
}
