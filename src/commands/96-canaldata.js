// Datas especiais do canal (aniversario, lancamento) pelo WhatsApp, sem editar arquivo.
// No dia, o post "Data especial" sai sozinho; datas com ano viram contagem regressiva ate 30 dias antes.
import { loadChannels, saveChannels } from '../channels.js';

const uso = list => `🎂 *Uso:*\n• /canaldata <canal> 13/12 Aniversário da artista!\n• /canaldata <canal> 05/03/2027 Show em SP _(com ano: contagem regressiva)_\n• /canaldata <canal> ver\n• /canaldata <canal> apagar <número>\n\n📣 Seus canais: ${list.map(c => `*${c.id}*`).join(', ') || 'nenhum (crie no site, aba Canal automático)'}`;

export const commands = [
  {
    name: 'canaldata', aliases: ['canaldatas'], owner: true, category: null, react: '🎂', run: ctx => {
      const list = loadChannels(); const [id, a2, ...rest] = ctx.args;
      // com um canal so, o nome do canal pode ser omitido
      let ch = list.find(c => c.id === id), args = [a2, ...rest];
      if (!ch && list.length === 1 && id) { ch = list[0]; args = [id, a2, ...rest]; }
      if (!ch) return ctx.reply(uso(list));
      const [op, ...txt] = args.filter(x => x != null);
      ch.dates = ch.dates || [];
      if (!op || op === 'ver') return ctx.reply(ch.dates.length ? `🎂 *DATAS DO CANAL ${ch.id}*\n\n${ch.dates.map((d, i) => `${i + 1}. *${d.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1")}* — ${d.text}`).join('\n')}` : `🎂 Nenhuma data cadastrada.\n\n${uso(list)}`);
      if (op === 'apagar') {
        const i = parseInt(txt[0]) - 1;
        if (!(i >= 0 && i < ch.dates.length)) return ctx.reply(`🎂 Número inválido. Veja a lista com */canaldata ${ch.id} ver*.`);
        const [x] = ch.dates.splice(i, 1); saveChannels(list);
        return ctx.reply(`🗑️ Data apagada: *${x.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1")}* — ${x.text}`);
      }
      const m = op.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
      if (!m || !txt.length || +m[1] > 31 || +m[2] > 12) return ctx.reply(`🎂 Use: */canaldata ${ch.id} 13/12 Texto do post* (ou 05/03/2027 para contagem regressiva)`);
      const dd = m[1].padStart(2, '0'), mm = m[2].padStart(2, '0');
      const date = m[3] ? `${m[3]}-${mm}-${dd}` : `${dd}/${mm}`;
      ch.dates.push({ date, text: txt.join(' ') }); saveChannels(list);
      return ctx.reply(`🎂 Data salva: *${m[3] ? `${dd}/${mm}/${m[3]}` : date}* — ${txt.join(' ')}\n_${m[3] ? 'Até 30 dias antes o canal faz contagem regressiva, e no dia posta.' : 'Todo ano nesse dia o canal posta.'}_`);
    },
  },
];
