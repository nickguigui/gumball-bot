// Middlewares de grupo: rodam em toda mensagem antes dos comandos (configuraveis por grupo no painel).
// Retornar true interrompe o processamento da mensagem.
import { getContentType } from 'baileys';
import { db } from './db.js';
import { numId, rand } from './lib/text.js';
import { imageToSticker, videoToSticker } from './lib/media.js';
import { config } from './config.js';
import { unwrap, textOf } from './context.js';

export const recentKeys = new Map(); // gjid -> ultimas chaves (para /limpar)
const recentMsgs = new Map();        // id -> {gjid, sender, text, message, at} (para apagadas/editadas)
const floodWin = new Map();          // gjid:jid -> [timestamps]
const captchas = new Map();          // gjid:jid -> {code}
const replyCd = new Map();           // gjid:palavra -> ts

const isProtected = async (ctx, s) => (s.whitelist || []).includes(numId(ctx.sender)) || ctx.isOwner() || await ctx.isAdmin();
async function remove(ctx) { await ctx.sock.sendMessage(ctx.jid, { delete: ctx.m.key }).catch(() => {}); }

// Tipos que o painel deixa apagar (chave -> como reconhecer)
export const ANTI_TYPES = {
  contato: m => m.contactMessage || m.contactsArrayMessage,
  documento: m => m.documentMessage || m.documentWithCaptionMessage,
  canal: (m, ci) => !!ci?.forwardedNewsletterMessageInfo,
  enquete: m => m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3,
  evento: m => m.eventMessage,
  figurinha: m => m.stickerMessage,
  imagem: m => m.imageMessage,
  localizacao: m => m.locationMessage || m.liveLocationMessage,
  trava: (m, ci, text) => (text || '').length > 4000,
  produto: m => m.productMessage || m.orderMessage,
  unica: (m, ci, text, raw) => !!(raw?.viewOnceMessage || raw?.viewOnceMessageV2 || raw?.viewOnceMessageV2Extension || m.imageMessage?.viewOnce || m.videoMessage?.viewOnce || m.audioMessage?.viewOnce),
  video: m => m.videoMessage,
  audio: m => m.audioMessage,
};
const LABEL = { contato: 'contato', documento: 'documento', canal: 'mensagem de canal', enquete: 'enquete', evento: 'evento', figurinha: 'figurinha', imagem: 'imagem', localizacao: 'localização', trava: 'mensagem gigante', produto: 'produto', unica: 'visualização única', video: 'vídeo', audio: 'áudio' };

async function warn(ctx, s, reason) {
  const max = s.maxadv || 3;
  const n = db.updateMember(ctx.jid, ctx.sender, m => { m.warns++; return m.warns; });
  if (n >= max) {
    db.updateMember(ctx.jid, ctx.sender, m => { m.warns = 0; });
    await ctx.sock.groupParticipantsUpdate(ctx.jid, [ctx.sender], 'remove').catch(() => {});
    await ctx.send({ text: `🚫 ${ctx.tag(ctx.sender)} foi removido (${reason}, ${max}/${max} advertências).`, mentions: [ctx.sender] });
  } else await ctx.send({ text: `⚠️ ${ctx.tag(ctx.sender)}, *${reason}* não é permitido aqui! Advertência ${n}/${max}.`, mentions: [ctx.sender] });
}

export const middlewares = [
  // guarda chaves e conteudo recente
  async ctx => {
    const l = recentKeys.get(ctx.jid) || []; l.push(ctx.m.key); if (l.length > 200) l.shift(); recentKeys.set(ctx.jid, l);
    recentMsgs.set(ctx.m.key.id, { gjid: ctx.jid, sender: ctx.sender, text: ctx.body, message: ctx.m.message, at: Date.now() });
    if (recentMsgs.size > 3000) recentMsgs.delete(recentMsgs.keys().next().value);
  },
  // silenciados
  async ctx => { if (!(ctx.group.settings.muted || []).includes(ctx.sender)) return; await remove(ctx); return true; },
  // captcha pendente
  async ctx => {
    const k = ctx.jid + ctx.sender; const c = captchas.get(k); if (!c) return;
    if (ctx.body.trim() === c.code) { captchas.delete(k); await ctx.reply('✅ Verificação concluída! Seja bem-vindo(a). 🎉'); return true; }
    await remove(ctx); return true;
  },
  // AFK: voltou / foi mencionado
  async ctx => {
    const me = db.member(ctx.jid, ctx.sender);
    if (me.afk && !ctx.body.trim().toLowerCase().startsWith(config.prefix + 'afk')) {
      const mins = Math.round((Date.now() - me.afk.since) / 60000);
      db.updateMember(ctx.jid, ctx.sender, m => { m.afk = null; m.afkTotal = (m.afkTotal || 0) + mins; });
      await ctx.reply(`👋 ${ctx.tag(ctx.sender)} voltou do AFK depois de *${mins} min*!`);
    }
    for (const j of [...new Set([...(ctx.mentions || []), ctx.quoted?.sender].filter(Boolean))]) {
      const t = db.member(ctx.jid, j);
      if (t.afk && j !== ctx.sender) await ctx.reply(`💤 ${ctx.tag(j)} está *AFK* há ${Math.round((Date.now() - t.afk.since) / 60000)} min.\n📝 _${t.afk.reason}_`, { mentions: [j] });
    }
  },
  // moderacao (nunca vale para admins)
  async ctx => {
    const s = ctx.group.settings;
    const linkMode = s.linkMode || (s.antilink ? 'todos' : 'off');
    const types = s.antiTypes || [];
    if (linkMode === 'off' && !s.antipalavra && !s.antiflood && !s.antispam && !types.length) return;
    if (await isProtected(ctx, s)) return;
    const body = ctx.body.toLowerCase(); const m = ctx.message || {}; const ci = m[ctx.type]?.contextInfo;
    // links
    if (linkMode !== 'off') {
      const links = body.match(/(?:https?:\/\/|www\.)\S+|chat\.whatsapp\.com\S*|wa\.me\/\S+/gi) || [];
      const bad = links.filter(l => !(s.allowLinks || []).some(d => d && l.includes(d.toLowerCase())));
      const hit = linkMode === 'grupo' ? bad.some(l => /chat\.whatsapp\.com/.test(l)) : bad.length > 0;
      if (hit) {
        await remove(ctx);
        if (s.banLinks) { await ctx.sock.groupParticipantsUpdate(ctx.jid, [ctx.sender], 'remove').catch(() => {}); await ctx.send({ text: `🚫 ${ctx.tag(ctx.sender)} foi removido por mandar link.`, mentions: [ctx.sender] }); }
        else await warn(ctx, s, 'link');
        return true;
      }
    }
    // palavroes
    if (s.antipalavra && (s.badwords || []).some(w => w && new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'i').test(body))) { await remove(ctx); await warn(ctx, s, 'palavra proibida'); return true; }
    // tipos de mensagem
    for (const t of types) if (ANTI_TYPES[t]?.(m, ci, ctx.body, ctx.m.message)) { await remove(ctx); await warn(ctx, s, LABEL[t] || t); return true; }
    // flood: mais de 7 mensagens em 10 s
    if (s.antiflood || s.antispam) {
      const k = ctx.jid + ctx.sender; const now = Date.now(); const w = (floodWin.get(k) || []).filter(x => now - x < 10_000); w.push(now); floodWin.set(k, w);
      if (w.length > 7) { floodWin.set(k, []); await warn(ctx, s, 'flood'); return true; }
    }
  },
  // auto-figurinha
  async ctx => {
    if (!ctx.group.settings.autosticker || !['imageMessage', 'videoMessage'].includes(ctx.type) || ctx.body.startsWith(config.prefix)) return;
    const m = await ctx.media(['imageMessage', 'videoMessage']); if (!m) return;
    const st = m.type === 'videoMessage' ? ((m.seconds || 0) <= 10 ? await videoToSticker(m.buffer) : null) : await imageToSticker(m.buffer);
    if (st) await ctx.sticker(st);
  },
  // respostas automaticas (no maximo 1 vez a cada 30 s por palavra)
  async ctx => {
    const r = ctx.group.settings.autoreplies; if (!r || ctx.body.startsWith(config.prefix)) return;
    const word = Object.keys(r).find(k => new RegExp(`(^|\\W)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'i').test(ctx.body)); if (!word) return;
    const key = ctx.jid + word; if (Date.now() - (replyCd.get(key) || 0) < 30_000) return;
    replyCd.set(key, Date.now()); await ctx.reply(r[word]);
  },
];

// Mensagem apagada / editada (chamado pelo handler para protocolMessage e edicoes)
export async function onProtocol(sock, m) {
  const jid = m.key.remoteJid; if (!jid?.endsWith('@g.us')) return;
  const s = db.group(jid).settings; const pm = m.message?.protocolMessage;
  const editedOf = pm?.type === 14 || pm?.editedMessage ? pm.key?.id : m.message?.editedMessage ? m.message.editedMessage.message?.protocolMessage?.key?.id : null;
  if (pm?.type === 0 && s.antiapagar) { // REVOKE
    const old = recentMsgs.get(pm.key?.id); if (!old) return;
    const who = old.sender; const t = getContentType(unwrap(old.message));
    if (t === 'conversation' || t === 'extendedTextMessage') return sock.sendMessage(jid, { text: `🗑️ @${numId(who)} apagou uma mensagem:\n\n${old.text}`, mentions: [who] }).catch(() => {});
    return sock.sendMessage(jid, { forward: { key: { remoteJid: jid, id: pm.key.id, participant: who }, message: old.message }, contextInfo: { isForwarded: false } }).then(() => sock.sendMessage(jid, { text: `🗑️ @${numId(who)} apagou isso aí em cima.`, mentions: [who] })).catch(() => {});
  }
  if (editedOf && s.antieditar) {
    const old = recentMsgs.get(editedOf); if (!old?.text) return;
    const novo = textOf(pm?.editedMessage || m.message?.editedMessage?.message?.protocolMessage?.editedMessage || {});
    old.text !== novo && await sock.sendMessage(jid, { text: `✏️ @${numId(old.sender)} editou uma mensagem.\n\n*Antes:* ${old.text}`, mentions: [old.sender] }).catch(() => {});
    old.text = novo;
  }
}

const fill = (tpl, jid, meta) => tpl.replace(/\{membro\}/g, '@' + numId(jid)).replace(/\{grupo\}/g, meta?.subject || 'grupo').replace(/\{desc\}/g, meta?.desc || '');
export async function onJoin(sock, g, jid) {
  const s = g.settings; const send = c => sock.sendMessage(g.jid, c).catch(() => {});
  if ((g.blacklist || []).includes(numId(jid))) { await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); return send({ text: `⛔ @${numId(jid)} está na lista negra e foi removido.`, mentions: [jid] }); }
  if (s.antifake) {
    const meta = await sock.groupMetadata(g.jid).catch(() => null);
    const p = meta?.participants.find(x => x.id === jid || x.lid === jid);
    const phone = numId(p?.phoneNumber || (jid.endsWith('@s.whatsapp.net') ? jid : ''));
    if (phone && !phone.startsWith('55') && !(s.allowDDI || []).some(d => d && phone.startsWith(String(d).replace(/\D/g, '')))) { await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); return send({ text: '🚫 Número de outro país removido (só números do Brasil).' }); }
  }
  if (s.captcha) {
    const code = String(rand(1000, 9999)); captchas.set(g.jid + jid, { code });
    await send({ text: `🔐 @${numId(jid)}, digite o código *${code}* em até 5 minutos para provar que não é robô.`, mentions: [jid] });
    setTimeout(async () => { if (captchas.has(g.jid + jid)) { captchas.delete(g.jid + jid); await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); } }, 5 * 60_000);
  }
  if (s.welcome) {
    const meta = await sock.groupMetadata(g.jid).catch(() => null);
    const text = fill(s.welcomeText || '👋 Bem-vindo(a) ao {grupo}, {membro}! Manda um /menu para ver o que eu sei fazer.', jid, meta);
    if (s.welcomePhoto) { const url = await sock.profilePictureUrl(jid, 'image').catch(() => null); if (url) return send({ image: { url }, caption: text, mentions: [jid] }); }
    return send({ text, mentions: [jid] });
  }
}
export async function onLeave(sock, g, jid) {
  const s = g.settings; if (!s.bye) return;
  const meta = await sock.groupMetadata(g.jid).catch(() => null);
  const text = fill(s.byeText || '👋 {membro} saiu do grupo. Vai tarde! 😜', jid, meta);
  if (s.byePhoto) { const url = await sock.profilePictureUrl(jid, 'image').catch(() => null); if (url) return sock.sendMessage(g.jid, { image: { url }, caption: text, mentions: [jid] }).catch(() => {}); }
  return sock.sendMessage(g.jid, { text, mentions: [jid] }).catch(() => {});
}
