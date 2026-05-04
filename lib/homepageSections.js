// Homepage block validation. The canvas array in `Page.customBlocks`
// is the single source of truth for ordering — there's no separate
// "section plan." This module owns block-type registration and
// per-block normalisation for the /admin/site save path.

import { LIVE_BLOCK_TYPES, isLiveBlockType, normaliseLiveBlockConfig } from "./blocks/index.js";

export { isLiveBlockType };

// Built-in block types are static-config — admin types in the content
// directly. Live block types (in LIVE_BLOCK_TYPES, registered from
// lib/blocks/) pull from the org's database at render time.
const STATIC_BLOCK_TYPES = Object.freeze({
  text:  { label: "Text",  description: "A heading and a paragraph (Markdown)." },
  image: { label: "Image", description: "A photo with optional caption." },
  cta:   { label: "Call to action", description: "Headline + body + button." },
});

export const BLOCK_TYPES = Object.freeze({
  ...STATIC_BLOCK_TYPES,
  ...LIVE_BLOCK_TYPES,
});

/**
 * Read the customBlocks JSON column into a clean array. Drops any rows
 * that don't have a known block type, since the renderer would have to
 * skip them anyway.
 */
export function readCustomBlocks(page) {
  const raw = page?.customBlocks;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b) => b && typeof b.id === "string" && BLOCK_TYPES[b.type])
    .map((b) => ({ ...b }));
}

/**
 * Validate a single block patch coming from the admin form. Throws on
 * unknown type / missing id / wrong-shape config. Returns the cleaned
 * row ready to be persisted.
 */
export function normaliseCustomBlock(input) {
  if (!input || typeof input !== "object") throw new Error("block must be an object");
  const id = String(input.id || "").trim();
  if (!id) throw new Error("block id required");
  const type = String(input.type || "");
  if (!BLOCK_TYPES[type]) throw new Error(`Unknown block type: ${type}`);
  const out = { id, type };
  if (type === "text") {
    out.title = String(input.title || "").slice(0, 120);
    out.body = String(input.body || "").slice(0, 8000);
  } else if (type === "image") {
    out.filename = String(input.filename || "").slice(0, 200);
    out.caption = String(input.caption || "").slice(0, 200);
    out.alt = String(input.alt || "").slice(0, 200);
  } else if (type === "cta") {
    out.title = String(input.title || "").slice(0, 120);
    out.body = String(input.body || "").slice(0, 600);
    out.buttonLabel = String(input.buttonLabel || "").slice(0, 60);
    out.buttonLink = String(input.buttonLink || "").slice(0, 500);
  } else if (isLiveBlockType(type)) {
    // Live blocks own their own config schema. Persist the cleaned
    // config under `config` so static and live blocks have a stable
    // shape for the dispatcher to peek at.
    out.config = normaliseLiveBlockConfig(type, input.config || input);
  }
  return out;
}
