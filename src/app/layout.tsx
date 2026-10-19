import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { isDemoMode } from "@/lib/demo/mode";
import { UsageBeacon } from "@/components/usage/UsageBeacon";

// Geist for words, Geist Mono for IDs, dates and small labels (the
// suite's Modern Clean faces, see src/styles/tokens.ts). The font files
// live in ./fonts (see README there) instead of coming from
// next/font/google: that fetched them from Google during every build, and
// a failed fetch failed the build, in CI and in `make deploy`.
const geist = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
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
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body className="font-sans">
        {isDemoMode() ? <DemoBanner /> : null}
        {children}
        <UsageBeacon />
      </body>
    </html>
  );
}
