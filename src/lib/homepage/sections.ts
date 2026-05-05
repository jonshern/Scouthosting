// Homepage block validation. The canvas array in `Page.customBlocks`
// is the single source of truth for ordering. This module owns
// block-type registration and per-block normalisation for the
// /admin/site save path.
//
// Live blocks (which pull from the org DB at render time) need their
// own type registration; this port keeps the static block types and
// exposes registerLiveBlockType so the live-block modules can wire
// themselves in at module init.

const STATIC_BLOCK_TYPES = {
  text: { label: "Text", description: "A heading and a paragraph (Markdown)." },
  image: { label: "Image", description: "A photo with optional caption." },
  cta: { label: "Call to action", description: "Headline + body + button." },
} as const;

type StaticBlockKey = keyof typeof STATIC_BLOCK_TYPES;

const LIVE_BLOCK_TYPES = new Map<
  string,
  { label: string; description: string; normaliseConfig: (raw: unknown) => unknown }
>();

export function registerLiveBlockType(
  key: string,
  meta: { label: string; description: string; normaliseConfig: (raw: unknown) => unknown },
): void {
  LIVE_BLOCK_TYPES.set(key, meta);
}

export function isLiveBlockType(key: string): boolean {
  return LIVE_BLOCK_TYPES.has(key);
}

export function blockTypes(): Record<string, { label: string; description: string }> {
  const out: Record<string, { label: string; description: string }> = {
    ...STATIC_BLOCK_TYPES,
  };
  for (const [k, v] of LIVE_BLOCK_TYPES.entries()) {
    out[k] = { label: v.label, description: v.description };
  }
  return out;
}

export type CustomBlock =
  | { id: string; type: "text"; title: string; body: string }
  | { id: string; type: "image"; filename: string; caption: string; alt: string }
  | { id: string; type: "cta"; title: string; body: string; buttonLabel: string; buttonLink: string }
  | { id: string; type: string; config: unknown };

export function readCustomBlocks(page: { customBlocks?: unknown } | null | undefined): CustomBlock[] {
  const raw = page?.customBlocks;
  if (!Array.isArray(raw)) return [];
  const known = blockTypes();
  return raw
    .filter(
      (b: unknown): b is { id: unknown; type: unknown } =>
        !!b &&
        typeof b === "object" &&
        typeof (b as { id?: unknown }).id === "string" &&
        typeof (b as { type?: unknown }).type === "string" &&
        !!known[(b as { type: string }).type],
    )
    .map((b) => ({ ...(b as object) })) as CustomBlock[];
}

export function normaliseCustomBlock(input: unknown): CustomBlock {
  if (!input || typeof input !== "object") throw new Error("block must be an object");
  const obj = input as Record<string, unknown>;
  const id = String(obj.id || "").trim();
  if (!id) throw new Error("block id required");
  const type = String(obj.type || "");
  const known = blockTypes();
  if (!known[type]) throw new Error(`Unknown block type: ${type}`);

  if (type === "text") {
    return {
      id,
      type: "text",
      title: String(obj.title || "").slice(0, 120),
      body: String(obj.body || "").slice(0, 8000),
    };
  }
  if (type === "image") {
    return {
      id,
      type: "image",
      filename: String(obj.filename || "").slice(0, 200),
      caption: String(obj.caption || "").slice(0, 200),
      alt: String(obj.alt || "").slice(0, 200),
    };
  }
  if (type === "cta") {
    return {
      id,
      type: "cta",
      title: String(obj.title || "").slice(0, 120),
      body: String(obj.body || "").slice(0, 600),
      buttonLabel: String(obj.buttonLabel || "").slice(0, 60),
      buttonLink: String(obj.buttonLink || "").slice(0, 500),
    };
  }
  if (isLiveBlockType(type)) {
    const meta = LIVE_BLOCK_TYPES.get(type)!;
    return {
      id,
      type,
      config: meta.normaliseConfig(obj.config ?? obj),
    } as CustomBlock;
  }
  // Should be unreachable: known[type] check above.
  throw new Error(`Unknown block type: ${type}`);
}

export const BLOCK_TYPES = blockTypes();

// Re-export so callers don't reach into the static map directly.
export { STATIC_BLOCK_TYPES };
export type { StaticBlockKey };
