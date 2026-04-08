// One-off: regenerate PWA icons (icon-192, icon-512, apple-touch-icon)
// from public/sylefi-logo.webp. Run with `node scripts/generate-icons.mjs`.
//
// The maskable icons add ~12% padding so iOS/Android can crop the corners
// without eating into the logo.

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const src       = join(root, 'public', 'sylefi-logo.webp');

// Background color matches the manifest theme so the padding looks intentional.
const BG = { r: 0x14, g: 0x52, b: 0x4f, alpha: 1 }; // teal that matches the logo

async function makeIcon(size, outName, padded = true) {
  const inner = padded ? Math.round(size * 0.82) : size;
  const offset = Math.round((size - inner) / 2);

  const logo = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: {
      width:  size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, top: offset, left: offset }])
    .png()
    .toFile(join(root, 'public', outName));

  console.log('wrote public/' + outName);
}

await makeIcon(192, 'icon-192.png');
await makeIcon(512, 'icon-512.png');
// Apple touch icon — solid background, slight padding, 180x180 is the standard.
await makeIcon(180, 'apple-touch-icon.png');
