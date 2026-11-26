// Jogos com estado por grupo (respostas sempre com prefixo, como no Zenitsu).
import { db } from '../db.js';
import { pick, rand, normalize, money } from '../lib/text.js';
import { config } from '../config.js';
import * as C from '../data/content.js';

const CAT = '🎮 JOGOS', EXT = '🧰 MAIS UTILIDADES';
const games = new Map(); // gjid -> {type, ...}
const cooldowns = new Map(); // gjid:type -> ts
const timers = new Map();

function startGame(ctx, type, state, ms, onTimeout) {
  games.set(ctx.jid, { type, ...state, startedAt: Date.now() });
  clearTimeout(timers.get(ctx.jid));
  timers.set(ctx.jid, setTimeout(() => {
    const g = games.get(ctx.jid);
    if (g && g.type === type && g.startedAt === games.get(ctx.jid).startedAt) { games.delete(ctx.jid); onTimeout?.(g); }
  }, ms));
}
function endGame(jid) { games.delete(jid); clearTimeout(timers.get(jid)); }
function reward(ctx, who, min, max, xpMin, xpMax, label) {
  const prize = rand(min, max), xp = rand(xpMin, xpMax);
  const u = db.updateUser(who, u => { u.wallet += prize; u.xp += xp; u.stats.games = (u.stats.games || 0) + 1; return u; });
  db.updateMember(ctx.jid, who, m => { m.fun.wins = (m.fun.wins || 0) + 1; });
  return { prize, xp, u };
}
const shuffle = w => { let s; do { s = [...w.replace(/-/g, '')].sort(() => Math.random() - 0.5).join(''); } while (s === w.replace(/-/g, '') && w.length > 2); return s.toUpperCase(); };
const busy = (ctx, g) => ctx.reply(`⚠️ Já existe um jogo de *${g.type}* rolando neste grupo! Termine ou use */parar*.`);

export const commands = [
  {
    name: 'anagrama', category: CAT, react: '🔤', run: ctx => {
      const g = games.get(ctx.jid);
      if (ctx.q) {
        if (!g || g.type !== 'anagrama') return ctx.reply('❌ Não há anagrama ativo. Digite */anagrama* para começar!');
        if (normalize(ctx.q).replace(/[\s-]/g, '') !== normalize(g.word).replace(/-/g, '')) return ctx.reply(`❌ *Resposta Incorreta!* A palavra não é *${ctx.q}*. Tente novamente!`);
        endGame(ctx.jid); cooldowns.set(ctx.jid + ':anagrama', Date.now());
        const { prize, xp, u } = reward(ctx, ctx.sender, 50, 120, 8, 20);
        return ctx.reply(`🎉 *PARABÉNS ${ctx.tag(ctx.sender)}! VOCÊ ACERTOU!* 🎉\n\n✨ *Palavra Correta:* ${g.word.toUpperCase()}\n💰 *Prêmio:* +R$ ${prize.toFixed(2)}\n⭐ *XP Ganhado:* +${xp} XP\n\n💳 *Seu Saldo Atual:* R$ ${u.wallet.toFixed(2)}\n📈 *Seu XP Total:* ${u.xp} XP\n\n⏳ *Próxima partida disponível em 5 minutos!*`);
      }
      if (g) return g.type === 'anagrama' ? ctx.reply(`🔤 Anagrama em andamento: *\`${g.scrambled}\`*\n💡 ${g.hint}`) : busy(ctx, g);
      const cd = (cooldowns.get(ctx.jid + ':anagrama') || 0) + 5 * 60_000 - Date.now();
      if (cd > 0) return ctx.reply(`⏳ Próxima partida disponível em *${Math.ceil(cd / 60000)} minuto(s)*.`);
      const [word, hint] = pick(C.anagramas); const scrambled = shuffle(word);
      startGame(ctx, 'anagrama', { word, hint, scrambled }, 10 * 60_000, () => ctx.send({ text: `⏰ *Tempo esgotado!* A palavra era *${word.toUpperCase()}*.` }));
      return ctx.reply(`🔤 *NOVO ANAGRAMA INICIADO!* 🔤\n\nDescubra a palavra embaralhada abaixo:\n\n👉 *\`${scrambled}\`*\n\n💡 *Dica:* ${hint}\n🎁 *Prêmio:* XP + Saldo\n⏳ *Tempo Limite:* 10 minutos\n\n📌 *Como Jogar:*\n• Digite: */anagrama [sua resposta]*\n• Se precisar de ajuda, digite: */dica*`);
    },
  },
  {
    name: 'dica', category: null, react: '💡', run: ctx => {
      const g = games.get(ctx.jid);
      if (!g) return ctx.reply('❌ Não há nenhum jogo ativo agora.');
      if (g.type === 'anagrama') { const w = g.word.replace(/-/g, ''); return ctx.reply(`💡 *DICA EXTRA DO ANAGRAMA*\n\n• *Dica Principal:* ${g.hint}\n• *Tamanho:* ${w.length} letras\n• *Primeira letra:* ${w[0].toUpperCase()}\n• *Última letra:* ${w.at(-1).toUpperCase()}\n\n🔤 *Embaralhada:* \`${g.scrambled}\``); }
      if (g.type === 'forca') return ctx.reply(`💡 A palavra tem *${g.word.length}* letras e começa com *${g.word[0].toUpperCase()}*.`);
      if (g.type === 'charada') return ctx.reply(`💡 A resposta tem *${g.answer.length}* letras.`);
      return ctx.reply('💡 Esse jogo não tem dica. Boa sorte!');
    },
  },
  {
    name: 'quiz', category: CAT, react: '❓', run: ctx => {
      const g = games.get(ctx.jid);
      if (ctx.q) {
        if (!g || g.type !== 'quiz') return ctx.reply('❌ Não há quiz ativo. Digite */quiz*.');
        const ans = ctx.q.trim().toUpperCase(); const idx = 'ABCD'.indexOf(ans[0]);
        const right = idx === g.correct || normalize(ctx.q) === normalize(g.options[g.correct]);
        if (g.answered.includes(ctx.sender)) return ctx.reply('⛔ Você já respondeu esta pergunta!');
        g.answered.push(ctx.sender);
        if (!right) return ctx.reply('❌ *Errou!* Só uma tentativa por pessoa.');
        endGame(ctx.jid);
        const { prize, xp } = reward(ctx, ctx.sender, 40, 90, 6, 15);
        return ctx.reply(`✅ *${ctx.tag(ctx.sender)} ACERTOU!*\n\n🎯 Resposta: *${'ABCD'[g.correct]}) ${g.options[g.correct]}*\n💰 +R$ ${prize} • ⭐ +${xp} XP`);
      }
      if (g) return busy(ctx, g);
      const [q, options, correct] = pick(C.quiz);
      startGame(ctx, 'quiz', { options, correct, answered: [] }, 60_000, () => ctx.send({ text: `⏰ *Tempo do quiz acabou!* Resposta: *${'ABCD'[correct]}) ${options[correct]}*` }));
      return ctx.reply(`❓ *QUIZ VALENDO PRÊMIO!*\n\n📝 ${q}\n\n${options.map((o, i) => `*${'ABCD'[i]})* ${o}`).join('\n')}\n\n⏳ 60 segundos • Responda: */quiz A*`);
    },
  },
  {
    name: 'jogodaforca', aliases: ['hangman'], category: CAT, react: '🪢', run: ctx => {
      let g = games.get(ctx.jid);
      const draw = g2 => { const stages = ['😀', '😐', '😟', '😨', '😰', '😵', '💀']; return `${stages[g2.errors]} *FORCA* (${g2.errors}/6 erros)\n\n\`${[...g2.word].map(c => (g2.guessed.includes(c) ? c.toUpperCase() : '_')).join(' ')}\`\n\n🔤 Usadas: ${g2.guessed.join(', ').toUpperCase() || '—'}`; };
      if (ctx.q) {
        if (!g || g.type !== 'forca') return ctx.reply('❌ Não há forca ativa. Digite */jogodaforca*.');
        const guess = normalize(ctx.q);
        if (guess.length > 1) {
          if (guess === g.word) { endGame(ctx.jid); const { prize, xp } = reward(ctx, ctx.sender, 60, 140, 10, 25); return ctx.reply(`🎉 ${ctx.tag(ctx.sender)} acertou a palavra *${g.word.toUpperCase()}*!\n💰 +R$ ${prize} • ⭐ +${xp} XP`); }
          g.errors++;
        } else if (!g.guessed.includes(guess)) { g.guessed.push(guess); if (!g.word.includes(guess)) g.errors++; }
        if ([...g.word].every(c => g.guessed.includes(c))) { endGame(ctx.jid); const { prize, xp } = reward(ctx, ctx.sender, 50, 110, 8, 20); return ctx.reply(`🎉 *Palavra completa:* ${g.word.toUpperCase()}\n🏆 ${ctx.tag(ctx.sender)} levou +R$ ${prize} e +${xp} XP!`); }
        if (g.errors >= 6) { endGame(ctx.jid); return ctx.reply(`💀 *ENFORCADO!* A palavra era *${g.word.toUpperCase()}*.`); }
        return ctx.reply(draw(g));
      }
      if (g) return busy(ctx, g);
      g = { word: normalize(pick(C.forcaPalavras)), guessed: [], errors: 0 };
      startGame(ctx, 'forca', g, 10 * 60_000, () => ctx.send({ text: `⏰ Forca encerrada. A palavra era *${g.word.toUpperCase()}*.` }));
      return ctx.reply(`${draw(games.get(ctx.jid))}\n\n📌 Chute uma letra: */jogodaforca a* ou a palavra inteira.`);
    },
  },
  {
    name: 'velha', category: CAT, react: '⭕', run: ctx => {
      let g = games.get(ctx.jid);
      const show = b => [0, 3, 6].map(i => b.slice(i, i + 3).map((c, j) => c || ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][i + j]).join('')).join('\n');
      const win = b => [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]].some(([a, b2, c]) => b[a] && b[a] === b[b2] && b[a] === b[c]);
      const n = parseInt(ctx.args[0]);
      if (g?.type === 'velha' && n >= 1 && n <= 9) {
        const turn = g.players[g.turn];
        if (ctx.sender !== turn) return ctx.reply(`⏳ É a vez de ${ctx.tag(turn)}!`, { mentions: [turn] });
        if (g.board[n - 1]) return ctx.reply('❌ Essa casa já está ocupada.');
        g.board[n - 1] = g.turn ? '⭕' : '❌';
        if (win(g.board)) { endGame(ctx.jid); const { prize } = reward(ctx, ctx.sender, 40, 80, 5, 12); return ctx.reply(`${show(g.board)}\n\n🏆 ${ctx.tag(ctx.sender)} *venceu!* (+R$ ${prize})`); }
        if (g.board.every(Boolean)) { endGame(ctx.jid); return ctx.reply(`${show(g.board)}\n\n🤝 *Deu velha!* Empate.`); }
        g.turn ^= 1;
        return ctx.reply(`${show(g.board)}\n\n👉 Vez de ${ctx.tag(g.players[g.turn])} (*/velha 1-9*)`, { mentions: [g.players[g.turn]] });
      }
      if (g) return busy(ctx, g);
      const op = ctx.mentions[0];
      if (!op || op === ctx.sender) return ctx.reply('⭕ *Uso:* /velha @adversário');
      startGame(ctx, 'velha', { players: [ctx.sender, op], turn: 0, board: Array(9).fill(null) }, 10 * 60_000);
      return ctx.reply(`❌⭕ *JOGO DA VELHA*\n\n${ctx.tag(ctx.sender)} (❌) vs ${ctx.tag(op)} (⭕)\n\n${show(Array(9).fill(null))}\n\n👉 ${ctx.tag(ctx.sender)} começa: */velha 1-9*`, { mentions: [ctx.sender, op] });
    },
  },
  {
    name: 'bandeira', category: CAT, react: '🏳️', run: ctx => {
      const g = games.get(ctx.jid);
      if (ctx.q) {
        if (!g || g.type !== 'bandeira') return ctx.reply('❌ Nenhuma bandeira ativa. Digite */bandeira*.');
        if (normalize(ctx.q) !== g.country) return ctx.reply('❌ Não é esse país! Tente de novo.');
        endGame(ctx.jid); const { prize, xp } = reward(ctx, ctx.sender, 30, 70, 5, 12);
        return ctx.reply(`🎉 ${ctx.tag(ctx.sender)} acertou: *${g.country.toUpperCase()}*! 💰 +R$ ${prize} • ⭐ +${xp} XP`);
      }
      if (g) return busy(ctx, g);
      const [flag, country] = pick(C.bandeiras);
      startGame(ctx, 'bandeira', { country }, 60_000, () => ctx.send({ text: `⏰ Era *${country.toUpperCase()}* ${flag}` }));
      return ctx.reply(`🏳️ *QUAL É O PAÍS?*\n\n${flag}\n\n⏳ 60 segundos • Responda: */bandeira <país>*`);
    },
  },
  {
    name: 'matematica', category: CAT, react: '🧮', run: ctx => {
      const g = games.get(ctx.jid);
      if (ctx.q) {
        if (!g || g.type !== 'matematica') return ctx.reply('❌ Nenhuma conta ativa. Digite */matematica*.');
        if (Number(ctx.q.replace(',', '.')) !== g.answer) return ctx.reply('❌ Errado! Calcula de novo.');
        endGame(ctx.jid); const { prize, xp } = reward(ctx, ctx.sender, 25, 60, 5, 10);
        return ctx.reply(`⚡ ${ctx.tag(ctx.sender)} foi o mais rápido! *${g.answer}* ✅\n💰 +R$ ${prize} • ⭐ +${xp} XP`);
      }
      if (g) return busy(ctx, g);
      const a = rand(2, 50), b = rand(2, 30), op = pick(['+', '-', '×']); const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
      startGame(ctx, 'matematica', { answer }, 45_000, () => ctx.send({ text: `⏰ Ninguém acertou! Era *${answer}*.` }));
      return ctx.reply(`🧮 *CONTA RÁPIDA!*\n\nQuanto é *${a} ${op} ${b}*?\n\n⏳ 45 s • Responda: */matematica <número>*`);
    },
  },
  {
    name: 'adedonha', category: CAT, react: '🅰️', run: ctx => {
      const letra = pick([...'ABCDEFGHIJLMNOPRSTUV']); const temas = [...C.adedonhaTemas].sort(() => Math.random() - 0.5).slice(0, 3);
      setTimeout(() => ctx.send({ text: `⏰ *TEMPO!* Acabou a adedonha da letra *${letra}*. Conferem aí quem acertou! 👀` }), 60_000);
      return ctx.reply(`🅰️ *ADEDONHA!*\n\n🔤 *Letra:* ${letra}\n📋 *Temas:* ${temas.join(' • ')}\n\n⏳ Vocês têm *60 segundos*! Mandem as respostas no grupo.`);
    },
  },
  {
    name: 'charada', category: CAT, react: '🧩', run: ctx => {
      const g = games.get(ctx.jid);
      if (ctx.q) {
        if (!g || g.type !== 'charada') return ctx.reply('❌ Nenhuma charada ativa. Digite */charada*.');
        if (normalize(ctx.q) !== g.answer) return ctx.reply('❌ Não é isso! Pensa mais um pouco.');
        endGame(ctx.jid); const { prize, xp } = reward(ctx, ctx.sender, 20, 50, 4, 10);
        return ctx.reply(`🧩 ${ctx.tag(ctx.sender)} matou a charada: *${g.answer}*! 💰 +R$ ${prize} • ⭐ +${xp} XP`);
      }
      if (g) return busy(ctx, g);
      const [q, answer] = pick(C.charadas);
      startGame(ctx, 'charada', { answer }, 30_000, () => ctx.send({ text: `⏰ Tempo esgotado! Resposta: *${answer}*.` }));
      return ctx.reply(`🧩 *CHARADA*\n\n${q}\n\n⏳ 30 segundos • */charada <resposta>*`);
    },
  },
  {
    name: 'ppt', category: CAT, react: '✊', run: ctx => {
      const map = { pedra: '🪨', papel: '📄', tesoura: '✂️' };
      const me = normalize(ctx.args[0]);
      if (!map[me]) return ctx.reply('✊ *Uso:* /ppt pedra | papel | tesoura');
      const bot = pick(Object.keys(map));
      const res = me === bot ? 0 : (me === 'pedra' && bot === 'tesoura') || (me === 'papel' && bot === 'pedra') || (me === 'tesoura' && bot === 'papel') ? 1 : -1;
      const u = db.updateUser(ctx.sender, u => { const s = u.stats.ppt || [0, 0, 0]; s[res === 1 ? 0 : res === -1 ? 1 : 2]++; u.stats.ppt = s; return u; });
      const [w, l, d] = u.stats.ppt;
      const title = res === 1 ? '🎉 *VITÓRIA SUA!*' : res === -1 ? '😎 *VITÓRIA MINHA!*' : '🤝 *EMPATE!*';
      const sub = res === 1 ? 'Você me venceu dessa vez... 😅' : res === -1 ? 'Treina mais e volta! 😏' : 'Pensamos igual! 🧠';
      return ctx.reply(`${title}\n\n${map[me]} vs ${map[bot]}\n\n${sub}\n\n📊 Placar: ✅${w} ❌${l} 🤝${d}`);
    },
  },
  {
    name: 'duelo', category: CAT, react: '⚔️', run: ctx => {
      const op = ctx.mentions[0] || ctx.quoted?.sender; const v = Number(ctx.args.find(a => /^\d+$/.test(a))) || 0;
      if (!op || op === ctx.sender) return ctx.reply('⚔️ *Uso:* /duelo @pessoa [aposta]');
      const a = db.user(ctx.sender), b = db.user(op);
      if (v && (a.wallet < v || b.wallet < v)) return ctx.reply('❌ Os dois precisam ter o valor da aposta na carteira.');
      const hpA = rand(40, 100), hpB = rand(40, 100); const winner = hpA === hpB ? pick([ctx.sender, op]) : hpA > hpB ? ctx.sender : op; const loser = winner === ctx.sender ? op : ctx.sender;
      if (v) { db.updateUser(winner, u => { u.wallet += v; }); db.updateUser(loser, u => { u.wallet -= v; }); }
      const golpes = ['desferiu um chute giratório', 'acertou um soco no queixo', 'usou um golpe secreto', 'lançou um kamehameha caseiro', 'deu uma voadora'];
      return ctx.reply(`⚔️ *DUELO!*\n\n${ctx.tag(ctx.sender)} (${hpA} HP) vs ${ctx.tag(op)} (${hpB} HP)\n\n💥 ${ctx.tag(winner)} ${pick(golpes)}!\n\n🏆 *Vencedor:* ${ctx.tag(winner)}${v ? `\n💰 Levou ${money(v)} de ${ctx.tag(loser)}` : ''}`, { mentions: [ctx.sender, op] });
    },
  },
  {
    name: 'bau', category: CAT, react: '🧰', run: ctx => {
      const g = ctx.group; const ev = g.event;
      if (ev?.type === 'bau' && ev.until > Date.now()) return ctx.reply(`🧰 Já existe um baú ativo! Chaves restantes: *${ev.keys}/5* • Use */abrir*`);
      const left = (g.settings.lastBau || 0) + 12 * 3600_000 - Date.now();
      if (left > 0) return ctx.reply(`🧰 O próximo baú aparece em *${Math.ceil(left / 3600_000)}h*.`);
      db.updateGroup(ctx.jid, gr => { gr.event = { type: 'bau', keys: 5, opened: [], until: Date.now() + 5 * 60_000 }; gr.settings.lastBau = Date.now(); });
      setTimeout(() => { const gr = db.group(ctx.jid); if (gr.event?.type === 'bau' && gr.event.keys > 0) { db.updateGroup(ctx.jid, x => { x.event = null; }); ctx.send({ text: '⏰ *O Baú desapareceu!* O tempo expirou e ninguém mais pegou as chaves.' }); } }, 5 * 60_000);
      return ctx.reply('🧰 *EVENTO 12H: BAÚ MISTERIOSO APARECEU!* 🧰\n\nExistem apenas *5 chaves* disponíveis neste baú!\nCada membro só pode tentar abrir *1 única vez*.\n\n🎁 *Prêmios:* Jackpots de até R$ 400, Ouro, Prata ou Armadilhas!\n⏰ *Duração:* Este baú ficará ativo por 5 minutos ou até acabarem as chaves.\n\n📌 *Para resgatar sua chave:* Digite */abrir*');
    },
  },
  {
    name: 'abrir', category: null, react: '🔑', run: ctx => {
      const g = ctx.group; const ev = g.event;
      if (ev?.type !== 'bau' || ev.until < Date.now() || ev.keys <= 0) return ctx.reply('🧰 Não há baú ativo agora. Fique de olho!');
      if (ev.opened.includes(ctx.sender)) return ctx.reply('🔒 Você já abriu este baú!');
      const roll = Math.random();
      const [title, v, xp] = roll < 0.05 ? ['💎 *JACKPOT!*', rand(250, 400), rand(40, 80)] : roll < 0.35 ? ['✨ 💰 *Recompensa de Ouro!*', rand(50, 120), rand(20, 50)] : roll < 0.75 ? ['🥈 *Recompensa de Prata!*', rand(15, 50), rand(8, 20)] : ['🪤 *ARMADILHA!*', -rand(10, 40), 2];
      const u = db.updateUser(ctx.sender, u => { u.wallet = Math.max(0, u.wallet + v); u.xp += xp; return u; });
      db.updateGroup(ctx.jid, gr => { gr.event.keys--; gr.event.opened.push(ctx.sender); if (gr.event.keys <= 0) gr.event = null; });
      return ctx.reply(`${title}\n\n👤 *Jogador:* ${ctx.tag(ctx.sender)}\n💵 *${v >= 0 ? 'Ganho' : 'Perda'}:* ${v >= 0 ? '+' : '-'}R$ ${Math.abs(v).toFixed(2)}\n✨ *XP:* +${xp} XP\n━━━━━━━━━━━━━━━━━\n💳 *Seu Saldo:* R$ ${u.wallet.toFixed(2)}\n🔑 *Chaves restantes no baú:* ${ev.keys - 1}/5`);
    },
  },
  {
    name: 'parar', category: EXT, react: '🛑', run: async ctx => {
      const g = games.get(ctx.jid); if (!g) return ctx.reply('Nenhum jogo ativo.');
      endGame(ctx.jid); return ctx.reply(`🛑 Jogo de *${g.type}* encerrado.`);
    },
  },
  {
    name: 'rankjogos', category: EXT, react: '🏆', run: ctx => {
      const list = db.members(ctx.jid).filter(m => m.fun.wins).sort((a, b) => b.fun.wins - a.fun.wins).slice(0, 10);
      if (!list.length) return ctx.reply('🏆 Ninguém venceu jogos ainda.');
      return ctx.reply(`🏆 *RANKING DOS JOGOS*\n\n${list.map((m, i) => `${i + 1}. ${ctx.tag(m.jid)} — *${m.fun.wins}* vitórias`).join('\n')}`, { mentions: list.map(m => m.jid) });
    },
  },
];
