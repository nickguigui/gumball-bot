// Utilitarios (Zenitsu + extras do ZueiraBot).
import { evaluate } from 'mathjs';
import QRCode from 'qrcode';
import * as cheerio from 'cheerio';
import { getJson, getText, http, UserError } from '../lib/http.js';
import { db } from '../db.js';
import { config } from '../config.js';
import { pick, rand, normalize, dateBR, boldSans, numId } from '../lib/text.js';
import { parseWhen, fmtLocal } from '../lib/when.js';
import * as C from '../data/content.js';

const CAT = '🧰 UTILITÁRIOS', EXT = '🧰 MAIS UTILIDADES';

// ---------- IA (OpenAI-compativel; sem chave usa Pollinations, gratis) ----------
export async function chat(prompt, system) {
  const sys = system || config.gptPersona || 'Você é a assistente virtual de um bot de WhatsApp. Responda em português do Brasil, de forma direta, simpática e curta. Use formatação do WhatsApp (*negrito*, _itálico_), nunca Markdown com ** ou tabelas.';
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: prompt }];
  // 1) provedor pago (se tiver chave e credito); 2) IA gratis (Pollinations) como reserva
  const tries = [];
  if (config.openaiKey && !(chat.paidOffUntil > Date.now())) tries.push({ paid: true, url: `${config.openaiBase}/chat/completions`, model: config.openaiModel, auth: config.openaiKey });
  tries.push({ url: 'https://text.pollinations.ai/openai', model: 'openai' });
  for (const t of tries) {
    const r = await http(t.url, { method: 'POST', timeout: 60000, headers: { 'Content-Type': 'application/json', ...(t.auth ? { Authorization: `Bearer ${t.auth}` } : {}) }, body: JSON.stringify({ model: t.model, messages }) }).catch(() => null);
    if (r?.ok) { const j = await r.json(); const out = (j.choices?.[0]?.message?.content || '').replace(/\*\*(.+?)\*\*/g, '*$1*').trim(); if (out) return out; }
    // sem credito/limite/chave invalida: deixa o pago de lado por 30 min e usa o gratis
    if (t.paid && r && [401, 402, 403, 429].includes(r.status)) chat.paidOffUntil = Date.now() + 30 * 60_000;
  }
  throw new UserError('O serviço de IA não respondeu agora. Tente de novo em instantes.');
}

// ---------- helpers ----------
function genCpf() {
  const n = Array.from({ length: 9 }, () => rand(0, 9));
  const dv = arr => { const s = arr.reduce((acc, d, i) => acc + d * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  n.push(dv(n)); n.push(dv(n));
  const s = n.join(''); return [s, `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`];
}
function seeded(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296); }
const WMO = { 0: 'Céu limpo ☀️', 1: 'Predomínio de sol 🌤️', 2: 'Parcialmente nublado ⛅', 3: 'Encoberto ☁️', 45: 'Neblina 🌫️', 48: 'Neblina com geada 🌫️', 51: 'Garoa fraca 🌦️', 53: 'Garoa 🌦️', 55: 'Garoa forte 🌧️', 61: 'Chuva fraca 🌧️', 63: 'Chuva 🌧️', 65: 'Chuva forte 🌧️', 71: 'Neve fraca 🌨️', 80: 'Pancadas de chuva 🌦️', 81: 'Pancadas fortes 🌧️', 82: 'Temporal ⛈️', 95: 'Trovoadas ⛈️', 96: 'Trovoadas com granizo ⛈️', 99: 'Tempestade severa ⛈️' };
const dirs = ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'];
async function tmdb(path) {
  if (!config.tmdbKey) throw new UserError('Integração de filmes não configurada (TMDB_API_KEY).');
  const sep = path.includes('?') ? '&' : '?';
  const auth = config.tmdbKey.length > 40 ? { headers: { Authorization: `Bearer ${config.tmdbKey}` } } : {};
  return getJson(`https://api.themoviedb.org/3${path}${sep}language=pt-BR${auth.headers ? '' : `&api_key=${config.tmdbKey}`}`, auth);
}
async function translate(text, to) {
  try {
    const j = await getJson(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
    return { text: j[0].map(x => x[0]).join(''), from: j[2] };
  } catch {
    const j = await getJson(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${to}`);
    return { text: j.responseData.translatedText, from: '?' };
  }
}
const LANGS = { ingles: 'en', english: 'en', en: 'en', espanhol: 'es', es: 'es', portugues: 'pt', pt: 'pt', frances: 'fr', fr: 'fr', italiano: 'it', it: 'it', alemao: 'de', de: 'de', japones: 'ja', ja: 'ja', coreano: 'ko', ko: 'ko', chines: 'zh-CN', zh: 'zh-CN', russo: 'ru', ru: 'ru', arabe: 'ar', ar: 'ar' };
const FONTS = [boldSans, s => [...s].map(c => { const n = c.codePointAt(0); return n >= 65 && n <= 90 ? String.fromCodePoint(0x1d4d0 + n - 65) : n >= 97 && n <= 122 ? String.fromCodePoint(0x1d4ea + n - 97) : c; }).join(''),
  s => [...s].map(c => { const n = c.codePointAt(0); return n >= 65 && n <= 90 ? String.fromCodePoint(0x1d56c + n - 65) : n >= 97 && n <= 122 ? String.fromCodePoint(0x1d586 + n - 97) : c; }).join(''),
  s => [...s].map(c => { const n = c.codePointAt(0); return n >= 97 && n <= 122 ? String.fromCodePoint(0x24d0 + n - 97) : n >= 65 && n <= 90 ? String.fromCodePoint(0x24b6 + n - 65) : c; }).join(''),
  s => [...s].map(c => { const n = c.codePointAt(0); return n >= 33 && n <= 126 ? String.fromCodePoint(0xff01 + n - 33) : c; }).join(''),
  s => [...s.toLowerCase()].map(c => 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'['abcdefghijklmnopqrstuvwxyz'.indexOf(c)] || c).join(''),
  s => [...s].map(c => c + '\u0336').join(''), s => [...s.toLowerCase()].map(c => 'ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz'['abcdefghijklmnopqrstuvwxyz'.indexOf(c)] || c).reverse().join('')];

// football-data.org: proximos jogos (e ao vivo) de uma liga ou dos principais campeonatos
const LIGAS = { brasileirao: 'BSA', brasil: 'BSA', bsa: 'BSA', premier: 'PL', pl: 'PL', champions: 'CL', cl: 'CL', laliga: 'PD', pd: 'PD', bundesliga: 'BL1', bl1: 'BL1', seriea: 'SA', italiano: 'SA', ligue1: 'FL1', frances: 'FL1', portugues: 'PPL', ppl: 'PPL', libertadores: 'CLI', copa: 'WC' };
const LIGA_NOME = { BSA: '🇧🇷 BRASILEIRÃO', PL: '🏴 PREMIER LEAGUE', CL: '⭐ CHAMPIONS LEAGUE', PD: '🇪🇸 LA LIGA', BL1: '🇩🇪 BUNDESLIGA', SA: '🇮🇹 SERIE A', FL1: '🇫🇷 LIGUE 1', PPL: '🇵🇹 LIGA PORTUGAL', CLI: '🏆 LIBERTADORES', WC: '🌍 COPA DO MUNDO', ELC: '🏴 CHAMPIONSHIP', DED: '🇳🇱 EREDIVISIE', EC: '🇪🇺 EUROCOPA' };
async function footballData(q) {
  const code = LIGAS[normalize(q).replace(/\s+/g, '')];
  const H = { headers: { 'X-Auth-Token': config.footballKey } };
  let matches;
  if (code) matches = (await getJson(`https://api.football-data.org/v4/competitions/${code}/matches?status=SCHEDULED,TIMED,IN_PLAY,PAUSED`, H)).matches;
  else {
    const d = new Date(), to = new Date(Date.now() + 6 * 864e5), f = x => x.toISOString().slice(0, 10);
    matches = (await getJson(`https://api.football-data.org/v4/matches?dateFrom=${f(d)}&dateTo=${f(to)}`, H)).matches;
  }
  matches = (matches || []).filter(m => m.status !== 'FINISHED');
  if (!matches.length) return code ? `⚽ Nenhum jogo agendado agora em *${LIGA_NOME[code] || code}*.` : null;
  const by = {};
  for (const m of matches) (by[m.competition?.code || code] ||= []).push(m);
  const order = ['BSA', 'CLI', 'CL', 'PL', 'PD', 'SA', 'BL1', 'FL1', 'PPL'];
  const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  const blocks = Object.keys(by).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).slice(0, code ? 1 : 3).map(c => `🏆 *${LIGA_NOME[c] || by[c][0].competition?.name}*\n${by[c].slice(0, 8).map((m, i) => {
    const when = new Date(m.utcDate).toLocaleString('pt-BR', { timeZone: config.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const live = ['IN_PLAY', 'PAUSED'].includes(m.status) ? ` 🔴 ${m.score?.fullTime?.home ?? 0}x${m.score?.fullTime?.away ?? 0}` : '';
    return `  ${nums[i]}  _${when}_ ➔ *${m.homeTeam.shortName || m.homeTeam.name}* x *${m.awayTeam.shortName || m.awayTeam.name}*${live}`;
  }).join('\n')}`);
  return `📅 *${code ? `PRÓXIMOS JOGOS: ${LIGA_NOME[code] || code}` : 'PRÓXIMOS JOGOS DE DESTAQUE'}*\n_Fonte: football-data.org • escolha a liga: /futebol brasileirao, champions, premier, laliga..._\n\n───────────────────────\n\n${blocks.join('\n\n')}`;
}

export const commands = [
  {
    name: 'gpt', category: CAT, react: '🧠', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply(`\n        _Sua assistente virtual_\n\n        ⚙️ *Como Usar:*\n        • Utilize o comando seguido da sua dúvida ou instrução.\n        • \`/gpt [sua pergunta]\`\n\n        💡 *Exemplo:* _/gpt como fazer vitamina de banana, sem a banana, sem o leite, sem o liquidificador_`);
      const text = await chat(ctx.q);
      return ctx.reply(`\n        ${text}\n\n        🏁 *Resposta gerada.*`);
    },
  },
  {
    name: 'resumir', category: CAT, react: '📝', done: '✅', run: async ctx => {
      const text = ctx.q || ctx.quoted?.text;
      if (!text || text.length < 80) return ctx.reply('📝 *Uso:* /resumir <texto longo> ou responda uma mensagem longa.');
      return ctx.reply(`📝 *RESUMO*\n\n${await chat(`Resuma em até 4 tópicos curtos, em português:\n\n${text.slice(0, 8000)}`)}`);
    },
  },
  {
    name: 'traduzir', category: CAT, react: '🌐', run: async ctx => {
      let [lang, ...rest] = ctx.args; let to = LANGS[normalize(lang)];
      let text = to ? rest.join(' ') : ctx.q; if (!to) to = 'pt';
      if (!text && ctx.quoted?.text) text = ctx.quoted.text;
      if (!text) return ctx.reply('🌐 *Uso:* /traduzir <idioma> <texto>\n\nEx.: _/traduzir ingles bom dia_ ou responda uma mensagem com _/traduzir_');
      const r = await translate(text, to);
      return ctx.reply(`🌐 *TRADUÇÃO* (${r.from} → ${to})\n\n${r.text}`);
    },
  },
  {
    name: 'calcular', aliases: ['calc'], category: CAT, react: '🧮', run: ctx => {
      if (!ctx.q) return ctx.reply('🧮 *Uso:* /calcular 2 + 2 * 5');
      try {
        if (/[a-df-z]{4,}|import|createUnit|evaluate|parse|simplify|derivative/i.test(ctx.q.replace(/sqrt|sin|cos|tan|log|abs|pi|round/gi, ''))) throw 0;
        const r = evaluate(ctx.q.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.'));
        if (typeof r !== 'number' && typeof r?.toString !== 'function') throw 0;
        return ctx.reply(`🧮 *CALCULADORA*\n\n📥 *Expressão:* \`${ctx.q}\`\n📤 *Resultado:* *${typeof r === 'number' ? +r.toFixed(10) : r.toString()}*`);
      } catch {
        ctx.react('⚠️');
        return ctx.reply('❌ *Erro de Cálculo:* Não foi possível processar a expressão.\n\n        _Verifique se a sintaxe está correta (ex: use * para multiplicação e / para divisão)._');
      }
    },
  },
  {
    name: 'dolarhoje', aliases: ['moedas', 'cotacao', 'cotação', 'dolar', 'dólar'], category: CAT, react: '💵', run: async ctx => {
      try {
        const j = await getJson('https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,GBP-BRL,BTC-BRL,ARS-BRL');
        const f = (k, e, n) => { const x = j[k]; return `${e} *${n}:* R$ ${Number(x.bid).toLocaleString('pt-BR', { maximumFractionDigits: k.startsWith('BTC') ? 0 : 4 })} _(${Number(x.pctChange) >= 0 ? '📈 +' : '📉 '}${x.pctChange}%)_`; };
        return ctx.reply(`💵 *COTAÇÕES DO DIA*\n\n${f('USDBRL', '🇺🇸', 'Dólar')}\n${f('EURBRL', '🇪🇺', 'Euro')}\n${f('GBPBRL', '🇬🇧', 'Libra')}\n${f('ARSBRL', '🇦🇷', 'Peso argentino')}\n${f('BTCBRL', '₿', 'Bitcoin')}\n\n🕒 _Atualizado: ${new Date(j.USDBRL.create_date.replace(' ', 'T') + '-03:00').toLocaleString('pt-BR', { timeZone: config.timezone })}_`);
      } catch { throw new UserError('*Erro Interno:* Não foi possível processar a consulta cambial no momento. Verifique a estabilidade da API.'); }
    },
  },
  {
    name: 'converter', category: EXT, react: '💱', run: async ctx => {
      const [v, from, to] = [Number((ctx.args[0] || '').replace(',', '.')), (ctx.args[1] || '').toUpperCase(), (ctx.args[2] || 'BRL').toUpperCase()];
      if (!v || !from) return ctx.reply('💱 *Uso:* /converter 100 usd brl');
      const j = await getJson(`https://economia.awesomeapi.com.br/json/last/${from}-${to}`).catch(() => null);
      const rate = j && Number(Object.values(j)[0]?.bid);
      if (!rate) return ctx.reply('❌ Par de moedas não encontrado.');
      return ctx.reply(`💱 *CONVERSÃO*\n\n${v.toLocaleString('pt-BR')} ${from} = *${(v * rate).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ${to}*\n_Taxa: ${rate}_`);
    },
  },
  {
    name: 'clima', category: CAT, react: '🌍', run: async ctx => {
      if (!ctx.q) return ctx.reply('🌍 *Uso:* /clima <cidade>');
      const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ctx.q)}&count=1&language=pt&format=json`);
      const p = geo.results?.[0]; if (!p) return ctx.reply('❌ Cidade não encontrada.');
      const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,cloud_cover,wind_speed_10m,wind_direction_10m,uv_index,surface_pressure,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=1`);
      const c = w.current, d = w.daily; const hm = s => s.split('T')[1];
      return ctx.reply(`🌍 *PREVISÃO DO TEMPO: ${p.name.toUpperCase()}* 🌍
📍 _${p.name}${p.admin1 ? ', ' + p.admin1 : ''}, ${p.country}_
🗺️ _Coords: ${p.latitude}, ${p.longitude}_

☀️ *ESTADO ATUAL (${dateBR()}):*
• *Condição:* ${WMO[c.weather_code] || 'Indefinido'}
• *Temperatura:* ${c.temperature_2m}°C
• *Sensação Térmica:* ${c.apparent_temperature}°C
• *Umidade Relativa:* ${c.relative_humidity_2m}%
• *Cobertura de Nuvens:* ${c.cloud_cover}%
• *Vento:* ${c.wind_speed_10m} km/h (${dirs[Math.round(c.wind_direction_10m / 45) % 8]} 🧭)
• *Índice UV:* ${c.uv_index}
• *Pressão Atmosférica:* ${c.surface_pressure} hPa

📅 *PREVISÃO DE HOJE:*
• 🔺 *Máxima:* ${d.temperature_2m_max[0]}°C
• 🔻 *Mínima:* ${d.temperature_2m_min[0]}°C
• 🌧️ *Probabilidade de Chuva:* ${d.precipitation_probability_max[0]}%
• 🌅 *Nascer do Sol:* ${hm(d.sunrise[0])}
• 🌇 *Pôr do Sol:* ${hm(d.sunset[0])}`);
    },
  },
  {
    name: 'futebol', category: CAT, react: '⚽', done: '✅', run: async ctx => {
      // 1) football-data.org (chave do Gumball antigo); 2) ESPN gratis como reserva
      if (config.footballKey) { const r = await footballData(ctx.q).catch(() => null); if (r) return ctx.reply(r); }
      const leagues = [['bra.1', '🇧🇷 BRASILEIRÃO'], ['conmebol.libertadores', '🏆 LIBERTADORES'], ['uefa.champions', '⭐ CHAMPIONS LEAGUE'], ['uefa.europa', '🏆 UEFA EUROPA LEAGUE'], ['eng.1', '🏴 PREMIER LEAGUE'], ['esp.1', '🇪🇸 LA LIGA']];
      const blocks = [];
      for (const [code, name] of leagues) {
        const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard`).catch(() => null);
        const ev = (j?.events || []).filter(e => e.status?.type?.state !== 'post').slice(0, 6);
        if (!ev.length) continue;
        const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
        blocks.push(`🏆 *${name}*\n${ev.map((e, i) => {
          const [h, a] = e.competitions[0].competitors.sort(x => (x.homeAway === 'home' ? -1 : 1));
          const live = e.status.type.state === 'in' ? ` 🔴 ${h.score}x${a.score} (${e.status.displayClock})` : '';
          const when = new Date(e.date).toLocaleString('pt-BR', { timeZone: config.timezone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `  ${nums[i]}  _${when}_ ➔ *${h.team.shortDisplayName}* x *${a.team.shortDisplayName}*${live}`;
        }).join('\n')}`);
        if (blocks.length >= 3) break;
      }
      if (!blocks.length) return ctx.reply('⚽ Nenhum jogo de destaque encontrado agora.');
      return ctx.reply(`📅 *PRÓXIMOS JOGOS DE DESTAQUE*\n_Confira as principais partidas da rodada:_\n\n───────────────────────\n\n${blocks.join('\n\n')}`);
    },
  },
  {
    name: 'filme', category: CAT, react: '🔍', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🎬 *Uso:* /filme <nome>');
      if (config.tmdbKey) {
        const r = (await tmdb(`/search/movie?query=${encodeURIComponent(ctx.q)}`)).results?.[0];
        if (!r) return ctx.reply('❌ Filme não encontrado.');
        const cap = `🎬 *${r.title}*\n📅 *Lançamento:* ${r.release_date || '?'}\n⭐ *Avaliação:* ${r.vote_average} (${r.vote_count} votos)\n\n📖 *Sinopse:*\n${r.overview || 'Sem sinopse.'}`;
        return r.poster_path ? ctx.send({ image: { url: `https://image.tmdb.org/t/p/w500${r.poster_path}` }, caption: cap }, { quoted: ctx.m }) : ctx.reply(cap);
      }
      const s = await getJson(`https://pt.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(ctx.q + ' filme')}&limit=1`);
      const page = s.pages?.[0]; if (!page) return ctx.reply('❌ Filme não encontrado.');
      const sum = await getJson(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
      const cap = `🎬 *${sum.title}*\n\n📖 *Sinopse:*\n${sum.extract}`;
      return sum.thumbnail?.source ? ctx.send({ image: { url: sum.originalimage?.source || sum.thumbnail.source }, caption: cap }, { quoted: ctx.m }) : ctx.reply(cap);
    },
  },
  {
    name: 'cinema', category: CAT, react: '🍿', run: async ctx => {
      const j = await tmdb('/movie/now_playing?region=BR&page=1');
      const list = j.results.slice(0, 10).map((f, i) => `${i + 1}. *${f.title}* ⭐ ${f.vote_average.toFixed(1)} _(${f.release_date})_`);
      return ctx.reply(`🍿 *EM CARTAZ NOS CINEMAS*\n\n${list.join('\n')}\n\n💡 _Detalhes: /filme <nome>_`);
    },
  },
  {
    name: 'noticias', category: CAT, react: '📰', done: '✅', run: async ctx => {
      // 1) GNews (aceita assunto: /noticias Laufey); 2) G1 gratis como reserva
      if (config.gnewsKey) {
        const url = ctx.q ? `https://gnews.io/api/v4/search?q=${encodeURIComponent(ctx.q)}&lang=pt&country=br&max=8&apikey=${config.gnewsKey}` : `https://gnews.io/api/v4/top-headlines?lang=pt&country=br&max=8&apikey=${config.gnewsKey}`;
        // plano gratis: 1 pedido por segundo; se recusar, espera e tenta de novo
        let j = await getJson(url).catch(() => null);
        if (!j?.articles) { await new Promise(r => setTimeout(r, 1500)); j = await getJson(url).catch(() => null); }
        if (j?.articles?.length) {
          const items = j.articles.map((a, i) => `*${i + 1}.* ${a.title}\n📰 _${a.source?.name || ''}_\n🔗 ${a.url}`);
          return ctx.reply(`╭━━━━━━━━━━━━━━━━━━━━━━━━╮\n┃   📰 ${ctx.q ? 'NOTÍCIAS: ' + ctx.q.toUpperCase().slice(0, 14) : 'ÚLTIMAS NOTÍCIAS'}   ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n${items.join('\n\n')}`);
        }
        if (ctx.q && j?.articles) return ctx.reply(`📰 Nenhuma notícia recente sobre *${ctx.q}*.`);
      }
      if (ctx.q) { // com assunto e sem GNews: busca no Google Noticias (nunca mostra manchete de outro assunto)
        const $g = cheerio.load(await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(ctx.q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`), { xmlMode: true });
        const it = $g('item').slice(0, 8).map((i, el) => `*${i + 1}.* ${$g(el).find('title').first().text().trim()}\n🔗 ${$g(el).find('link').first().text().trim()}`).get();
        return ctx.reply(it.length ? `╭━━━━━━━━━━━━━━━━━━━━━━━━╮\n┃   📰 NOTÍCIAS: ${ctx.q.toUpperCase().slice(0, 14)}   ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n${it.join('\n\n')}` : `📰 Nenhuma notícia recente sobre *${ctx.q}*.`);
      }
      const xml = await getText('https://g1.globo.com/rss/g1/');
      const $ = cheerio.load(xml, { xmlMode: true });
      const items = $('item').slice(0, 8).map((i, el) => `*${i + 1}.* ${$(el).find('title').first().text().trim()}\n🔗 ${$(el).find('link').first().text().trim()}`).get();
      return ctx.reply(`╭━━━━━━━━━━━━━━━━━━━━━━━━╮\n┃   📰 ÚLTIMAS NOTÍCIAS (G1)   ┃\n╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n${items.join('\n\n')}`);
    },
  },
  {
    name: 'celular', category: CAT, react: '🔍', done: '📱', run: async ctx => {
      if (!ctx.q) return ctx.reply('📱 *Uso:* /celular <modelo>  Ex.: _/celular Galaxy S24_');
      // Fonte aberta: Wikipedia (pt, depois en). Sites de especificacoes bloqueiam robos.
      for (const lang of ['pt', 'en']) {
        const s = await getJson(`https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(ctx.q + ' smartphone')}&limit=3`).catch(() => null);
        const page = s?.pages?.find(p => normalize(p.title).includes(normalize(ctx.q).split(' ')[0])) || s?.pages?.[0];
        if (!page) continue;
        const sum = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`).catch(() => null);
        if (!sum?.extract) continue;
        const cap = `📱 *${sum.title}*\n\n        📝 *Resumo*\n        ${sum.extract.slice(0, 700)}\n\n        🔗 ${sum.content_urls?.desktop?.page || ''}\n\n        ✅ Informações consultadas com sucesso.`;
        const img = sum.originalimage?.source || sum.thumbnail?.source;
        return img ? ctx.send({ image: { url: img }, caption: cap }, { quoted: ctx.m }) : ctx.reply(cap);
      }
      return ctx.reply('❌ Modelo não encontrado.');
    },
  },
  {
    name: 'signo', category: CAT, react: '✨', done: '🔮', run: ctx => {
      let key = normalize(ctx.args[0]);
      const dm = ctx.q.match(/^(\d{1,2})\/(\d{1,2})/);
      if (dm) { const d = +dm[1], m = +dm[2]; const cut = [20, 19, 21, 20, 21, 21, 23, 23, 23, 23, 22, 22]; const order = ['capricornio', 'aquario', 'peixes', 'aries', 'touro', 'gemeos', 'cancer', 'leao', 'virgem', 'libra', 'escorpiao', 'sagitario', 'capricornio']; key = order[d >= cut[m - 1] ? m : m - 1]; }
      if (!C.signos[key]) return ctx.reply('🔮 *Uso Incorreto!* Digite o comando seguido do seu signo.\n\nExemplo: _/signo peixes_');
      const [sym, elem, planeta] = C.signos[key]; const today = dateBR(); const r = seeded(key + today);
      const compat = Object.keys(C.signos)[Math.floor(r() * 12)];
      const nums = Array.from({ length: 4 }, () => String(Math.floor(r() * 60) + 1).padStart(2, '0')).join(' - ');
      return ctx.reply(`🌌 *HORÓSCOPO* 🌌\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n${sym} *Signo:* ${C.signoNomes[key]}\n${{ Fogo: '🔥', Terra: '🌱', Ar: '🌬️', Água: '💧' }[elem]} *Elemento:* ${elem}\n🪐 *Planeta Regente:* ${planeta}\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n📝 *Previsão do Dia (${today}):*\n${C.previsoes[Math.floor(r() * C.previsoes.length)]}\n\n🎰 *Números da Sorte:* ${nums}\n💎 *Amuleto do Dia:* ${C.amuletos[Math.floor(r() * C.amuletos.length)]}\n☯️ *Compatibilidade:* ${C.signoNomes[compat]} ${C.signos[compat][0]}\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n🔮 _As estrelas guiam, mas você decide o caminho._`);
    },
  },
  {
    name: 'cpf', category: CAT, react: '🪪', run: ctx => {
      const [raw, fmt] = genCpf();
      return ctx.reply(`✨ *GERADOR DE CPF* ✨\n\n📝 *Formatado:* \`${fmt}\`\n🔢 *Sem formatação:* \`${raw}\`\n\n⚠️ _Aviso: Este CPF é gerado de forma puramente algorítmica e matemática para fins de testes e homologação de sistemas._`);
    },
  },
  {
    name: 'qr', category: CAT, react: '🔍', done: '✅', run: async ctx => {
      if (!ctx.q) return ctx.reply('🔳 *Uso:* /qr <texto ou link>');
      return ctx.image(await QRCode.toBuffer(ctx.q, { width: 512, margin: 2 }), '✅ *QR Code gerado com sucesso!*');
    },
  },
  {
    name: 'dados', aliases: ['dado'], category: CAT, react: '🎲', done: '✅', run: ctx => {
      const n = rand(1, 6);
      return ctx.reply(`🎲 *DADO LANÇADO* 🎲\n\n👤 *Jogador:* ${ctx.tag(ctx.sender)}\n🎯 *Resultado:* ${'⚀⚁⚂⚃⚄⚅'[n - 1]} [ *${n}* ]`);
    },
  },
  {
    name: 'ff', category: CAT, react: '🔫', run: ctx => {
      const r = seeded(ctx.sender + dateBR());
      const s = () => Math.floor(r() * 41) + 60;
      return ctx.reply(`🔫 *SENSIBILIDADE FREE FIRE DO DIA*\n\n👤 ${ctx.tag(ctx.sender)}\n\n• Geral: *${s()}*\n• Ponto vermelho: *${s()}*\n• Mira 2x: *${s()}*\n• Mira 4x: *${s()}*\n• AWM: *${Math.floor(r() * 40) + 30}*\n• Olhadinha: *${s()}*\n\n🎯 _DPI sugerido: ${pick([400, 411, 440, 480, 520])}_`);
    },
  },
  {
    name: 'afk', category: CAT, react: '💤', run: ctx => {
      db.updateMember(ctx.jid, ctx.sender, m => { m.afk = { reason: ctx.q || 'Sem motivo', since: Date.now() }; });
      return ctx.reply(`💤 ${ctx.tag(ctx.sender)} agora está *AFK*.\n📝 Motivo: _${ctx.q || 'Sem motivo'}_`);
    },
  },
  {
    name: 'admins', category: CAT, react: '🛡️', run: async ctx => {
      const ad = (await ctx.meta()).participants.filter(p => p.admin).map(p => p.id);
      return ctx.reply(`🛡️ *ADMINISTRADORES DO GRUPO*${ctx.q ? `\n\n📢 _${ctx.q}_` : ''}\n\n${ad.map(a => `• ${ctx.tag(a)}`).join('\n')}`, { mentions: ad });
    },
  },
  {
    name: 'linkgp', aliases: ['link'], category: CAT, react: '🔗', botAdmin: true, run: async ctx => {
      const code = await ctx.sock.groupInviteCode(ctx.jid);
      return ctx.reply(`🔗 *LINK DO GRUPO*\n\nhttps://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: 'infogp', aliases: ['grupoinfo'], category: CAT, react: 'ℹ️', run: async ctx => {
      const m = await ctx.meta(); const g = ctx.group; const s = g.settings;
      const on = k => (s[k] ? '✅' : '❌');
      return ctx.reply(`ℹ️ *INFORMAÇÕES DO GRUPO*\n\n📛 *Nome:* ${m.subject}\n👥 *Membros:* ${m.participants.length}\n🛡️ *Admins:* ${m.participants.filter(p => p.admin).length}\n📅 *Criado em:* ${m.creation ? dateBR(new Date(m.creation * 1000)) : '?'}\n🏢 *Cofre:* R$ ${g.vault.toFixed(2)}\n\n🛡️ *PROTEÇÕES*\nAntilink ${on('antilink')} • Antifake ${on('antifake')} • Antipalavra ${on('antipalavra')}\nAntiflood ${on('antiflood')} • Captcha ${on('captcha')} • Boas-vindas ${on('welcome')}\nSó admin ${on('soadm')} • Bot ${g.bot === false ? '❌' : '✅'}\n\n📝 *Descrição:*\n${m.desc || '_sem descrição_'}`);
    },
  },
  {
    name: 'listablock', category: CAT, react: '🚫', owner: true, run: async ctx => {
      const list = await ctx.sock.fetchBlocklist().catch(() => []);
      return ctx.reply(list.length ? `🚫 *CONTATOS BLOQUEADOS PELO BOT* (${list.length})\n\n${list.map(j => `• wa.me/${numId(j)}`).join('\n')}` : '🚫 Nenhum contato bloqueado.');
    },
  },
  {
    name: 'palavras', category: CAT, react: '📋', run: ctx => {
      const w = ctx.group.settings.badwords || [];
      return ctx.reply(w.length ? `📋 *PALAVRAS PROIBIDAS* (${w.length})\n\n${w.map(x => `• ${x}`).join('\n')}` : '📋 *Nenhuma palavra proibida cadastrada.*\n\n💡 Adicione com `/antipalavra add <palavra>`');
    },
  },
  {
    name: 'lembrete', category: CAT, react: '⏰', run: ctx => {
      const all = db.get('reminders', []);
      const sub = normalize(ctx.args[0]);
      if (!ctx.q) return ctx.reply('⏰ *COMO USAR O LEMBRETE*\n\n• `/lembrete amanhã às 13:00 tomar remédio`\n• `/lembrete hoje 20:30 tirar o frango`\n• `/lembrete daqui a 5 minutos tirar o frango`\n• `/lembrete 30min beber água`\n• `/lembrete todos os dias às 07:00 acordar`\n\n📌 *Gerenciamento:*\n• `/lembrete lista`\n• `/lembrete apagar <ID>`');
      if (sub === 'lista') return listReminders(ctx, all);
      if (sub === 'apagar' || sub === 'cancelar') return delReminder(ctx, all, ctx.args[1]);
      const w = parseWhen(ctx.q);
      if (!w || !w.text) return ctx.reply('❌ Não entendi o horário. Ex.: `/lembrete daqui a 10 minutos ligar pra mãe`');
      if (w.at < Date.now() + 5000) return ctx.reply('❌ Esse horário já passou.');
      const id = (db.get('reminderSeq', 0) + 1); db.set('reminderSeq', id);
      all.push({ id, jid: ctx.jid, who: ctx.sender, text: w.text, at: w.at, repeat: w.repeat }); db.set('reminders', all);
      return ctx.reply(`⏰ *LEMBRETE AGENDADO COM SUCESSO!*\n\n🆔 *ID do Lembrete:* \`${id}\`\n📝 *Aviso:* ${w.text}\n📅 *${w.repeat ? 'Primeiro Disparo' : 'Disparo'}:* ${fmtLocal(w.at)}${w.repeat ? '\n🔁 *Repete:* todos os dias' : ''}\n\n💡 *O bot te marcará aqui no grupo na hora exata!*`);
    },
  },
  { name: 'lembretes', category: EXT, react: '📋', run: ctx => listReminders(ctx, db.get('reminders', [])) },
  { name: 'cancelarlembrete', category: null, react: '🗑️', run: ctx => delReminder(ctx, db.get('reminders', []), ctx.args[0]) },

  // ----- extras -----
  {
    name: 'cep', category: EXT, react: '📮', run: async ctx => {
      const cep = ctx.q.replace(/\D/g, ''); if (cep.length !== 8) return ctx.reply('📮 *Uso:* /cep 01001000');
      const j = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
      if (j.erro) return ctx.reply('❌ CEP não encontrado.');
      return ctx.reply(`📮 *CEP ${j.cep}*\n\n🛣️ ${j.logradouro || '—'}\n🏘️ ${j.bairro || '—'}\n🏙️ ${j.localidade} - ${j.uf}\n📞 DDD ${j.ddd}`);
    },
  },
  {
    name: 'ddd', category: EXT, react: '📞', run: async ctx => {
      const d = ctx.q.replace(/\D/g, ''); if (d.length !== 2) return ctx.reply('📞 *Uso:* /ddd 61');
      const j = await getJson(`https://brasilapi.com.br/api/ddd/v1/${d}`).catch(() => null);
      if (!j?.cities) return ctx.reply('❌ DDD não encontrado.');
      return ctx.reply(`📞 *DDD ${d}* — ${j.state}\n\n${j.cities.slice(0, 40).map(c => c[0] + c.slice(1).toLowerCase()).join(', ')}${j.cities.length > 40 ? ` _e mais ${j.cities.length - 40}_` : ''}`);
    },
  },
  {
    name: 'feriados', category: EXT, react: '📅', run: async ctx => {
      const y = new Date().getFullYear(); const today = new Date().toISOString().slice(0, 10);
      const list = [...await getJson(`https://brasilapi.com.br/api/feriados/v1/${y}`), ...await getJson(`https://brasilapi.com.br/api/feriados/v1/${y + 1}`).catch(() => [])].filter(f => f.date >= today).slice(0, 8);
      return ctx.reply(`📅 *PRÓXIMOS FERIADOS NACIONAIS*\n\n${list.map(f => `• *${f.date.split('-').reverse().join('/')}* — ${f.name}`).join('\n')}`);
    },
  },
  {
    name: 'wiki', category: EXT, react: '📚', run: async ctx => {
      if (!ctx.q) return ctx.reply('📚 *Uso:* /wiki <termo>');
      const s = await getJson(`https://pt.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(ctx.q)}&limit=1`);
      const p = s.pages?.[0]; if (!p) return ctx.reply('❌ Nada encontrado na Wikipédia.');
      const sum = await getJson(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`);
      return ctx.reply(`📚 *${sum.title}*\n\n${sum.extract}\n\n🔗 ${sum.content_urls?.desktop?.page || ''}`);
    },
  },
  {
    name: 'encurtar', category: EXT, react: '🔗', run: async ctx => {
      if (!/^https?:\/\//.test(ctx.q)) return ctx.reply('🔗 *Uso:* /encurtar https://exemplo.com/link-grande');
      const short = (await getText(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(ctx.q)}`)).trim();
      return ctx.reply(`🔗 *LINK ENCURTADO*\n\n${short}`);
    },
  },
  { name: 'fazernick', category: EXT, react: '✍️', run: ctx => ctx.q ? ctx.reply(`✍️ *SEU NICK ESTILIZADO*\n\n${FONTS.map((f, i) => `${i + 1}. ${f(ctx.q)}`).join('\n')}`) : ctx.reply('✍️ *Uso:* /fazernick seu nome') },
  { name: 'tagme', category: EXT, react: '👋', run: ctx => ctx.reply(`👋 ${ctx.tag(ctx.sender)}`) },
  { name: 'wame', category: EXT, react: '📲', run: ctx => { const t = ctx.target(); const n = numId(ctx.senderAlt && t === ctx.sender ? ctx.senderAlt : t); return ctx.reply(`📲 wa.me/${n}`); } },
  {
    name: 'notas', category: EXT, react: '🗒️', run: ctx => {
      const n = ctx.group.settings.notes || [];
      return ctx.reply(n.length ? `🗒️ *ANOTAÇÕES DO GRUPO*\n\n${n.map((x, i) => `*${i + 1}.* ${x}`).join('\n')}` : '🗒️ Nenhuma anotação. Use */anotar <texto>*.');
    },
  },
  { name: 'anotar', category: EXT, react: '📝', run: ctx => { if (!ctx.q) return ctx.reply('📝 *Uso:* /anotar <texto>'); db.updateGroup(ctx.jid, g => { (g.settings.notes ||= []).push(ctx.q); }); return ctx.reply('📝 Anotado! Veja com */notas*.'); } },
  { name: 'rmnota', category: EXT, react: '🗑️', run: ctx => { const i = parseInt(ctx.args[0]) - 1; const r = db.updateGroup(ctx.jid, g => { const n = g.settings.notes || []; if (n[i] == null) return 'x'; n.splice(i, 1); }); return ctx.reply(r === 'x' ? '❌ Nota não encontrada.' : '🗑️ Nota apagada.'); } },
  {
    name: 'niver', category: EXT, react: '🎂', run: ctx => {
      const m = ctx.q.match(/^(\d{1,2})\/(\d{1,2})$/); if (!m) return ctx.reply('🎂 *Uso:* /niver 25/12');
      db.updateGroup(ctx.jid, g => { (g.settings.birthdays ||= {})[ctx.sender] = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`; });
      return ctx.reply(`🎂 Aniversário de ${ctx.tag(ctx.sender)} salvo: *${m[1]}/${m[2]}*! O bot vai lembrar o grupo no dia. 🥳`);
    },
  },
  {
    name: 'aniversarios', category: EXT, react: '🎉', run: ctx => {
      const b = Object.entries(ctx.group.settings.birthdays || {}).sort((x, y) => x[1].split('/').reverse().join() < y[1].split('/').reverse().join() ? -1 : 1);
      return b.length ? ctx.reply(`🎉 *ANIVERSÁRIOS DO GRUPO*\n\n${b.map(([j, d]) => `🎂 *${d}* — ${ctx.tag(j)}`).join('\n')}`, { mentions: b.map(x => x[0]) }) : ctx.reply('🎉 Ninguém cadastrou aniversário. Use */niver dd/mm*.');
    },
  },
  {
    name: 'lista', category: EXT, react: '📋', run: ctx => {
      const l = ctx.group.settings.lista;
      if (!ctx.q) return l ? showLista(ctx, l) : ctx.reply('📋 *Uso:* /lista Futebol sábado 15h');
      db.updateGroup(ctx.jid, g => { g.settings.lista = { title: ctx.q, by: ctx.sender, yes: [], open: true }; });
      return ctx.reply(`📋 *LISTA CRIADA:* ${ctx.q}\n\n✅ Entre com */vou*\n❌ Saia com */naovou*`);
    },
  },
  { name: 'vou', category: EXT, react: '✅', run: ctx => { const l = ctx.group.settings.lista; if (!l?.open) return ctx.reply('Não há lista aberta.'); if (!l.yes.includes(ctx.sender)) l.yes.push(ctx.sender); db.updateGroup(ctx.jid, g => { g.settings.lista = l; }); return showLista(ctx, l); } },
  { name: 'naovou', category: EXT, react: '❌', run: ctx => { const l = ctx.group.settings.lista; if (!l?.open) return ctx.reply('Não há lista aberta.'); l.yes = l.yes.filter(j => j !== ctx.sender); db.updateGroup(ctx.jid, g => { g.settings.lista = l; }); return showLista(ctx, l); } },
  {
    name: 'fecharlista', category: EXT, react: '🔒', run: async ctx => {
      const l = ctx.group.settings.lista; if (!l?.open) return ctx.reply('Não há lista aberta.');
      if (l.by !== ctx.sender && !(await ctx.isAdmin())) return ctx.reply('🛡️ Só quem criou ou admin pode fechar.');
      l.open = false; db.updateGroup(ctx.jid, g => { g.settings.lista = l; });
      return showLista(ctx, l, '🔒 *LISTA FECHADA*');
    },
  },
];
function showLista(ctx, l, head = '📋 *LISTA DE PRESENÇA*') {
  return ctx.reply(`${head}\n📌 *${l.title}*\n\n${l.yes.map((j, i) => `${i + 1}. ${ctx.tag(j)}`).join('\n') || '_ninguém ainda_'}\n\n✅ /vou • ❌ /naovou`, { mentions: l.yes });
}
function listReminders(ctx, all) {
  const mine = all.filter(r => r.who === ctx.sender);
  return ctx.reply(mine.length ? `⏰ *SEUS LEMBRETES*\n\n${mine.map(r => `🆔 \`${r.id}\` • ${fmtLocal(r.at)}${r.repeat ? ' 🔁' : ''}\n📝 ${r.text}`).join('\n\n')}` : '⏰ Você não tem lembretes.');
}
function delReminder(ctx, all, id) {
  const i = all.findIndex(r => String(r.id) === String(id) && (r.who === ctx.sender || ctx.isOwner()));
  if (i < 0) return ctx.reply('❌ Lembrete não encontrado.');
  all.splice(i, 1); db.set('reminders', all);
  return ctx.reply(`✅ Lembrete *#${id}* apagado!`);
}
