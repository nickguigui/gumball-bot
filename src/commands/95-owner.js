// Comandos do dono: canais.
import { loadChannels, runChannel, fetchNews, DEFAULT_SLOTS } from '../channels.js';
import { enviarCanal } from '../lib/canal.js';

const O = { owner: true, category: null };
const TYPES = Object.keys(DEFAULT_SLOTS);
export const commands = [
  {
    name: 'canais', ...O, react: '📣', run: ctx => {
      const l = loadChannels();
      return ctx.reply(l.length ? `📣 *CANAIS CONFIGURADOS*\n\n${l.map(c => `• *${c.id}* — ${c.topic} ${c.enabled === false ? '⏸️' : '▶️'}`).join('\n')}\n\n💡 */canal <id> <tipo>* força um post\nTipos: ${TYPES.join(', ')}\n💡 */canal <id> texto livre* posta seu texto` : '📣 Nenhum canal. Configure pelo site ou no channels.json.');
    },
  },
  {
    name: 'canal', ...O, react: '📣', done: '✅', run: async ctx => {
      const [id, kind, ...rest] = ctx.args; const ch = loadChannels().find(c => c.id === id);
      if (!ch) return ctx.reply(`📣 *Uso:* /canal <id> <tipo | texto>\nTipos: ${TYPES.join(', ')}`);
      if (kind && TYPES.includes(kind)) { const log = await runChannel(ctx.sock, ch, { force: kind }); return ctx.reply(log.length ? `📣 Publicado: ${log.join(', ')}` : '📣 Nada para postar nesse tipo agora (ex.: sem data especial hoje).'); }
      const text = [kind, ...rest].filter(Boolean).join(' '); if (!text) return ctx.reply('📣 Informe o tipo ou o texto.');
      const jid = ch.jid || (await ctx.sock.newsletterMetadata('invite', (ch.invite || '').split('/').pop())).id;
      await enviarCanal(ctx.sock, jid, { text: `${ch.emoji || '📰'} ${text}${ch.signature ? `\n\n${ch.emoji || '📰'}- _${ch.signature}_` : ''}` });
      return ctx.reply('📣 Publicado no canal!');
    },
  },
  {
    name: 'previacanal', ...O, react: '👀', run: async ctx => {
      const ch = loadChannels().find(c => c.id === ctx.args[0]) || { topic: ctx.q, query: ctx.q };
      if (!ch.topic) return ctx.reply('👀 *Uso:* /previacanal <id ou assunto>');
      const n = (await fetchNews(ch)).slice(0, 5);
      return ctx.reply(n.length ? `👀 *NOTÍCIAS RECENTES SOBRE "${ch.topic}"*\n\n${n.map((x, i) => `${i + 1}. ${x.title} _(${x.source})_`).join('\n')}` : 'Nada recente sobre esse assunto.');
    },
  },
];
