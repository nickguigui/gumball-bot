// Visualizacao unica com consentimento, por grupo (os admins escolhem o modo):
//   off    = restrito, ninguem usa o /ver
//   optin  = so quem mandar /permitirver (padrao)
//   optout = todos, menos quem mandar /bloquearver (o bot avisa o grupo quando liga)
// A escolha de cada pessoa vale em todos os grupos e e guardada pelo numero E pelo LID
// (o WhatsApp identifica a mesma pessoa dos dois jeitos).
import { db } from '../db.js';
import { numId } from '../lib/text.js';

const CAT = '🧰 UTILITÁRIOS';
const ids = (...jids) => [...new Set(jids.filter(Boolean).map(numId))];
function getPref(...jids) { const m = db.get('reveal', {}); for (const id of ids(...jids)) if (id in m) return m[id]; return undefined; }
function setPref(v, ...jids) { const m = db.get('reveal', {}); for (const id of ids(...jids)) m[id] = v; db.set('reveal', m); }
function viewOnceInner(raw) {
  if (!raw) return null;
  const inner = raw.viewOnceMessage?.message || raw.viewOnceMessageV2?.message || raw.viewOnceMessageV2Extension?.message || raw;
  for (const k of ['imageMessage', 'videoMessage', 'audioMessage']) if (inner[k] && (inner !== raw || inner[k].viewOnce)) return { type: k, msg: inner[k] };
  return null;
}

export const VO_MODES = { restrito: 'off', liberar: 'optin', todos: 'optout' };
export const VO_AVISO = '👁️ *Aviso do grupo:* agora fotos, vídeos e áudios de *visualização única* podem ser reenviados com */ver*.\n\n🔒 Quem *não* quiser manda */bloquearver* (vale para todos os grupos).';
const NOME = { off: 'Restrito (ninguém)', optin: 'Só quem liberar com /permitirver', optout: 'Todos, menos quem bloquear com /bloquearver' };

export const commands = [
  {
    name: 'vermodo', category: null, react: '👁️', admin: true, run: async ctx => {
      const m = VO_MODES[(ctx.args[0] || '').toLowerCase()];
      const now = ctx.group.settings.viewOnceMode || 'optin';
      if (!m) return ctx.reply(`👁️ *VISUALIZAÇÃO ÚNICA NESTE GRUPO*\n\nAgora: *${NOME[now]}*\n\n• */vermodo restrito*: ninguém usa o /ver\n• */vermodo liberar*: só quem mandar /permitirver\n• */vermodo todos*: todo mundo, menos quem mandar /bloquearver`);
      db.updateGroup(ctx.jid, g => { g.settings.viewOnceMode = m; });
      if (m === 'optout' && now !== 'optout') await ctx.send({ text: VO_AVISO });
      return ctx.reply(`✅ Visualização única: *${NOME[m]}*.`);
    },
  },
  {
    name: 'permitirver', category: CAT, react: '👁️', run: ctx => {
      setPref(true, ctx.sender, ctx.senderAlt);
      const mode = ctx.isGroup ? ctx.group.settings.viewOnceMode || 'optin' : 'optin';
      return ctx.reply(`👁️ *Liberado!* ${ctx.tag(ctx.sender)}, suas fotos, vídeos e áudios de visualização única podem ser reenviados com */ver*.${mode === 'off' ? '\n\n⚠️ _Neste grupo o /ver está desligado pelos admins._' : ''}\n\n🔒 Para desfazer: */bloquearver*`);
    },
  },
  {
    name: 'bloquearver', category: CAT, react: '🔒', run: ctx => {
      setPref(false, ctx.sender, ctx.senderAlt);
      return ctx.reply(`🔒 *Protegido!* ${ctx.tag(ctx.sender)}, ninguém consegue reenviar suas mídias de visualização única pelo bot, em nenhum grupo.`);
    },
  },
  {
    name: 'ver', category: CAT, react: '👁️', done: '✅', run: async ctx => {
      if (!ctx.quoted) return ctx.reply('👁️ *Uso:* responda uma foto, vídeo ou áudio de visualização única com */ver*.');
      const vo = viewOnceInner(ctx.quoted.raw);
      if (!vo) return ctx.reply('👁️ Essa mensagem não é de visualização única.');
      const mode = ctx.isGroup ? (ctx.group.settings.viewOnceMode || 'optin') : 'optin';
      if (mode === 'off') return ctx.reply('🔒 O */ver* está *desligado* neste grupo. Admins mudam com */vermodo* ou no painel do site.');
      const author = ctx.quoted.sender || ctx.sender;
      const pref = author === ctx.sender ? true : getPref(author);
      if (mode === 'optin' ? pref !== true : pref === false) {
        return ctx.reply(mode === 'optin'
          ? `🔒 ${ctx.tag(author)} não liberou o reenvio das visualizações únicas dele(a).\n\n💡 Se quiser liberar, ele(a) manda */permitirver*.`
          : `🔒 ${ctx.tag(author)} bloqueou o reenvio das visualizações únicas dele(a).`, { mentions: [author] });
      }
      // O WhatsApp muitas vezes NAO entrega a chave da midia de visualizacao unica para aparelhos conectados (o bot e um)
      if (!vo.msg.mediaKey || !(vo.msg.directPath || vo.msg.url)) {
        return ctx.reply('😕 *Não deu para abrir.* O WhatsApp não mandou a mídia junto: ele protege a visualização única e às vezes só entrega no celular de quem recebeu, não em aparelhos conectados como o bot.');
      }
      const m = await ctx.media(['imageMessage', 'videoMessage', 'audioMessage']).catch(() => null);
      if (!m) return ctx.reply('❌ Não consegui baixar essa mídia (ela pode ter expirado no WhatsApp).');
      const cap = `👁️ *Visualização única* de @${numId(author)}`;
      if (m.type === 'imageMessage') return ctx.send({ image: m.buffer, caption: cap, mentions: [author] }, { quoted: ctx.m });
      if (m.type === 'videoMessage') return ctx.send({ video: m.buffer, caption: cap, mentions: [author] }, { quoted: ctx.m });
      await ctx.send({ audio: m.buffer, mimetype: m.mimetype || 'audio/ogg; codecs=opus', ptt: true }, { quoted: ctx.m });
      return ctx.reply(cap, { mentions: [author] });
    },
  },
];
