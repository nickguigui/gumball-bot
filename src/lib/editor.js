// Editor de figurinhas do site: cada /editarfig cria uma pasta temporaria com um token.
// O site sobe os arquivos (base, desenho, som) pelo servidor e pede para montar; aqui o bot
// junta tudo com sharp/ffmpeg e manda a figurinha (com ou sem som) no chat onde o comando foi usado.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { config } from '../config.js';
import { addExif } from './media.js';
import { attachSound } from './soundsticker.js';

const run = promisify(execFile);
export const EDITOR_DIR = process.env.EDITOR_DIR || path.join(os.tmpdir(), 'gumball-editor');
export const EDITOR_URL = process.env.EDITOR_URL || 'https://nickguigui.github.io/gumball-bot/editor.html';
export const TTL = 30 * 60_000;
const MAX_SEC = 8; // limite da animacao da figurinha
const ok = t => /^[A-Za-z0-9_-]{20,40}$/.test(t || '');
export const tokenDir = t => (ok(t) ? path.join(EDITOR_DIR, t) : null);

// Cria o link. base = { buffer, ext, kind: 'image'|'video' } (midia que a pessoa respondeu), opcional
export function createToken({ jid, chatName, base, pack, author, files, figurinha, modo, mudo }) {
  const t = crypto.randomBytes(18).toString('base64url');
  const d = tokenDir(t); fs.mkdirSync(d, { recursive: true });
  if (base) fs.writeFileSync(path.join(d, `base.${base.ext}`), base.buffer);
  // pecas de uma figurinha pronta (original.webp, som.ogg, som.mp3) para baixar no site
  for (const [name, buf] of Object.entries(files || {})) if (buf && /^[a-z]+\.[a-z0-9]+$/.test(name)) fs.writeFileSync(path.join(d, name), buf);
  const meta = { phone: config.owners[0] || '', jid, chatName: chatName || '', exp: Date.now() + TTL, base: base ? { file: `base.${base.ext}`, kind: base.kind } : null, pack: pack || '', author: author || '', made: 0, modo: modo || null, mudo: !!mudo, figurinha: figurinha || null, files: Object.keys(files || {}).filter(k => files[k]) };
  fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta));
  return t;
}
export function readMeta(t) {
  const d = tokenDir(t); if (!d) return null;
  try { const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); return m.exp > Date.now() ? m : null; } catch { return null; }
}
// Limpa links vencidos (roda de tempos em tempos)
export function sweep() {
  try { for (const t of fs.readdirSync(EDITOR_DIR)) { const m = (() => { try { return JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, t, 'meta.json'), 'utf8')); } catch { return null; } })(); if (!m || m.exp < Date.now() - 60_000) fs.rmSync(path.join(EDITOR_DIR, t), { recursive: true, force: true }); } } catch {}
}

const ff = (args, timeout = 180000) => run(config.ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 64 << 20, timeout });
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
function upload(d, name) { const f = fs.readdirSync(d).find(x => x.startsWith(name + '.')); return f ? path.join(d, f) : null; }

// Som -> ogg/opus mono, a partir de `inicio` segundos, com no maximo `dur` segundos
async function sound(file, inicio, dur, dir) {
  const out = path.join(dir, `som-${Date.now()}.ogg`);
  await ff(['-ss', String(inicio), '-t', String(dur), '-i', file, '-vn', '-ac', '1', '-c:a', 'libopus', '-b:a', '64k', out]).catch(() => null);
  if (!fs.existsSync(out) || fs.statSync(out).size < 800) throw new Error('Não achei som nesse arquivo (ou o trecho escolhido está mudo).');
  return fs.readFileSync(out);
}

// Monta e envia. o = opcoes vindas do site
export async function makeSticker(sock, t, o = {}) {
  const meta = readMeta(t); if (!meta) throw new Error('Esse link expirou. Mande /editarfig de novo.');
  if (meta.made >= 20) throw new Error('Esse link já fez 20 figurinhas. Mande /editarfig de novo.');
  const d = tokenDir(t); const work = fs.mkdtempSync(path.join(d, 'w-'));
  try {
    const pack = String(o.pacote || meta.pack || config.botName).slice(0, 60), author = String(o.autor || meta.author || config.ownerName).slice(0, 60);
    const overlay = upload(d, 'overlay');
    let webp, secs = 0, kind = o.tipo === 'video' ? 'video' : 'image';
    if (kind === 'image') {
      // o site ja manda a imagem pronta (foto + desenho, 512x512, com zoom/filtros aplicados)
      const img = upload(d, 'final'); if (!img) throw new Error('A imagem não chegou. Tente de novo.');
      webp = await sharp(img).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 92, effort: 5 }).toBuffer();
      if (webp.length > 95_000) webp = await sharp(webp).webp({ quality: 78, effort: 6 }).toBuffer();
    } else {
      const src = upload(d, 'video') || (meta.base?.kind === 'video' ? path.join(d, meta.base.file) : null);
      if (!src) throw new Error('O vídeo não chegou. Tente de novo.');
      const inicio = num(o.inicio, 0, 36000, 0); const dur = num(o.duracao, 0.5, MAX_SEC, MAX_SEC); secs = dur;
      // posicao/zoom escolhidos no site: o video (escalado) e colado num quadro 512x512 transparente
      const s = num(o.escala, 0.01, 50, 0), ox = Math.round(num(o.x, -20000, 20000, 0)), oy = Math.round(num(o.y, -20000, 20000, 0));
      // "esticar": escala diferente na largura e na altura (escalaX / escalaY)
      const sx = num(o.escalaX, 0.01, 50, 0) || s, sy = num(o.escalaY, 0.01, 50, 0) || s;
      const vw = Math.round(num(o.largura, 1, 8000, 512) * sx) || 0, vh = Math.round(num(o.altura, 1, 8000, 512) * sy) || 0;
      const place = (s || sx) && vw && vh ? `scale=${vw + (vw % 2)}:${vh + (vh % 2)}:flags=lanczos` : 'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos';
      const pos = (s || sx) && vw && vh ? `x=${ox}:y=${oy}` : 'x=(W-w)/2:y=(H-h)/2';
      const bg = /^#[0-9a-f]{6}$/i.test(o.fundo || '') ? '0x' + o.fundo.slice(1) : 'black@0.0'; // fundo escolhido no site
      for (const [q, fps] of [[80, 15], [65, 15], [50, 12], [35, 10]]) {
        const out = path.join(work, `f${q}.webp`);
        const inputs = ['-ss', String(inicio), '-t', String(dur), '-i', src];
        let fc = `color=c=${bg}:s=512x512:r=${fps}:d=${dur},format=rgba[bg];[0:v]fps=${fps},${place},format=rgba[v];[bg][v]overlay=${pos}:shortest=1:format=auto[b]`;
        if (overlay) { inputs.push('-i', overlay); fc += ';[1:v]format=rgba,scale=512:512[o];[b][o]overlay=0:0:format=auto[out]'; } else fc += ';[b]null[out]';
        await ff([...inputs, '-filter_complex', fc, '-map', '[out]', '-an', '-loop', '0', '-vcodec', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '6', '-preset', 'picture', '-t', String(dur), out]);
        webp = fs.readFileSync(out);
        if (webp.length <= 490_000) break;
      }
    }
    webp = await addExif(webp, pack, author);

    // Som: nenhum | video (do proprio video) | arquivo (mp3, outro video, gravacao)
    let ogg = null;
    if (o.som === 'video' && kind === 'video') {
      const src = upload(d, 'video') || path.join(d, meta.base.file);
      ogg = await sound(src, num(o.inicio, 0, 36000, 0), secs, work);
    } else if (o.som === 'original') {
      const a = path.join(d, 'som.ogg'); if (!fs.existsSync(a)) throw new Error('Essa figurinha não tinha som.');
      const dur = kind === 'video' ? secs : num(o.somDuracao, 1, 30, meta.figurinha?.somSeg || 10);
      ogg = await sound(a, num(o.somInicio, 0, 36000, 0), dur, work); secs = dur;
    } else if (o.som === 'arquivo') {
      const a = upload(d, 'audio'); if (!a) throw new Error('O áudio não chegou. Tente de novo.');
      const dur = kind === 'video' ? secs : num(o.somDuracao, 1, 30, 10);
      ogg = await sound(a, num(o.somInicio, 0, 36000, 0), dur, work); secs = dur;
    }
    if (ogg) await attachSound(sock, webp, ogg, secs);
    if (o.noPacote) { // tambem vai para o pacote aberto da galeria (/novopacote)
      const { bufferToDraft } = await import('../commands/16-galeria.js');
      var pacote = await bufferToDraft(webp, ogg, secs || 5).catch(e => ({ erro: e.message }));
    }
    await sock.sendMessage(meta.jid, { sticker: webp });
    meta.made++; fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify(meta));
    return { ok: true, comSom: !!ogg, tamanho: webp.length, chat: meta.chatName, pacote: typeof pacote === 'undefined' ? null : pacote };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}
