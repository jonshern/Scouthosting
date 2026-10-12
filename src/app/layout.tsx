import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { isDemoMode } from "@/lib/demo/mode";

// Type stack per design_handoff_compass_cms — Source Serif 4 for
// display, Inter Tight for chrome, JetBrains Mono for IDs / dates.
// The font files live in ./fonts (see README there) instead of coming
// from next/font/google: that fetched them from Google during every
// build, and a failed fetch failed the build, in CI and in `make deploy`.
const interTight = localFont({
  src: "./fonts/inter-tight-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-ui",
  display: "swap",
});
const sourceSerif = localFont({
  src: [
    { path: "./fonts/source-serif-4-latin-wght-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/source-serif-4-latin-wght-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
});
const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-400-normal.woff2",
  weight: "400",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Compass", template: "%s — Compass" },
  description:
    "The planning and communication hub for Scout units — calendar, photos, group email, trip planning, and a CMS leaders can actually use.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans">
        {isDemoMode() ? <DemoBanner /> : null}
        {children}
      </body>
    </html>
  );
}
