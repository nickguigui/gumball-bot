// Menu, ping, suporte.
import os from 'node:os';
import { buildMenu, buildMenuAdm, pingOf } from '../menu.js';
import { db } from '../db.js';
import { config } from '../config.js';
import { duration, lightBar } from '../lib/text.js';

const C = '🤝 SUPORTE DO BOT';
export const commands = [
  { name: 'menu', category: 'core', react: '⚡', run: ctx => ctx.reply(buildMenu(ctx, pingOf(ctx), ctx.q.toLowerCase() || null)) },
  { name: 'menuadm', category: 'core', react: '🛡️', run: ctx => ctx.reply(buildMenuAdm(ctx)) },
  {
    name: 'ping', category: '🧰 UTILITÁRIOS', react: '⚡', run: async ctx => {
      const bot = pingOf(ctx);
      const t = Date.now(); await fetch('https://www.gstatic.com/generate_204').catch(() => {}); const net = Date.now() - t;
      const ram = Math.round((1 - os.freemem() / os.totalmem()) * 100);
      const cpu = Math.min(100, Math.round(os.loadavg()[0] / os.cpus().length * 100)) || Math.round(process.cpuUsage().user / 1e6 / (process.uptime() || 1));
      const q = (ms, ok, mid) => (ms < ok ? 'Ótima 🟢' : ms < mid ? 'Lento 🟡' : 'Ruim 🔴');
      return ctx.reply(`⚡ *PING DO BOT*

        🛰️ *Latência*
        ├ Bot: _${bot}ms_ ${q(bot, 1500, 6000)}
        └ Rede: _${net}ms_ ${q(net, 150, 600)}

        💾 *Recursos*
        ├ RAM: ${lightBar(ram)} _${ram}%_
        └ CPU: ${lightBar(cpu)} _${cpu}%_

        ⏳ *Online há* _${duration(Date.now() - db.get('startedAt', Date.now()))}_`);
    },
  },
  {
    name: 'topcmd', category: C, react: '📊', run: ctx => {
      const stats = Object.entries(db.get('cmdStats', {})).sort((a, b) => b[1] - a[1]);
      const total = stats.reduce((s, [, n]) => s + n, 0);
      if (!total) return ctx.reply('📊 Ainda não há comandos registrados.');
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
      const lines = stats.slice(0, 10).map(([c, n], i) => `${medals[i]} */${c}* — ${n.toLocaleString('pt-BR')} usos _(${(n / total * 100).toFixed(1)}%)_`);
      return ctx.reply(`📊 *RANKING DOS COMANDOS MAIS USADOS*\n\n${lines.join('\n')}\n\n📈 *Total acumulado:* ${total.toLocaleString('pt-BR')} execuções`);
    },
  },
  {
    name: 'alugar', category: C, react: '💎', run: ctx => ctx.reply(`💎 *ALUGUEL DO ${config.botName.toUpperCase()} BOT*

📌 Quer o bot no seu grupo? Fale com o dono:
👑 *${config.ownerName}*${config.owners[0] ? `\n📱 wa.me/${config.owners[0]}` : ''}

✅ Figurinhas, downloads, jogos, economia e moderação completa.`),
  },
  {
    name: 'teste', category: C, react: '🧪', run: ctx => ctx.reply(`🧪 *TESTE GRÁTIS*\n\nPeça um período de teste ao dono *${config.ownerName}*${config.owners[0] ? ` (wa.me/${config.owners[0]})` : ''}.`),
  },
];
