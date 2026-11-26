// Administracao do grupo (menuadm do Zenitsu + extras do ZueiraBot).
import { db } from '../db.js';
import { config } from '../config.js';
import { numId, dateBR } from '../lib/text.js';
import { invalidateMeta, sameUser } from '../context.js';
import { recentKeys } from '../middlewares.js';

const G = '⚙️ GESTÃO DE GRUPO', S = '🛡️ SEGURANÇA & ANTIS';
const A = { admin: true };
const set = (ctx, fn) => db.updateGroup(ctx.jid, g => { fn(g.settings, g); });
const targets = ctx => [...new Set([...(ctx.mentions || []), ctx.quoted?.sender].filter(Boolean))];
const onoff = (ctx, key, label, extra = '') => {
  const arg = (ctx.args[0] || '').toLowerCase();
  const cur = !!ctx.group.settings[key];
  const val = arg === 'on' || arg === '1' ? true : arg === 'off' || arg === '0' ? false : !cur;
  set(ctx, s => { s[key] = val; });
  return ctx.reply(`${val ? '✅' : '❌'} *${label}* ${val ? 'ativado' : 'desativado'} neste grupo.${extra && val ? `\n\n${extra}` : ''}`);
};
const hhmm = s => /^([01]?\d|2[0-3]):[0-5]\d$/.test(s || '');

const ANTIS = {
  antilink: 'Antilink', antifoto: 'Antifoto', antiaudio: 'Antiáudio', antivideo: 'Antivídeo', antisticker: 'Antifigurinha', antidocumento: 'Antidocumento',
  antiloc: 'Antilocalização', anticontato: 'Anticontato', antispam: 'Antispam', antiflood: 'Antiflood', antifake: 'Antifake (só +55)', captcha: 'Captcha de entrada', autosticker: 'Autofigurinha',
};

export const commands = [
  ...Object.entries(ANTIS).map(([name, label]) => ({ name, category: S, react: '🛡️', ...A, botAdmin: name !== 'autosticker', run: ctx => onoff(ctx, name, label, name === 'antilink' ? '💡 Libere sites com */permlink youtube.com*' : '') })),
  {
    name: 'antipalavra', category: S, react: '🤬', ...A, run: ctx => {
      const sub = (ctx.args[0] || '').toLowerCase(); const words = ctx.args.slice(1).join(' ').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      if (sub === 'add') { set(ctx, s => { s.badwords = [...new Set([...(s.badwords || []), ...words])]; s.antipalavra = true; }); return ctx.reply(`🤬 Adicionadas: ${words.join(', ')}`); }
      if (sub === 'del') { set(ctx, s => { s.badwords = (s.badwords || []).filter(w => !words.includes(w)); }); return ctx.reply(`✅ Removidas: ${words.join(', ')}`); }
      if (sub === 'limpar') { set(ctx, s => { s.badwords = []; }); return ctx.reply('🧹 Lista de palavras proibidas zerada.'); }
      return onoff(ctx, 'antipalavra', 'Antipalavra', '💡 */antipalavra add palavra1, palavra2*');
    },
  },
  { name: 'permlink', category: S, react: '🔗', ...A, run: ctx => { const d = ctx.args.map(x => x.toLowerCase()); if (!d.length) return ctx.reply(`🔗 Sites liberados: ${(ctx.group.settings.allowLinks || []).join(', ') || 'nenhum'}\n\n*/permlink dominio.com*`); set(ctx, s => { s.allowLinks = [...new Set([...(s.allowLinks || []), ...d])]; }); return ctx.reply(`✅ Liberados no antilink: ${d.join(', ')}`); } },
  {
    name: 'bot', category: G, react: '🤖', ...A, run: ctx => {
      const arg = (ctx.args[0] || '').toLowerCase(); if (!['on', 'off'].includes(arg)) return ctx.reply(`🤖 O bot está *${ctx.group.bot === false ? 'DESLIGADO' : 'LIGADO'}* aqui.\n\n*/bot on* ou */bot off*`);
      db.updateGroup(ctx.jid, g => { g.bot = arg === 'on'; });
      return ctx.reply(arg === 'on' ? '🤖 *Bot ligado neste grupo!* Digite */menu*.' : '😴 *Bot desligado neste grupo.* Admins religam com */bot on*.');
    },
  },
  { name: 'soadm', category: G, react: '🛡️', ...A, run: ctx => onoff(ctx, 'soadm', 'Modo só admins') },
  { name: 'modobrincadeira', category: G, react: '🎭', ...A, run: ctx => { const r = onoff(ctx, 'noFun', 'Bloqueio de brincadeiras/jogos'); return r; } },
  { name: 'tempocmd', category: G, react: '⏱️', ...A, run: ctx => { const n = Math.max(0, Math.min(300, parseInt(ctx.args[0]) || 0)); set(ctx, s => { s.tempocmd = n; }); return ctx.reply(n ? `⏱️ Intervalo mínimo entre comandos: *${n}s* por pessoa.` : '⏱️ Intervalo entre comandos desativado.'); } },
  { name: 'bloqcmd', category: G, react: '🚫', ...A, run: ctx => { const c = (ctx.args[0] || '').replace(/^\//, '').toLowerCase(); if (!c) return ctx.reply('🚫 *Uso:* /bloqcmd play'); set(ctx, s => { s.blockedCmds = [...new Set([...(s.blockedCmds || []), c])]; }); return ctx.reply(`🚫 */${c}* bloqueado neste grupo.`); } },
  { name: 'desbloqcmd', category: G, react: '✅', ...A, run: ctx => { const c = (ctx.args[0] || '').replace(/^\//, '').toLowerCase(); set(ctx, s => { s.blockedCmds = (s.blockedCmds || []).filter(x => x !== c); }); return ctx.reply(`✅ */${c}* liberado.`); } },
  { name: 'prefixo', category: G, react: '🔧', ...A, run: ctx => { const p = ctx.args[0]; if (!p || p.length > 2) return ctx.reply(`🔧 Prefixo atual: *${ctx.group.settings.prefix || config.prefix}*\n\n*/prefixo !*`); set(ctx, s => { s.prefix = p; }); return ctx.reply(`🔧 Prefixo deste grupo agora é *${p}*  _(o ${config.prefix} continua funcionando)_`); } },

  // ----- membros -----
  {
    name: 'ban', category: G, react: '🔨', ...A, botAdmin: true, run: async ctx => {
      const t = targets(ctx); if (!t.length) return ctx.reply('🔨 *Uso:* /ban @pessoa (ou responda a mensagem)');
      const meta = await ctx.meta(); const owner = meta.owner;
      const ok = t.filter(j => !numId(j).includes(numId(ctx.sock.user.id)) && j !== owner);
      await ctx.sock.groupParticipantsUpdate(ctx.jid, ok, 'remove'); invalidateMeta(ctx.jid);
      return ctx.reply(`🔨 *Removido(s):* ${ok.map(ctx.tag).join(', ')}`, { mentions: ok });
    },
  },
  ...[['promoveradm', 'promote', '👑 *Promovido(s) a admin:*', ['promover']], ['removeradm', 'demote', '⬇️ *Admin removido de:*', ['rebaixar']]].map(([name, action, msg, aliases]) => ({
    name, aliases, category: G, react: '🛡️', ...A, botAdmin: true, run: async ctx => {
      const t = targets(ctx); if (!t.length) return ctx.reply(`*Uso:* /${name} @pessoa`);
      await ctx.sock.groupParticipantsUpdate(ctx.jid, t, action); invalidateMeta(ctx.jid);
      return ctx.reply(`${msg} ${t.map(ctx.tag).join(', ')}`, { mentions: t });
    },
  })),
  {
    name: 'del', category: G, react: '🗑️', ...A, botAdmin: true, run: async ctx => {
      if (!ctx.quoted) return ctx.reply('🗑️ Responda a mensagem que quer apagar com */del*');
      await ctx.sock.sendMessage(ctx.jid, { delete: { remoteJid: ctx.jid, id: ctx.quoted.id, participant: ctx.quoted.sender, fromMe: false } });
      await ctx.sock.sendMessage(ctx.jid, { delete: ctx.m.key }).catch(() => {});
      return false;
    },
  },
  {
    name: 'limpar', category: G, react: '🧹', ...A, botAdmin: true, run: async ctx => {
      const t = targets(ctx)[0]; const n = Math.min(50, parseInt(ctx.args.find(a => /^\d+$/.test(a))) || 10);
      const keys = (recentKeys.get(ctx.jid) || []).filter(k => !t || sameUser({ id: k.participant }, t)).slice(-n);
      for (const k of keys) await ctx.sock.sendMessage(ctx.jid, { delete: k }).catch(() => {});
      return ctx.reply(`🧹 *${keys.length}* mensagens apagadas${t ? ` de ${ctx.tag(t)}` : ''}.`, { mentions: t ? [t] : [] });
    },
  },
  {
    name: 'totag', aliases: ['marcar'], category: G, react: '📢', ...A, run: async ctx => {
      const ids = (await ctx.meta()).participants.map(p => p.id);
      if (ctx.quoted) return ctx.send({ forward: { key: { remoteJid: ctx.jid, id: ctx.quoted.id, participant: ctx.quoted.sender }, message: ctx.quoted.message }, mentions: ids }).catch(() => ctx.send({ text: ctx.quoted.text || '📢', mentions: ids }));
      return ctx.send({ text: `📢 ${ctx.q || 'Atenção, pessoal!'}`, mentions: ids });
    },
  },
  {
    name: 'mutar', aliases: ['mute'], category: G, react: '🔇', ...A, botAdmin: true, run: ctx => {
      const t = targets(ctx); if (!t.length) return ctx.reply('🔇 *Uso:* /mutar @pessoa');
      set(ctx, s => { s.muted = [...new Set([...(s.muted || []), ...t])]; });
      return ctx.reply(`🔇 ${t.map(ctx.tag).join(', ')} silenciado(s). Tudo que mandarem será apagado.`, { mentions: t });
    },
  },
  { name: 'desmutar', aliases: ['desmute'], category: G, react: '🔊', ...A, run: ctx => { const t = targets(ctx); set(ctx, s => { s.muted = (s.muted || []).filter(j => !t.includes(j)); }); return ctx.reply(`🔊 ${t.map(ctx.tag).join(', ')} pode falar de novo.`, { mentions: t }); } },
  { name: 'mutados', category: null, react: '🔇', ...A, run: ctx => { const m = ctx.group.settings.muted || []; return ctx.reply(m.length ? `🔇 *SILENCIADOS*\n\n${m.map(ctx.tag).join('\n')}` : 'Ninguém silenciado.', { mentions: m }); } },
  {
    name: 'adv', category: G, react: '⚠️', ...A, botAdmin: true, run: async ctx => {
      const t = targets(ctx)[0]; if (!t) return ctx.reply('⚠️ *Uso:* /adv @pessoa [motivo]');
      const max = ctx.group.settings.maxadv || 3; const reason = ctx.q.replace(/@\d+/g, '').trim() || 'sem motivo';
      const n = db.updateMember(ctx.jid, t, m => { m.warns++; return m.warns; });
      if (n >= max) { db.updateMember(ctx.jid, t, m => { m.warns = 0; }); await ctx.sock.groupParticipantsUpdate(ctx.jid, [t], 'remove').catch(() => {}); return ctx.reply(`🚫 ${ctx.tag(t)} atingiu ${max} advertências e foi *removido*.`, { mentions: [t] }); }
      return ctx.reply(`⚠️ *ADVERTÊNCIA ${n}/${max}*\n\n👤 ${ctx.tag(t)}\n📝 Motivo: _${reason}_`, { mentions: [t] });
    },
  },
  { name: 'rmadv', category: G, react: '✅', ...A, run: ctx => { const t = targets(ctx)[0]; if (!t) return ctx.reply('*Uso:* /rmadv @pessoa'); const n = db.updateMember(ctx.jid, t, m => { m.warns = Math.max(0, m.warns - 1); return m.warns; }); return ctx.reply(`✅ ${ctx.tag(t)} agora tem ${n} advertência(s).`, { mentions: [t] }); } },
  { name: 'zeraradv', category: null, react: '🧽', ...A, run: ctx => { const t = targets(ctx)[0]; if (!t) return ctx.reply('*Uso:* /zeraradv @pessoa'); db.updateMember(ctx.jid, t, m => { m.warns = 0; }); return ctx.reply(`🧽 Advertências de ${ctx.tag(t)} zeradas.`, { mentions: [t] }); } },
  { name: 'advs', category: G, react: '📋', ...A, run: ctx => { const l = db.members(ctx.jid).filter(m => m.warns > 0); return ctx.reply(l.length ? `📋 *ADVERTÊNCIAS*\n\n${l.map(m => `• ${ctx.tag(m.jid)} — ${m.warns}`).join('\n')}` : '📋 Ninguém advertido.', { mentions: l.map(m => m.jid) }); } },
  { name: 'maxadv', category: null, react: '⚙️', ...A, run: ctx => { const n = Math.max(1, Math.min(10, parseInt(ctx.args[0]) || 3)); set(ctx, s => { s.maxadv = n; }); return ctx.reply(`⚙️ Remoção automática na *${n}ª* advertência.`); } },
  {
    name: 'blacklist', aliases: ['listanegra'], category: G, react: '⛔', ...A, run: ctx => {
      const t = targets(ctx); const nums = ctx.args.filter(a => /^\+?\d{8,}$/.test(a)).map(a => a.replace(/\D/g, ''));
      if (!t.length && !nums.length) { const b = ctx.group.blacklist || []; return ctx.reply(b.length ? `⛔ *LISTA NEGRA*\n\n${b.map(x => `• ${x}`).join('\n')}` : '⛔ Lista negra vazia.\n\n*/blacklist @pessoa* ou número'); }
      db.updateGroup(ctx.jid, g => { g.blacklist = [...new Set([...(g.blacklist || []), ...t.map(numId), ...nums])]; });
      return ctx.reply('⛔ Adicionado(s) à lista negra. Serão removidos ao entrar.');
    },
  },
  { name: 'listabranca', category: null, react: '🤍', ...A, run: ctx => { const t = targets(ctx); set(ctx, s => { s.whitelist = [...new Set([...(s.whitelist || []), ...t.map(numId)])]; }); return ctx.reply(`🤍 ${t.map(ctx.tag).join(', ')} imune(s) às regras automáticas.`, { mentions: t }); } },

  // ----- grupo -----
  ...[['fechargp', 'announcement', '🔒 *Grupo fechado!* Só admins podem mandar mensagens.', ['fechar']], ['abrirgp', 'not_announcement', '🔓 *Grupo aberto!* Todos podem mandar mensagens.', []]].map(([name, mode, msg, aliases]) => ({
    name, aliases, category: G, react: mode === 'announcement' ? '🔒' : '🔓', ...A, botAdmin: true, run: async ctx => {
      if (hhmm(ctx.args[0])) { set(ctx, s => { s[mode === 'announcement' ? 'autoClose' : 'autoOpen'] = ctx.args[0]; }); return ctx.reply(`⏰ O grupo vai ${mode === 'announcement' ? 'fechar' : 'abrir'} todo dia às *${ctx.args[0]}* (Brasília).`); }
      await ctx.sock.groupSettingUpdate(ctx.jid, mode); return ctx.reply(msg);
    },
  })),
  ...[['agendafc', 'autoClose', 'fechar'], ['agendaab', 'autoOpen', 'abrir']].map(([name, key, verb]) => ({
    name, category: G, react: '⏰', ...A, botAdmin: true, run: ctx => {
      if ((ctx.args[0] || '').toLowerCase() === 'off') { set(ctx, s => { delete s[key]; }); return ctx.reply(`⏰ Agendamento para ${verb} removido.`); }
      if (!hhmm(ctx.args[0])) return ctx.reply(`⏰ *Uso:* /${name} 22:00  (ou /${name} off)`);
      set(ctx, s => { s[key] = ctx.args[0]; }); return ctx.reply(`⏰ O grupo vai *${verb}* todo dia às *${ctx.args[0]}* (Brasília).`);
    },
  })),
  {
    name: 'grupo', category: null, react: '🔐', ...A, botAdmin: true, run: async ctx => {
      const a = (ctx.args[0] || '').toLowerCase()[0]; if (!'af'.includes(a) || !a) return ctx.reply('🔐 *Uso:* /grupo a (abrir) | /grupo f (fechar)');
      await ctx.sock.groupSettingUpdate(ctx.jid, a === 'f' ? 'announcement' : 'not_announcement');
      return ctx.reply(a === 'f' ? '🔒 Grupo fechado.' : '🔓 Grupo aberto.');
    },
  },
  { name: 'nomegp', category: G, react: '✏️', ...A, botAdmin: true, run: async ctx => { if (!ctx.q) return ctx.reply('✏️ *Uso:* /nomegp novo nome'); await ctx.sock.groupUpdateSubject(ctx.jid, ctx.q.slice(0, 100)); return ctx.reply('✏️ Nome do grupo atualizado!'); } },
  { name: 'descgp', category: G, react: '📝', ...A, botAdmin: true, run: async ctx => { if (!ctx.q) return ctx.reply('📝 *Uso:* /descgp nova descrição'); await ctx.sock.groupUpdateDescription(ctx.jid, ctx.q); return ctx.reply('📝 Descrição atualizada!'); } },
  {
    name: 'fotogp', category: G, react: '🖼️', ...A, botAdmin: true, run: async ctx => {
      const m = await ctx.media(['imageMessage']); if (!m) return ctx.reply('🖼️ Envie ou responda uma imagem com */fotogp*');
      await ctx.sock.updateProfilePicture(ctx.jid, m.buffer); return ctx.reply('🖼️ Foto do grupo atualizada!');
    },
  },
  { name: 'revogarlink', aliases: ['resetlink'], category: G, react: '🔗', ...A, botAdmin: true, run: async ctx => { const c = await ctx.sock.groupRevokeInvite(ctx.jid); return ctx.reply(`🔗 Link antigo cancelado. Novo link:\nhttps://chat.whatsapp.com/${c}`); } },
  {
    name: 'aprovar', category: G, react: '✅', ...A, botAdmin: true, run: async ctx => {
      const list = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
      if (!list.length) return ctx.reply('✅ Nenhuma solicitação pendente.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, list.map(r => r.jid), 'approve');
      return ctx.reply(`✅ *${list.length}* solicitação(ões) aprovada(s).`);
    },
  },
  {
    name: 'recusar', category: G, react: '❌', ...A, botAdmin: true, run: async ctx => {
      const list = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []);
      if (!list.length) return ctx.reply('Nenhuma solicitação pendente.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.jid, list.map(r => r.jid), 'reject');
      return ctx.reply(`❌ *${list.length}* solicitação(ões) recusada(s).`);
    },
  },
  { name: 'solicitacoes', category: null, react: '📨', ...A, botAdmin: true, run: async ctx => { const l = await ctx.sock.groupRequestParticipantsList(ctx.jid).catch(() => []); return ctx.reply(l.length ? `📨 *PEDIDOS PARA ENTRAR* (${l.length})\n\n${l.map(r => `• wa.me/${numId(r.phone_number || r.jid)}`).join('\n')}\n\n*/aprovar* ou */recusar*` : '📨 Nenhum pedido pendente.'); } },
  {
    name: 'membros', category: G, react: '👥', ...A, run: async ctx => {
      const m = await ctx.meta(); const ad = m.participants.filter(p => p.admin).length;
      return ctx.reply(`👥 *MEMBROS DO GRUPO*\n\n📊 Total: *${m.participants.length}*\n🛡️ Admins: *${ad}*\n👤 Membros comuns: *${m.participants.length - ad}*`);
    },
  },
  ...[['ativos', 'mais ativos', (a, b) => b.msgs - a.msgs, '🔥'], ['inativos', 'inativos', (a, b) => (a.lastSeen || 0) - (b.lastSeen || 0), '💤'], ['fantasma', 'fantasmas (nunca falaram)', null, '👻']].map(([name, label, sort, emoji]) => ({
    name, category: G, react: emoji, ...A, run: async ctx => {
      const ids = (await ctx.meta()).participants.map(p => p.id); const days = parseInt(ctx.args[0]) || (name === 'inativos' ? 7 : 0);
      const mem = Object.fromEntries(db.members(ctx.jid).map(m => [m.jid, m]));
      let rows = ids.map(j => ({ jid: j, msgs: mem[j]?.msgs || 0, lastSeen: mem[j]?.lastSeen || 0 }));
      if (name === 'fantasma') rows = rows.filter(r => !r.msgs);
      else if (name === 'inativos') rows = rows.filter(r => Date.now() - r.lastSeen > days * 864e5).sort(sort);
      else rows = rows.filter(r => r.msgs).sort(sort).slice(0, 15);
      return ctx.reply(rows.length ? `${emoji} *MEMBROS ${label.toUpperCase()}*${name === 'inativos' ? ` (+${days} dias)` : ''}\n\n${rows.map(r => `• ${ctx.tag(r.jid)}${name === 'ativos' ? ` — ${r.msgs} msgs` : r.lastSeen ? ` — visto ${dateBR(new Date(r.lastSeen))}` : ''}`).join('\n')}` : `${emoji} Ninguém nessa lista.`, { mentions: rows.map(r => r.jid) });
    },
  })),
  {
    name: 'banghost', category: null, react: '👻', ...A, botAdmin: true, run: async ctx => {
      const days = parseInt(ctx.args[0]) || 30; const ids = (await ctx.meta()).participants.filter(p => !p.admin).map(p => p.id);
      const mem = Object.fromEntries(db.members(ctx.jid).map(m => [m.jid, m]));
      const rows = ids.filter(j => Date.now() - (mem[j]?.lastSeen || 0) > days * 864e5);
      if (ctx.args.at(-1) !== 'confirmar') return ctx.reply(`👻 *${rows.length}* membros sem falar há +${days} dias.\n\nPara remover: */banghost ${days} confirmar*`);
      for (const j of rows) await ctx.sock.groupParticipantsUpdate(ctx.jid, [j], 'remove').catch(() => {});
      return ctx.reply(`👻 ${rows.length} inativos removidos.`);
    },
  },
  // ----- mensagens automaticas -----
  ...[['msgbv', 'welcomeText', 'welcome', 'boas-vindas', '👋'], ['msgbv2', 'welcomeText', 'welcome', 'boas-vindas (com foto)', '👋'], ['msgsaiu', 'byeText', 'bye', 'saída', '🚪'], ['msgsaiu2', 'byeText', 'bye', 'saída (com foto)', '🚪']].map(([name, textKey, flag, label, emoji]) => ({
    name, aliases: name === 'msgbv' ? ['bemvindo'] : name === 'msgsaiu' ? ['saida'] : [], category: G, react: emoji, ...A, run: ctx => {
      const a = (ctx.args[0] || '').toLowerCase();
      if (a === 'off') { set(ctx, s => { s[flag] = false; }); return ctx.reply(`${emoji} Mensagem de ${label} *desativada*.`); }
      set(ctx, s => { s[flag] = true; s[flag + 'Photo'] = name.endsWith('2'); if (ctx.q && a !== 'on') s[textKey] = ctx.q; });
      return ctx.reply(`${emoji} Mensagem de ${label} *ativada*!\n\n📝 Texto: ${ctx.group.settings[textKey] || ctx.q || '_padrão_'}\n\n💡 Variáveis: {membro} {grupo} {desc}\nDesative com */${name} off*`);
    },
  })),
  { name: 'regras', category: null, react: '📜', run: ctx => ctx.reply(ctx.group.settings.rules ? `📜 *REGRAS DO GRUPO*\n\n${ctx.group.settings.rules}` : '📜 Nenhuma regra definida. Admins: */setregras texto*') },
  { name: 'setregras', category: G, react: '📜', ...A, run: ctx => { if (!ctx.q) return ctx.reply('📜 *Uso:* /setregras texto das regras'); set(ctx, s => { s.rules = ctx.q; }); return ctx.reply('📜 Regras salvas! Membros veem com */regras*.'); } },
  {
    name: 'agendar', category: G, react: '🗓️', ...A, run: ctx => {
      const [time, ...rest] = ctx.args; if (!hhmm(time) || !rest.length) return ctx.reply('🗓️ *Uso:* /agendar 08:00 Bom dia, grupo!');
      const id = Date.now().toString(36); set(ctx, s => { (s.agendas ||= []).push({ id, time, text: rest.join(' ') }); });
      return ctx.reply(`🗓️ Agendado: todo dia às *${time}*\n📝 ${rest.join(' ')}\n🆔 \`${id}\``);
    },
  },
  { name: 'agendas', category: G, react: '🗓️', ...A, run: ctx => { const a = ctx.group.settings.agendas || []; return ctx.reply(a.length ? `🗓️ *AGENDAMENTOS*\n\n${a.map(x => `🆔 \`${x.id}\` • ${x.time}\n📝 ${x.text}`).join('\n\n')}` : '🗓️ Nada agendado.'); } },
  { name: 'rmagenda', category: G, react: '🗑️', ...A, run: ctx => { set(ctx, s => { s.agendas = (s.agendas || []).filter(x => x.id !== ctx.args[0]); }); return ctx.reply('🗑️ Agendamento removido.'); } },
  {
    name: 'addresposta', category: G, react: '💬', ...A, run: ctx => {
      const [trig, resp] = ctx.q.split('|').map(s => s?.trim()); if (!trig || !resp) return ctx.reply('💬 *Uso:* /addresposta gatilho | resposta');
      set(ctx, s => { (s.autoreplies ||= {})[trig.toLowerCase()] = resp; }); return ctx.reply(`💬 Quando alguém disser *${trig}*, vou responder: _${resp}_`);
    },
  },
  { name: 'rmresposta', category: G, react: '🗑️', ...A, run: ctx => { set(ctx, s => { delete (s.autoreplies || {})[ctx.q.toLowerCase()]; }); return ctx.reply('🗑️ Resposta automática removida.'); } },
  { name: 'respostas', category: G, react: '💬', run: ctx => { const r = Object.entries(ctx.group.settings.autoreplies || {}); return ctx.reply(r.length ? `💬 *RESPOSTAS AUTOMÁTICAS*\n\n${r.map(([k, v]) => `• *${k}* → ${v}`).join('\n')}` : '💬 Nenhuma resposta automática.'); } },
  {
    name: 'enquete', category: G, react: '📊', run: ctx => {
      const [q, ...opts] = ctx.q.split('|').map(s => s.trim()).filter(Boolean);
      if (!q || opts.length < 2) return ctx.reply('📊 *Uso:* /enquete Pergunta | opção 1 | opção 2 | opção 3');
      return ctx.send({ poll: { name: q, values: opts.slice(0, 12), selectableCount: 1 } });
    },
  },
  { name: 'setautor', category: null, react: '✏️', ...A, run: ctx => { const [pack, author] = ctx.q.split('|').map(s => s?.trim()); set(ctx, s => { s.stickerPack = pack || null; s.stickerAuthor = author || null; }); return ctx.reply(`✏️ Figurinhas do grupo agora saem com pacote *${pack || config.botName}* e autor *${author || '(quem pediu)'}*.`); } },
];
