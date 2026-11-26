// Midia: figurinhas (WebP + metadados de pacote), ffmpeg e renderizacao de texto via SVG/sharp.
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

const run = promisify(execFile);

export async function tmpdir() { return mkdtemp(path.join(os.tmpdir(), 'gumball-')); }

export async function ffmpeg(input, ext, args, outExt) {
  const dir = await tmpdir();
  try {
    const inp = path.join(dir, 'in.' + ext), out = path.join(dir, 'out.' + outExt);
    await writeFile(inp, input);
    await run(config.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', inp, ...args, out], { maxBuffer: 64 << 20, timeout: 180000 });
    return await readFile(out);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function probeDuration(buffer, ext) {
  const dir = await tmpdir();
  try {
    const f = path.join(dir, 'p.' + ext); await writeFile(f, buffer);
    const { stderr } = await run(config.ffmpeg, ['-hide_banner', '-i', f], { timeout: 30000 }).catch(e => e);
    const mm = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr || '');
    return mm ? (+mm[1]) * 3600 + (+mm[2]) * 60 + parseFloat(mm[3]) : 0;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// ---------- Metadados de figurinha (chunk EXIF no RIFF/WebP) ----------
function exifPayload(pack, author) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': 'gumball-' + Date.now(), 'sticker-pack-name': pack, 'sticker-pack-publisher': author, emojis: ['🤖'],
  }));
  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  head.writeUInt32LE(json.length, 14);
  return Buffer.concat([head, json]);
}
function chunks(webp) {
  const out = []; let i = 12;
  while (i + 8 <= webp.length) {
    const id = webp.toString('ascii', i, i + 4), size = webp.readUInt32LE(i + 4);
    out.push({ id, data: webp.subarray(i + 8, i + 8 + size) });
    i += 8 + size + (size & 1);
  }
  return out;
}
function chunk(id, data) {
  const h = Buffer.alloc(8); h.write(id, 0, 'ascii'); h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
export async function addExif(webp, pack = config.botName, author = config.ownerName) {
  let cs = chunks(webp).filter(c => c.id !== 'EXIF');
  let vp8x = cs.find(c => c.id === 'VP8X');
  if (!vp8x) {
    const meta = await sharp(webp).metadata();
    const d = Buffer.alloc(10);
    d.writeUIntLE(meta.width - 1, 4, 3); d.writeUIntLE(meta.height - 1, 7, 3);
    vp8x = { id: 'VP8X', data: d }; cs.unshift(vp8x);
  }
  vp8x.data = Buffer.from(vp8x.data); vp8x.data[0] |= 0x08; // flag EXIF
  cs.push({ id: 'EXIF', data: exifPayload(pack, author) });
  const body = Buffer.concat([Buffer.from('WEBP'), ...cs.map(c => chunk(c.id, c.data))]);
  const riff = Buffer.alloc(8); riff.write('RIFF', 0, 'ascii'); riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
export function readExif(webp) {
  const c = chunks(webp).find(c => c.id === 'EXIF');
  if (!c) return null;
  const s = c.data.toString('utf8'); const i = s.indexOf('{');
  try { return JSON.parse(s.slice(i)); } catch { return null; }
}

// Imagem -> figurinha 512x512 (contain, fundo transparente)
export async function imageToSticker(buffer, { pack, author, fit = 'contain', round = false } = {}) {
  let img = sharp(buffer, { animated: false }).resize(512, 512, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (round) {
    const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>');
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return addExif(await img.webp({ quality: 80 }).toBuffer(), pack, author);
}
// Video/GIF -> figurinha animada (ate 8s, 512px, 15fps)
export async function videoToSticker(buffer, ext = 'mp4', { pack, author } = {}) {
  const webp = await ffmpeg(buffer, ext, ['-t', '8', '-vf',
    "fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=0x00000000,format=rgba",
    '-loop', '0', '-an', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', '50', '-preset', 'default'], 'webp');
  return addExif(webp, pack, author);
}
export async function stickerToImage(webp) { return sharp(webp, { animated: false }).png().toBuffer(); }
export async function stickerToGif(webp) { return sharp(webp, { animated: true }).gif().toBuffer(); }
export async function stickerToMp4(webp) {
  const gif = await stickerToGif(webp);
  return ffmpeg(gif, 'gif', ['-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'], 'mp4');
}

// ---------- Texto -> imagem (SVG) ----------
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function wrap(text, maxChars) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
function fitText(text, box = 460, base = 120) {
  for (let size = base; size >= 28; size -= 4) {
    const per = Math.max(1, Math.floor(box / (size * 0.58)));
    const lines = wrap(text, per);
    if (lines.length * size * 1.15 <= box && lines.every(l => l.length <= per + 2)) return { size, lines };
  }
  return { size: 28, lines: wrap(text, 28).slice(0, 14) };
}
export function textSvg(text, { fill = '#fff', stroke = '#000', strokeW = 8, bg = 'none', font = 'Arial Black, Arial, sans-serif', weight = 900, align = 'middle', blur = 0, box, base } = {}) {
  const { size, lines } = fitText(text, box, base);
  const total = lines.length * size * 1.15;
  const x = align === 'start' ? 30 : 256;
  const y0 = 256 - total / 2 + size * 0.85;
  const tspans = lines.map((l, i) => `<tspan x="${x}" y="${(y0 + i * size * 1.15).toFixed(1)}">${esc(l)}</tspan>`).join('');
  const filter = blur ? `<filter id="b"><feGaussianBlur stdDeviation="${blur}"/></filter>` : '';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs>${filter}</defs>
<rect width="512" height="512" fill="${bg}"/>
<text font-family="${font}" font-weight="${weight}" font-size="${size}" text-anchor="${align}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" paint-order="stroke" ${blur ? 'filter="url(#b)"' : ''}>${tspans}</text></svg>`);
}
export async function svgToWebp(svg) { return sharp(svg).webp({ quality: 85 }).toBuffer(); }
export async function svgToPng(svg) { return sharp(svg).png().toBuffer(); }
// Animacao: lista de SVGs -> webp animado
export async function framesToAnimatedWebp(svgs, delay = 120) {
  const pngs = await Promise.all(svgs.map(s => sharp(s).png().toBuffer()));
  return sharp(pngs, { join: { animated: true } }).webp({ quality: 80, loop: 0, delay: pngs.map(() => delay) }).toBuffer();
}
