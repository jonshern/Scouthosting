// Pure-JS smoke test for the Compass mobile design tokens.
//
// Loads the canonical `bold` palette from design/source/tokens.js (a
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

function loadCanonicalBoldPalette(): Record<string, string> {
  const src = readFileSync(tokensJsPath, 'utf8');
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  runInNewContext(src, sandbox);
  const palettes = sandbox.window.SH_PALETTES as Record<string, Record<string, string>>;
  if (!palettes || !palettes.bold) {
    throw new Error('bold palette not found in design/source/tokens.js');
  }
  return palettes.bold;
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

describe('mobile tokens — Forest & Ember (bold) parity', () => {
  const canonical = loadCanonicalBoldPalette();
  const mobile = loadMobilePalette();

  it('mobile palette has the bold palette name', () => {
    expect(mobile.name).toBe('Evergreen & Spectrum');
  });

  it.each([
    ['bg', '#f4ecdc'],
    ['surface', '#ffffff'],
    ['surfaceAlt', '#1a1f1a'],
    ['ink', '#0d130d'],
    ['inkSoft', '#2a352a'],
    ['inkMuted', '#5a6258'],
    ['line', '#d4c8a8'],
    ['lineSoft', '#e6dcc0'],
    ['primary', '#0e3320'],
    ['primaryHover', '#06200f'],
    ['accent', '#c8e94a'],
    ['accentSoft', '#e3f29b'],
    ['danger', '#a82e1d'],
    ['success', '#3d6b3a'],
    ['chip', '#0e3320'],
    ['sky', '#3a7ab8'],
    ['skySoft', '#bcd6ec'],
    ['ember', '#e07a3c'],
    ['emberSoft', '#f5cba8'],
    ['raspberry', '#c43d6b'],
    ['raspberrySoft', '#f0bccc'],
    ['butter', '#f3c54a'],
    ['butterSoft', '#faecb8'],
    ['plum', '#6e3b7a'],
    ['plumSoft', '#d6bcdc'],
    ['teal', '#3aa893'],
    ['tealSoft', '#bce0d8'],
  ] as const)('canonical %s == mobile %s', (key, expected) => {
    expect(canonical[key]).toBe(expected);
    expect(mobile[key]).toBe(expected);
  });

  it('every canonical bold palette key has an exact mobile match', () => {
    for (const key of Object.keys(canonical)) {
      if (key === 'name') continue;
      expect(mobile[key], `mobile token missing or mismatched for '${key}'`).toBe(
        canonical[key],
      );
    }
  });
});
