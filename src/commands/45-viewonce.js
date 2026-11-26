// Visualizacao unica COM consentimento: so revela midia de quem liberou com /permitirver.
// Quem nunca liberou fica protegido (o bot recusa e avisa como liberar).
import { db } from '../db.js';
import { numId } from '../lib/text.js';

const CAT = '🧰 UTILITÁRIOS';
function isViewOnce(raw) {
  if (!raw) return false;
  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
  return ['imageMessage', 'videoMessage', 'audioMessage'].some(k => raw[k]?.viewOnce);
}

export const commands = [
  {
    name: 'permitirver', category: CAT, react: '👁️', run: ctx => {
      db.updateUser(ctx.sender, u => { u.allowReveal = true; });
      return ctx.reply(`👁️ *Liberado!* ${ctx.tag(ctx.sender)}, suas fotos, vídeos e áudios de visualização única podem ser reenviados com */ver*.\n\n🔒 Para desfazer: */bloquearver*`);
    },
  },
  {
    name: 'bloquearver', category: CAT, react: '🔒', run: ctx => {
      db.updateUser(ctx.sender, u => { u.allowReveal = false; });
      return ctx.reply(`🔒 *Protegido!* ${ctx.tag(ctx.sender)}, ninguém consegue mais reenviar suas mídias de visualização única pelo bot.`);
    },
  },
  {
    name: 'ver', category: CAT, react: '👁️', done: '✅', run: async ctx => {
      if (!ctx.quoted) return ctx.reply('👁️ *Uso:* responda uma foto, vídeo ou áudio de visualização única com */ver*.');
      if (!isViewOnce(ctx.quoted.raw)) return ctx.reply('👁️ Essa mensagem não é de visualização única.');
      const author = ctx.quoted.sender;
      if (author && !db.user(author).allowReveal) {
        return ctx.reply(`🔒 ${ctx.tag(author)} não liberou o reenvio das visualizações únicas dele(a).\n\n💡 Se quiser liberar, ele(a) manda */permitirver*.`, { mentions: [author] });
      }
      const m = await ctx.media(['imageMessage', 'videoMessage', 'audioMessage']).catch(() => null);
      if (!m) return ctx.reply('❌ Não consegui baixar essa mídia (ela pode ter expirado no WhatsApp).');
      const cap = `👁️ *Visualização única* de @${numId(author)} _(liberada por ele(a))_`;
      if (m.type === 'imageMessage') return ctx.send({ image: m.buffer, caption: cap, mentions: [author] }, { quoted: ctx.m });
      if (m.type === 'videoMessage') return ctx.send({ video: m.buffer, caption: cap, mentions: [author] }, { quoted: ctx.m });
      await ctx.send({ audio: m.buffer, mimetype: m.mimetype || 'audio/ogg; codecs=opus', ptt: true }, { quoted: ctx.m });
      return ctx.reply(cap, { mentions: [author] });
    },
  },
];
