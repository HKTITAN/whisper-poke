// Generates a tray PNG at runtime so we don't need to commit a binary asset.
// Draws a filled accent-red circle with a soft antialiased edge.
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
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scan = Buffer.alloc(height * (1 + width * 4));
  let o = 0;
  for (let y = 0; y < height; y++) {
    scan[o++] = 0; // filter type: none
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

function drawCircle(size: number): Buffer {
  const r = size / 2 - 1;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      let a = 0;
      if (d <= r - 0.5) a = 255;
      else if (d <= r + 0.5) a = Math.round(255 * (r + 0.5 - d));
      rgba[i] = 0xff;     // R
      rgba[i + 1] = 0x4d; // G
      rgba[i + 2] = 0x55; // B
      rgba[i + 3] = a;
    }
  }
  return rgba;
}

export function buildTrayIcon(): NativeImage {
  // Provide 16 and 32 for DPI scaling.
  const png16 = encodePng(16, 16, drawCircle(16));
  const img = nativeImage.createFromBuffer(png16);
  try {
    const png32 = encodePng(32, 32, drawCircle(32));
    img.addRepresentation({ scaleFactor: 2, buffer: png32 });
  } catch {
    // older Electron — representation API optional.
  }
  return img;
}
