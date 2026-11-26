// Despachante: replica o comportamento observado no Zenitsu.
//  - so mensagens com prefixo e comando conhecido (desconhecido = silencio)
//  - reacao de "processando" -> resposta citando a mensagem -> reacao final
//  - erro -> mensagem de erro + reacao ⚠️
import { buildContext, sentIds, invalidateMeta } from './context.js';
import { registry } from './registry.js';
import { config } from './config.js';
import { db } from './db.js';
import { middlewares, onJoin, onLeave } from './middlewares.js';
import { numId } from './lib/text.js';

const lastCmdAt = new Map(); // anti-spam por usuario (tempocmd)

export async function handleMessage(sock, m) {
  if (!m.message || m.key.remoteJid === 'status@broadcast') return;
  if (m.message.protocolMessage || m.message.reactionMessage || m.message.senderKeyDistributionMessage && Object.keys(m.message).length === 1) return;
  if (sentIds.has(m.key.id)) return; // mensagem que o proprio bot enviou
  if (m.key.fromMe && !config.allowSelf) return;

  const ctx = buildContext(sock, m);
  // Modo "so dono" funciona tambem no privado; senao, so grupos (como o Zenitsu)
  if (config.groupsOnly && !config.ownerOnly && !ctx.isGroup) return;

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
  if (!cmd) return; // comando desconhecido: silencio total
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
    console.error(`/${cmd.name}:`, e);
    if (!ctx.isGroup && e instanceof TypeError) return ctx.reply(onlyGroup).catch(() => {});
    const msg = e?.userMessage || e?.message || 'Falha desconhecida';
    await ctx.reply(`❌ *Erro:* ${msg}`).catch(() => {});
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
