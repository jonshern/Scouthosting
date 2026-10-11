// Turn a Waypoint event file (events/*.json in the bluecard repo: a
// merit badge day with stations and volunteer roles) into the sign-up
// slots Compass needs, keyed so public sign-ups can find them.

import { z } from "zod";
import { ExternalIdSchema, roleKey, stationKey } from "./public-signup";

const Station = z.object({
  id: ExternalIdSchema,
  badge: z.string().trim().min(1).max(120),
  block: z.string().max(80).optional(),
  capacity: z.number().int().min(1).max(10_000),
});

const Role = z.object({
  id: ExternalIdSchema,
  label: z.string().trim().min(1).max(120),
  need: z.number().int().min(1).max(10_000),
  desc: z.string().max(1000).optional(),
});

const EventFile = z.object({
  title: z.string().optional(),
  blocks: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  stations: z.array(Station).max(500).default([]),
  volunteerRoles: z.array(Role).max(100).default([]),
});

export type SlotSpec = {
  key: string;
  title: string;
  description: string | null;
  capacity: number;
  sortOrder: number;
};

/** Parse the file's JSON text into slot specs, or a message for the leader. */
export function slotsFromEventFile(text: string): { slots: SlotSpec[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const parsed = EventFile.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: `Event file: ${i?.path.join(".") || "file"} ${i?.message ?? "is invalid"}.` };
  }
  const f = parsed.data;
  const blockLabel = new Map((f.blocks ?? []).map((b) => [b.id, b.label]));
  const slots: SlotSpec[] = [];
  const seen = new Set<string>();
  for (const st of f.stations) {
    const key = stationKey(st.id);
    if (seen.has(key)) return { error: `Station id "${st.id}" appears twice.` };
    seen.add(key);
    const block = st.block ? blockLabel.get(st.block) ?? st.block : null;
    slots.push({
      key,
      title: block ? `${st.badge} (${block})` : st.badge,
      description: null,
      capacity: st.capacity,
      sortOrder: slots.length,
    });
  }
  for (const r of f.volunteerRoles) {
    const key = roleKey(r.id);
    if (seen.has(key)) return { error: `Volunteer role id "${r.id}" appears twice.` };
    seen.add(key);
    slots.push({
      key,
      title: `Volunteer: ${r.label}`,
      description: r.desc ?? null,
      capacity: r.need,
      sortOrder: slots.length,
    });
  }
  if (!slots.length) return { error: "The file has no stations or volunteer roles." };
  return { slots };
}
