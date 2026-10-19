import type { SVGProps } from "react";

// Compass's mark: a compass needle on an ink tile, the north point in the
// accent. Same construction as the suite's Waypoint and Lantern marks
// (Modern Clean canvas, Foundations board); only the glyph changes.
export function Mark({
  size = 28,
  accent = "var(--accent)",
  ...rest
}: { size?: number; accent?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <rect width="44" height="44" rx="12" style={{ fill: "var(--mark)" }} />
      <g transform="translate(10 10)">
        <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="1.5" />
        <path d="M12 4.5 L14.2 12 L12 10.6 L9.8 12 Z" style={{ fill: accent }} />
        <path d="M12 19.5 L9.8 12 L12 13.4 L14.2 12 Z" fill="#fff" />
      </g>
    </svg>
  );
}
