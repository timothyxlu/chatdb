import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const iconPath = path.join(outDir, 'icon-512.png');

// All iPhone splash screen sizes: [width, height, pixelRatio]
const screens = [
  // iPhone 17 Pro / 16 Pro (402x874 @3x)
  [1206, 2622, 3, 402, 874],
  // iPhone 16 Pro Max / 17 Pro Max (440x956 @3x)
  [1320, 2868, 3, 440, 956],
  // iPhone 16 / 15 / 15 Pro / 14 Pro (393x852 @3x)
  [1179, 2556, 3, 393, 852],
  // iPhone 16 Plus / 15 Plus / 14 Plus (430x932 @3x)
  [1290, 2796, 3, 430, 932],
  // iPhone 14 / 13 / 13 Pro / 12 / 12 Pro (390x844 @3x)
  [1170, 2532, 3, 390, 844],
  // iPhone 14 Pro Max / 13 Pro Max / 12 Pro Max (428x926 @3x)
  [1284, 2778, 3, 428, 926],
  // iPhone 13 mini / 12 mini (375x812 @3x)
  [1125, 2436, 3, 375, 812],
  // iPhone SE 3rd / 8 / 7 / 6s (375x667 @2x)
  [750, 1334, 2, 375, 667],
  // iPhone 11 / XR (414x896 @2x)
  [828, 1792, 2, 414, 896],
  // iPhone 11 Pro Max / XS Max (414x896 @3x)
  [1242, 2688, 3, 414, 896],
];

const BG_COLOR = '#F5F5F7'; // matches manifest background_color
const ICON_SIZE_RATIO = 0.2; // icon takes 20% of screen width

async function generate() {
  const icon = sharp(iconPath);

  for (const [w, h, dpr, logicalW, logicalH] of screens) {
    const iconSize = Math.round(w * ICON_SIZE_RATIO);
    const resizedIcon = await icon
      .clone()
      .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const left = Math.round((w - iconSize) / 2);
    const top = Math.round((h - iconSize) / 2);

    const filename = `splash-${w}x${h}.png`;
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 4,
        background: BG_COLOR,
      },
    })
      .composite([{ input: resizedIcon, left, top }])
      .png()
      .toFile(path.join(outDir, filename));

    console.log(`✓ ${filename} (${logicalW}x${logicalH} @${dpr}x)`);
  }

  console.log('\nDone! Generated', screens.length, 'splash screens.');
}

generate().catch(console.error);
