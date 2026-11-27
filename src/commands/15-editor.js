// /editarfig e /abrirfig: link unico (30 min) para o editor de figurinhas do site.
// Respondendo uma figurinha pronta, o bot "desmonta" ela: original, imagem/animacao, som (OGG e MP3)
// e dados (pacote, autor, emojis, quadros, duracao), para baixar ou trocar no site.
import sharp from 'sharp';
import { createToken, EDITOR_URL, sweep } from '../lib/editor.js';
import { isAnimatedWebp, stickerToImage, stickerToMp4, readExif, ffmpeg } from '../lib/media.js';
import { stickerSound } from '../lib/soundsticker.js';

setInterval(sweep, 10 * 60_000).unref();

export async function desmontar(m) {
  const animada = isAnimatedWebp(m.buffer);
  const info = await sharp(m.buffer, { animated: true }).metadata().catch(() => ({}));
  const exif = readExif(m.buffer) || {};
  const som = await stickerSound(m.raw).catch(() => null);
  const mp3 = som ? await ffmpeg(som.buffer, 'ogg', ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k'], 'mp3').catch(() => null) : null;
  const quadros = info.pages || 1;
  const duracao = animada && Array.isArray(info.delay) ? info.delay.reduce((a, b) => a + (b || 0), 0) / 1000 : 0;
  return {
    base: animada ? { buffer: await stickerToMp4(m.buffer), ext: 'mp4', kind: 'video' } : { buffer: await stickerToImage(m.buffer), ext: 'png', kind: 'image' },
    files: { 'original.webp': m.buffer, 'som.ogg': som?.buffer || null, 'som.mp3': mp3 },
    figurinha: {
      animada, comSom: !!som, somSeg: som?.seconds || 0, kb: Math.round(m.buffer.length / 1024), largura: info.width || 512, altura: info.pageHeight || info.height || 512, quadros, duracao: Math.round(duracao * 10) / 10,
      pacote: exif['sticker-pack-name'] || '', autor: exif['sticker-pack-publisher'] || '', emojis: Array.isArray(exif.emojis) ? exif.emojis.join(' ') : '',
      avatar: !!m.raw?.isAvatar, ia: !!m.raw?.isAiSticker,
    },
  };
}

export const commands = [
  {
    name: 'editarfig', aliases: ['editor', 'editorfig', 'criarfig', 'editar', 'abrirfig', 'extrair', 'desmontar'], category: '🎨 FIGURINHAS & STICKERS', react: '🎨', run: async ctx => {
      if (!process.env.MANAGED) return ctx.reply('🎨 O editor de figurinhas funciona com o bot conectado pelo site (nickguigui.github.io/gumball-bot).');
      let base = null, files = null, figurinha = null;
      const m = await ctx.media(['imageMessage', 'videoMessage', 'stickerMessage']).catch(() => null);
      if (m?.type === 'stickerMessage') ({ base, files, figurinha } = await desmontar(m));
      else if (m) base = m.type === 'videoMessage' || m.mimetype?.includes('gif') ? { buffer: m.buffer, ext: 'mp4', kind: 'video' } : { buffer: m.buffer, ext: 'jpg', kind: 'image' };
      const g = ctx.group?.settings;
      const chatName = ctx.isGroup ? (await ctx.meta().catch(() => null))?.subject : 'conversa privada';
      const t = createToken({ jid: ctx.jid, chatName, base, files, figurinha, pack: figurinha?.pacote || g?.stickerPack, author: figurinha?.autor || g?.stickerAuthor || ctx.pushName });
      const pecas = figurinha ? `🧩 Separei as peças da figurinha: ${figurinha.animada ? 'animação' : 'imagem'}${figurinha.comSom ? ', *som*' : ''} e dados do pacote. Dá pra baixar cada uma, trocar o som, tirar o som ou editar.\n\n` : base ? `Sua ${base.kind === 'video' ? 'mídia animada' : 'imagem'} já está lá esperando. ` : '';
      return ctx.reply(`🎨 *EDITOR DE FIGURINHAS*\n\n${pecas}Abra o link, desenhe, escreva, escolha o som e toque em *Mandar no WhatsApp*: a figurinha chega aqui.\n\n👉 ${EDITOR_URL}#${t}\n\n⏳ _O link é só seu e vale por 30 minutos._\n💡 _Responda uma figurinha com /abrirfig para desmontar ela._`);
    },
  },
];
