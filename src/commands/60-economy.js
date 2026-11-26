// Economia: carteira, banco (1%/dia), cofre do grupo, trabalhos, loja, apostas.
import { db, levelOf, nextLevelXp, patente } from '../db.js';
import { money, brl, rand, pick, bar, shortDur, timeBR } from '../lib/text.js';
import { config } from '../config.js';
import * as C from '../data/content.js';

const CAT = '💰 ECONOMIA';
const H = 3600_000;

function cooldown(u, key, ms) {
  const left = (u.cooldowns[key] || 0) + ms - Date.now();
  return left > 0 ? left : 0;
}
function applyInterest(u) {
  const days = (Date.now() - (u.bankAt || Date.now())) / (24 * H);
  if (days >= 1 && u.bank > 0) {
    const gain = +(u.bank * (Math.pow(1.01, Math.floor(days)) - 1)).toFixed(2);
    u.bank = +(u.bank + gain).toFixed(2); u.bankAt = Date.now(); return gain;
  }
  if (!u.bankAt) u.bankAt = Date.now();
  return 0;
}
const toVault = (gjid, v) => db.updateGroup(gjid, g => { g.vault = +(g.vault + v).toFixed(2); });
function parseAmount(arg, max) {
  if (!arg) return NaN;
  if (/^(tudo|all|max)$/i.test(arg)) return max;
  const n = Number(String(arg).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.floor(n * 100) / 100 : NaN;
}
function lvlLine(u) { const l = levelOf(u.xp); const p = patente(l); return `${p[2]} ${p[3]} (Nível ${l})`; }
const useItem = (u, item) => { if (u.inventory[item] > 0) { u.inventory[item]--; if (!u.inventory[item]) delete u.inventory[item]; return true; } return false; };

export const commands = [
  {
    name: 'daily', category: CAT, react: '💰', run: async ctx => {
      const u = ctx.user; const left = cooldown(u, 'daily', 24 * H);
      if (left) return ctx.reply(`⏳ *Daily já coletado!*\n\n📅 Volte em *${shortDur(left)}*.`);
      const isAdm = await ctx.isAdmin();
      const lvl = levelOf(u.xp); const mult = +(1 + lvl * 0.05 + (isAdm ? 0.05 : 0)).toFixed(2);
      const base = 150, final = +(base * mult).toFixed(2), xp = rand(15, 30);
      u.wallet = +(u.wallet + final).toFixed(2); u.xp += xp; u.cooldowns.daily = Date.now(); u.name = ctx.pushName || u.name;
      db.saveUser(u);
      return ctx.reply(`💰 *DAILY COLETADO* 💰
_${isAdm ? 'A gerência recebeu o bônus de patrulha! 🔥' : 'Seu bônus diário caiu na conta! 🔥'}_

👤 *Usuário:* ${u.name || 'Usuário'}
🔰 *Cargo no Grupo:* ${isAdm ? 'Administração 🛡️' : 'Membro 👥'}
🎖️ *Patente de XP:* ${lvlLine(u)}

💵 *Bônus Base:* ${money(base)}
⚡ *Multiplicador de XP (x${mult}):* ${money(final)}
💰 *Recompensa Final:* +${money(final)}
✨ *Experiência:* +${xp} XP 🧪
━━━━━━━━━━━━━━━━━
💳 *Seu Novo Saldo:* ${money(u.wallet)}
📈 *XP Total:* ${u.xp} XP _(Próximo Nível: ${nextLevelXp(u.xp)} XP)_
🏢 *Cofre do Grupo:* ${money(ctx.group.vault)}

📅 _Próximo bônus disponível em 24 horas._`);
    },
  },
  {
    name: 'trabalhar', category: CAT, react: '💼', run: ctx => {
      const u = ctx.user; const left = cooldown(u, 'work', 2 * H);
      if (left) return ctx.reply(`😮‍💨 *Você está cansado!*\n\n⏰ Próximo turno em *${shortDur(left)}*.`);
      const [job, min, max, events] = pick(C.empregos);
      const lvl = levelOf(u.xp); const mult = +(1 + lvl * 0.1).toFixed(1);
      const base = rand(min, max), final = Math.round(base * mult), xp = rand(5, 12);
      u.wallet = +(u.wallet + final).toFixed(2); u.xp += xp; u.jobs++; u.cooldowns.work = Date.now();
      db.saveUser(u);
      return ctx.reply(`💼 *RELATÓRIO DE TRABALHO*

👤 *Trabalhador:* ${u.name || ctx.pushName || 'Usuário'}
🎖️ *Patente:* ${lvlLine(u)}
🛠️ *Cargo:* ${job}
💬 *Ocorrência:* _"${pick(events)}"_

💵 *Salário Base:* ${brl(base)}
⚡ *Bônus do Nível (x${mult}):* ${brl(final)}

💰 *Renda Final:* +${brl(final)}
✨ *Experiência Adquirida:* +${xp} XP 🧪
━━━━━━━━━━━━━━━━━
💳 *Novo Saldo:* R$ ${Math.round(u.wallet)}
📈 *XP Total:* ${u.xp} XP _(Próximo Nível: ${nextLevelXp(u.xp)} XP)_
📋 *Total de Turnos:* ${u.jobs}
⏰ *Próximo Turno:* às ${timeBR(new Date(Date.now() + 2 * H), config.timezone)}`);
    },
  },
  ...[['minerar', '⛏️', 'MINERAÇÃO', C.minerios, 'picareta', 'mine'], ['pescar', '🎣', 'PESCARIA', C.peixes, 'vara', 'fish']].map(([name, emoji, title, table, tool, key]) => ({
    name, category: CAT, react: emoji, run: ctx => {
      const u = ctx.user; const left = cooldown(u, key, 10 * 60_000);
      if (left) return ctx.reply(`${emoji} *Calma!* Você poderá ${name} de novo em *${shortDur(left)}*.`);
      const total = table.reduce((s, r) => s + r[2], 0); let r = Math.random() * total;
      const [item, value] = table.find(t => (r -= t[2]) < 0) || table[0];
      const boosted = useItem(u, tool); const gain = value * (boosted ? 2 : 1); const xp = value ? rand(3, 9) : 1;
      u.wallet += gain; u.xp += xp; u.cooldowns[key] = Date.now(); u.stats[key] = (u.stats[key] || 0) + 1;
      db.saveUser(u);
      return ctx.reply(`${emoji} *${title}*\n\n👤 ${ctx.tag(ctx.sender)}\n🎁 *Encontrou:* ${item}\n💵 *Valor:* +${money(gain)}${boosted ? ' _(x2 item)_' : ''}\n✨ *XP:* +${xp}\n━━━━━━━━━━━━━━━━━\n💳 *Saldo:* ${money(u.wallet)}\n⏰ _Volte em 10 minutos._`);
    },
  })),
  {
    name: 'banco', category: CAT, react: '🏛️', run: ctx => {
      const u = ctx.user; const gain = applyInterest(u); db.saveUser(u);
      return ctx.reply(`🏛️ *BANCO CENTRAL ${config.botName.toUpperCase()}* 🏛️
🏢 *Agência:* ${ctx.group ? (ctx.group.settings.name || 'Grupo') : 'Privado'}
👤 *Titular:* ${u.name || ctx.pushName || 'Usuário'}
═════════════════════
${gain ? `\n🎉 *RENDIMENTO APLICADO!*\n📈 Sua poupança rendeu *+${money(gain)}* (1% ao dia)!\n` : ''}
💳 *DEFINIÇÕES DE CONTA:*
👛 *Carteira (Em mãos):* ${money(u.wallet)}
🔒 *Banco (Poupança):* ${money(u.bank)}
📊 *Patrimônio Total:* ${money(u.wallet + u.bank)}

📈 *TAXA DE RENDIMENTO:*
• *Juros Fixo:* +1.0% ao dia (24h)
• *Proteção:* 100% Imune ao comando \`/roubar\`

💡 *COMO USAR:*
👉 \`/depositar <valor>\` ou \`/depositar tudo\`
👉 \`/retirar <valor>\` ou \`/retirar tudo\`

🤖 _${config.botName} Bot • Sistema de Economia Protegida_`);
    },
  },
  ...[['depositar', 'wallet', 'bank', '🏦', 'DEPÓSITO REALIZADO'], ['retirar', 'bank', 'wallet', '💸', 'SAQUE REALIZADO']].map(([name, from, to, emoji, title]) => ({
    name, category: CAT, react: emoji, run: ctx => {
      const u = ctx.user; applyInterest(u);
      const v = parseAmount(ctx.args[0], u[from]);
      if (!(v > 0)) return ctx.reply(`${emoji} *Uso:* /${name} <valor> ou /${name} tudo`);
      if (v > u[from]) return ctx.reply(`❌ *Saldo insuficiente!* Você tem ${money(u[from])} ${from === 'wallet' ? 'na carteira' : 'no banco'}.`);
      u[from] = +(u[from] - v).toFixed(2); u[to] = +(u[to] + v).toFixed(2); db.saveUser(u);
      return ctx.reply(`${emoji} *${title}*\n\n💵 *Valor:* ${money(v)}\n👛 *Carteira:* ${money(u.wallet)}\n🔒 *Banco:* ${money(u.bank)}`);
    },
  })),
  {
    name: 'perfil', category: CAT, react: '👑', run: async ctx => {
      const alvo = ctx.target(); const u = db.user(alvo); applyInterest(u); db.saveUser(u);
      const lvl = levelOf(u.xp); const p = patente(lvl); const next = nextLevelXp(u.xp); const prevBase = lvl === 1 ? 0 : next - 100;
      const pct = Math.round((u.xp - prevBase) / (next - prevBase) * 100);
      const all = db.allUsers().map(x => ({ jid: x.jid, t: x.wallet + x.bank })).sort((a, b) => b.t - a.t);
      const members = ctx.isGroup ? db.members(ctx.jid).map(m => m.jid) : [];
      const local = all.filter(x => members.includes(x.jid));
      const mem = ctx.isGroup ? db.member(ctx.jid, alvo) : { msgs: 0 };
      const text = `👤 *PAINEL DE PERFIL DO USUÁRIO*
        _Métricas cadastrais, evolução comportamental e saldo._

        🪪 *IDENTIFICAÇÃO*
        • *Nome:* ${u.name || 'Usuário_' + String(alvo).split('@')[0].slice(-4)}
        • *ID:* #${u.seq || '—'}
        • *Patente:* ${p[1]} _${p[2]}_

        🎖️ *EVOLUÇÃO & NÍVEL*
        • *Nível:* _${lvl}_
        • *XP:* _${u.xp} / ${next}_
        • *Progresso:* ${bar(pct)} _${pct}%_

        💰 *FINANÇAS & POSIÇÃO*
        • *Carteira:* _${brl(u.wallet)}_
        • *Banco (Poupança):* _${brl(u.bank)}_
        • *Patrimônio Total:* _${brl(u.wallet + u.bank)}_
        • *Rank Grupo:* _#${local.findIndex(x => x.jid === alvo) + 1 || '—'}_ │ *Global:* _#${all.findIndex(x => x.jid === alvo) + 1 || '—'}_

        📊 *ESTATÍSTICAS DE ATIVIDADE*
        • *Mensagens:* _${mem.msgs}_ (Grupo) │ _${u.msgs}_ (Global)
        • *Comandos:* _${u.cmds}_
        • *Trabalhos:* _${u.jobs}_
        • *Casado(a) com:* ${u.spouse ? ctx.tag(u.spouse) : '_ninguém_ 💔'}`;
      const url = await ctx.sock.profilePictureUrl(alvo, 'image').catch(() => null);
      const mentions = [alvo, u.spouse].filter(Boolean);
      if (url) return ctx.send({ image: { url }, caption: text, mentions }, { quoted: ctx.m });
      return ctx.reply(text, { mentions });
    },
  },
  {
    name: 'loja', category: CAT, react: '🛒', run: ctx => {
      const u = ctx.user;
      const items = C.loja.map(([id, nome, preco, desc]) => `🔹 *${nome}*\n   🏷️ \`/comprar ${id}\`\n   💰 *Valor:* ${brl(preco)}\n   💬 _${desc}_`).join('\n\n');
      return ctx.reply(`🛒 *LOJA DO BOT* 🛒\n═════════════════════\n\n👤 *Cliente:* ${ctx.tag(ctx.sender)}\n💵 *Seu Saldo:* ${brl(u.wallet)}\n⭐ *XP Total:* ${u.xp} XP\n\n═════════════════════\n\n📜 *CATÁLOGO DE ITENS*\n\n${items}`);
    },
  },
  {
    name: 'comprar', category: CAT, react: '🛍️', run: ctx => {
      const id = (ctx.args[0] || '').toLowerCase(); const qtd = Math.max(1, Math.min(50, parseInt(ctx.args[1]) || 1));
      const item = C.loja.find(i => i[0] === id);
      if (!item) return ctx.reply('🛍️ *Uso:* /comprar <item> [quantidade]\n\nVeja os itens em */loja*.');
      const u = ctx.user; const total = item[2] * qtd;
      if (u.wallet < total) return ctx.reply(`❌ *Saldo insuficiente!* Custa ${brl(total)} e você tem ${brl(u.wallet)}.`);
      if (id === 'alianca' && (u.inventory.alianca || u.spouse)) return ctx.reply('💍 Você já tem uma aliança (ou já é casado)!');
      u.wallet = +(u.wallet - total).toFixed(2);
      let extra = '';
      if (id === 'cartas') {
        const got = Array.from({ length: 3 * qtd }, () => pick(C.cartasColecao));
        for (const c of got) u.inventory['carta:' + c] = (u.inventory['carta:' + c] || 0) + 1;
        extra = `\n\n🃏 *Cartas obtidas:*\n${got.map(c => `• ${c}`).join('\n')}`;
      } else u.inventory[id] = (u.inventory[id] || 0) + (id === 'picareta' || id === 'vara' ? 10 * qtd : id === 'trevo' ? 5 * qtd : qtd);
      db.saveUser(u); toVault(ctx.jid, total * 0.1);
      return ctx.reply(`✅ *COMPRA REALIZADA!*\n\n📦 *Item:* ${item[1]} x${qtd}\n💸 *Pago:* ${brl(total)}\n💳 *Saldo:* ${brl(u.wallet)}${extra}`);
    },
  },
  {
    name: 'inventario', category: CAT, react: '🎒', run: ctx => {
      const u = ctx.user; const inv = Object.entries(u.inventory);
      if (!inv.length) return ctx.reply('🎒 *Seu inventário está vazio.*\n\nCompre itens na */loja*.');
      const names = Object.fromEntries(C.loja.map(i => [i[0], i[1]]));
      return ctx.reply(`🎒 *INVENTÁRIO DE* ${ctx.tag(ctx.sender)}\n\n${inv.map(([k, v]) => `• ${k.startsWith('carta:') ? '🃏 ' + k.slice(6) : names[k] || k} — *x${v}*`).join('\n')}`);
    },
  },
  {
    name: 'vender', category: CAT, react: '💱', run: ctx => {
      const u = ctx.user; const key = ctx.q.toLowerCase();
      if (!key) return ctx.reply('💱 *Uso:* /vender <item>  _(vende pela metade do preço; cartas valem R$ 60)_');
      const k = Object.keys(u.inventory).find(x => x.toLowerCase() === key || x.toLowerCase() === 'carta:' + key || x.toLowerCase().includes(key));
      if (!k) return ctx.reply('❌ Você não tem esse item.');
      const price = k.startsWith('carta:') ? 60 : (C.loja.find(i => i[0] === k)?.[2] || 0) / 2;
      useItem(u, k); u.wallet += price; db.saveUser(u);
      return ctx.reply(`💱 *VENDA CONCLUÍDA*\n\n📦 ${k.replace('carta:', '🃏 ')}\n💵 +${brl(price)}\n💳 *Saldo:* ${brl(u.wallet)}`);
    },
  },
  {
    name: 'raspadinha', category: CAT, react: '🎰', run: ctx => {
      const u = ctx.user; const left = cooldown(u, 'scratch', 12 * H);
      if (left) return ctx.reply(`⏱️ Você poderá comprar outra raspadinha em *${shortDur(left)}*.`);
      const cost = 50; if (u.wallet < cost) return ctx.reply(`❌ A raspadinha custa ${money(cost)}.`);
      const lucky = useItem(u, 'trevo');
      const sym = ['💎', '🍒', '7️⃣', '🍋', '⭐']; const r = [pick(sym), pick(sym), lucky ? null : pick(sym)]; if (lucky) r[2] = Math.random() < 0.5 ? r[0] : pick(sym);
      const prize = r[0] === r[1] && r[1] === r[2] ? (r[0] === '💎' ? 1000 : r[0] === '7️⃣' ? 700 : 300) : (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) ? rand(10, 80) : 0;
      u.wallet = +(u.wallet - cost + prize).toFixed(2); u.cooldowns.scratch = Date.now(); if (prize > cost) u.luck++; db.saveUser(u);
      const g = toVault(ctx.jid, cost - prize > 0 ? cost - prize : 0);
      const diff = prize - cost;
      return ctx.reply(`🎰 *RASPADINHA ADQUIRIDA!* 🎰\n\n🎟️ *Custo:* ${money(cost)}\n✨ *Raspando:* [  ${r[0]}  ]  [  ${r[1]}  ]  [  ${r[2]}  ]\n\n━━━━━━━━━━━━━━━━━━\n🎁 *Retorno:* ${money(prize)}\n📈 *Resultado:* ${diff >= 0 ? `Lucro de ${money(diff)}` : `Prejuízo de ${money(-diff)}`}\n━━━━━━━━━━━━━━━━━━\n\n👤 *Sua Carteira:* ${money(u.wallet)}\n🏢 *Cofre do Grupo:* ${money(g.vault)}\n\n⏱️ _Você poderá comprar outra em 12 horas!_`);
    },
  },
  {
    name: 'apostar', category: CAT, react: '🎲', run: ctx => {
      const u = ctx.user; const v = parseAmount(ctx.args[0], u.wallet);
      if (!(v >= 10)) return ctx.reply('🎲 *Uso:* /apostar <valor>  _(mínimo R$ 10)_\n\n45% de chance de dobrar!');
      if (v > u.wallet) return ctx.reply(`❌ Você só tem ${money(u.wallet)} na carteira.`);
      const win = Math.random() < (useItem(u, 'trevo') ? 0.55 : 0.45);
      u.wallet = +(u.wallet + (win ? v : -v)).toFixed(2); if (win) u.luck++; db.saveUser(u);
      if (!win) toVault(ctx.jid, v);
      return ctx.reply(win ? `🎉 *VOCÊ GANHOU!*\n\n💵 +${money(v)}\n💳 *Saldo:* ${money(u.wallet)}` : `💀 *PERDEU TUDO!*\n\n💸 -${money(v)} (foi pro cofre do grupo)\n💳 *Saldo:* ${money(u.wallet)}`);
    },
  },
  {
    name: 'roleta', category: CAT, react: '🎡', run: ctx => {
      const u = ctx.user; const v = parseAmount(ctx.args[0], u.wallet); const bet = (ctx.args[1] || '').toLowerCase();
      if (!(v >= 10) || !['vermelho', 'preto', 'verde'].includes(bet)) return ctx.reply('🎡 *Uso:* /roleta <valor> <vermelho|preto|verde>\n\n🔴⚫ pagam 2x • 🟢 paga 14x');
      if (v > u.wallet) return ctx.reply(`❌ Você só tem ${money(u.wallet)}.`);
      const n = rand(0, 36); const color = n === 0 ? 'verde' : n % 2 ? 'vermelho' : 'preto';
      const win = color === bet; const gain = win ? v * (bet === 'verde' ? 13 : 1) : -v;
      u.wallet = +(u.wallet + gain).toFixed(2); if (win) u.luck++; db.saveUser(u); if (!win) toVault(ctx.jid, v);
      const e = { vermelho: '🔴', preto: '⚫', verde: '🟢' };
      return ctx.reply(`🎡 *ROLETA*\n\n🎯 Caiu: *${n} ${e[color]}*\n${win ? `🎉 Você ganhou *${money(gain)}*!` : `💸 Perdeu ${money(v)}.`}\n💳 *Saldo:* ${money(u.wallet)}`);
    },
  },
  {
    name: 'pix', category: CAT, react: '💸', run: ctx => {
      const to = ctx.mentions[0] || ctx.quoted?.sender; const v = parseAmount(ctx.args.find(a => /^\d/.test(a)), 0);
      if (!to || !(v > 0)) return ctx.reply('💸 *Uso:* /pix @pessoa <valor>');
      if (to === ctx.sender) return ctx.reply('🤨 Mandar pix pra você mesmo?');
      const u = ctx.user; if (u.wallet < v) return ctx.reply(`❌ Saldo insuficiente (${money(u.wallet)}).`);
      u.wallet = +(u.wallet - v).toFixed(2); db.saveUser(u);
      db.updateUser(to, t => { t.wallet = +(t.wallet + v).toFixed(2); });
      return ctx.reply(`💸 *PIX ENVIADO!*\n\n📤 *De:* ${ctx.tag(ctx.sender)}\n📥 *Para:* ${ctx.tag(to)}\n💵 *Valor:* ${money(v)}\n🧾 _Comprovante #${Date.now().toString(36).toUpperCase()}_`, { mentions: [ctx.sender, to] });
    },
  },
  {
    name: 'roubar', category: CAT, react: '🥷', run: ctx => {
      const to = ctx.mentions[0] || ctx.quoted?.sender;
      if (!to || to === ctx.sender) return ctx.reply('🥷 *Uso:* /roubar @pessoa');
      const u = ctx.user; const left = cooldown(u, 'steal', H);
      if (left) return ctx.reply(`🚔 A polícia está de olho! Tente de novo em *${shortDur(left)}*.`);
      const v = db.user(to); u.cooldowns.steal = Date.now();
      if (v.wallet < 20) { db.saveUser(u); return ctx.reply(`😅 ${ctx.tag(to)} está liso, não tem nada na carteira.`, { mentions: [to] }); }
      if (useItem(v, 'escudo')) { db.saveUser(v); db.saveUser(u); return ctx.reply(`🛡️ ${ctx.tag(to)} tinha um *Escudo Anti-Roubo*! O roubo falhou.`, { mentions: [to] }); }
      if (Math.random() < 0.45) {
        const amt = +(v.wallet * rand(10, 35) / 100).toFixed(2);
        v.wallet = +(v.wallet - amt).toFixed(2); u.wallet = +(u.wallet + amt).toFixed(2); u.steals++;
        db.saveUser(v); db.saveUser(u);
        return ctx.reply(`🥷 *ROUBO BEM-SUCEDIDO!*\n\n${ctx.tag(ctx.sender)} levou *${money(amt)}* de ${ctx.tag(to)}! 💰\n\n💡 _Dica: dinheiro no /banco não pode ser roubado._`, { mentions: [ctx.sender, to] });
      }
      const fine = Math.min(u.wallet, 50); u.wallet = +(u.wallet - fine).toFixed(2); db.saveUser(u); toVault(ctx.jid, fine);
      return ctx.reply(`🚔 *PRESO!*\n\n${ctx.tag(ctx.sender)} tentou roubar ${ctx.tag(to)} e foi pego!\n💸 Multa: ${money(fine)}`, { mentions: [ctx.sender, to] });
    },
  },
  {
    name: 'resetarsaldo', category: CAT, react: '🔄', run: ctx => {
      if (ctx.args[0] !== 'confirmar') return ctx.reply('⚠️ *Isso zera sua carteira, banco, XP e inventário!*\n\nPara confirmar: */resetarsaldo confirmar*');
      db.updateUser(ctx.sender, u => { u.wallet = 0; u.bank = 0; u.xp = 0; u.inventory = {}; u.cooldowns = {}; });
      return ctx.reply('🔄 *Seu saldo foi resetado.* Recomeço é sempre uma chance nova! 💪');
    },
  },
];
export { applyInterest, cooldown };
