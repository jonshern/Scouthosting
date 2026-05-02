// Build placeholder PNG icons for the mobile app from scratch using
// Node's built-in zlib + a tiny PNG encoder. Real branded icons should
// replace these before App Store / Play Store submission, but having
// valid PNGs in the repo unblocks `eas build`.
//
// Usage:  node scripts/gen-placeholder-icons.mjs
//
// Outputs:
//   assets/icon.png            (1024x1024, solid primary green)
//   assets/adaptive-icon.png   (1024x1024, foreground for Android)
//   assets/splash.png          (1242x2436, primary green w/ centered mark)
//   assets/favicon.png         (48x48, web)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "assets");
fs.mkdirSync(OUT, { recursive: true });

// Brand palette mirrors the web: primary forest green, accent yellow.
const PRIMARY = [0x0e, 0x33, 0x20, 0xff];
const ACCENT = [0xc8, 0xe9, 0x4a, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];
const TRANSPARENT = [0, 0, 0, 0];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, drawPixel) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // RGBA
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace

  // Raw image data: each row prefixed with a filter byte (0 = none).
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < width; x++) {
      const px = drawPixel(x, y);
      const off = y * rowSize + 1 + x * 4;
      raw[off + 0] = px[0];
      raw[off + 1] = px[1];
      raw[off + 2] = px[2];
      raw[off + 3] = px[3];
    }
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 5x7 bitmap font for the letter "C". Just the glyph we need; trivial
// to extend later. Each row is a 5-bit mask, MSB = leftmost.
const FONT_C = [
  0b01110,
  0b10001,
  0b10000,
  0b10000,
  0b10000,
  0b10001,
  0b01110,
];

function drawCenteredC(width, height, scale, fg, bg) {
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const offX = Math.floor((width - glyphW) / 2);
  const offY = Math.floor((height - glyphH) / 2);
  return (x, y) => {
    const gx = x - offX;
    const gy = y - offY;
    if (gx >= 0 && gy >= 0 && gx < glyphW && gy < glyphH) {
      const row = FONT_C[Math.floor(gy / scale)];
      const col = Math.floor(gx / scale);
      const bit = (row >> (4 - col)) & 1;
      if (bit) return fg;
    }
    return bg;
  };
}

function write(name, buf) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, buf);
  console.log("wrote", path.relative(path.resolve(__dirname, ".."), file), "(" + buf.length + " bytes)");
}

// 1024x1024 app icon: solid primary with a centered "C" in accent yellow.
write(
  "icon.png",
  encodePng(1024, 1024, drawCenteredC(1024, 1024, 90, ACCENT, PRIMARY)),
);

// Android adaptive icon foreground: same C, transparent background so
// the OS-provided shape mask renders correctly.
write(
  "adaptive-icon.png",
  encodePng(1024, 1024, drawCenteredC(1024, 1024, 90, WHITE, PRIMARY)),
);

// Splash: 1242x2436 (iPhone 13 Pro Max portrait) with centered C in white.
write(
  "splash.png",
  encodePng(1242, 2436, drawCenteredC(1242, 2436, 110, WHITE, PRIMARY)),
);

// Web favicon: 48x48 with the same C.
write("favicon.png", encodePng(48, 48, drawCenteredC(48, 48, 4, ACCENT, PRIMARY)));

console.log("\nDone. Replace any of these with real branded artwork before store submission.");
