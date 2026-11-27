// Canais do WhatsApp sobre QUALQUER assunto, com a mesma grade do canal da Laufey.
// Envio: src/lib/canal.js (do bot da Laufey; resolve o erro 479 de midia/enquete em canal).
// Config: channels.json (editavel pelo site). Estado: banco (kv), sem repetir conteudo.
import fs from 'node:fs';
import sharp from 'sharp';
import * as cheerio from 'cheerio';
import { enviarCanal } from './lib/canal.js';
import { getText, getBuffer, getJson } from './lib/http.js';
import { addExif, ffmpeg, esc, wrap } from './lib/media.js';
import { db } from './db.js';
import { config } from './config.js';

const FILE = process.env.CHANNELS_FILE || './channels.json';
const GAP = 40_000;            // 40 s entre posts
const MAX_PER_TICK = 6;        // max. posts por rodada
export const DEFAULT_SLOTS = {
  on: '06:00', curiosidade: '08:00', data: '09:00', musica: '10:00', icon: '12:00', isso: '14:00', enquete: '15:00',
  figurinhas: '16:00', quiz: '17:00', resposta: '19:00', mecore: '20:00', jogo: '21:30', off: '23:30',
};
export const DAILY_LIMITS = { news: 8, videos: 3, releases: 2 };
// WhatsApp nao tem spoiler: ~4000 caracteres invisiveis forcam o "Ler mais" e escondem a resposta.
export const LER_MAIS = '‎'.repeat(4001);
let lastPostAt = 0; let busy = false;

export function saveChannels(list) {
  let doc = {}; try { doc = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  fs.writeFileSync(FILE, JSON.stringify({ ...doc, channels: list }, null, 1));
}
export function loadChannels() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')).channels || []; } catch { return []; } }
const now = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, md: `${p.day}/${p.month}` }; };
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
const K = (ch, k) => `ch:${ch.id}:${k}`;
const E = ch => ch.emoji || '📰';
const sign = ch => (ch.signature ? `\n\n${E(ch)}- _${ch.signature}_` : '');
const pickUnused = (ch, key, list, idOf = x => JSON.stringify(x)) => {
  const used = new Set(db.get(K(ch, 'used:' + key), []));
  let pool = list.filter(x => !used.has(idOf(x)));
  if (!pool.length) { used.clear(); pool = list; }
  const it = pool[Math.floor(Math.random() * pool.length)];
  used.add(idOf(it)); db.set(K(ch, 'used:' + key), [...used].slice(-500));
  return it;
};

async function resolveJid(sock, ch) {
  if (ch.jid) return ch.jid;
  const c = db.get(K(ch, 'jid')); if (c) return c;
  const meta = await sock.newsletterMetadata('invite', (ch.invite || '').split('/').pop());
  db.set(K(ch, 'jid'), meta.id); return meta.id;
}
async function send(sock, jid, content) {
  const w = lastPostAt + GAP - Date.now(); if (w > 0) await new Promise(r => setTimeout(r, w));
  const r = await enviarCanal(sock, jid, content); lastPostAt = Date.now(); return r;
}

// ---------- fontes ----------
async function wikiText(ch) {
  const c = db.get(K(ch, 'wiki')); if (c && Date.now() - c.at < 7 * 864e5) return c.text;
  let text = '';
  for (const lang of ['pt', 'en']) {
    try {
      const s = await getJson(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(ch.wiki || ch.topic)}&limit=1`);
      const key = s.pages?.[0]?.key; if (!key) continue;
      const j = await getJson(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=${encodeURIComponent(key)}`);
      text = Object.values(j.query.pages)[0].extract || ''; if (text.length > 800) break;
    } catch {}
  }
  db.set(K(ch, 'wiki'), { at: Date.now(), text: text.slice(0, 12000) });
  return text.slice(0, 12000);
}
async function ai(ch, task, wantJson = false) {
  const { chat } = await import('./commands/50-utils.js');
  const ref = await wikiText(ch);
  const sys = `Você cria posts para um canal de WhatsApp de fãs sobre "${ch.topic}". Português do Brasil, tom ${ch.tone || 'animado, próximo e divertido'}. Formatação WhatsApp (*negrito*, _itálico_), nada de Markdown com ** ou #. Use SOMENTE fatos do texto de referência; se não houver fato suficiente, faça algo opinativo/divertido sem afirmar fatos.${wantJson ? ' Responda APENAS com JSON válido, sem texto fora do JSON.' : ''}\n\nREFERÊNCIA:\n${ref || '(sem referência)'}`;
  const out = await chat(task, sys);
  if (!wantJson) return out;
  const m = out.match(/\{[\s\S]*\}|\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : null;
}
export async function fetchNews(ch) {
  const lang = ch.lang || 'pt-BR'; const gl = lang.split('-')[1] || 'BR';
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(ch.query || ch.topic)}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang.split('-')[0]}`);
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').map((i, el) => ({ id: $(el).find('guid').text() || $(el).find('link').text(), title: $(el).find('title').text().replace(/\s+-\s+[^-]+$/, '').trim(), source: $(el).find('source').text().trim(), link: $(el).find('link').text().trim(), date: new Date($(el).find('pubDate').text()).getTime() || 0 }))
    .get().filter(n => n.title && Date.now() - n.date < 36 * 3600_000).sort((a, b) => b.date - a.date);
}
async function openverse(ch, n = 1) {
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(ch.imageQuery || ch.topic)}&page_size=40&mature=false`);
  const used = new Set(db.get(K(ch, 'used:img'), []));
  const res = j.results.filter(r => !used.has(r.id)).slice(0, n * 3);
  const out = [];
  for (const r of res) {
    try { const b = await getBuffer(r.url, { timeout: 15000 }); if (b.length > 8000) { out.push({ buf: b, credit: `${r.creator || 'autor desconhecido'} (${(r.license || '').toUpperCase()})` }); used.add(r.id); } } catch {}
    if (out.length >= n) break;
  }
  db.set(K(ch, 'used:img'), [...used].slice(-500)); return out;
}
async function deezerArtist(ch) {
  if (!ch.artist) return null;
  const c = db.get(K(ch, 'dz')); if (c) return c;
  const s = await getJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(ch.artist)}&limit=1`);
  const id = s.data?.[0]?.id || null; db.set(K(ch, 'dz'), id); return id;
}
async function card(title, subtitle, emoji = '', bg = ['#1b1035', '#4b1d6b']) {
  const lines = wrap(title, 16).slice(0, 3);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/>
<text x="540" y="330" font-size="150" text-anchor="middle">${esc(emoji)}</text>
${lines.map((l, i) => `<text x="540" y="${520 + i * 120}" font-family="Arial Black" font-size="104" fill="#fff" text-anchor="middle">${esc(l)}</text>`).join('')}
<text x="540" y="${560 + lines.length * 120}" font-family="Arial" font-size="46" fill="#ffffffcc" text-anchor="middle">${esc(subtitle)}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

// ---------- tipos de post ----------
const SLOT = {
  async on(ch) { return { image: await card('CANAL ON‼️', ch.name || ch.topic, '☀️'), caption: `${E(ch)} *_CANAL ON‼️_*\n\nBom dia! Bora acompanhar tudo sobre *${ch.topic}* hoje ✨${sign(ch)}` }; },
  async off(ch) { return { image: await card('CANAL OFF‼️', ch.name || ch.topic, '🌙', ['#0b1026', '#1f2a5a']), caption: `${E(ch)} *_CANAL OFF‼️_*\n\nBoa noite! Amanhã tem mais às ${ch.slots?.on || DEFAULT_SLOTS.on} 💤${sign(ch)}` }; },
  async curiosidade(ch) {
    const used = db.get(K(ch, 'used:cur'), []);
    const t = await ai(ch, `Escreva 1 curiosidade curta e interessante (máx. 350 caracteres) que NÃO seja nenhuma destas: ${used.slice(-30).join(' | ') || 'nenhuma'}. Comece direto pelo fato.`);
    db.set(K(ch, 'used:cur'), [...used, t.slice(0, 80)].slice(-200));
    return { text: `${E(ch)} *_🧠 CURIOSIDADE DO DIA_*\n\n${t}${sign(ch)}` };
  },
  async data(ch) {
    const { md, day } = now();
    const hit = (ch.dates || []).find(d => d.date === md || d.date === day);
    if (hit) return { text: `${E(ch)} *_🎂 DATA ESPECIAL_*\n\n${hit.text}${sign(ch)}` };
    const next = (ch.dates || []).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date > day).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    if (next) { const days = Math.ceil((Date.parse(next.date) - Date.parse(day)) / 864e5); if (days <= 30) return { text: `${E(ch)} *_⏳ CONTAGEM REGRESSIVA_*\n\nFaltam *${days} dia${days > 1 ? 's' : ''}* para: ${next.text}${sign(ch)}` }; }
    return null; // so posta quando tem
  },
  async musica(ch) {
    const id = await deezerArtist(ch); if (!id) return null;
    const { data = [] } = await getJson(`https://api.deezer.com/artist/${id}/top?limit=50`);
    const t = pickUnused(ch, 'music', data.filter(x => x.preview), x => x.id); if (!t) return null;
    const cover = await getBuffer(t.album.cover_xl || t.album.cover_big);
    const caption = `${E(ch)} *_🎧 MÚSICA DO DIA_*\n\n🎵 *${t.title}*\n👤 ${t.artist.name}\n💿 _${t.album.title}_\n\n▶️ Deezer: ${t.link}\n🔎 YouTube: https://www.youtube.com/results?search_query=${encodeURIComponent(t.artist.name + ' ' + t.title)}${sign(ch)}`;
    const extra = [];
    try { const mp3 = await getBuffer(t.preview); const ogg = await ffmpeg(mp3, 'mp3', ['-c:a', 'libopus', '-b:a', '64k'], 'ogg'); extra.push({ audio: ogg, ptt: true, seconds: 30 }); } catch {}
    return [{ image: cover, caption }, ...extra];
  },
  async icon(ch) {
    const [img] = await openverse(ch, 1); if (!img) return null;
    const sq = await sharp(img.buf).resize(1080, 1080, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
    return { image: sq, caption: `${E(ch)} *_🖼️ ICON LIBERADO_*\n\nSalva e usa à vontade! 💅\n_📷 ${img.credit}_${sign(ch)}` };
  },
  async figurinhas(ch) {
    const imgs = await openverse(ch, ch.stickers || 5); if (!imgs.length) return null;
    const st = [];
    for (const i of imgs) st.push({ sticker: await addExif(await sharp(i.buf).resize(512, 512, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(), ch.name || ch.topic, ch.signature || config.botName) });
    return [{ text: `${E(ch)} *_🎨 HORA DAS FIGURINHASSS‼️_*\n\nSegura aí ${st.length} figurinhas fresquinhas 👇${sign(ch)}` }, ...st];
  },
  async isso(ch) {
    const j = await ai(ch, 'Crie uma enquete "isso ou aquilo" divertida sobre o assunto. JSON: {"pergunta":"...","opcoes":["A","B"]}', true);
    return j ? { poll: { name: `🤔 ISSO OU AQUILO: ${j.pergunta}`.slice(0, 255), values: j.opcoes.slice(0, 2), selectableCount: 1 } } : null;
  },
  async enquete(ch) {
    const j = await ai(ch, 'Crie a enquete do dia (opinião dos fãs) sobre o assunto. JSON: {"pergunta":"...","opcoes":["...","...","...","..."]}', true);
    return j ? { poll: { name: `🗳️ ENQUETE DO DIA: ${j.pergunta}`.slice(0, 255), values: j.opcoes.slice(0, 4), selectableCount: 1 } } : null;
  },
  async quiz(ch) {
    const j = await ai(ch, 'Crie 1 pergunta de quiz com base APENAS na referência. JSON: {"pergunta":"...","opcoes":["...","...","...","..."],"correta":0,"explicacao":"..."}', true);
    if (!j) return null;
    db.set(K(ch, 'quizAnswer'), { ...j, day: now().day });
    return { poll: { name: `🧠 QUIZ: ${j.pergunta}`.slice(0, 255), values: j.opcoes.slice(0, 4), selectableCount: 1 } };
  },
  async resposta(ch) {
    const q = db.get(K(ch, 'quizAnswer')); if (!q || q.day !== now().day) return null;
    return { text: `${E(ch)} *_✅ RESPOSTA DO QUIZ_*\n\n❓ ${q.pergunta}\n\n👉 *${q.opcoes[q.correta]}*\n\n${q.explicacao || ''}${sign(ch)}` };
  },
  async mecore(ch) {
    const t = await ai(ch, 'Escreva um "me core": frase curtinha melancólica e poética sobre ser fã de/viver o assunto, seguida de uma quebra cômica. Máx. 280 caracteres.');
    return { text: `${E(ch)} *_🖤 ME CORE_*\n\n${t}${sign(ch)}` };
  },
  async jogo(ch) {
    const kind = pickUnused(ch, 'jogo', ['complete a frase', 'adivinhe pelos emojis', 'qual combina com seu signo', 'verdade ou mentira', 'monte seu combo ideal', 'descreva em 3 palavras']);
    const j = await ai(ch, `Crie o "jogo da noite" para os seguidores do canal no formato "${kind}". Curto, interativo, peça para reagirem. Se o jogo tiver resposta certa, NÃO coloque a resposta no texto, só no campo "resposta". JSON: {"texto":"...","resposta":"... ou null"}`, true);
    if (!j?.texto) return null;
    const hidden = j.resposta ? `\n\n🤫 _Pensou? Não vale trapacear! A resposta tá escondida aqui embaixo_ 👇${LER_MAIS}\n\n> ✔️ ${j.resposta}` : '';
    return { text: `${E(ch)} *_🎮 JOGO DA NOITE_*\n\n${j.texto}${hidden}${sign(ch)}` };
  },
};

// ---------- fluxo continuo (noticias, videos, lancamentos) ----------
async function streamPosts(ch) {
  const out = []; const { day } = now();
  const count = db.get(K(ch, 'count:' + day), { news: 0, videos: 0, releases: 0 });
  const seen = new Set(db.get(K(ch, 'seen'), []));
  const first = !db.get(K(ch, 'primed'));
  if (ch.news !== false && count.news < (ch.limits?.news ?? DAILY_LIMITS.news)) {
    const items = await fetchNews(ch).catch(() => []);
    for (const n of items) {
      if (seen.has(n.id)) continue; seen.add(n.id); if (first) continue;
      let body = ''; try { body = await ai(ch, `Escreva um post curto (máx. 350 caracteres) sobre esta manchete, sem inventar detalhes: "${n.title}" (${n.source}).`); } catch {}
      out.push({ kind: 'news', content: { text: `${E(ch)} *_📰 ${n.title}_*\n\n${body || `_${n.source}_`}\n\n🔗 ${n.link}${sign(ch)}` } });
      if (count.news + out.filter(o => o.kind === 'news').length >= (ch.limits?.news ?? DAILY_LIMITS.news)) break;
      if (out.length >= 2) break;
    }
  }
  if (ch.videos !== false && count.videos < (ch.limits?.videos ?? DAILY_LIMITS.videos)) {
    try {
      const { search } = await import('./lib/ytdlp.js');
      const vids = await search(`${ch.videoQuery || ch.topic}`, 5);
      for (const v of vids) { const id = 'yt:' + v.id; if (seen.has(id)) continue; seen.add(id); if (first) continue; out.push({ kind: 'videos', content: { text: `${E(ch)} *_🎬 VÍDEO_*\n\n*${v.title}*\n📺 ${v.channel || ''}\n\n▶️ ${v.url}${sign(ch)}` } }); break; }
    } catch {}
  }
  if (ch.artist && count.releases < DAILY_LIMITS.releases) {
    try {
      const id = await deezerArtist(ch); const { data = [] } = await getJson(`https://api.deezer.com/artist/${id}/albums?limit=5`);
      for (const a of data) { const k = 'dz:' + a.id; if (seen.has(k)) continue; seen.add(k); if (first || Date.now() - Date.parse(a.release_date) > 14 * 864e5) continue; out.push({ kind: 'releases', content: { image: await getBuffer(a.cover_xl), caption: `${E(ch)} *_💿 LANÇAMENTO_*\n\n*${a.title}* (${a.record_type})\n📅 ${a.release_date}\n\n▶️ ${a.link}${sign(ch)}` } }); }
    } catch {}
  }
  db.set(K(ch, 'seen'), [...seen].slice(-1500)); db.set(K(ch, 'primed'), true);
  return out;
}

// ---------- motor ----------
export async function buildSlot(ch, key) { return SLOT[key] ? SLOT[key](ch) : null; }
export async function runChannel(sock, ch, { force } = {}) {
  const jid = await resolveJid(sock, ch); const { day, min } = now();
  const slots = { ...DEFAULT_SLOTS, ...(ch.slots || {}) };
  const done = db.get(K(ch, 'done:' + day), []);
  const due = force ? [force] : Object.entries(slots).filter(([k, t]) => t && !done.includes(k) && min >= toMin(t) && min - toMin(t) < 90 && !(ch.disabled || []).includes(k)).map(([k]) => k);
  let posted = 0; const log = [];
  for (const key of due) {
    if (posted >= MAX_PER_TICK) break;
    let c = null; try { c = await buildSlot(ch, key); } catch (e) { log.push(`${key}: erro ${e.message}`); }
    if (!force) done.push(key);
    if (!c) continue;
    for (const part of [].concat(c)) { await send(sock, jid, part); posted++; }
    log.push(key);
  }
  if (!force) db.set(K(ch, 'done:' + day), done);
  const onMin = toMin(slots.on || '00:00'), offMin = toMin(slots.off || '23:59');
  if (!force && min >= onMin && min < offMin && posted < MAX_PER_TICK) {
    const count = db.get(K(ch, 'count:' + day), { news: 0, videos: 0, releases: 0 });
    for (const p of await streamPosts(ch)) {
      if (posted >= MAX_PER_TICK) break;
      await send(sock, jid, p.content); posted++; count[p.kind]++; log.push(p.kind);
    }
    db.set(K(ch, 'count:' + day), count);
  }
  return log;
}
export async function tickChannels(sock) {
  if (busy) return; busy = true;
  try {
    const { min } = now();
    if (min % 10 !== 2 && !process.env.CHANNELS_EVERY_TICK) return; // roda a cada 10 min (:02, :12...)
    if (db.get('ch:lastTick') === `${now().day}-${min}`) return; db.set('ch:lastTick', `${now().day}-${min}`);
    for (const ch of loadChannels()) {
      if (ch.enabled === false) continue;
      const log = await runChannel(sock, ch).catch(e => [`erro: ${e.message}`]);
      if (log.length) console.log(`📣 [${ch.id}] ${log.join(', ')}`);
    }
  } finally { busy = false; }
}
export const postNow = (sock, ch, { force } = {}) => runChannel(sock, ch, { force: typeof force === 'string' ? force : null }).then(l => l.join(', ') || 'sem-novidades');
