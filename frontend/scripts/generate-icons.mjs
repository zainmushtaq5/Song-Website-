/**
 * Generates the PWA icon set without any image library.
 *
 * The brand mark (rounded accent tile + white "Music2"-style note) is rasterised
 * from signed-distance fields and encoded as PNG by hand (`node:zlib` deflate +
 * CRC32), so `npm run icons` is deterministic and has no dependencies.
 *
 * Run: npm run icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ── brand colours (mirrors the oklch tokens in src/styles/globals.css) ───── */
const GRADIENT_TOP = [0xb8, 0x92, 0xff]; // light accent
const GRADIENT_BOTTOM = [0x7c, 0x3a, 0xed]; // deep violet
const NOTE = [0xff, 0xff, 0xff];

/* ── PNG encoding ────────────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

/** Encode straight-alpha RGBA pixels as a PNG buffer. */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container holding one PNG entry — keeps /favicon.ico from 404-ing. */
function encodeIco(png, size) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header[6] = size === 256 ? 0 : size; // width
  header[7] = size === 256 ? 0 : size; // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // payload size
  header.writeUInt32LE(header.length, 18); // payload offset
  return Buffer.concat([header, png]);
}

/* ── signed-distance helpers (device pixels, y grows downward) ───────────── */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Coverage of a pixel whose distance to the nearest shape edge is `d`. */
const coverage = (d) => clamp01(0.5 - d);
const mix = (a, b, t) => a + (b - a) * t;

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdSegment(px, py, ax, ay, bx, by, thickness) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / len2);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) - thickness / 2;
}

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/* ── the mark ────────────────────────────────────────────────────────────── */
/** Music-note geometry in a 0..1 box (same silhouette as the Lucide Music2 logo). */
function noteShapes(size, scale) {
  const p = (v) => (0.5 + (v - 0.5) * scale) * size; // position, scaled about the centre
  const w = (v) => v * scale * size; // thickness
  return {
    heads: [
      { cx: p(0.33), cy: p(0.715), r: w(0.105) },
      { cx: p(0.635), cy: p(0.645), r: w(0.105) },
    ],
    stems: [
      { ax: p(0.435), ay: p(0.715), bx: p(0.435), by: p(0.29), w: w(0.05) },
      { ax: p(0.74), ay: p(0.645), bx: p(0.74), by: p(0.245), w: w(0.05) },
    ],
    beam: { ax: p(0.435), ay: p(0.29), bx: p(0.74), by: p(0.245), w: w(0.075) },
  };
}

/**
 * Renders one icon.
 * @param {number} size output edge length in pixels
 * @param {{ radius?: number, markScale?: number }} opts `radius: 0` = full bleed (maskable / iOS)
 */
function renderIcon(size, { radius = 0.22, markScale = 1 } = {}) {
  const shapes = noteShapes(size, markScale);
  const rgba = Buffer.alloc(size * size * 4);
  const rounded = radius > 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const bg = rounded
        ? coverage(sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, radius * size))
        : 1;

      // Union of the note primitives: min of the distances, one shared coverage.
      let note = Number.POSITIVE_INFINITY;
      for (const h of shapes.heads) note = Math.min(note, sdCircle(px, py, h.cx, h.cy, h.r));
      for (const s of shapes.stems) note = Math.min(note, sdSegment(px, py, s.ax, s.ay, s.bx, s.by, s.w));
      const b = shapes.beam;
      note = Math.min(note, sdSegment(px, py, b.ax, b.ay, b.bx, b.by, b.w));
      const noteCov = coverage(note) * bg;

      const gradient = y / size;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        const base = mix(GRADIENT_TOP[c], GRADIENT_BOTTOM[c], gradient);
        rgba[i + c] = Math.round(mix(base, NOTE[c], noteCov));
      }
      rgba[i + 3] = Math.round(bg * 255);
    }
  }
  return encodePng(size, rgba);
}

/* ── outputs ─────────────────────────────────────────────────────────────── */
const targets = [
  { file: "public/icons/icon-192.png", size: 192, opts: { radius: 0.22, markScale: 1 } },
  { file: "public/icons/icon-512.png", size: 512, opts: { radius: 0.22, markScale: 1 } },
  // Maskable art must survive any OS mask: full-bleed background with the mark inside
  // the 80% safe circle (the note geometry peaks ~0.375 of the canvas from the centre).
  { file: "public/icons/maskable-512.png", size: 512, opts: { radius: 0, markScale: 0.86 } },
  // iOS ignores alpha and applies its own mask, so this one is opaque edge-to-edge.
  { file: "public/icons/apple-touch-icon.png", size: 180, opts: { radius: 0, markScale: 0.92 } },
  // `app/` file conventions are what Next links automatically in <head>.
  { file: "src/app/apple-icon.png", size: 180, opts: { radius: 0, markScale: 0.92 } },
  { file: "public/favicon.ico", size: 32, opts: { radius: 0.22, markScale: 1 }, ico: true },
  { file: "src/app/icon.png", size: 48, opts: { radius: 0.22, markScale: 1 } },
];

for (const target of targets) {
  const png = renderIcon(target.size, target.opts);
  const out = resolve(ROOT, target.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, target.ico ? encodeIco(png, target.size) : png);
  console.log(`${target.file.padEnd(38)} ${target.size}x${target.size}  ${png.length} bytes`);
}
console.log(`\n${targets.length} icons written.`);
