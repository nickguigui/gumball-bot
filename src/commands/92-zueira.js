// Comandos do ZueiraBot que faltavam.
import { db } from '../db.js';
import { config } from '../config.js';
import { METRICS } from './70-fun.js';
import { ANTI_TYPES } from '../middlewares.js';

const A = { admin: true };
const SITE = 'https://nickguigui.github.io/gumball-bot/';
const set = (ctx, fn) => db.updateGroup(ctx.jid, g => { fn(g.settings, g); });
const toggle = (ctx, key, label, extra = '') => {
  const a = (ctx.args[0] || '').toLowerCase(); const cur = !!ctx.group.settings[key];
  const v = a === 'on' ? true : a === 'off' ? false : !cur; set(ctx, s => { s[key] = v; });
  return ctx.reply(`${v ? '✅' : '❌'} *${label}* ${v ? 'ligado' : 'desligado'} neste grupo.${v && extra ? `\n\n${extra}` : ''}`);
};

export const commands = [
  { name: 'medidores', category: '🎉 MAIS BRINCADEIRAS', react: '📏', run: ctx => ctx.reply(`📏 *MEDIDORES*\n\n${Object.entries(METRICS).map(([k, [e, t]]) => `${e} */${k}* — ${t.replace(/^MÉTRICA (DE )?/, '').toLowerCase()}`).join('\n')}\n\n💡 _Use com @pessoa ou respondendo alguém._`) },
  { name: 'interacoes', category: '🎉 MAIS BRINCADEIRAS', react: '🤗', run: ctx => ctx.reply('🤗 *INTERAÇÕES*\n\n💋 /beijar @ • 🤗 /abracar @ • 🥊 /brigar @ • 👋 /tapa @\n💐 /flores @ • 💎 /joia @ • 🧸 /ursinho @ • 🍫 /chocolate @\n🪄 /magia @ • 🧊 /congelar @ • 🔥 /queimar @ • ⚡ /eletrocutar @\n👻 /assombrar @ • 💻 /hackear @ • 🧬 /clonar @ • 🌌 /teletransportar @') },
  { name: 'antiapagar', category: '🛡️ SEGURANÇA & ANTIS', react: '🗑️', ...A, run: ctx => toggle(ctx, 'antiapagar', 'Mostrar mensagens apagadas', 'Quando alguém apagar uma mensagem, eu mando de novo aqui.') },
  { name: 'antieditar', category: '🛡️ SEGURANÇA & ANTIS', react: '✏️', ...A, run: ctx => toggle(ctx, 'antieditar', 'Mostrar mensagens editadas', 'Quando alguém editar, eu mostro como era antes.') },
  {
    name: 'anti', category: '🛡️ SEGURANÇA & ANTIS', react: '🧹', ...A, botAdmin: true, run: ctx => {
      const t = (ctx.args[0] || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const key = Object.keys(ANTI_TYPES).find(k => k.startsWith(t) || (t === 'visualizacao' && k === 'unica'));
      const on = ctx.group.settings.antiTypes || [];
      if (!key) return ctx.reply(`🧹 *Uso:* /anti <tipo> [on|off]\n\nTipos: ${Object.keys(ANTI_TYPES).join(', ')}\n\nLigados aqui: ${on.join(', ') || 'nenhum'}`);
      const want = ctx.args[1] ? ctx.args[1].toLowerCase() === 'on' : !on.includes(key);
      set(ctx, s => { s.antiTypes = want ? [...new Set([...(s.antiTypes || []), key])] : (s.antiTypes || []).filter(x => x !== key); });
      return ctx.reply(`${want ? '✅' : '❌'} Apagar *${key}* ${want ? 'ligado' : 'desligado'} (não vale para admins).`);
    },
  },
  { name: 'addpalavra', category: null, react: '🤬', ...A, run: ctx => { const w = ctx.q.split(',').map(x => x.trim().toLowerCase()).filter(Boolean); if (!w.length) return ctx.reply('🤬 *Uso:* /addpalavra palavra1, palavra2'); set(ctx, s => { s.badwords = [...new Set([...(s.badwords || []), ...w])]; s.antipalavra = true; }); return ctx.reply(`🤬 Proibidas agora: ${w.join(', ')}`); } },
  { name: 'rmpalavra', category: null, react: '✅', ...A, run: ctx => { const w = ctx.q.split(',').map(x => x.trim().toLowerCase()).filter(Boolean); set(ctx, s => { s.badwords = (s.badwords || []).filter(x => !w.includes(x)); }); return ctx.reply(`✅ Liberadas: ${w.join(', ') || 'nada'}`); } },
  { name: 'permddi', category: null, react: '🌍', ...A, run: ctx => { const d = ctx.args.map(x => x.replace(/\D/g, '')).filter(Boolean); if (!d.length) return ctx.reply(`🌍 Países liberados no "só Brasil": ${(ctx.group.settings.allowDDI || []).join(', ') || 'nenhum'}\n\n*/permddi 351 1* (Portugal e EUA)`); set(ctx, s => { s.allowDDI = [...new Set([...(s.allowDDI || []), ...d])]; }); return ctx.reply(`🌍 Liberados: ${d.map(x => '+' + x).join(', ')}`); } },
  { name: 'bots', category: 'ℹ️ INFO', react: '🤖', run: ctx => ctx.reply(`🤖 *BOTS NESTE GRUPO*\n\n• *${config.botName}* (este número) — ${ctx.group.bot === false ? 'desligado 😴' : 'ligado ✅'}\n\n💡 _Se houver mais de um bot no mesmo número, desligue um deles no painel para não responderem em dobro._`) },
  { name: 'botprincipal', category: null, react: '👑', ...A, run: ctx => ctx.reply(`👑 Este número usa só o *${config.botName}*. Para escolher qual bot responde aqui, ligue/desligue cada um com */bot on* e */bot off* ou pelo painel:\n${SITE}#conectar`) },
  { name: 'suporte', category: 'ℹ️ INFO', react: '🆘', run: ctx => ctx.reply(`🆘 *SUPORTE*\n\nDúvidas ou problemas? Fale com o *${config.ownerName}*${config.owners[0] ? `: wa.me/${config.owners[0]}` : ''}\n🌐 ${SITE}`) },
  { name: 'conectar', aliases: ['meubot'], category: 'ℹ️ INFO', react: '🔗', run: ctx => ctx.reply(`🔗 *QUER O ${config.botName.toUpperCase()} NO SEU NÚMERO?*\n\nÉ grátis: abra o site, digite seu número e o código no WhatsApp.\n👉 ${SITE}#conectar`) },
];
