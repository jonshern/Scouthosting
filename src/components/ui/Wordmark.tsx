import { Mark } from "./Mark";

export function Wordmark({
  size = 20,
  light = false,
}: {
  size?: number;
  light?: boolean;
}) {
  const inkClass = light ? "text-white" : "text-ink";
  return (
    <span className={`inline-flex items-center gap-2.5 ${inkClass}`}>
      <Mark size={Math.round(size * 1.6)} />
      <span
        className="font-semibold"
        style={{ fontSize: size, letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        Compass
      </span>
    </span>
  );
}
