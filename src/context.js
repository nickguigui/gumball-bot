// Contexto entregue a cada comando: dados da mensagem + atalhos de resposta.
import { downloadMediaMessage, getContentType, jidNormalizedUser, generateMessageIDV2 } from 'baileys';
import { queue, reactNow } from './queue.js';
import { db } from './db.js';
import { config } from './config.js';
import { numId } from './lib/text.js';

export const sentIds = new Set(); // ids enviados pelo bot (evita loop quando roda no proprio numero)
const rememberSent = r => { if (r?.key?.id) { sentIds.add(r.key.id); if (sentIds.size > 2000) sentIds.delete(sentIds.values().next().value); } return r; };

const metaCache = new Map(); // jid -> {at, meta}
export async function groupMeta(sock, jid, fresh = false) {
  const c = metaCache.get(jid);
  if (!fresh && c && Date.now() - c.at < 5 * 60_000) return c.meta;
  const meta = await sock.groupMetadata(jid);
  metaCache.set(jid, { at: Date.now(), meta });
  return meta;
}
export const invalidateMeta = jid => metaCache.delete(jid);

export function unwrap(message) {
  let msg = message || {};
  for (let i = 0; i < 5; i++) {
    const inner = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message
      || msg.viewOnceMessageV2Extension?.message || msg.documentWithCaptionMessage?.message || msg.editedMessage?.message;
    if (!inner) break;
    msg = inner;
  }
  return msg;
}
export function textOf(msg) {
  msg = unwrap(msg);
  return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption
    || msg.documentMessage?.caption || msg.buttonsResponseMessage?.selectedButtonId
    || msg.listResponseMessage?.singleSelectReply?.selectedRowId || msg.templateButtonReplyMessage?.selectedId || '';
}

export function buildContext(sock, m) {
  const jid = m.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const message = unwrap(m.message);
  const type = getContentType(message);
  const ctxInfo = message?.[type]?.contextInfo || {};
  const sender = jidNormalizedUser(m.key.fromMe ? sock.user.id : (isGroup ? (m.key.participant || m.participant) : jid));
  const senderAlt = m.key.participantAlt || m.key.remoteJidAlt || null;
  const body = textOf(m.message);
  const quotedMsg = ctxInfo.quotedMessage ? unwrap(ctxInfo.quotedMessage) : null;

  const ctx = {
    sock, m, jid, isGroup, sender, senderAlt, type, message, body,
    pushName: m.pushName || '',
    mentions: ctxInfo.mentionedJid || [],
    quoted: quotedMsg ? { message: quotedMsg, sender: ctxInfo.participant, id: ctxInfo.stanzaId, type: getContentType(quotedMsg), text: textOf(quotedMsg) } : null,
    cmd: '', args: [], q: '',
    tag: j => '@' + numId(j),
    get user() { return db.user(sender); },
    get group() { return db.group(jid); }, // no privado vale como "conversa" (notas, listas, jogos)

    // Envia com citacao da mensagem original (padrao do Zenitsu)
    reply(text, opts = {}) {
      const mentions = opts.mentions || extractMentions(text, [sender, ...(ctx.mentions || [])]);
      return ctx.send({ text, mentions }, { quoted: opts.quoted === false ? undefined : m });
    },
    // O id e gerado e anotado ANTES do envio: o eco da propria mensagem nunca vira comando
    send(content, opts = {}) {
      return queue.push(() => { const messageId = generateMessageIDV2(sock.user?.id); sentIds.add(messageId); return sock.sendMessage(jid, content, { ...opts, messageId }); }).then(rememberSent);
    },
    sendTo(to, content, opts = {}) { return queue.push(() => { const messageId = generateMessageIDV2(sock.user?.id); sentIds.add(messageId); return sock.sendMessage(to, content, { ...opts, messageId }); }).then(rememberSent); },
    react(emoji) { return emoji ? reactNow(sock, jid, m.key, emoji) : null; },
    sticker(buffer) { return ctx.send({ sticker: buffer }, { quoted: m }); },
    image(buffer, caption = '', mentions) { return ctx.send({ image: buffer, caption, mentions: mentions || extractMentions(caption, [sender]) }, { quoted: m }); },
    audio(buffer, mimetype = 'audio/mpeg', ptt = false) { return ctx.send({ audio: buffer, mimetype, ptt }, { quoted: m }); },
    video(buffer, caption = '') { return ctx.send({ video: buffer, caption }, { quoted: m }); },

    async meta(fresh) { return isGroup ? groupMeta(sock, jid, fresh) : null; },
    async isAdmin(who = sender) {
      if (!isGroup) return false;
      const meta = await ctx.meta();
      return meta.participants.some(p => sameUser(p, who) && p.admin);
    },
    async botIsAdmin() {
      if (!isGroup) return false;
      const meta = await ctx.meta();
      const me = [sock.user.id, sock.user.lid].filter(Boolean).map(j => jidNormalizedUser(j));
      return meta.participants.some(p => me.some(x => sameUser(p, x)) && p.admin);
    },
    isOwner() {
      const ids = [sender, senderAlt].filter(Boolean).map(numId);
      return m.key.fromMe || config.owners.some(o => ids.includes(o));
    },
    // Baixa a midia da propria mensagem ou da mensagem citada
    async media(kinds = ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage', 'documentMessage']) {
      let target = null;
      if (kinds.includes(type)) target = { key: m.key, message };
      else if (ctx.quoted && kinds.includes(ctx.quoted.type)) target = { key: { remoteJid: jid, id: ctx.quoted.id, participant: ctx.quoted.sender }, message: ctx.quoted.message };
      if (!target) return null;
      const t = getContentType(target.message);
      const buffer = await downloadMediaMessage(target, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      return { buffer, type: t, mimetype: target.message[t]?.mimetype || '', seconds: target.message[t]?.seconds };
    },
    target() { // alvo: mencionado > citado > o proprio autor
      return ctx.mentions[0] || ctx.quoted?.sender || sender;
    },
  };
  return ctx;
}

export function sameUser(p, who) {
  const w = numId(who);
  return [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).some(x => numId(x) === w);
}
export function extractMentions(text, extra = []) {
  const nums = new Set([...(text || '').matchAll(/@(\d{6,20})/g)].map(x => x[1]));
  return extra.filter(Boolean).filter(j => nums.has(numId(j)));
}
