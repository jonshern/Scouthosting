// Generate small solid-color PNGs procedurally — no native deps.
// Used by prisma/seed.js to populate the demo gallery + activity feed
// without bundling stock photos in the repo.

import zlib from "node:zlib";

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf), 0);
  return Buffer.concat([len, Buffer.from(type), data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Solid color (with a darker bottom-half band so the result has a hint
 * of structure and isn't a flat rectangle in the gallery thumbnails).
 *
 * @param {number} w
 * @param {number} h
 * @param {[number,number,number]} top   [r, g, b]
 * @param {[number,number,number]} bottom [r, g, b]
 */
export function gradientPng(w, h, top, bottom) {
  const split = Math.floor(h * 0.6);
  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter byte
    const c = y < split ? top : bottom;
    for (let x = 0; x < w; x++) raw.push(c[0], c[1], c[2]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
