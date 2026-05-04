// Live-content block registry for the public site editor.
//
// "Live" blocks pull from the org's database at render time — events
// from Event, photos from Photo, etc. — so the admin places one block
// and new content surfaces automatically forever.
//
// Each block module exports a spec:
//   {
//     type:           string identifier persisted in customBlocks JSON
//     label:          short admin-visible name
//     description:    one-line helper for the block-picker UI
//     defaults:       config the picker assigns when a block is added
//     normalise(c):   sync, validates + clamps user-supplied config
//     fetch(args):    async, returns whatever data the renderer needs
//                     args = { orgId, config, prisma }
//     render(args):   sync, returns the public HTML for the block
//                     args = { data, config, escapeHtml, textToHtml }
//   }
//
// The dispatcher in server/render.js receives a pre-fetched
// `liveBlocksData` map (block.id → fetch result) so render() stays
// synchronous and the existing renderSite() doesn't have to become
// async.
//
// New live block types: drop a file in this directory, import + add
// it to the SPECS list below. Everything else (admin UI, validation,
// rendering, templates) picks it up automatically.

import { eventsBlock } from "./events.js";
import { photosBlock } from "./photos.js";
import { postsBlock } from "./posts.js";
import { contactBlock } from "./contact.js";

const SPECS = [eventsBlock, photosBlock, postsBlock, contactBlock];

export const LIVE_BLOCK_TYPES = Object.freeze(
  Object.fromEntries(
    SPECS.map((s) => [
      s.type,
      Object.freeze({
        label: s.label,
        description: s.description,
        defaults: s.defaults,
        live: true,
      }),
    ]),
  ),
);

const SPEC_BY_TYPE = Object.fromEntries(SPECS.map((s) => [s.type, s]));

export function isLiveBlockType(type) {
  return Boolean(SPEC_BY_TYPE[type]);
}

export function getLiveBlockSpec(type) {
  return SPEC_BY_TYPE[type] || null;
}

/**
 * Validate + clamp a single live block's config. Throws on unknown
 * type. Returns the cleaned config.
 */
export function normaliseLiveBlockConfig(type, input) {
  const spec = SPEC_BY_TYPE[type];
  if (!spec) throw new Error(`Unknown live block type: ${type}`);
  return spec.normalise(input || {});
}

/**
 * Fetch the data each live block in `blocks` needs to render. Runs
 * each spec's fetch() in parallel and returns a map keyed by block.id.
 *
 * Blocks that aren't live (text/image/cta) are skipped — the caller
 * passes the same array it has on hand and we only do work for the
 * live ones.
 *
 * Errors from a single block's fetch are caught and recorded as `null`
 * data; the renderer is expected to handle empty gracefully (most
 * already do — "no upcoming events" etc.). One bad block doesn't
 * crash the whole page.
 */
export async function fetchLiveBlocksData({ blocks, orgId, prisma }) {
  const live = (blocks || []).filter(
    (b) => b && typeof b.id === "string" && SPEC_BY_TYPE[b.type],
  );
  if (!live.length) return {};
  const results = await Promise.all(
    live.map(async (b) => {
      try {
        const data = await SPEC_BY_TYPE[b.type].fetch({
          orgId,
          config: b.config || {},
          prisma,
        });
        return [b.id, data];
      } catch (err) {
        // Don't propagate — render() will fall back to the empty state.
        // Logging is the caller's job (it has request context).
        return [b.id, { __error: String(err?.message || err) }];
      }
    }),
  );
  return Object.fromEntries(results);
}

/**
 * Render one live block to HTML. Used by server/render.js's
 * renderCustomBlock() dispatcher when the block type is live.
 *
 * data = the entry from fetchLiveBlocksData's map for this block.id
 * helpers = { escapeHtml, textToHtml } so block files don't have to
 *           re-import them and we can swap implementations centrally.
 */
export function renderLiveBlock(block, data, helpers) {
  const spec = SPEC_BY_TYPE[block?.type];
  if (!spec) return "";
  if (data?.__error) return ""; // fail closed — drop the block silently
  return spec.render({ data, config: block.config || {}, ...helpers });
}
