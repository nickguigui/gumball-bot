// Utilitarios de texto/formatacao usados nos templates.
export function boldSans(str) {
  // 𝗔-𝗭 𝗮-𝘇 𝟬-𝟵 (Mathematical Sans-Serif Bold)
  return [...str].map(c => {
    const n = c.codePointAt(0);
    if (n >= 65 && n <= 90) return String.fromCodePoint(0x1d5d4 + n - 65);
    if (n >= 97 && n <= 122) return String.fromCodePoint(0x1d5ee + n - 97);
    if (n >= 48 && n <= 57) return String.fromCodePoint(0x1d7ec + n - 48);
    return c;
  }).join('');
}
export function boldItalicSans(str) {
  return [...str].map(c => {
    const n = c.codePointAt(0);
    if (n >= 65 && n <= 90) return String.fromCodePoint(0x1d63c + n - 65);
    if (n >= 97 && n <= 122) return String.fromCodePoint(0x1d656 + n - 97);
    return c;
  }).join('');
}
export const brl = v => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = v => 'R$ ' + Number(v || 0).toFixed(2);
export const bar = (pct, size = 10) => {
  const filled = Math.max(0, Math.min(size, Math.round(pct / (100 / size))));
  return '`[' + '▰'.repeat(filled) + '▱'.repeat(size - filled) + ']`';
};
export const lightBar = (pct, size = 10) => {
  const filled = Math.max(0, Math.min(size, Math.round(pct / (100 / size))));
  return '`[' + '█'.repeat(filled) + '░'.repeat(size - filled) + ']`';
};
export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
// Sorteio "saco embaralhado": em listas fixas nao repete ate passar por todas (piadas, quiz, fatos...)
const bags = new WeakMap();
export const pick = arr => {
  if (!Array.isArray(arr) || arr.length < 3) return arr[Math.floor(Math.random() * arr.length)];
  let bag = bags.get(arr);
  if (!bag || !bag.length) {
    const last = bag?.last;
    bag = arr.map((_, i) => i).sort(() => Math.random() - 0.5);
    if (bag.length > 1 && bag.at(-1) === last) bag.unshift(bag.pop()); // nao repete na virada do saco
    bags.set(arr, bag);
  }
  const i = bag.pop(); bag.last = i; return arr[i];
};
export function duration(ms) {
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return [d && `${d}d`, (d || h) && `${h}h`, (d || h || m) && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}
export function shortDur(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} minuto${m > 1 ? 's' : ''}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h}h${r ? ` ${r}min` : ''}`;
}
export const nowIn = (tz) => new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
export function greeting(tz) {
  const h = nowIn(tz).getHours();
  if (h < 5) return 'Boa madrugada 🌙';
  if (h < 12) return 'Bom dia ☀️';
  if (h < 18) return 'Boa tarde 🌇';
  return 'Boa noite 🌌';
}
export const dateBR = (d = new Date(), tz = 'America/Sao_Paulo') => d.toLocaleDateString('pt-BR', { timeZone: tz });
export const timeBR = (d = new Date(), tz = 'America/Sao_Paulo') => d.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
export const normalize = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const numId = jid => (jid || '').split('@')[0].split(':')[0];
