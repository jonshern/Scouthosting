// Pure-JS smoke test for the Compass mobile design tokens.
//
// Loads the canonical `balanced` palette from design/source/tokens.js (a
// browser-shaped file that assigns to window.SH_PALETTES) and the
// mobile token export from mobile/src/theme/tokens.ts (read as text and
// extracted with a regex) and asserts the two are identical. This
// catches drift between the design system reference and the mobile
// implementation without depending on either the react-native runtime
// or the expo tsconfig base.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const tokensJsPath = resolve(here, '..', '..', 'design', 'source', 'tokens.js');
const tokensTsPath = resolve(here, '..', 'src', 'theme', 'tokens.ts');

function loadCanonicalBalancedPalette(): Record<string, string> {
  const src = readFileSync(tokensJsPath, 'utf8');
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(src, sandbox);
  const palettes = sandbox.window.SH_PALETTES as Record<string, Record<string, string>>;
  if (!palettes || !palettes.balanced) {
    throw new Error('balanced palette not found in design/source/tokens.js');
  }
  return palettes.balanced;
}

function loadMobilePalette(): Record<string, string> {
  // Read tokens.ts as text and extract the `palette: Palette = { ... }`
  // literal. We avoid `import` so we don't need to load react-native or
  // resolve the expo tsconfig extension.
  const src = readFileSync(tokensTsPath, 'utf8');
  const match = src.match(/export const palette: Palette = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('Could not locate mobile palette literal in tokens.ts');
  const body = match[1] ?? '';
  const out: Record<string, string> = {};
  // Match: key: 'value', or key: "value", — comments and trailing
  // commas are tolerated by the global regex.
  const entryRe = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    const key = m[1];
    const value = m[2];
    if (key && value) out[key] = value;
  }
  return out;
}

describe('mobile tokens — Slate & Sky (balanced) parity', () => {
  const canonical = loadCanonicalBalancedPalette();
  const mobile = loadMobilePalette();

  it('mobile palette has the balanced palette name', () => {
    expect(mobile.name).toBe('Slate & Sky');
  });

  it.each([
    ['bg', '#f7f8fa'],
    ['surface', '#ffffff'],
    ['surfaceAlt', '#eef1f5'],
    ['ink', '#0f172a'],
    ['inkSoft', '#334155'],
    ['inkMuted', '#64748b'],
    ['line', '#e2e8f0'],
    ['lineSoft', '#eef1f5'],
    ['primary', '#0f172a'],
    ['primaryHover', '#020617'],
    ['accent', '#1d4ed8'],
    ['accentSoft', '#bcd0f4'],
    ['danger', '#dc2626'],
    ['success', '#059669'],
    ['chip', '#e2e8f0'],
    ['sky', '#1d4ed8'],
    ['skySoft', '#bcd0f4'],
    ['ember', '#f59e0b'],
    ['emberSoft', '#fde68a'],
    ['butter', '#f59e0b'],
    ['butterSoft', '#fde68a'],
    ['teal', '#0891b2'],
    ['tealSoft', '#bee5ef'],
  ] as const)('canonical %s == mobile %s', (key, expected) => {
    expect(canonical[key]).toBe(expected);
    expect(mobile[key]).toBe(expected);
  });

  it('every canonical balanced palette key the mobile theme uses matches', () => {
    // The balanced palette adds `surfaceDark` (an inverted-block surface)
    // that the current mobile theme doesn't expose; allow it. Otherwise
    // every canonical key the mobile theme declares must match exactly.
    const skip = new Set(['name', 'surfaceDark']);
    for (const key of Object.keys(canonical)) {
      if (skip.has(key)) continue;
      if (mobile[key] === undefined) continue;
      expect(mobile[key], `mobile token mismatched for '${key}'`).toBe(canonical[key]);
    }
  });
});
