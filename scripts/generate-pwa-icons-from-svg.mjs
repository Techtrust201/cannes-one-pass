/**
 * Rasterise public/icons/logo-festival-de-cannes.svg → PNG PWA + favicon.ico.
 * Les paths SVG sont en #000000 : rendu blanc sur fond rouge institutionnel #e30613.
 *
 * Dépendances : npm install --save-dev sharp png-to-ico
 * Usage : npm run generate:pwa-icons
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SVG_SRC = path.join(root, "public/icons/logo-festival-de-cannes.svg");
const BRAND_RED = "#e30613";

function prepareSvgBuffer() {
  let svg = fs.readFileSync(SVG_SRC, "utf8");
  svg = svg.replace(/fill="#000000"/g, 'fill="#ffffff"');
  return Buffer.from(svg);
}

async function rasterSquare(size, svgBuf) {
  const fg = await sharp(svgBuf)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_RED,
    },
  })
    .composite([{ input: fg, blend: "over" }])
    .png()
    .toBuffer();
}

async function rasterMaskable(size, svgBuf) {
  const pad = Math.floor(size * 0.14);
  const inner = size - 2 * pad;
  const fgInner = await sharp(svgBuf)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_RED,
    },
  })
    .composite([{ input: fgInner, left: pad, top: pad, blend: "over" }])
    .png()
    .toBuffer();
}

function writePng(absPath, buf) {
  fs.writeFileSync(absPath, buf);
}

function createIcoFromPngs(pairs) {
  const count = pairs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  const blobs = [];

  for (const { width, height, png } of pairs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(0, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...blobs]);
}

const svgBuf = prepareSvgBuffer();

const sizes = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];

fs.mkdirSync(path.join(root, "public/icons"), { recursive: true });

for (const s of sizes) {
  const buf = await rasterSquare(s, svgBuf);
  writePng(path.join(root, `public/icons/icon-${s}.png`), buf);
}

for (const s of [192, 512]) {
  const buf = await rasterMaskable(s, svgBuf);
  writePng(path.join(root, `public/icons/icon-maskable-${s}.png`), buf);
}

const png32 = await rasterSquare(32, svgBuf);
const png48 = await rasterSquare(48, svgBuf);
fs.writeFileSync(
  path.join(root, "public/favicon.ico"),
  createIcoFromPngs([
    { width: 32, height: 32, png: png32 },
    { width: 48, height: 48, png: png48 },
  ]),
);

console.log("Icônes PWA générées depuis logo-festival-de-cannes.svg");
