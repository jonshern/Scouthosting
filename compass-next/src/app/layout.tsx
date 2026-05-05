import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Compass", template: "%s — Compass" },
  description:
    "The planning and communication hub for Scout units — calendar, photos, group email, trip planning, and a CMS leaders can actually use.",
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
