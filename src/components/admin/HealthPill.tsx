// A health form date's state as a pill: Current, Expiring, Expired or Missing.

import { Pill } from "@/components/ui";
import { healthState, type HealthState } from "@/lib/members/health-forms";

const LOOK: Record<HealthState, { tone: "success" | "amber" | "danger" | "neutral"; label: string }> = {
  current: { tone: "success", label: "Current" },
  expiring: { tone: "amber", label: "Expiring soon" },
  expired: { tone: "danger", label: "Expired" },
  missing: { tone: "neutral", label: "Missing" },
};

export function HealthPill({ on, state }: { on?: Date | null; state?: HealthState }) {
  const s = state ?? healthState(on ?? null);
  return <Pill tone={LOOK[s].tone}>{LOOK[s].label}</Pill>;
}
