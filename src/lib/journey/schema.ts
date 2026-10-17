// Lantern journey: input shapes and limits. Pure (no DB), so the unit
// tests cover every rule.
//
// Keys follow the scout-core requirement ids, plus Lantern's own steps:
//   item:  "rank:first-class", "badge:camping", "custom:k3x9a1"
//   step:  "<item>#<number>", e.g. "rank:second-class#1a", "badge:plumbing#6b",
//          or "badge:cooking#2a~2" where Lantern numbers a repeated id
// A progress key is a step, or an item on its own meaning "marked
// complete as a whole".

import { z } from "zod";

export const ITEM_KEY_PATTERN = /^(rank|badge|award|custom):[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PROGRESS_KEY_PATTERN =
  /^(rank|badge|award|custom):[a-z0-9]+(?:-[a-z0-9]+)*(?:#[0-9A-Za-z][0-9A-Za-z.~-]*)?$/;

export const MAX_SCOUTS_PER_OWNER = 12;
export const MAX_PATH = 400;
export const MAX_CUSTOM_ITEMS = 60;
export const MAX_PROGRESS_CHANGES = 2000;

export const ItemKey = z.string().max(96).regex(ITEM_KEY_PATTERN, "invalid_item_key");
export const ProgressKey = z.string().max(128).regex(PROGRESS_KEY_PATTERN, "invalid_progress_key");
export const DoneOn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");

export const ScoutName = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "name_required").max(60, "name_too_long"));

export const Path = z
  .array(ItemKey)
  .max(MAX_PATH, "path_too_long")
  .refine((keys) => new Set(keys).size === keys.length, "path_has_duplicates");

const Text = (max: number) => z.string().max(max);

/** A step the owner wrote themself; same shape Lantern uses for catalog items. */
export const CustomItem = z.object({
  key: ItemKey.refine((k) => k.startsWith("custom:"), "custom_key_required"),
  name: Text(120).min(1),
  kind: z.literal("custom"),
  reqs: z
    .array(
      z.object({
        n: Text(16),
        t: Text(500),
        subs: z.array(z.object({ id: Text(16), t: Text(500) })).max(30),
      }),
    )
    .max(50),
});

export const Custom = z
  .record(ItemKey, CustomItem)
  .refine((r) => Object.keys(r).length <= MAX_CUSTOM_ITEMS, "too_many_custom_items")
  .refine((r) => Object.entries(r).every(([k, v]) => v.key === k), "custom_key_mismatch");

/** Checked steps: key → the day it was checked, or true when the day isn't known. */
export const ProgressMap = z
  .record(ProgressKey, z.union([DoneOn, z.literal(true)]))
  .refine((r) => Object.keys(r).length <= MAX_PROGRESS_CHANGES, "too_many_steps");

export const CreateScoutBody = z.object({
  name: ScoutName,
  path: Path.optional(),
  custom: Custom.optional(),
  progress: ProgressMap.optional(),
});

export const PatchScoutBody = z
  .object({
    name: ScoutName.optional(),
    path: Path.optional(),
    custom: Custom.optional(),
    /** A troop roster scout to link (see GET /api/v1/journey/troop-scouts), or null to unlink. */
    memberId: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "nothing_to_change");

export const ProgressChange = z.object({
  key: ProgressKey,
  done: z.boolean(),
  on: DoneOn.optional(),
});

export const ProgressBody = z.object({
  changes: z.array(ProgressChange).min(1).max(MAX_PROGRESS_CHANGES),
});

export type ProgressChangeT = z.infer<typeof ProgressChange>;

/**
 * Collapses a batch of changes to the last one per key (the order the
 * device made them), so a check then uncheck in one batch ends unchecked.
 */
export function lastChangePerKey(changes: ProgressChangeT[]): ProgressChangeT[] {
  const byKey = new Map<string, ProgressChangeT>();
  for (const c of changes) {
    byKey.delete(c.key);
    byKey.set(c.key, c);
  }
  return [...byKey.values()];
}

export const PairBody = z.object({
  code: z.string().min(1).max(32),
  /** What the parent will see in the device list, e.g. "Emmett's iPad". */
  label: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(40))
    .optional(),
});
