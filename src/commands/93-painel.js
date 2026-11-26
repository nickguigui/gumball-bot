// Painel visual no WhatsApp: /painel mostra tudo do grupo; /config <opcao> <valor> muda qualquer coisa.
// Mesmas opcoes do painel do site.
import { db } from '../db.js';
import { ANTI_TYPES } from '../middlewares.js';
import { VO_AVISO } from './45-viewonce.js';

const on = v => (v ? '✅' : '❌');
const lista = v => (Array.isArray(v) && v.length ? v.join(', ') : '—');
const BOOL = v => { v = (v || '').toLowerCase(); return ['on', 'sim', 'ligar', 'ligado', '1', 'true'].includes(v) ? true : ['off', 'nao', 'não', 'desligar', 'desligado', '0', 'false'].includes(v) ? false : null; };
const HM = v => (/^off|nao|não$/i.test(v || '') ? '' : /^([01]?\d|2[0-3]):[0-5]\d$/.test(v || '') ? v.padStart(5, '0') : null);
const csv = v => (v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);

// nome -> [secao, rotulo, leitor(g), escritor(g, valor) -> erro|undefined, ajuda]
const OP = {
  bot: ['Geral', 'Bot ligado', g => on(g.bot !== false), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.bot = b; }, 'on/off'],
  brincadeiras: ['Geral', 'Brincadeiras e jogos', g => on(!g.settings.noFun), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.noFun = !b; }, 'on/off'],
  boasvindas: ['Geral', 'Boas-vindas', g => on(g.settings.welcome), (g, v) => { const b = BOOL(v); if (b === null) { g.settings.welcome = true; g.settings.welcomeText = v; return; } g.settings.welcome = b; }, 'on/off ou o texto ({membro} {grupo})'],
  links: ['Geral', 'Apagar links', g => ({ off: 'não apagar', grupo: 'link de outro grupo', todos: 'qualquer link' })[g.settings.linkMode || (g.settings.antilink ? 'todos' : 'off')], (g, v) => { v = (v || '').toLowerCase(); if (!['off', 'grupo', 'todos'].includes(v)) return 'use off, grupo ou todos'; g.settings.linkMode = v; }, 'off | grupo | todos'],
  soadm: ['Quem usa', 'Só admins usam comandos', g => on(g.settings.soadm), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.soadm = b; }, 'on/off'],
  apagadas: ['Quem usa', 'Mostrar mensagens apagadas', g => on(g.settings.antiapagar), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.antiapagar = b; }, 'on/off'],
  editadas: ['Quem usa', 'Mostrar mensagens editadas', g => on(g.settings.antieditar), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.antieditar = b; }, 'on/off'],
  ver: ['Quem usa', 'Visualização única (/ver)', g => ({ off: 'restrito', optin: 'só quem liberar', optout: 'todos, menos quem bloquear' })[g.settings.viewOnceMode || 'optin'], (g, v) => { const m = { restrito: 'off', liberar: 'optin', todos: 'optout' }[(v || '').toLowerCase()]; if (!m) return 'use restrito, liberar ou todos'; g.__aviso = m === 'optout' && g.settings.viewOnceMode !== 'optout'; g.settings.viewOnceMode = m; }, 'restrito | liberar | todos'],
  autofig: ['Quem usa', 'Auto-figurinha', g => on(g.settings.autosticker), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.autosticker = b; }, 'on/off'],
  espera: ['Quem usa', 'Espera entre comandos', g => `${g.settings.tempocmd || 0}s`, (g, v) => { const n = parseInt(v); if (!(n >= 0 && n <= 300)) return 'use um número de 0 a 300'; g.settings.tempocmd = n; }, 'segundos'],
  saida: ['Entrada e saída', 'Aviso de saída', g => on(g.settings.bye), (g, v) => { const b = BOOL(v); if (b === null) { g.settings.bye = true; g.settings.byeText = v; return; } g.settings.bye = b; }, 'on/off ou o texto ({membro})'],
  captcha: ['Entrada e saída', 'Confirmar que não é robô', g => on(g.settings.captcha), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.captcha = b; }, 'on/off'],
  sobrasil: ['Entrada e saída', 'Só números do Brasil', g => on(g.settings.antifake), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.antifake = b; }, 'on/off'],
  paises: ['Entrada e saída', 'Outros países liberados', g => lista((g.settings.allowDDI || []).map(x => '+' + x)), (g, v) => { g.settings.allowDDI = csv(v).map(x => x.replace(/\D/g, '')).filter(Boolean); }, 'ex.: 351, 1'],
  regras: ['Entrada e saída', 'Regras do grupo', g => (g.settings.rules ? 'definidas' : '—'), (g, v) => { g.settings.rules = v; }, 'o texto das regras'],
  banirlink: ['Moderação', 'Remover quem mandar link', g => on(g.settings.banLinks), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.banLinks = b; }, 'on/off'],
  sites: ['Moderação', 'Sites liberados', g => lista(g.settings.allowLinks), (g, v) => { g.settings.allowLinks = csv(v); }, 'ex.: youtube.com, instagram.com'],
  palavrao: ['Moderação', 'Apagar palavrão', g => on(g.settings.antipalavra), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.antipalavra = b; }, 'on/off'],
  palavras: ['Moderação', 'Palavras proibidas', g => `${(g.settings.badwords || []).length} palavra(s)`, (g, v) => { g.settings.badwords = csv(v); }, 'palavra1, palavra2'],
  flood: ['Moderação', 'Barrar flood (7 msgs em 10 s)', g => on(g.settings.antiflood), (g, v) => { const b = BOOL(v); if (b === null) return 'use on/off'; g.settings.antiflood = b; }, 'on/off'],
  advertencias: ['Moderação', 'Advertências até sair', g => String(g.settings.maxadv || 3), (g, v) => { const n = parseInt(v); if (!(n >= 1 && n <= 10)) return 'use 1 a 10'; g.settings.maxadv = n; }, '1 a 10'],
  tipos: ['Moderação', 'Apagar tipos de mensagem', g => lista(g.settings.antiTypes), (g, v) => { const t = csv(v).map(x => x.normalize('NFD').replace(/[̀-ͯ]/g, '')); const bad = t.filter(x => !ANTI_TYPES[x] && x !== 'nenhum'); if (bad.length) return `tipos válidos: ${Object.keys(ANTI_TYPES).join(', ')}`; g.settings.antiTypes = t.filter(x => x !== 'nenhum'); }, Object.keys(ANTI_TYPES).join(', ') + ' ou nenhum'],
  abrir: ['Horários', 'Abrir todo dia às', g => g.settings.autoOpen || '—', (g, v) => { const h = HM(v); if (h === null) return 'use HH:MM ou off'; g.settings.autoOpen = h; }, 'HH:MM ou off'],
  fechar: ['Horários', 'Fechar todo dia às', g => g.settings.autoClose || '—', (g, v) => { const h = HM(v); if (h === null) return 'use HH:MM ou off'; g.settings.autoClose = h; }, 'HH:MM ou off'],
  pacote: ['Figurinhas', 'Nome do pacote', g => g.settings.stickerPack || '—', (g, v) => { g.settings.stickerPack = v; }, 'nome'],
  autor: ['Figurinhas', 'Autor', g => g.settings.stickerAuthor || '—', (g, v) => { g.settings.stickerAuthor = v; }, 'nome'],
};

export const commands = [
  {
    name: 'painel', aliases: ['configs'], category: null, react: '🎛️', admin: true, run: ctx => {
      const g = ctx.group; const secs = {};
      for (const [k, [sec, label, read]] of Object.entries(OP)) (secs[sec] ||= []).push(`${label}: *${read(g)}*  _(${k})_`);
      return ctx.reply(`🎛️ *PAINEL DO GRUPO*\n_${Object.keys(OP).length} opções. Mude com */config <opção> <valor>*._\n\n${Object.entries(secs).map(([s, l]) => `❖ *${s}*\n${l.map(x => `› ${x}`).join('\n')}`).join('\n\n')}\n\n💡 Ex.: */config links todos* • */config fechar 22:00* • */config ver liberar*\n🌐 Também dá pelo site, na aba Conectar / Painel.`);
    },
  },
  {
    name: 'config', category: null, react: '🎛️', admin: true, run: async ctx => {
      const [name, ...rest] = ctx.args; const k = (name || '').toLowerCase(); const op = OP[k];
      if (!op) return ctx.reply(`🎛️ *Uso:* /config <opção> <valor>\n\nOpções: ${Object.keys(OP).join(', ')}\n\n💡 Veja tudo com */painel*.`);
      const val = rest.join(' ').trim();
      if (!val) return ctx.reply(`🎛️ *${op[1]}*: *${op[2](ctx.group)}*\n\nPara mudar: */config ${k} <${op[4]}>*`);
      let erro, aviso = false;
      db.updateGroup(ctx.jid, g => { erro = op[3](g, val); aviso = g.__aviso; delete g.__aviso; });
      if (erro) return ctx.reply(`❌ ${op[1]}: ${erro}.`);
      if (aviso) await ctx.send({ text: VO_AVISO });
      return ctx.reply(`✅ *${op[1]}*: *${op[2](db.group(ctx.jid))}*`);
    },
  },
];
