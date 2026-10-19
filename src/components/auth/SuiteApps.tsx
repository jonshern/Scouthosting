// The three apps one Compass account signs in to, as quiet rows with
// each app's mark (Modern Clean, shared sign-in board).
import type { ReactNode } from "react";

function Tile({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-mark" aria-hidden>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        {children}
      </svg>
    </span>
  );
}

const APPS: Array<{ name: string; blurb: string; glyph: ReactNode }> = [
  {
    name: "Compass",
    blurb: "Troop website, calendar, roster, money",
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" stroke="#fff" strokeWidth="1.5" />
        <path d="M12 4.5 L14.2 12 L12 10.6 L9.8 12 Z" style={{ fill: "var(--accent)" }} />
        <path d="M12 19.5 L9.8 12 L12 13.4 L14.2 12 Z" fill="#fff" />
      </>
    ),
  },
  {
    name: "Waypoint",
    blurb: "Merit badge counseling and badge days",
    glyph: (
      <>
        <path d="M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21z" stroke="#fff" strokeWidth="1.5" />
        <circle cx="12" cy="10.5" r="2.25" style={{ fill: "var(--accent)" }} />
      </>
    ),
  },
  {
    name: "Lantern",
    blurb: "A scout's own trail to Eagle",
    glyph: (
      <>
        <path
          d="M9 4h6M10 4v2M14 4v2M8 6h8l1 3v8a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9z"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M12 11c1.3 1.2 1.6 2.4 0 4-1.6-1.6-1.3-2.8 0-4z" style={{ fill: "var(--accent)" }} />
      </>
    ),
  },
];

export function SuiteApps() {
  return (
    <ul className="flex flex-col gap-2.5">
      {APPS.map((a) => (
        <li key={a.name} className="flex items-center gap-3.5 rounded-[14px] border border-line p-3.5">
          <Tile>{a.glyph}</Tile>
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold">{a.name}</span>
            <span className="text-[13px] text-muted">{a.blurb}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
