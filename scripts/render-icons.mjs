// Renders the Pokerize logo (assets/logo/pokerize-icon.html) into the app's
// icon files. Needs a Chromium browser; set BROWSER to its binary if the
// default below isn't installed. Usage: node scripts/render-icons.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";

const browser =
  process.env.BROWSER ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = resolve(import.meta.dirname, "..");
const source = join(root, "assets/logo/pokerize-icon.html");
const master = join(mkdtempSync(join(tmpdir(), "pokerize-icon-")), "1024.png");

// The page is a 140px tile; scale it up to a 1024px master.
execFileSync(browser, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--window-size=140,140",
  `--force-device-scale-factor=${1024 / 140}`,
  "--virtual-time-budget=1000",
  `--screenshot=${master}`,
  pathToFileURL(source).href,
]);

const png = (size) =>
  sharp(master)
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .png()
    .toBuffer();

const outputs = {
  "app/icon.png": 192,
  "app/apple-icon.png": 180,
  "public/icons/icon-192.png": 192,
  "public/icons/icon-512.png": 512,
};
for (const [path, size] of Object.entries(outputs)) {
  writeFileSync(join(root, path), await png(size));
}

// favicon.ico holds RGBA PNG images at 16, 32 and 48 px.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += images[i].length;
});
writeFileSync(join(root, "app/favicon.ico"), Buffer.concat([header, ...images]));

console.log("Wrote", [...Object.keys(outputs), "app/favicon.ico"].join(", "));
