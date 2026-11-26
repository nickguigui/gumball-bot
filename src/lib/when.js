// Interpreta horarios em linguagem natural (pt-BR) para lembretes e agendas.
// Aceita: "daqui a 5 minutos x", "30min x", "2h x", "18:30 x", "hoje 20:30 x",
// "amanha as 13:00 x", "amanha 9h x", "25/12 10h x", "todos os dias as 07:00 x"
import { normalize } from './text.js';

const TZ_OFFSET_MIN = () => { // offset de America/Sao_Paulo (fixo -180 desde 2019)
  return Number(process.env.TZ_OFFSET_MIN ?? -180);
};
function localNow() { const n = new Date(); return new Date(n.getTime() + (TZ_OFFSET_MIN() + n.getTimezoneOffset()) * 60000); }
function toUtc(local) { return new Date(local.getTime() - (TZ_OFFSET_MIN() + new Date().getTimezoneOffset()) * 60000); }

export function parseWhen(input) {
  const raw = input.trim(); const s = normalize(raw);
  let m, at = null, repeat = null, rest = raw;
  const cut = re => { const mm = raw.match(re); rest = mm ? raw.slice(mm.index + mm[0].length).trim() : raw; };
  if ((m = s.match(/^(?:daqui a |em )?(\d+)\s*(segundos?|s|minutos?|min|m|horas?|h|dias?|d)\b/))) {
    const n = +m[1]; const u = m[2][0];
    const ms = u === 's' ? n * 1000 : u === 'm' ? n * 60000 : u === 'h' ? n * 3600000 : n * 86400000;
    at = new Date(Date.now() + ms); cut(/^(?:daqui a |em )?\d+\s*\S+/i);
  } else if ((m = s.match(/^todos? os dias (?:as |a )?(\d{1,2})(?::|h)?(\d{2})?h?\b/))) {
    const l = localNow(); l.setHours(+m[1], +(m[2] || 0), 0, 0); if (l <= localNow()) l.setDate(l.getDate() + 1);
    at = toUtc(l); repeat = 'daily'; cut(/^todos? os dias (?:às |as |a )?\d{1,2}(?::|h)?(?:\d{2})?h?/i);
  } else if ((m = s.match(/^(hoje|amanha|depois de amanha)?\s*(?:as |a )?(\d{1,2})(?::|h)(\d{2})?h?\b/)) || (m = s.match(/^(hoje|amanha)\s+(?:as |a )?(\d{1,2})\b/))) {
    const l = localNow(); const day = m[1];
    if (day === 'amanha') l.setDate(l.getDate() + 1); if (day === 'depois de amanha') l.setDate(l.getDate() + 2);
    l.setHours(+m[2], +(m[3] || 0), 0, 0);
    if (!day && l <= localNow()) l.setDate(l.getDate() + 1);
    at = toUtc(l); cut(/^(?:hoje|amanhã|amanha|depois de amanhã|depois de amanha)?\s*(?:às |as |a )?\d{1,2}(?:(?::|h)\d{0,2}h?)?/i);
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:as |a )?(\d{1,2})?(?::|h)?(\d{2})?h?/))) {
    const l = localNow(); const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : l.getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1], +(m[4] || 9), +(m[5] || 0));
    if (!m[3] && d < l) d.setFullYear(y + 1);
    at = toUtc(d); cut(/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:às |as |a )?\d{0,2}(?::|h)?\d{0,2}h?/i);
  }
  if (!at || isNaN(at)) return null;
  return { at: at.getTime(), repeat, text: rest.replace(/^(de |pra |para |que )/i, '').trim() };
}
export function fmtLocal(ts) {
  return new Date(ts).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' às');
}
