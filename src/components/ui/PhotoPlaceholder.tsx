// A quiet photo stand-in: pale sky, two hills and a sun (Modern Clean,
// troop site hero). Used where a unit hasn't added a photo yet and on
// marketing pages that show what a photo would look like.
export function PhotoPlaceholder({
  label,
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`relative h-full w-full overflow-hidden rounded-2xl border border-line bg-photo-sky ${className}`}
    >
      <svg
        viewBox="0 0 500 400"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <path d="M0 290 L120 170 L200 240 L310 120 L500 280 L500 400 L0 400 Z" style={{ fill: "var(--photo-hill)" }} />
        <path d="M0 330 L150 250 L260 310 L380 230 L500 300 L500 400 L0 400 Z" style={{ fill: "var(--photo-hill-near)" }} />
        <circle cx="390" cy="96" r="28" style={{ fill: "var(--photo-sun)" }} />
      </svg>
      {label ? (
        <span className="absolute bottom-4 left-4 rounded-lg bg-surface/90 px-2.5 py-1.5 text-xs text-ink-2">
          {label}
        </span>
      ) : null}
    </div>
  );
}
