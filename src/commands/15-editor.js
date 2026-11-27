// /editarfig: manda um link unico (30 min) para o editor de figurinhas do site.
// Se for usado respondendo uma foto/video/figurinha, ela ja abre no editor.
import { createToken, EDITOR_URL, sweep } from '../lib/editor.js';
import { isAnimatedWebp, stickerToImage, stickerToMp4 } from '../lib/media.js';

setInterval(sweep, 10 * 60_000).unref();

export const commands = [
  {
    name: 'editarfig', aliases: ['editor', 'editorfig', 'criarfig', 'editar'], category: '🎨 FIGURINHAS & STICKERS', react: '🎨', run: async ctx => {
      if (!process.env.MANAGED) return ctx.reply('🎨 O editor de figurinhas funciona com o bot conectado pelo site (nickguigui.github.io/gumball-bot).');
      let base = null;
      const m = await ctx.media(['imageMessage', 'videoMessage', 'stickerMessage']).catch(() => null);
      if (m) {
        if (m.type === 'videoMessage' || m.mimetype?.includes('gif')) base = { buffer: m.buffer, ext: 'mp4', kind: 'video' };
        else if (m.type === 'stickerMessage') base = isAnimatedWebp(m.buffer) ? { buffer: await stickerToMp4(m.buffer), ext: 'mp4', kind: 'video' } : { buffer: await stickerToImage(m.buffer), ext: 'png', kind: 'image' };
        else base = { buffer: m.buffer, ext: 'jpg', kind: 'image' };
      }
      const g = ctx.group?.settings;
      const chatName = ctx.isGroup ? (await ctx.meta().catch(() => null))?.subject : 'conversa privada';
      const t = createToken({ jid: ctx.jid, chatName, base, pack: g?.stickerPack, author: g?.stickerAuthor || ctx.pushName });
      return ctx.reply(`🎨 *EDITOR DE FIGURINHAS*\n\n${base ? `Sua ${base.kind === 'video' ? 'mídia animada' : 'imagem'} já está lá esperando. ` : ''}Abra o link, desenhe, escreva, escolha o som e toque em *Mandar no WhatsApp*: a figurinha chega aqui.\n\n👉 ${EDITOR_URL}#${t}\n\n⏳ _O link é só seu e vale por 30 minutos._\n💡 _Responda uma foto, vídeo ou figurinha com /editarfig para editar ela._`);
    },
  },
];
