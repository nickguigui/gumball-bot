// Downloads (yt-dlp) e letras de musica.
import * as yt from '../lib/ytdlp.js';
import { getJson, http, UserError } from '../lib/http.js';
import { config } from '../config.js';
import { duration } from '../lib/text.js';

const CAT = '⬇️ DOWNLOADS', EXT = '🧰 MAIS UTILIDADES';
const fmtDur = s => (s ? duration(s * 1000).replace(/^0m /, '') : '?');

async function resolve(ctx, usage) {
  const q = ctx.q || ctx.quoted?.text;
  if (!q) throw new UserError(usage);
  if (yt.isUrl(q)) return { url: q, title: null };
  const [v] = await yt.search(q, 1);
  if (!v) throw new UserError('Nada encontrado no YouTube.');
  return v;
}
async function playAudio(ctx) {
  const v = await resolve(ctx, '🎵 *Uso:* /play <nome da música ou link>');
  await ctx.reply('🚀 *Pega a pipoca!* Já tô preparando seu som na qualidade máxima!');
  const { buffer } = await yt.audio(v.url);
  await ctx.audio(buffer, 'audio/mpeg');
}

// ---------- letras ----------
async function deezerIsrc(q) {
  const s = await getJson(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=1`);
  const t = s.data?.[0]; if (!t) return null;
  const full = await getJson(`https://api.deezer.com/track/${t.id}`);
  return { isrc: full.isrc, title: t.title, artist: t.artist?.name };
}
function spicyText(body) {
  const lines = [];
  const walk = (n, depth = 0) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(x => walk(x, depth));
    if (n.Lead?.Syllables) { lines.push(n.Lead.Syllables.map((s, i, a) => s.Text + (s.IsPartOfWord || i === a.length - 1 ? '' : ' ')).join('').trim()); return; }
    if (typeof n.Text === 'string' && !n.Syllables) { lines.push(n.Text); return; }
    for (const k of ['Content', 'Lines', 'Body']) if (n[k]) walk(n[k], depth + 1);
  };
  walk(body);
  return lines.filter(Boolean).join('\n');
}
async function spicyLyrics(q) {
  if (!config.spicyKey) return null;
  const t = await deezerIsrc(q).catch(() => null); if (!t?.isrc) return null;
  const headers = { Authorization: `Bearer ${config.spicyKey}`, ...(config.spicyOrigin ? { Origin: config.spicyOrigin, Referer: config.spicyOrigin + '/' } : {}) };
  const r = await http(`https://api.spicylyrics.org/v1/lyrics/${t.isrc}`, { headers }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json(); const text = spicyText(j.Body || j);
  return text ? { ...t, text, source: 'Spicy Lyrics' } : null;
}
async function lrclib(q) {
  const parts = q.split(/\s+-\s+/);
  const url = parts.length === 2 ? `https://lrclib.net/api/search?artist_name=${encodeURIComponent(parts[0])}&track_name=${encodeURIComponent(parts[1])}` : `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
  const j = await getJson(url, { headers: { 'Lrclib-Client': 'gumball-bot' } }).catch(() => []);
  const hit = j.find(x => x.plainLyrics);
  return hit ? { title: hit.trackName, artist: hit.artistName, text: hit.plainLyrics, source: 'LRCLIB' } : null;
}
async function genius(q) {
  const s = await getJson(`https://genius.com/api/search/song?q=${encodeURIComponent(q.replace(/\s+-\s+/, ' '))}&per_page=1`, { timeout: 8000 });
  const hit = s.response?.sections?.[0]?.hits?.[0]?.result; if (!hit?.url) return null;
  const html = await (await http(hit.url, { timeout: 10000 })).text();
  const { load } = await import('cheerio'); const $ = load(html);
  $('[data-lyrics-container] br').replaceWith('\n');
  $('[data-exclude-from-selection]').remove();
  const text = $('[data-lyrics-container]').map((i, el) => $(el).text()).get().join('\n').trim();
  return text ? { title: hit.title, artist: hit.primary_artist?.name, text, source: 'Genius' } : null;
}
async function netease(q) {
  const s = await getJson(`https://music.163.com/api/search/get?s=${encodeURIComponent(q.replace(/\s+-\s+/, ' '))}&type=1&limit=1`, { timeout: 8000, headers: { Referer: 'https://music.163.com' } });
  const song = s.result?.songs?.[0]; if (!song) return null;
  const l = await getJson(`https://music.163.com/api/song/lyric?id=${song.id}&lv=1`, { timeout: 8000, headers: { Referer: 'https://music.163.com' } });
  const text = (l.lrc?.lyric || '').replace(/\[[^\]]*\]/g, '').split('\n').map(x => x.trim()).filter(x => x && !/^(作词|作曲|编曲|制作人)\s*[:：]/.test(x)).join('\n');
  return text ? { title: song.name, artist: song.artists?.map(a => a.name).join(', '), text, source: 'NetEase' } : null;
}
// Varias fontes em sequencia (como o Spicy Lyrics Mobile): a primeira que responder ganha.
export const LYRICS_SOURCES = [['Spicy Lyrics', spicyLyrics], ['LRCLIB', lrclib], ['Genius', genius], ['NetEase', netease], ['lyrics.ovh', lyricsOvh]];
export async function findLyrics(q) {
  for (const [name, fn] of LYRICS_SOURCES) {
    try {
      const r = await Promise.race([fn(q), new Promise(res => setTimeout(() => res(null), 12000))]);
      if (r?.text && r.text.length > 40) return r;
    } catch (e) { if (process.env.DEBUG) console.warn(`lyrics ${name}:`, e.message); }
  }
  return null;
}
async function lyricsOvh(q) {
  const [a, t] = q.split(/\s+-\s+/); if (!t) return null;
  const j = await getJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(a)}/${encodeURIComponent(t)}`).catch(() => null);
  return j?.lyrics ? { title: t, artist: a, text: j.lyrics.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n'), source: 'lyrics.ovh' } : null;
}

export const commands = [
  { name: 'play', category: CAT, react: '🎵', done: '✅', run: playAudio },
  { name: 'ytmp3', aliases: ['play2'], category: CAT, react: '🎵', done: '✅', run: playAudio },
  {
    name: 'ytmp4', aliases: ['playvideo'], category: CAT, react: '🎬', done: '✅', run: async ctx => {
      const v = await resolve(ctx, '🎬 *Uso:* /ytmp4 <nome ou link>');
      await ctx.reply('🎬 *Baixando o vídeo...* Aguenta aí! ⏳');
      const { buffer } = await yt.video(v.url);
      await ctx.video(buffer, v.title ? `🎬 *${v.title}*` : '');
    },
  },
  ...[['tkk', 'TikTok', '🎵'], ['insta', 'Instagram', '📸'], ['face', 'Facebook', '📘'], ['pin', 'Pinterest', '📌'], ['baixar', 'TikTok, Insta, X, Kwai...', '⬇️']].map(([name, site, emoji]) => ({
    name, category: name === 'baixar' ? EXT : CAT, react: emoji, done: '✅', run: async ctx => {
      const url = (ctx.q.match(/https?:\/\/\S+/) || ctx.quoted?.text?.match(/https?:\/\/\S+/) || [])[0];
      if (!url) return ctx.reply(`${emoji} *Uso:* /${name} <link do ${site}>`);
      await ctx.reply(`${emoji} *Baixando do ${site}...* ⏳`);
      const { buffer, ext } = await yt.any(url);
      if (/^(jpe?g|png|webp)$/.test(ext)) return ctx.image(buffer, `${emoji} *Download concluído!*`);
      return ctx.video(buffer, `${emoji} *Download concluído!*`);
    },
  })),
  {
    name: 'ytsearch', category: EXT, react: '🔎', run: async ctx => {
      if (!ctx.q) return ctx.reply('🔎 *Uso:* /ytsearch <termo>');
      const r = await yt.search(ctx.q, 6);
      return ctx.reply(`🔎 *RESULTADOS NO YOUTUBE*\n\n${r.map((v, i) => `*${i + 1}.* ${v.title}\n⏱️ ${fmtDur(v.duration)} • 📺 ${v.channel || '?'}\n🔗 ${v.url}`).join('\n\n')}\n\n💡 _Baixe com /play <link>_`);
    },
  },
  {
    name: 'lyrics', aliases: ['letra'], category: CAT, react: '🔍', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🎵 *Uso:* /lyrics artista - música\n\nEx.: _/lyrics Queen - Bohemian Rhapsody_');
      const r = await findLyrics(ctx.q);
      if (!r) { ctx.react('❌'); return ctx.reply('❌ *Erro ao buscar a letra:*\nA letra não está disponível para esta música.\n\n💡 _Tente no formato: artista - música_'); }
      return ctx.reply(`🎵 *${r.title}*\n👤 *Artista:* ${r.artist}\n\n📝 *Letra:*\n${r.text.slice(0, 6000)}\n\n_Fonte: ${r.source}_`);
    },
  },
];
