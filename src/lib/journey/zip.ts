// A small zip writer and reader for trail exports: the "everything"
// download (trail.json, trail.xlsx and the photos) and the .xlsx file
// itself, which is a zip of XML parts. Only what those need: deflate or
// stored entries, no zip64, no encryption. The reader caps the number
// of files and their unpacked size, so a crafted upload can't blow up
// memory.

import zlib from "node:zlib";

export type ZipFile = { name: string; data: Uint8Array; store?: boolean };

// 1980-01-01 00:00, the earliest time a zip can record.
const DOS_EPOCH = { time: 0, date: (1 << 5) | 1 };

function dosTime(d: Date) {
  if (d.getUTCFullYear() < 1980) return DOS_EPOCH;
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

export function zip(files: ZipFile[], when = new Date()): Buffer {
  const { time, date } = dosTime(when);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.from(f.data);
    const crc = zlib.crc32(raw);
    const packed = f.store ? raw : zlib.deflateRawSync(raw);
    const method = f.store ? 0 : 8;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // names are UTF-8
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    local.push(head, name, packed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);
    offset += head.length + name.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBytes, end]);
}

export class BadZip extends Error {}

export type UnzipLimits = { maxFiles: number; maxBytes: number };

/** The files in a zip, by name. Throws BadZip for anything it can't read or that's over the limits. */
export function unzip(buf: Buffer, limits: UnzipLimits): Map<string, Buffer> {
  // The end record is in the last 22 bytes plus up to 64 KB of comment.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new BadZip("not a zip file");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  if (count > limits.maxFiles) throw new BadZip("too many files");
  const out = new Map<string, Buffer>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new BadZip("damaged zip directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packedLen = buf.readUInt32LE(p + 20);
    const rawLen = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new BadZip("encrypted zips aren't supported");
    if (name.endsWith("/")) continue;
    total += rawLen;
    if (total > limits.maxBytes) throw new BadZip("zip is too large when unpacked");
    if (at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) throw new BadZip("damaged zip entry");
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const packed = buf.subarray(start, start + packedLen);
    let data: Buffer;
    if (method === 0) data = Buffer.from(packed);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(packed, { maxOutputLength: Math.max(rawLen, 1) });
      } catch {
        throw new BadZip(`can't unpack ${name}`);
      }
    } else throw new BadZip(`unsupported compression in ${name}`);
    if (data.length !== rawLen || zlib.crc32(data) !== crc) throw new BadZip(`${name} is damaged`);
    // macOS "Compress" adds __MACOSX/ resource forks; they aren't ours.
    if (name.startsWith("__MACOSX/")) continue;
    out.set(name, data);
  }
  return out;
}
