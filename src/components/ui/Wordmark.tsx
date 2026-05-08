import { Mark } from "./Mark";

export function Wordmark({
  size = 22,
  light = false,
}: {
  size?: number;
  light?: boolean;
}) {
  const inkClass = light ? "text-white" : "text-ink";
  return (
    <span className={`inline-flex items-center gap-2.5 ${inkClass}`}>
      <Mark size={size + 8} />
      <span
        className="font-display"
        style={{
          fontSize: size,
          fontWeight: 500,
          letterSpacing: "-0.015em",
          lineHeight: 1,
        }}
      >
        Compass<span className="text-sky">.</span>
      </span>
    </span>
  );
}
