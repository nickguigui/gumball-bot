// Despachante: replica o comportamento observado no Zenitsu.
//  - so mensagens com prefixo e comando conhecido (desconhecido = silencio)
//  - reacao de "processando" -> resposta citando a mensagem -> reacao final
//  - erro -> mensagem de erro + reacao ⚠️
import { buildContext, sentIds, invalidateMeta } from './context.js';
import { registry } from './registry.js';
import { config } from './config.js';
import { db } from './db.js';
import { middlewares, onJoin, onLeave, onProtocol } from './middlewares.js';
import { numId } from './lib/text.js';
import { settings } from './settings.js';

const lastCmdAt = new Map(); // anti-spam por usuario (tempocmd)

// Comando mais parecido (distancia de edicao <= 2), para sugerir em erro de digitacao
function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function closest(name) {
  let best = null, bd = 3;
  for (const [n, c] of registry) { if (c.hidden || Math.abs(n.length - name.length) > 2) continue; const k = dist(name, n); if (k < bd) { bd = k; best = c.name; } }
  return bd <= (name.length <= 4 ? 1 : 2) ? best : null;
}

export async function handleMessage(sock, m) {
  if (!m.message || m.key.remoteJid === 'status@broadcast') return;
  // mensagem apagada/editada: mostra de novo se o grupo ligou essas opcoes
  if (m.message.protocolMessage || m.message.editedMessage) return onProtocol(sock, m).catch(() => {});
  if (m.message.reactionMessage || m.message.senderKeyDistributionMessage && Object.keys(m.message).length === 1) return;
  if (sentIds.has(m.key.id)) return; // mensagem que o proprio bot enviou
  if (m.key.fromMe && !config.allowSelf) return;

  const ctx = buildContext(sock, m);
  // Privado: so no modo "so dono" e com a opcao "Responder no privado" ligada no painel do site
  if (!ctx.isGroup && !(config.ownerOnly && settings.privateChats)) return;

  // Estatisticas e middlewares (antis, afk, mute, autosticker, respostas automaticas)
  if (ctx.isGroup) {
    const stop = await runMiddlewares(ctx);
    if (stop) return;
  }

  const body = ctx.body.trim();
  if (!body.startsWith(config.prefix)) return;
  const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
  if (!rawCmd) return;
  const name = rawCmd.toLowerCase();
  const cmd = registry.get(name);
  if (!cmd) { // comando desconhecido: silencio, exceto para o dono quando ha um parecido (erro de digitacao)
    if (config.ownerOnly && ctx.isOwner() && name.length >= 3 && /^[a-zà-ú0-9]+$/.test(name)) {
      const near = closest(name);
      if (near) return ctx.reply(`🤔 Não conheço */${name}*. Quis dizer */${near}*?`).catch(() => {});
    }
    return;
  }
  // Modo "so dono": comandos de qualquer outra pessoa sao ignorados em silencio
  if (config.ownerOnly && !ctx.isOwner()) return;

  ctx.cmd = name; ctx.args = args; ctx.q = body.slice(config.prefix.length + rawCmd.length).trim();
  const group = ctx.group;
  const onlyGroup = '👥 Esse comando só funciona em grupo.';
  if (!ctx.isGroup && (cmd.admin || cmd.botAdmin || /GESTÃO|ANTIS|RANKINGS LOCAIS/.test(cmd.category || ''))) return ctx.reply(onlyGroup);

  // Bot desligado no grupo: so /bot on por admin
  if (ctx.isGroup && group.bot === false && cmd.name !== 'bot') return;
  if (group?.settings?.soadm && !(await ctx.isAdmin()) && !ctx.isOwner()) return;
  if (group?.settings?.blockedCmds?.includes(cmd.name)) return ctx.reply(`🚫 O comando */${cmd.name}* está bloqueado neste grupo.`);
  if (group?.settings?.noFun && ['🤡 BRINCADEIRAS', '🎮 JOGOS', '💍 MATRIMÔNIOS'].includes(cmd.category)) return;
  if (config.blocked.includes(cmd.name)) return ctx.reply('🚫 *Comando bloqueado* pelo dono do bot no momento.');

  const wait = (group?.settings?.tempocmd || 0) * 1000;
  const key = ctx.jid + ctx.sender;
  if (wait && Date.now() - (lastCmdAt.get(key) || 0) < wait) return;
  lastCmdAt.set(key, Date.now());

  if (cmd.owner && !ctx.isOwner()) return ctx.reply('👑 *Acesso negado!* Apenas o dono do bot pode usar este comando.');
  if (cmd.admin && !(await ctx.isAdmin()) && !ctx.isOwner()) return ctx.reply('🛡️ *Acesso negado!* Este comando é exclusivo para administradores do grupo.');
  if (cmd.botAdmin && !(await ctx.botIsAdmin())) return ctx.reply('🤖 *Preciso ser administrador* do grupo para executar este comando.');

  countCommand(ctx, cmd);
  if (cmd.react) ctx.react(cmd.react);
  try {
    const ok = await cmd.run(ctx);
    if (cmd.done && ok !== false) ctx.react(cmd.done);
  } catch (e) {
    if (!ctx.isGroup && e instanceof TypeError) return ctx.reply(onlyGroup).catch(() => {});
    // Explicacao de uso / aviso esperado: mostra so a mensagem (sem "Erro" e sem ⚠️)
    if (e?.userMessage) {
      const t = e.userMessage;
      return ctx.reply(/^\p{Extended_Pictographic}|^\*/u.test(t) ? t : `💡 ${t}`).catch(() => {});
    }
    console.error(`/${cmd.name}:`, e);
    await ctx.reply(`❌ *Erro:* ${e?.message || 'Falha desconhecida'}`).catch(() => {});
    ctx.react('⚠️');
  }
}

async function runMiddlewares(ctx) {
  // contagem de mensagens por membro e global
  db.updateMember(ctx.jid, ctx.sender, mem => { mem.msgs++; mem.lastSeen = Date.now(); mem.name = ctx.pushName || mem.name; });
  db.updateUser(ctx.sender, u => { u.msgs++; if (ctx.pushName) u.name = ctx.pushName; });
  for (const mw of middlewares) {
    try { if (await mw(ctx)) return true; } catch (e) { console.error('middleware:', e.message); }
  }
  return false;
}

function countCommand(ctx, cmd) {
  db.updateUser(ctx.sender, u => { u.cmds++; });
  const stats = db.get('cmdStats', {});
  stats[cmd.name] = (stats[cmd.name] || 0) + 1;
  db.set('cmdStats', stats);
}

export async function handleParticipants(sock, ev) {
  invalidateMeta(ev.id);
  const g = db.group(ev.id);
  for (const p of ev.participants) {
    const jid = typeof p === 'string' ? p : p.id;
    if (ev.action === 'add') await onJoin(sock, g, jid, numId);
    if (ev.action === 'remove') await onLeave(sock, g, jid);
  }
}
