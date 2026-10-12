import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // scripts/demo.sh builds into .next-demo so `make demo` can run beside
  // `make dev` (Next allows one dev server per build folder).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Dev only: lets `next dev` serve its scripts and HMR to a Mac
  // exposed over `tailscale serve` (<mac>.<tailnet>.ts.net).
  allowedDevOrigins: ["*.ts.net"],
  experimental: {
    // Photo uploads allow 10 MB per file and form attachments 25 MB
    // (src/server-actions/photos.ts, forms.ts); a lower limit rejects a
    // phone photo before the action can say anything useful.
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // SAMEORIGIN (not DENY) so the admin Site editor can iframe
          // the unit's own /o/<slug> page for the live preview pane.
          // Cross-origin framing is still rejected.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
        ],
      },
    ];
  },
};

export default config;
