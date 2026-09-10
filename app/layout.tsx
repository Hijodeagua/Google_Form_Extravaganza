import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";

/**
 * Same pairing as Can-Tre-Beat-Vegas's Techno Bowl theme: Press Start 2P for
 * the scoreboard furniture, Inter for anything you read a sentence of. Both
 * self-hosted by next/font, so no render-blocking request to Google.
 */
const app = Inter({ subsets: ["latin"], variable: "--font-app", display: "swap" });
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Google Form Extravaganza",
  description: "Live results tracking for friend-group prediction pools run through Google Forms.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${app.variable} ${pixel.variable}`}>
      <body>
        <header className="top">
          <div className="wrap top-inner">
            <Link className="brand" href="/">
              <span className="em" />
              EXTRAVAGANZA
            </Link>
            <span className="brand sub">FORM-DRIVEN TRACKERS</span>
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
