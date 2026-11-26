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

export const VO_MODES = { restrito: 'off', liberar: 'optin', todos: 'optout' };
export const VO_AVISO = '👁️ *Aviso do grupo:* agora fotos, vídeos e áudios de *visualização única* podem ser reenviados com */ver*.\n\n🔒 Quem *não* quiser manda */bloquearver* (vale para todos os grupos).';
export const commands = [
  {
    name: 'vermodo', category: null, react: '👁️', admin: true, run: async ctx => {
      const m = VO_MODES[(ctx.args[0] || '').toLowerCase()];
      const now = ctx.group.settings.viewOnceMode || 'optin';
      const nome = { off: 'Restrito (ninguém)', optin: 'Só quem liberar com /permitirver', optout: 'Todos, menos quem bloquear com /bloquearver' };
      if (!m) return ctx.reply(`👁️ *VISUALIZAÇÃO ÚNICA NESTE GRUPO*\n\nAgora: *${nome[now]}*\n\n• */vermodo restrito*: ninguém usa o /ver\n• */vermodo liberar*: só quem mandar /permitirver\n• */vermodo todos*: todo mundo, menos quem mandar /bloquearver`);
      db.updateGroup(ctx.jid, g => { g.settings.viewOnceMode = m; });
      if (m === 'optout' && now !== 'optout') await ctx.send({ text: VO_AVISO });
      return ctx.reply(`✅ Visualização única: *${nome[m]}*.`);
    },
  },
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
      // modo do grupo (os admins escolhem): off = ninguem | optin = so quem liberar | optout = todos, menos quem bloquear
      const mode = ctx.isGroup ? (ctx.group.settings.viewOnceMode || 'optin') : 'optin';
      if (mode === 'off') return ctx.reply('🔒 O */ver* está *desligado* neste grupo. Admins podem mudar com */vermodo* ou no painel do site.');
      const pref = author ? db.user(author).allowReveal : true;
      if (author && (mode === 'optin' ? pref !== true : pref === false)) {
        return ctx.reply(mode === 'optin'
          ? `🔒 ${ctx.tag(author)} não liberou o reenvio das visualizações únicas dele(a).\n\n💡 Se quiser liberar, ele(a) manda */permitirver*.`
          : `🔒 ${ctx.tag(author)} bloqueou o reenvio das visualizações únicas dele(a).`, { mentions: [author] });
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
