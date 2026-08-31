// Minimal EXIF reader that pulls just the tag we need
// (FocalLengthIn35mmFilm, 0xA405). No dependencies - walks the TIFF
// structure inside the JPEG's APP1 segment by hand. Returns null if the
// file has no EXIF (WhatsApp / social media strip it) or if the tag
// isn't present.

// Returns the 35mm-equivalent focal length in mm, or null.
export async function readFocalLength35mm(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    // JPEG must start with SOI 0xFFD8
    if (buf.length < 12 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    // Walk segments until APP1 (0xFFE1) or SOS (0xFFDA - image data starts)
    let p = 2;
    while (p < buf.length - 4) {
      if (buf[p] !== 0xFF) return null;
      const marker = buf[p + 1];
      if (marker === 0xDA || marker === 0xD9) return null; // hit image data
      const segLen = (buf[p + 2] << 8) | buf[p + 3];
      if (marker === 0xE1) {
        const start = p + 4;
        // Must be "Exif\0\0"
        if (buf[start] !== 0x45 || buf[start + 1] !== 0x78 ||
            buf[start + 2] !== 0x69 || buf[start + 3] !== 0x66) { p += 2 + segLen; continue; }
        return parseExif(buf, start + 6);
      }
      p += 2 + segLen;
    }
    return null;
  } catch { return null; }
}

// tiffStart points at the TIFF header ("II"/"MM" byte-order mark).
function parseExif(buf, tiffStart) {
  const isLE = buf[tiffStart] === 0x49; // 'I' = intel = little-endian
  const u16 = (o) => isLE ? (buf[o] | (buf[o + 1] << 8)) : ((buf[o] << 8) | buf[o + 1]);
  const u32 = (o) => isLE
    ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0
    : ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
  if (u16(tiffStart + 2) !== 0x002A) return null;
  const ifd0Offset = u32(tiffStart + 4);
  const readIfd = (ifdOffset) => {
    const base = tiffStart + ifdOffset;
    if (base + 2 > buf.length) return { entries: [], next: 0 };
    const count = u16(base);
    const entries = [];
    for (let i = 0; i < count; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > buf.length) break;
      entries.push({ tag: u16(e), type: u16(e + 2), n: u32(e + 4), valueOffset: e + 8 });
    }
    return { entries, next: u32(base + 2 + count * 12) };
  };
  // Look for FocalLengthIn35mmFilm (0xA405) in ExifIFD (0x8769), fall
  // back to plain IFD0 in case a weird camera writes it there.
  const ifd0 = readIfd(ifd0Offset);
  const findTag = (entries, tag) => entries.find((e) => e.tag === tag);
  const exifPtr = findTag(ifd0.entries, 0x8769);
  const target = exifPtr ? readIfd(u32(exifPtr.valueOffset)) : ifd0;
  const focal = findTag(target.entries, 0xA405);
  if (!focal) return null;
  // FocalLengthIn35mmFilm is type SHORT (u16), stored inline in the value
  // slot when count=1 (which is always).
  return u16(focal.valueOffset);
}

// Convert 35mm-equivalent focal length (mm) + image dimensions (px) into
// horizontal FOV in degrees. Uses the diagonal convention: the 35mm
// equivalent focal length is defined against a 43.27mm-diagonal frame.
export function focal35mmToHFovDeg(focal35mm, imgW, imgH) {
  const FRAME_DIAG = 43.27;
  const imgDiag = Math.hypot(imgW, imgH);
  const fPx = focal35mm * imgDiag / FRAME_DIAG;
  return 2 * Math.atan(imgW / (2 * fPx)) * 180 / Math.PI;
}
