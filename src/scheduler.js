// Tarefas periodicas: lembretes, abrir/fechar grupo, mensagens agendadas, aniversarios, canais.
import { db, sql } from './db.js';
import { queue } from './queue.js';
import { config } from './config.js';
import { numId } from './lib/text.js';
import { tickChannels } from './channels.js';

let timer = null;
const localHM = () => new Date().toLocaleTimeString('pt-BR', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false });
const localDM = () => new Date().toLocaleDateString('pt-BR', { timeZone: config.timezone, day: '2-digit', month: '2-digit' });
const send = (sock, jid, content) => queue.push(() => sock.sendMessage(jid, content)).catch(e => console.warn('agenda:', e.message));

export function startScheduler(sock) {
  clearInterval(timer);
  let lastMinute = '';
  timer = setInterval(async () => {
    try {
      // lembretes
      const all = db.get('reminders', []); const now = Date.now(); let changed = false;
      for (const r of all.filter(r => r.at <= now)) {
        await send(sock, r.jid, { text: `⏰ *LEMBRETE!*\n\n@${numId(r.who)}\n📝 ${r.text}`, mentions: [r.who] });
        if (r.repeat === 'daily') r.at += 864e5; else r.done = true;
        changed = true;
      }
      if (changed) db.set('reminders', all.filter(r => !r.done));

      const hm = localHM();
      if (hm !== lastMinute) {
        lastMinute = hm;
        for (const row of sql.prepare('SELECT jid FROM groups').all()) {
          const g = db.group(row.jid); const s = g.settings;
          if (g.bot === false) continue;
          if (s.autoClose === hm) await sock.groupSettingUpdate(g.jid, 'announcement').then(() => send(sock, g.jid, { text: '🔒 *Grupo fechado automaticamente.* Até amanhã! 🌙' })).catch(() => {});
          if (s.autoOpen === hm) await sock.groupSettingUpdate(g.jid, 'not_announcement').then(() => send(sock, g.jid, { text: '🔓 *Grupo aberto!* Bom dia, pessoal! ☀️' })).catch(() => {});
          for (const a of s.agendas || []) if (a.time === hm) await send(sock, g.jid, { text: a.text });
          if (hm === '09:00') {
            const today = localDM(); const bd = Object.entries(s.birthdays || {}).filter(([, d]) => d === today).map(([j]) => j);
            if (bd.length) await send(sock, g.jid, { text: `🎂🎉 *FELIZ ANIVERSÁRIO!* 🎉🎂\n\n${bd.map(j => '@' + numId(j)).join(' ')}\n\nO grupo inteiro deseja muitas felicidades! 🥳`, mentions: bd });
          }
        }
      }
      await tickChannels(sock);
    } catch (e) { console.error('scheduler:', e.message); }
  }, 30_000);
}
