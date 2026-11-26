// Middlewares de grupo: rodam em toda mensagem antes dos comandos.
// Retornar true interrompe o processamento da mensagem.
import { db } from './db.js';
import { numId, rand } from './lib/text.js';
import { imageToSticker, videoToSticker } from './lib/media.js';
import { config } from './config.js';

export const recentKeys = new Map(); // gjid -> ultimas chaves (para /limpar)
const floodWin = new Map(); // gjid:jid -> [timestamps]
const captchas = new Map(); // gjid:jid -> {code, until}

const isProtected = async (ctx, s) => (s.whitelist || []).includes(numId(ctx.sender)) || ctx.isOwner() || await ctx.isAdmin();
async function remove(ctx) { await ctx.sock.sendMessage(ctx.jid, { delete: ctx.m.key }).catch(() => {}); }

export const middlewares = [
  // guarda chaves recentes
  async ctx => { const l = recentKeys.get(ctx.jid) || []; l.push(ctx.m.key); if (l.length > 200) l.shift(); recentKeys.set(ctx.jid, l); },
  // silenciados
  async ctx => {
    const s = ctx.group.settings; if (!(s.muted || []).includes(ctx.sender)) return;
    await remove(ctx); return true;
  },
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
  // antis
  async ctx => {
    const s = ctx.group.settings;
    const any = s.antilink || s.antipalavra || s.antifoto || s.antiaudio || s.antivideo || s.antisticker || s.antidocumento || s.antiloc || s.anticontato || s.antispam || s.antiflood;
    if (!any || await isProtected(ctx, s)) return;
    const body = ctx.body.toLowerCase(); const t = ctx.type;
    let reason = null;
    if (s.antilink && /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/)\S+/i.test(body)) {
      const links = body.match(/(?:https?:\/\/|www\.)\S+|chat\.whatsapp\.com\S*|wa\.me\/\S+/gi) || [];
      if (links.some(l => !(s.allowLinks || []).some(d => l.includes(d)))) reason = 'link';
    }
    if (!reason && s.antipalavra && (s.badwords || []).some(w => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`, 'i').test(body))) reason = 'palavra proibida';
    const typeRule = { imageMessage: 'antifoto', audioMessage: 'antiaudio', videoMessage: 'antivideo', stickerMessage: 'antisticker', documentMessage: 'antidocumento', locationMessage: 'antiloc', liveLocationMessage: 'antiloc', contactMessage: 'anticontato', contactsArrayMessage: 'anticontato' }[t];
    if (!reason && typeRule && s[typeRule]) reason = typeRule.replace('anti', '');
    if (!reason && (s.antiflood || s.antispam)) {
      const k = ctx.jid + ctx.sender; const now = Date.now(); const w = (floodWin.get(k) || []).filter(x => now - x < 8000); w.push(now); floodWin.set(k, w);
      if (w.length > 6 || (s.antispam && ctx.body.length > 3000)) reason = 'flood';
    }
    if (!reason) return;
    await remove(ctx);
    const max = s.maxadv || 3;
    const n = db.updateMember(ctx.jid, ctx.sender, m => { m.warns++; return m.warns; });
    if (n >= max) {
      db.updateMember(ctx.jid, ctx.sender, m => { m.warns = 0; });
      await ctx.sock.groupParticipantsUpdate(ctx.jid, [ctx.sender], 'remove').catch(() => {});
      await ctx.send({ text: `🚫 ${ctx.tag(ctx.sender)} foi removido (${reason}, ${max}/${max} advertências).`, mentions: [ctx.sender] });
    } else await ctx.send({ text: `⚠️ ${ctx.tag(ctx.sender)}, *${reason}* não é permitido aqui! Advertência ${n}/${max}.`, mentions: [ctx.sender] });
    return true;
  },
  // autofigurinha
  async ctx => {
    if (!ctx.group.settings.autosticker || !['imageMessage', 'videoMessage'].includes(ctx.type) || ctx.body.startsWith(config.prefix)) return;
    const m = await ctx.media(['imageMessage', 'videoMessage']); if (!m) return;
    const st = m.type === 'videoMessage' ? ((m.seconds || 0) <= 10 ? await videoToSticker(m.buffer) : null) : await imageToSticker(m.buffer);
    if (st) await ctx.sticker(st);
  },
  // respostas automaticas
  async ctx => {
    const r = ctx.group.settings.autoreplies; if (!r || ctx.body.startsWith(config.prefix)) return;
    const hit = r[ctx.body.trim().toLowerCase()]; if (hit) await ctx.reply(hit);
  },
];

const fill = (tpl, jid, meta) => tpl.replace(/\{membro\}/g, '@' + numId(jid)).replace(/\{grupo\}/g, meta?.subject || 'grupo').replace(/\{desc\}/g, meta?.desc || '');
export async function onJoin(sock, g, jid) {
  const s = g.settings; const send = c => sock.sendMessage(g.jid, c).catch(() => {});
  if ((g.blacklist || []).includes(numId(jid))) { await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); return send({ text: `⛔ @${numId(jid)} está na lista negra e foi removido.`, mentions: [jid] }); }
  if (s.antifake) {
    const meta = await sock.groupMetadata(g.jid).catch(() => null);
    const p = meta?.participants.find(x => x.id === jid || x.lid === jid);
    const phone = numId(p?.phoneNumber || (jid.endsWith('@s.whatsapp.net') ? jid : ''));
    if (phone && !phone.startsWith('55') && !(s.allowDDI || []).some(d => phone.startsWith(d))) { await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); return send({ text: '🚫 Número estrangeiro removido (antifake).' }); }
  }
  if (s.captcha) {
    const code = String(rand(1000, 9999)); captchas.set(g.jid + jid, { code });
    await send({ text: `🔐 @${numId(jid)}, digite o código *${code}* em até 3 minutos para provar que não é robô.`, mentions: [jid] });
    setTimeout(async () => { if (captchas.has(g.jid + jid)) { captchas.delete(g.jid + jid); await sock.groupParticipantsUpdate(g.jid, [jid], 'remove').catch(() => {}); } }, 180_000);
  }
  if (s.welcome) {
    const meta = await sock.groupMetadata(g.jid).catch(() => null);
    const text = fill(s.welcomeText || '👋 Seja bem-vindo(a), {membro}, ao *{grupo}*!\n\n📜 Leia as regras com /regras e divirta-se! 🎉', jid, meta);
    if (s.welcomePhoto) { const url = await sock.profilePictureUrl(jid, 'image').catch(() => null); if (url) return send({ image: { url }, caption: text, mentions: [jid] }); }
    return send({ text, mentions: [jid] });
  }
}
export async function onLeave(sock, g, jid) {
  const s = g.settings; if (!s.bye) return;
  const meta = await sock.groupMetadata(g.jid).catch(() => null);
  const text = fill(s.byeText || '🚪 {membro} saiu do grupo. Até mais! 👋', jid, meta);
  if (s.byePhoto) { const url = await sock.profilePictureUrl(jid, 'image').catch(() => null); if (url) return sock.sendMessage(g.jid, { image: { url }, caption: text, mentions: [jid] }).catch(() => {}); }
  return sock.sendMessage(g.jid, { text, mentions: [jid] }).catch(() => {});
}
