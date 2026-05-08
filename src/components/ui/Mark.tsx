import type { SVGProps } from "react";

// Compass-rose mark — ink stroke + sky-blue accent on the north arrowhead.
// Two arrows (N + S) for visual asymmetry; E/W are dim. Same construction as
// design-handoff/atoms.jsx#SHMark.
export function Mark({
  size = 28,
  accent = "#1d4ed8",
  ...rest
}: { size?: number; accent?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
      <path d="M20 3 L23.5 20 L20 16.5 L16.5 20 Z" fill={accent} />
      <path d="M20 37 L16.5 20 L20 23.5 L23.5 20 Z" fill="currentColor" opacity="0.85" />
      <path d="M37 20 L20 22.4 L22.4 20 L20 17.6 Z" fill="currentColor" opacity="0.5" />
      <path d="M3 20 L20 17.6 L17.6 20 L20 22.4 Z" fill="currentColor" opacity="0.5" />
      <circle cx="20" cy="20" r="1.6" fill="currentColor" />
    </svg>
  );
}
