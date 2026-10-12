import type { Metadata } from "next";
import { Inter_Tight, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { isDemoMode } from "@/lib/demo/mode";

// Type stack per design_handoff_compass_cms — Source Serif 4 for
// display, Inter Tight for chrome, JetBrains Mono for IDs / dates.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
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
