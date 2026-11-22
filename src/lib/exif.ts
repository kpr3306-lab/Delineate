// Reads when and where a JPEG was taken from its EXIF block. No dependencies, so `node scripts/exif.check.ts` can test it.

export type ExifInfo = { taken?: number; place?: { lat: number; lon: number } };

/** Parse EXIF out of the start of a JPEG file. Anything missing or malformed is simply left out. */
export function parseExif(buf: ArrayBuffer): ExifInfo {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let p = 2;
  while (p + 4 <= v.byteLength) {
    const marker = v.getUint16(p);
    const len = v.getUint16(p + 2);
    if (marker === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) return tiff(v, p + 10); // "Exif"
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; // not a marker / start of image data
    p += 2 + len;
  }
  return {};
}

function tiff(v: DataView, t: number): ExifInfo {
  try {
    const le = v.getUint16(t) === 0x4949;
    const u16 = (o: number) => v.getUint16(t + o, le);
    const u32 = (o: number) => v.getUint32(t + o, le);
    const entries = (ifd: number) => {
      const out = new Map<number, { type: number; count: number; at: number }>();
      const n = u16(ifd);
      for (let i = 0; i < n; i += 1) {
        const e = ifd + 2 + i * 12;
        const type = u16(e + 2);
        const count = u32(e + 4);
        const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 } as Record<number, number>)[type] ?? 1;
        out.set(u16(e), { type, count, at: size * count > 4 ? u32(e + 8) : e + 8 });
      }
      return out;
    };
    const ascii = (at: number, count: number) => {
      let s = '';
      for (let i = 0; i < count; i += 1) {
        const c = v.getUint8(t + at + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s;
    };
    const rational = (at: number, i: number) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1);
    const info: ExifInfo = {};
    const ifd0 = entries(u32(4));
    const exifPtr = ifd0.get(0x8769);
    if (exifPtr) {
      const sub = entries(u32(exifPtr.at));
      const dto = sub.get(0x9003) ?? sub.get(0x9004);
      const m = dto && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(ascii(dto.at, dto.count));
      if (m) {
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        if (Number.isFinite(d) && +m[1] > 1900) info.taken = d;
      }
    }
    const gpsPtr = ifd0.get(0x8825);
    if (gpsPtr) {
      const g = entries(u32(gpsPtr.at));
      const deg = (tag: number, refTag: number, neg: string) => {
        const e = g.get(tag);
        const r = g.get(refTag);
        if (!e || e.count < 3) return undefined;
        const val = rational(e.at, 0) + rational(e.at, 1) / 60 + rational(e.at, 2) / 3600;
        return r && ascii(r.at, r.count) === neg ? -val : val;
      };
      const lat = deg(2, 1, 'S');
      const lon = deg(4, 3, 'W');
      if (lat !== undefined && lon !== undefined && (lat || lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        info.place = { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
      }
    }
    return info;
  } catch {
    return {}; // truncated or odd EXIF: keep what the file name and import time give us
  }
}

/** EXIF lives at the very start of a JPEG; 256 KB is plenty even with a big embedded thumbnail. */
export async function readExif(file: Blob): Promise<ExifInfo> {
  if (!/jpe?g/i.test(file.type)) return {};
  return parseExif(await file.slice(0, 256 * 1024).arrayBuffer());
}
