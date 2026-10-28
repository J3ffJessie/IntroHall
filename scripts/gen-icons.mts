// Generates the PWA icons in public/icons (run: node scripts/gen-icons.mts). Two overlapping rings on
// indigo, "two people connecting". Maskable variants keep the mark inside the 80 % safe zone.
import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const INDIGO = [79, 70, 229];
const WHITE = [255, 255, 255];

function icon(size: number, { maskable, radius }: { maskable: boolean; radius: number }) {
  const png = new PNG({ width: size, height: size });
  const scale = maskable ? 0.62 : 0.78; // mark size relative to the canvas
  const r = (size * scale) / 4.2; // ring radius
  const stroke = r * 0.34;
  const cx1 = size / 2 - r * 0.62, cx2 = size / 2 + r * 0.62, cy = size / 2;
  const SS = 4; // supersampling for anti-aliasing
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
      // Rounded-square background (full bleed when maskable: the platform applies the mask).
      const dx = Math.max(Math.abs(px - size / 2) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(py - size / 2) - (size / 2 - radius), 0);
      if (maskable || dx * dx + dy * dy <= radius * radius) bg++;
      const d1 = Math.hypot(px - cx1, py - cy), d2 = Math.hypot(px - cx2, py - cy);
      if (Math.abs(d1 - r) <= stroke / 2 || Math.abs(d2 - r) <= stroke / 2) fg++;
    }
    const a = bg / (SS * SS), f = fg / (SS * SS);
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(INDIGO[c] * (1 - f) + WHITE[c] * f);
    png.data[i + 3] = Math.round(255 * a);
  }
  return PNG.sync.write(png);
}

const out = (name: string, buf: Buffer) => writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), buf);
out("icon-192.png", icon(192, { maskable: false, radius: 42 }));
out("icon-512.png", icon(512, { maskable: false, radius: 112 }));
out("maskable-512.png", icon(512, { maskable: true, radius: 0 }));
out("apple-touch-icon.png", icon(180, { maskable: true, radius: 0 })); // iOS rounds corners itself
console.log("icons written to public/icons");
