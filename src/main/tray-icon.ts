// Generates tray PNGs at runtime so we don't need to commit binary assets.
// Two variants: gray "idle" and red "recording". Both have soft antialiased
// edges and the small inner glyph that hints at a mic.
import { nativeImage, NativeImage } from 'electron';
import * as zlib from 'zlib';

function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scan = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    scan[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      scan[o++] = rgba[i];
      scan[o++] = rgba[i + 1];
      scan[o++] = rgba[i + 2];
      scan[o++] = rgba[i + 3];
    }
  }
  const idatData = zlib.deflateSync(scan);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))]);
}

interface Rgb { r: number; g: number; b: number; }

function drawMicIcon(size: number, fill: Rgb, innerAlpha = 255): Buffer {
  const r = size / 2 - 1;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const rgba = Buffer.alloc(size * size * 4);

  // Proportions for the inner mic shape.
  const capsuleHalfW = size * 0.14;
  const capsuleTop = size * 0.22;
  const capsuleBottom = size * 0.58;
  const capsuleR = capsuleHalfW;
  const stemTop = capsuleBottom;
  const stemBottom = size * 0.76;
  const baseTop = size * 0.76;
  const baseBottom = size * 0.82;
  const baseHalfW = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;

      // Outer disc (full-color fill with antialiased edge).
      let a = 0;
      if (d <= r - 0.5) a = 255;
      else if (d <= r + 0.5) a = Math.round(255 * (r + 0.5 - d));

      if (a === 0) {
        rgba[i + 3] = 0;
        continue;
      }

      // Inside the disc: check whether pixel is in the mic glyph → punch it
      // white-ish, otherwise keep the fill color.
      let inGlyph = false;

      // Capsule body (rounded rect from capsuleTop..capsuleBottom width 2*halfW)
      if (Math.abs(dx) <= capsuleHalfW + 0.5) {
        if (y >= capsuleTop + capsuleR && y <= capsuleBottom - capsuleR) inGlyph = true;
        else if (y < capsuleTop + capsuleR) {
          const ddy = y - (capsuleTop + capsuleR - size / 2 + cy);
          const ddx = dx;
          const ydelta = y - (capsuleTop + capsuleR);
          if (Math.sqrt(ddx * ddx + ydelta * ydelta) <= capsuleR) inGlyph = true;
          void ddy;
        } else if (y > capsuleBottom - capsuleR) {
          const ddx = dx;
          const ydelta = y - (capsuleBottom - capsuleR);
          if (Math.sqrt(ddx * ddx + ydelta * ydelta) <= capsuleR) inGlyph = true;
        }
      }

      // Stem
      if (!inGlyph && Math.abs(dx) <= size * 0.025 && y >= stemTop && y <= stemBottom) {
        inGlyph = true;
      }

      // Base bar
      if (!inGlyph && Math.abs(dx) <= baseHalfW && y >= baseTop && y <= baseBottom) {
        inGlyph = true;
      }

      if (inGlyph) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
        rgba[i + 3] = Math.min(a, innerAlpha);
      } else {
        rgba[i] = fill.r;
        rgba[i + 1] = fill.g;
        rgba[i + 2] = fill.b;
        rgba[i + 3] = a;
      }
    }
  }
  return rgba;
}

const RED: Rgb = { r: 0xff, g: 0x4d, b: 0x55 };
const GRAY: Rgb = { r: 0x88, g: 0x8c, b: 0x94 };

function buildIcon(fill: Rgb): NativeImage {
  // Use a single 32×32 image — addRepresentation occasionally fails to swap
  // on Windows, leaving the tray stuck on whatever was set first.
  const png32 = encodePng(32, 32, drawMicIcon(32, fill));
  return nativeImage.createFromBuffer(png32);
}

export function buildTrayIcon(): NativeImage {
  return buildIcon(GRAY);
}

export function buildTrayIconRecording(): NativeImage {
  return buildIcon(RED);
}

export function buildTrayIconIdle(): NativeImage {
  return buildIcon(GRAY);
}
