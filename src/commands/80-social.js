// Matrimonios, rankings globais/locais, amigo secreto, level.
import { db, levelOf } from '../db.js';
import { pick, money, dateBR } from '../lib/text.js';
import * as C from '../data/content.js';

const CAT = '💍 MATRIMÔNIOS', GL = '🌐 RANKINGS GLOBAIS', LO = '🏰 RANKINGS LOCAIS', EXT = '🎉 MAIS BRINCADEIRAS';
const proposals = new Map(); // jid alvo -> {from, gjid, at}

const GIFTS = { flores: ['💐', 'um lindo buquê de flores'], joia: ['💎', 'uma joia raríssima'], ursinho: ['🧸', 'um ursinho de pelúcia'], chocolate: ['🍫', 'uma caixa de chocolates'] };
const AFFECT = { beijar: ['💋', 'deu um beijo em'], abracar: ['🤗', 'deu um abraço apertado em'], brigar: ['🥊', 'começou uma briga com'] };

const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
function rankMsg(ctx, title, rows, fmt) {
  if (!rows.length) return ctx.reply(`${title}\n\n_Sem dados ainda._`);
  return ctx.reply(`${title}\n\n${rows.map((r, i) => `${medal(i)} ${ctx.tag(r.jid)} — ${fmt(r)}`).join('\n')}`, { mentions: rows.map(r => r.jid) });
}
const GLOBAL = {
  topxp: ['⭐ *TOP XP GLOBAL*', u => u.xp, u => `${u.xp} XP`],
  toplevel: ['🎖️ *TOP NÍVEL GLOBAL*', u => u.xp, u => `Nível ${levelOf(u.xp)}`],
  topmsg: ['💬 *TOP MENSAGENS GLOBAL*', u => u.msgs, u => `${u.msgs} msgs`],
  topladrao: ['🥷 *TOP LADRÕES GLOBAL*', u => u.steals, u => `${u.steals} roubos`],
  toprico: ['💰 *TOP RICOS GLOBAL*', u => u.wallet + u.bank, u => money(u.wallet + u.bank)],
  topbanco: ['🏦 *TOP BANCO GLOBAL*', u => u.bank, u => money(u.bank)],
  topsortudo: ['🍀 *TOP SORTUDOS GLOBAL*', u => u.luck, u => `${u.luck} vitórias de sorte`],
};
const LOCAL = {
  rankxp: ['⭐ *RANK XP DO GRUPO*', 'u', u => u.xp, u => `${u.xp} XP`],
  ranklevel: ['🎖️ *RANK NÍVEL DO GRUPO*', 'u', u => u.xp, u => `Nível ${levelOf(u.xp)}`],
  rankmsg: ['💬 *RANK MENSAGENS DO GRUPO*', 'm', m => m.msgs, m => `${m.msgs} msgs`],
  rank: ['🏰 *QUEM MAIS FALA NO GRUPO*', 'm', m => m.msgs, m => `${m.msgs} msgs`],
  rankafk: ['💤 *RANK AFK DO GRUPO*', 'm', m => -(m.lastSeen || 0), m => (m.lastSeen ? `visto em ${dateBR(new Date(m.lastSeen))}` : 'nunca visto')],
  rankladrao: ['🥷 *RANK LADRÕES DO GRUPO*', 'u', u => u.steals, u => `${u.steals} roubos`],
  rankbanco: ['🏦 *RANK BANCO DO GRUPO*', 'u', u => u.bank, u => money(u.bank)],
  ranksortudo: ['🍀 *RANK SORTUDOS DO GRUPO*', 'u', u => u.luck, u => `${u.luck} vitórias`],
  rankfeio: ['👹 *RANK FEIURA DO GRUPO*', 'f', m => m.fun.feio, m => `${m.fun.feio}%`, 'feio'],
  rankcalvo: ['👨‍🦲 *RANK CALVÍCIE DO GRUPO*', 'f', m => m.fun.calvo, m => `${m.fun.calvo}%`, 'calvo'],
  rankburro: ['🫏 *RANK BURRICE DO GRUPO*', 'f', m => m.fun.burro, m => `${m.fun.burro}%`, 'burro'],
  rankcorno: ['🦌 *RANK GALHADA DO GRUPO*', 'f', m => m.fun.corno, m => `${m.fun.corno}%`, 'corno'],
};

export const commands = [
  {
    name: 'casar', category: CAT, react: '💍', run: ctx => {
      const to = ctx.mentions[0] || ctx.quoted?.sender; const me = ctx.user;
      if (!to || to === ctx.sender) return ctx.reply('💍 *Uso:* /casar @pessoa  _(precisa de uma 💍 Aliança da /loja)_');
      if (me.spouse) return ctx.reply(`💍 Você já é casado(a) com ${ctx.tag(me.spouse)}! Use /divorciar antes.`, { mentions: [me.spouse] });
      if (!me.inventory.alianca) return ctx.reply('💍 Você precisa de uma *Aliança de Casamento*. Compre com */comprar alianca*.');
      if (db.user(to).spouse) return ctx.reply('💔 Essa pessoa já é casada!');
      proposals.set(to, { from: ctx.sender, gjid: ctx.jid, at: Date.now() });
      return ctx.reply(`💍 *PEDIDO DE CASAMENTO!*\n\n${ctx.tag(ctx.sender)} pediu ${ctx.tag(to)} em casamento! 😍\n\n${ctx.tag(to)}, responda com */aceito* ou */recuso* (5 minutos).`, { mentions: [ctx.sender, to] });
    },
  },
  {
    name: 'aceito', category: null, react: '💒', run: ctx => {
      const p = proposals.get(ctx.sender);
      if (!p || Date.now() - p.at > 5 * 60_000) return ctx.reply('Ninguém te pediu em casamento (ou o pedido expirou).');
      proposals.delete(ctx.sender);
      db.updateUser(p.from, u => { delete u.inventory.alianca; u.spouse = ctx.sender; u.marriedAt = Date.now(); });
      db.updateUser(ctx.sender, u => { u.spouse = p.from; u.marriedAt = Date.now(); });
      return ctx.reply(`💒 *CASAMENTO REALIZADO!* 🎉\n\n${ctx.tag(p.from)} 💞 ${ctx.tag(ctx.sender)}\n\n📅 ${dateBR()} • Felicidades ao casal!`, { mentions: [p.from, ctx.sender] });
    },
  },
  {
    name: 'recuso', category: null, react: '💔', run: ctx => {
      const p = proposals.get(ctx.sender); if (!p) return ctx.reply('Não há pedido pendente.');
      proposals.delete(ctx.sender);
      return ctx.reply(`💔 ${ctx.tag(ctx.sender)} recusou o pedido de ${ctx.tag(p.from)}... Força! 😢`, { mentions: [ctx.sender, p.from] });
    },
  },
  {
    name: 'divorciar', category: CAT, react: '📜', run: ctx => {
      const me = ctx.user; if (!me.spouse) return ctx.reply('Você não é casado(a). 🤷');
      const ex = me.spouse; const hasLawyer = me.inventory.advogado > 0;
      if (!hasLawyer && ctx.args[0] !== 'confirmar') return ctx.reply(`📜 Para divorciar de ${ctx.tag(ex)} sem advogado, os dois perdem 20% da carteira.\nConfirme com */divorciar confirmar* ou compre um *Advogado* na /loja.`, { mentions: [ex] });
      db.updateUser(ctx.sender, u => { if (hasLawyer) u.inventory.advogado--; else u.wallet *= 0.8; u.spouse = null; });
      db.updateUser(ex, u => { if (!hasLawyer) u.wallet *= 0.8; u.spouse = null; });
      return ctx.reply(`📜 *DIVÓRCIO CONCLUÍDO*\n\n${ctx.tag(ctx.sender)} e ${ctx.tag(ex)} não são mais casados. 💔${hasLawyer ? '\n💼 _O advogado resolveu tudo._' : ''}`, { mentions: [ctx.sender, ex] });
    },
  },
  {
    name: 'trair', category: CAT, react: '😈', run: ctx => {
      const me = ctx.user; const with_ = ctx.mentions[0];
      if (!me.spouse) return ctx.reply('Você nem é casado(a) pra trair... 🤨');
      if (!with_) return ctx.reply('😈 *Uso:* /trair @pessoa');
      const caught = Math.random() < 0.5;
      return ctx.reply(caught ? `🚨 *FLAGRANTE!*\n\n${ctx.tag(ctx.sender)} foi pego(a) traindo ${ctx.tag(me.spouse)} com ${ctx.tag(with_)}! 😱\n💡 _${ctx.tag(me.spouse)}, quer usar /divorciar?_` : `🤫 ${ctx.tag(ctx.sender)} traiu ${ctx.tag(me.spouse)} com ${ctx.tag(with_)}... e ninguém percebeu. Por enquanto. 👀`, { mentions: [ctx.sender, me.spouse, with_] });
    },
  },
  ...Object.entries(AFFECT).map(([name, [emoji, verb]]) => ({
    name, category: CAT, react: emoji, run: ctx => {
      const to = ctx.target(); if (to === ctx.sender) return ctx.reply(`${emoji} Marque alguém! Ex.: /${name} @pessoa`);
      return ctx.reply(`${emoji} ${ctx.tag(ctx.sender)} ${verb} ${ctx.tag(to)}!`, { mentions: [ctx.sender, to] });
    },
  })),
  ...Object.entries(GIFTS).map(([name, [emoji, desc]]) => ({
    name, category: CAT, react: emoji, run: ctx => {
      const to = ctx.target(); if (to === ctx.sender) return ctx.reply(`${emoji} Marque quem vai receber! Ex.: /${name} @pessoa`);
      const me = ctx.user; if (!me.inventory[name]) return ctx.reply(`${emoji} Você não tem esse presente. Compre com */comprar ${name}*.`);
      me.inventory[name]--; if (!me.inventory[name]) delete me.inventory[name]; db.saveUser(me);
      db.updateUser(to, u => { u.stats.gifts = (u.stats.gifts || 0) + 1; });
      return ctx.reply(`${emoji} *PRESENTE!*\n\n${ctx.tag(ctx.sender)} deu ${desc} para ${ctx.tag(to)}! 🥰`, { mentions: [ctx.sender, to] });
    },
  })),
  {
    name: 'casais', category: EXT, react: '💞', run: async ctx => {
      const ids = new Set((await ctx.meta()).participants.map(p => p.id));
      const seen = new Set(); const pairs = [];
      for (const u of db.allUsers()) if (u.spouse && ids.has(u.jid) && !seen.has(u.jid)) { seen.add(u.jid); seen.add(u.spouse); pairs.push([u.jid, u.spouse, u.marriedAt]); }
      if (!pairs.length) return ctx.reply('💞 Nenhum casal no grupo ainda. Use */casar*!');
      return ctx.reply(`💞 *CASAIS DO GRUPO*\n\n${pairs.map(([a, b, t]) => `💍 ${ctx.tag(a)} + ${ctx.tag(b)}${t ? ` _(desde ${dateBR(new Date(t))})_` : ''}`).join('\n')}`, { mentions: pairs.flat().filter(x => typeof x === 'string') });
    },
  },
  {
    name: 'topcasal', category: GL, react: '💑', run: ctx => {
      const pairs = db.allUsers().filter(u => u.spouse && u.marriedAt && u.jid < u.spouse).sort((a, b) => a.marriedAt - b.marriedAt).slice(0, 10);
      if (!pairs.length) return ctx.reply('💑 Nenhum casal ainda.');
      return ctx.reply(`💑 *CASAIS MAIS DURADOUROS*\n\n${pairs.map((u, i) => `${medal(i)} ${ctx.tag(u.jid)} + ${ctx.tag(u.spouse)} — ${Math.floor((Date.now() - u.marriedAt) / 864e5)} dias`).join('\n')}`, { mentions: pairs.flatMap(u => [u.jid, u.spouse]) });
    },
  },
  {
    name: 'rankcasal', category: LO, react: '💑', run: async ctx => {
      const ids = new Set((await ctx.meta()).participants.map(p => p.id));
      const pairs = db.allUsers().filter(u => u.spouse && u.marriedAt && ids.has(u.jid) && u.jid < u.spouse).sort((a, b) => a.marriedAt - b.marriedAt).slice(0, 10);
      if (!pairs.length) return ctx.reply('💑 Nenhum casal no grupo.');
      return ctx.reply(`💑 *CASAIS DO GRUPO*\n\n${pairs.map((u, i) => `${medal(i)} ${ctx.tag(u.jid)} + ${ctx.tag(u.spouse)}`).join('\n')}`, { mentions: pairs.flatMap(u => [u.jid, u.spouse]) });
    },
  },
  ...Object.entries(GLOBAL).map(([name, [title, key, fmt]]) => ({
    name, category: GL, react: '🌐', run: ctx => rankMsg(ctx, title, db.allUsers().filter(u => key(u) > 0).sort((a, b) => key(b) - key(a)).slice(0, 10), fmt),
  })),
  ...Object.entries(LOCAL).map(([name, [title, src, key, fmt, metric]]) => ({
    name, category: LO, react: '🏰', run: async ctx => {
      const memberIds = (await ctx.meta()).participants.map(p => p.id);
      let rows;
      if (src === 'u') rows = memberIds.map(j => ({ ...db.user(j), jid: j }));
      else rows = db.members(ctx.jid).filter(m => memberIds.includes(m.jid));
      if (src === 'f') rows = rows.filter(m => m.fun[metric] != null);
      rows = rows.filter(r => key(r) || key(r) === 0 && src === 'f').sort((a, b) => key(b) - key(a)).slice(0, 10);
      return rankMsg(ctx, title, rows, fmt);
    },
  })),
  {
    name: 'level', category: EXT, react: '📈', run: ctx => {
      const u = ctx.user; const l = levelOf(u.xp);
      return ctx.reply(`📈 *SEU NÍVEL*\n\n👤 ${ctx.tag(ctx.sender)}\n🎖️ Nível *${l}* • ⭐ ${u.xp} XP\n💬 ${db.member(ctx.jid, ctx.sender).msgs} mensagens no grupo`);
    },
  },
  // Amigo secreto
  {
    name: 'amigosecreto', category: EXT, react: '🎁', admin: false, run: async ctx => {
      const g = ctx.group; const as = g.settings.amigo || { open: false, list: [], pairs: null };
      if (ctx.args[0] === 'sortear') {
        if (!(await ctx.isAdmin()) && !ctx.isOwner()) return ctx.reply('🛡️ Só admins podem sortear.');
        if (as.list.length < 3) return ctx.reply('🎁 Precisa de pelo menos 3 participantes.');
        const sh = [...as.list].sort(() => Math.random() - 0.5); const pairs = {};
        sh.forEach((j, i) => { pairs[j] = sh[(i + 1) % sh.length]; });
        as.pairs = pairs; as.open = false; db.updateGroup(ctx.jid, gr => { gr.settings.amigo = as; });
        for (const [j, t] of Object.entries(pairs)) await ctx.sendTo(j, { text: `🎁 *AMIGO SECRETO*\n\nVocê tirou: *@${t.split('@')[0]}* 🤫`, mentions: [t] }).catch(() => {});
        return ctx.reply('🎁 *Sorteio feito!* Cada um recebeu no privado quem tirou. Use */meuamigo* para rever.');
      }
      as.open = true; as.list = as.list || []; as.pairs = null; db.updateGroup(ctx.jid, gr => { gr.settings.amigo = as; });
      return ctx.reply('🎁 *AMIGO SECRETO ABERTO!*\n\n✋ Entre com */participar*\n🚪 Saia com */sairamigo*\n🎲 Admin sorteia com */amigosecreto sortear*');
    },
  },
  {
    name: 'participar', category: EXT, react: '✋', run: ctx => {
      const as = ctx.group.settings.amigo; if (!as?.open) return ctx.reply('🎁 Não há amigo secreto aberto. Admin abre com */amigosecreto*.');
      if (as.list.includes(ctx.sender)) return ctx.reply('Você já está participando! ✅');
      db.updateGroup(ctx.jid, gr => { gr.settings.amigo.list.push(ctx.sender); });
      return ctx.reply(`✋ ${ctx.tag(ctx.sender)} entrou no amigo secreto! (${as.list.length + 1} participantes)`);
    },
  },
  {
    name: 'sairamigo', category: EXT, react: '🚪', run: ctx => {
      const as = ctx.group.settings.amigo; if (!as?.open) return ctx.reply('Não dá pra sair depois do sorteio.');
      db.updateGroup(ctx.jid, gr => { gr.settings.amigo.list = gr.settings.amigo.list.filter(j => j !== ctx.sender); });
      return ctx.reply('🚪 Você saiu do amigo secreto.');
    },
  },
  {
    name: 'meuamigo', category: EXT, react: '🤫', run: async ctx => {
      const t = ctx.group.settings.amigo?.pairs?.[ctx.sender];
      if (!t) return ctx.reply('Você não tem amigo secreto sorteado neste grupo.');
      await ctx.sendTo(ctx.sender, { text: `🤫 Seu amigo secreto é *@${t.split('@')[0]}*`, mentions: [t] });
      return ctx.reply('📩 Te mandei no privado!');
    },
  },
];
