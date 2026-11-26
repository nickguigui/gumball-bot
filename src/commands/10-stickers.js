// Figurinhas e edicao de fotos (sharp + ffmpeg, tudo local).
import sharp from 'sharp';
import { imageToSticker, videoToSticker, addExif, readExif, stickerToImage, stickerToMp4, textSvg, svgToWebp, svgToPng, framesToAnimatedWebp, esc, wrap } from '../lib/media.js';
import { getBuffer, getJson, http, UserError } from '../lib/http.js';
import { db } from '../db.js';
import { config } from '../config.js';
import { pick } from '../lib/text.js';

const ST = '🎨 FIGURINHAS & STICKERS', PH = '🖼️ EDIÇÃO DE FOTOS', EXT = '🎨 MAIS FIGURINHAS';
const IMG = ['imageMessage', 'stickerMessage'];
async function needImage(ctx, kinds = IMG) {
  const m = await ctx.media(kinds);
  if (!m) throw new UserError(`Envie uma imagem com */${ctx.cmd}* na legenda ou responda uma imagem com o comando.`);
  return m.type === 'stickerMessage' ? sharp(m.buffer, { animated: false }).png().toBuffer() : m.buffer;
}
const packOf = ctx => { const g = ctx.group?.settings; return { pack: g?.stickerPack || config.botName, author: g?.stickerAuthor || ctx.pushName || config.ownerName }; };

// Filtros de foto -> figurinha (estilo ZueiraBot) ou imagem
const FILTERS = {
  desfoque: img => img.blur(12), pixel: async (img, buf) => { const m = await sharp(buf).metadata(); return sharp(await sharp(buf).resize(Math.max(8, Math.round(m.width / 24)), null, { kernel: 'nearest' }).toBuffer()).resize(m.width, m.height, { kernel: 'nearest' }); },
  inverter: img => img.negate({ alpha: false }), cinza: img => img.grayscale(), sepia: img => img.recomb([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]),
  espelho: img => img.flop(), triste: img => img.modulate({ saturation: 0.4, brightness: 0.85 }).tint('#4a6fa5'), brilho: img => img.modulate({ brightness: 1.35 }), contraste: img => img.linear(1.5, -40),
};
async function overlay(buf, svgFn, gray = false) {
  let img = sharp(buf).resize(512, 512, { fit: 'cover' }); if (gray) img = img.grayscale();
  return sharp(await img.png().toBuffer()).composite([{ input: Buffer.from(svgFn()) }]).png().toBuffer();
}
const OVERLAYS = {
  wasted: buf => overlay(buf, () => `<svg width="512" height="512"><rect y="206" width="512" height="100" fill="rgba(0,0,0,.55)"/><text x="256" y="282" font-family="Pricedown, Impact, Arial Black" font-size="92" fill="#c8102e" stroke="#000" stroke-width="4" text-anchor="middle">WASTED</text></svg>`, true),
  procurado: buf => overlay(buf, () => `<svg width="512" height="512"><rect width="512" height="512" fill="none" stroke="#5b3a1a" stroke-width="40"/><rect y="0" width="512" height="96" fill="#e8d3a2"/><text x="256" y="76" font-family="Georgia, serif" font-weight="900" font-size="70" fill="#3b2410" text-anchor="middle">PROCURADO</text><rect y="430" width="512" height="82" fill="#e8d3a2"/><text x="256" y="487" font-family="Georgia, serif" font-weight="900" font-size="44" fill="#3b2410" text-anchor="middle">$ 1.000.000</text></svg>`),
  preso: buf => overlay(buf, () => `<svg width="512" height="512">${Array.from({ length: 8 }, (_, i) => `<rect x="${i * 66 + 18}" y="0" width="18" height="512" fill="#2b2b2b" stroke="#777" stroke-width="2"/>`).join('')}<rect y="0" width="512" height="22" fill="#2b2b2b"/><rect y="490" width="512" height="22" fill="#2b2b2b"/></svg>`, true),
  rip: buf => overlay(buf, () => `<svg width="512" height="512"><path d="M56 512 V190 Q56 40 256 40 Q456 40 456 190 V512 Z" fill="none" stroke="#6d6d6d" stroke-width="44"/><text x="256" y="150" font-family="Georgia, serif" font-weight="900" font-size="90" fill="#fff" stroke="#333" stroke-width="5" text-anchor="middle">R.I.P</text></svg>`, true),
};

async function textSticker(ctx, opts, usage) {
  const text = ctx.q || ctx.quoted?.text;
  if (!text) throw new UserError(usage);
  return ctx.sticker(await addExif(await svgToWebp(textSvg(text.slice(0, 200), opts)), ...Object.values(packOf(ctx))));
}
const BRAT = { brat: ['#8ACE00', '#000'], brat2: ['#ffffff', '#000'], bratbranco: ['#ffffff', '#000'], bratrosa: ['#ff9ecf', '#000'], bratpreto: ['#000000', '#fff'], bratvinho: ['#6b1028', '#fff'], bratazul: ['#3b82f6', '#000'] };

export const commands = [
  {
    name: 'fig', aliases: ['s', 'sticker', 'f'], category: ST, react: '🖼️', done: '✨', run: async ctx => {
      const m = await ctx.media(['imageMessage', 'videoMessage', 'stickerMessage']);
      if (!m) return ctx.reply('🖼️ *Como usar:* envie uma foto/vídeo/GIF com */fig* na legenda, ou responda a mídia com */fig*.');
      const { pack, author } = packOf(ctx);
      if (m.type === 'videoMessage' || m.mimetype.includes('gif')) {
        if ((m.seconds || 0) > 10) return ctx.reply('⏱️ O vídeo precisa ter até *10 segundos*.');
        return ctx.sticker(await videoToSticker(m.buffer, 'mp4', { pack, author }));
      }
      return ctx.sticker(await imageToSticker(m.buffer, { pack, author }));
    },
  },
  { name: 'redonda', category: EXT, react: '⭕', done: '✨', run: async ctx => ctx.sticker(await imageToSticker(await needImage(ctx), { ...packOf(ctx), fit: 'cover', round: true })) },
  {
    name: 'toimg', category: ST, react: '🔄', done: '✅', run: async ctx => {
      const m = await ctx.media(['stickerMessage']); if (!m) return ctx.reply('🔄 Responda uma *figurinha* com /toimg');
      return ctx.image(await stickerToImage(m.buffer), '🖼️ *Figurinha convertida em imagem!*');
    },
  },
  {
    name: 'togif', category: EXT, react: '🎞️', done: '✅', run: async ctx => {
      const m = await ctx.media(['stickerMessage']); if (!m) return ctx.reply('🎞️ Responda uma *figurinha animada* com /togif');
      return ctx.send({ video: await stickerToMp4(m.buffer), gifPlayback: true }, { quoted: ctx.m });
    },
  },
  ...['take', 'rename'].map(name => ({
    name, category: ST, react: '✏️', done: '✅', run: async ctx => {
      const m = await ctx.media(['stickerMessage']); if (!m) return ctx.reply(`✏️ Responda uma figurinha com */${name} pacote | autor*`);
      const [pack, author] = (ctx.q || config.botName).split('|').map(s => s.trim());
      return ctx.sticker(await addExif(m.buffer, pack || config.botName, author || ctx.pushName || config.ownerName));
    },
  })),
  { name: 'ttp', category: ST, react: '🎨', run: ctx => textSticker(ctx, { fill: '#fff', stroke: '#000', strokeW: 10 }, '🎨 *Uso:* /ttp seu texto') },
  { name: 'textofig', category: ST, react: '🎨', run: ctx => textSticker(ctx, { fill: '#111', stroke: '#fff', strokeW: 6, bg: '#fff', font: 'Arial, sans-serif', weight: 700 }, '🎨 *Uso:* /textofig seu texto') },
  {
    name: 'attp', category: ST, react: '🎨', done: '✨', run: async ctx => {
      const text = ctx.q || ctx.quoted?.text; if (!text) return ctx.reply('🎨 *Uso:* /attp seu texto');
      const colors = ['#ff0000', '#ff8800', '#ffee00', '#00dd00', '#00ccff', '#3355ff', '#aa00ff', '#ff00aa'];
      const frames = colors.map(c => textSvg(text.slice(0, 80), { fill: c, stroke: '#000', strokeW: 8 }));
      return ctx.sticker(await addExif(await framesToAnimatedWebp(frames, 110), ...Object.values(packOf(ctx))));
    },
  },
  ...Object.entries(BRAT).map(([name, [bg, fg]]) => ({
    name, category: ['brat', 'brat2'].includes(name) ? ST : EXT, react: '⏳', done: '✅', run: ctx => textSticker(ctx, { bg, fill: fg, stroke: 'none', strokeW: 0, font: 'Arial Narrow, Arial, sans-serif', weight: 500, blur: 1.6, align: 'middle' }, `💚 *Uso:* /${name} seu texto`),
  })),
  {
    name: 'bratanimado', category: EXT, react: '⏳', done: '✅', run: async ctx => {
      const words = (ctx.q || '').split(/\s+/).filter(Boolean).slice(0, 12); if (!words.length) return ctx.reply('💚 *Uso:* /bratanimado seu texto');
      const frames = words.map((_, i) => textSvg(words.slice(0, i + 1).join(' '), { bg: '#8ACE00', fill: '#000', stroke: 'none', strokeW: 0, font: 'Arial Narrow, Arial', weight: 500, blur: 1.6 }));
      frames.push(frames.at(-1), frames.at(-1));
      return ctx.sticker(await addExif(await framesToAnimatedWebp(frames, 450), ...Object.values(packOf(ctx))));
    },
  },
  {
    name: 'qc', category: ST, react: '💬', done: '✨', run: async ctx => {
      const text = ctx.quoted?.text || ctx.q; if (!text) return ctx.reply('💬 Responda uma mensagem com */qc* (ou /qc texto)');
      const who = ctx.quoted?.sender || ctx.sender; const name = ctx.quoted ? (db.user(who).name || 'Usuário') : (ctx.pushName || 'Usuário');
      let avatar = null; try { const u = await ctx.sock.profilePictureUrl(who, 'image'); avatar = await sharp(await getBuffer(u)).resize(80, 80).png().toBuffer(); } catch {}
      const lines = wrap(text.slice(0, 300), 26).slice(0, 9); const h = 70 + lines.length * 34;
      const color = pick(['#e542a3', '#1f7aec', '#00a884', '#ff8c00', '#9a48d0', '#d64545']);
      const bubble = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="100" y="${256 - h / 2}" width="400" height="${h}" rx="22" fill="#202c33"/>
<text x="120" y="${256 - h / 2 + 38}" font-family="Arial" font-weight="700" font-size="24" fill="${color}">${esc(name.slice(0, 22))}</text>
${lines.map((l, i) => `<text x="120" y="${256 - h / 2 + 74 + i * 34}" font-family="Arial" font-size="27" fill="#e9edef">${esc(l)}</text>`).join('')}
<circle cx="50" cy="${256 - h / 2 + 40}" r="40" fill="#6b7c85"/></svg>`);
      const comp = [{ input: bubble }];
      if (avatar) { const mask = Buffer.from('<svg width="80" height="80"><circle cx="40" cy="40" r="40"/></svg>'); comp.push({ input: await sharp(avatar).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer(), left: 10, top: Math.round(256 - h / 2) }); }
      const webp = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comp).webp().toBuffer();
      return ctx.sticker(await addExif(webp, ...Object.values(packOf(ctx))));
    },
  },
  {
    name: 'emojimix', category: ST, react: '🧪', done: '✨', run: async ctx => {
      const em = [...(ctx.q.match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) || [])];
      if (em.length < 2) return ctx.reply('🧪 *Uso:* /emojimix 😂+🔥');
      const cp = e => [...e].map(c => c.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').map(h => 'u' + h).join('-');
      if (!process.env.TENOR_API_KEY) throw new UserError('Emoji Kitchen não configurado (TENOR_API_KEY).');
      const r = await http(`https://tenor.googleapis.com/v2/featured?key=${process.env.TENOR_API_KEY}&contentfilter=high&media_filter=png_transparent&component=proactive&collection=emoji_kitchen_v5&q=${encodeURIComponent(em[0] + '_' + em[1])}`).catch(() => null);
      const url = r?.ok ? (await r.json()).results?.[0]?.url : null;
      if (!url) { ctx.react('❌'); return ctx.reply(`❌ *Erro no Lab:* Essa combinação (${cp(em[0])} + ${cp(em[1])}) não existe no Emoji Kitchen.`); }
      return ctx.sticker(await imageToSticker(await getBuffer(url), packOf(ctx)));
    },
  },
  ...Object.keys(OVERLAYS).map(name => ({
    name, category: ['wasted', 'procurado'].includes(name) ? ST : EXT, react: '🖼️', done: '✨',
    run: async ctx => ctx.sticker(await imageToSticker(await OVERLAYS[name](await needImage(ctx)), { ...packOf(ctx), fit: 'cover' })),
  })),
  {
    name: 'smeme', category: ST, react: '😂', done: '✨', run: async ctx => {
      const [top, bottom] = (ctx.q || '').split('|').map(s => s?.trim() || '');
      if (!top && !bottom) return ctx.reply('😂 *Uso:* envie/responda uma imagem com */smeme texto de cima | texto de baixo*');
      const buf = await overlay(await needImage(ctx), () => `<svg width="512" height="512" font-family="Impact, Arial Black" font-size="52" fill="#fff" stroke="#000" stroke-width="5" paint-order="stroke" text-anchor="middle"><text x="256" y="66">${esc(top.toUpperCase())}</text><text x="256" y="486">${esc(bottom.toUpperCase())}</text></svg>`);
      return ctx.sticker(await imageToSticker(buf, packOf(ctx)));
    },
  },
  ...Object.keys(FILTERS).map(name => ({
    name, category: EXT, react: '🎛️', done: '✨', run: async ctx => {
      const buf = await needImage(ctx); const out = await FILTERS[name](sharp(buf), buf);
      return ctx.sticker(await imageToSticker(await out.png().toBuffer(), { ...packOf(ctx), fit: 'cover' }));
    },
  })),
  // Pacote pessoal
  { name: 'addpacote', category: EXT, react: '📦', run: async ctx => { const m = await ctx.media(['stickerMessage']); if (!m) return ctx.reply('📦 Responda uma figurinha com /addpacote'); const list = db.get('pack:' + ctx.sender, []); if (list.length >= 30) return ctx.reply('📦 Seu pacote está cheio (30).'); list.push(m.buffer.toString('base64')); db.set('pack:' + ctx.sender, list); return ctx.reply(`📦 Adicionada! Seu pacote tem *${list.length}* figurinhas. Envie com */pacote*.`); } },
  { name: 'pacote', category: EXT, react: '📦', run: async ctx => { const list = db.get('pack:' + ctx.sender, []); if (!list.length) return ctx.reply('📦 Seu pacote está vazio. Use /addpacote respondendo figurinhas.'); for (const b of list) await ctx.send({ sticker: Buffer.from(b, 'base64') }); } },
  { name: 'limparpacote', category: EXT, react: '🗑️', run: ctx => { db.set('pack:' + ctx.sender, []); return ctx.reply('🗑️ Pacote esvaziado.'); } },

  // ----- edicao de fotos -----
  {
    name: 'logo', category: PH, react: '⏳', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🎨 *Uso:* /logo seu texto');
      await ctx.reply('🚀 *Processando design!* Renderizando a imagem em alta qualidade... ⚡');
      const styles = {
        techstyle: `<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#00f0ff"/><stop offset="1" stop-color="#7a00ff"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="1024" height="512" fill="#05060f"/>${Array.from({ length: 24 }, (_, i) => `<line x1="${i * 45}" y1="0" x2="${i * 45 - 200}" y2="512" stroke="#0ff" stroke-opacity=".07"/>`).join('')}<text x="512" y="300" font-family="Arial Black" font-size="120" fill="url(#g)" text-anchor="middle" filter="url(#glow)">${esc(ctx.q.slice(0, 16))}</text>`,
        neon: `<defs><filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="1024" height="512" fill="#120018"/><text x="512" y="300" font-family="Arial Black" font-size="120" fill="none" stroke="#ff2bd6" stroke-width="5" text-anchor="middle" filter="url(#glow)">${esc(ctx.q.slice(0, 16))}</text>`,
        gold: `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#e2b13c"/><stop offset="1" stop-color="#8a5a00"/></linearGradient></defs><rect width="1024" height="512" fill="#111"/><text x="512" y="300" font-family="Georgia" font-weight="900" font-size="130" fill="url(#g)" stroke="#3d2a00" stroke-width="3" text-anchor="middle">${esc(ctx.q.slice(0, 14))}</text>`,
      };
      const style = pick(Object.keys(styles));
      const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512">${styles[style]}</svg>`)).jpeg({ quality: 90 }).toBuffer();
      return ctx.image(png, `✨ *LOGOTIPO GERADO*\n\n🎨 *Estilo:* ${style}\n📝 *Texto:* ${ctx.q}`);
    },
  },
  {
    name: 'grid', category: PH, react: '🔲', done: '✅', run: async ctx => {
      const buf = await needImage(ctx); const m = await sharp(buf).metadata(); const w = Math.floor(m.width / 3), h = Math.floor(m.height / 3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) await ctx.send({ image: await sharp(buf).extract({ left: c * w, top: r * h, width: w, height: h }).jpeg().toBuffer() });
    },
  },
  {
    name: 'placa', category: PH, react: '🪧', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🪧 *Uso:* /placa seu texto');
      const lines = wrap(ctx.q.slice(0, 90), 14).slice(0, 5);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#87ceeb"/><rect x="246" y="300" width="20" height="212" fill="#7a4a1f"/><rect x="56" y="70" width="400" height="250" rx="16" fill="#fff8e1" stroke="#5d4037" stroke-width="10"/>${lines.map((l, i) => `<text x="256" y="${195 - (lines.length - 1) * 21 + i * 44}" font-family="Comic Sans MS, Arial" font-weight="700" font-size="38" fill="#3e2723" text-anchor="middle">${esc(l)}</text>`).join('')}</svg>`;
      return ctx.image(await sharp(Buffer.from(svg)).jpeg().toBuffer(), '🪧 *Sua placa está pronta!*');
    },
  },
  {
    name: 'sfundo', category: PH, react: '✂️', done: '✨', run: async ctx => {
      const key = process.env.REMOVEBG_API_KEY; if (!key) throw new UserError('Remoção de fundo não configurada (REMOVEBG_API_KEY).');
      const buf = await needImage(ctx); const fd = new FormData(); fd.append('image_file', new Blob([buf]), 'img.png'); fd.append('size', 'auto');
      const r = await http('https://api.remove.bg/v1.0/removebg', { method: 'POST', headers: { 'X-Api-Key': key }, body: fd, timeout: 60000 });
      if (!r.ok) throw new UserError('O serviço de remoção de fundo falhou.');
      return ctx.sticker(await imageToSticker(Buffer.from(await r.arrayBuffer()), packOf(ctx)));
    },
  },
  {
    name: 'mudarfundo', category: PH, react: '🎨', done: '✨', run: async ctx => {
      const color = (ctx.args[0] || '#00b140'); const buf = await needImage(ctx); const m = await sharp(buf).metadata();
      const png = await sharp({ create: { width: m.width, height: m.height, channels: 4, background: color } }).composite([{ input: await sharp(buf).ensureAlpha().png().toBuffer() }]).jpeg().toBuffer();
      return ctx.image(png, `🎨 Fundo trocado para *${color}* _(funciona melhor em imagens com fundo transparente, ex.: depois do /sfundo)_`);
    },
  },
];
export { FILTERS };
