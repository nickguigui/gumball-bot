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
  const s = c.data.toString('utf8'); const i = s.indexOf('{"'); // o byte de tamanho pode valer '{'
  try { return JSON.parse(s.slice(i)); } catch { return null; }
}

// Imagem -> figurinha 512x512 (contain, fundo transparente)
export async function imageToSticker(buffer, { pack, author, fit = 'contain', round = false } = {}) {
  // lanczos + leve nitidez: a foto nao fica "embacada" ao reduzir para 512
  let img = sharp(buffer, { animated: false }).rotate().resize(512, 512, { fit, kernel: 'lanczos3', background: { r: 0, g: 0, b: 0, alpha: 0 } }).sharpen({ sigma: 0.6 });
  if (round) {
    const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>');
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  let webp = await img.webp({ quality: 92, effort: 5, smartSubsample: true }).toBuffer();
  if (webp.length > 95_000) webp = await sharp(webp).webp({ quality: 80, effort: 5 }).toBuffer(); // limite de figurinha estatica (~100 KB)
  return addExif(webp, pack, author);
}
// Video/GIF -> figurinha animada (ate 8s, 512px, 15fps)
// fit: contain = inteira (bordas transparentes), cover = recorta o centro, fill = estica ate o quadrado
const VF = {
  contain: 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:-1:-1:color=0x00000000',
  cover: 'scale=512:512:force_original_aspect_ratio=increase:flags=lanczos,crop=512:512',
  fill: 'scale=512:512:flags=lanczos',
};
export async function videoToSticker(buffer, ext = 'mp4', { pack, author, fit = 'contain' } = {}) {
  // qualidade alta primeiro; so abaixa se passar do limite de figurinha animada do WhatsApp (500 KB)
  let webp;
  for (const [q, fps] of [[80, 15], [65, 15], [50, 12], [35, 10]]) {
    webp = await ffmpeg(buffer, ext, ['-t', '8', '-vf',
      `fps=${fps},${VF[fit] || VF.contain},format=rgba`,
      '-loop', '0', '-an', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '6', '-preset', 'picture'], 'webp');
    if (webp.length <= 490_000) break;
  }
  return addExif(webp, pack, author);
}
// Audio de um video/audio -> ogg/opus mono (formato da figurinha com som). null se nao tiver audio.
export async function toOggOpus(buffer, ext, maxSec = 30) {
  try {
    const out = await ffmpeg(buffer, ext, ['-vn', '-t', String(maxSec), '-ac', '1', '-c:a', 'libopus', '-b:a', '64k'], 'ogg');
    return out.length > 800 ? out : null;
  } catch { return null; }
}
// Junta um mp4 (sem som) com um audio; o video dura o maior dos dois (ultimo quadro congela)
export async function muxAudio(mp4, audio) {
  const dir = await tmpdir();
  try {
    const v = path.join(dir, 'v.mp4'), a = path.join(dir, 'a.ogg'), out = path.join(dir, 'o.mp4');
    await writeFile(v, mp4); await writeFile(a, audio);
    await run(config.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', v, '-i', a, '-filter_complex', '[0:v]tpad=stop_mode=clone:stop_duration=30[v]', '-map', '[v]', '-map', '1:a', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', 'faststart', out], { timeout: 120000 });
    return await readFile(out);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export const isAnimatedWebp = webp => webp.subarray(0, 64).includes('VP8X') && (webp.indexOf('ANIM') > 0 && webp.indexOf('ANIM') < 200);
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

// Largura e altura de uma foto ou video (ja girados como aparecem na tela)
export async function mediaDims(buffer, kind) {
  if (kind === 'image') {
    const m = await sharp(buffer).metadata().catch(() => ({}));
    return (m.orientation || 1) >= 5 ? { w: m.height, h: m.width } : { w: m.width, h: m.height };
  }
  const dir = await tmpdir();
  try {
    const f = path.join(dir, 'v.mp4'); await writeFile(f, buffer);
    const { stderr } = await run(config.ffmpeg, ['-hide_banner', '-i', f], { timeout: 30000 }).catch(e => e);
    const m = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr || ''); if (!m) return {};
    const rot = /rotat(?:e|ion of)\s*:?\s*(-?\d+)/i.exec(stderr || '');
    const virado = rot && Math.abs(parseInt(rot[1])) % 180 === 90;
    return virado ? { w: +m[2], h: +m[1] } : { w: +m[1], h: +m[2] };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
export const quadrado = d => !d?.w || !d?.h || Math.abs(d.w / d.h - 1) <= 0.05;
