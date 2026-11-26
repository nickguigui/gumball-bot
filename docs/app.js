// Gumball Bot site: abas, demo, comandos e gerador de canal (100% no navegador, gratis).
// A previa usa fatos reais da Wikipedia (sem IA, que bloqueia chamadas do navegador);
// no canal de verdade o bot usa IA no servidor para escrever cada post.
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const wa = s => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/^&gt; (.*)$/gm, '<span style="border-left:3px solid #8886;padding-left:8px;display:block">$1</span>');
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const REPO = 'nickguigui/gumball-bot';
const pick = a => a[Math.floor(Math.random() * a.length)];

// ---------- navegacao ----------
// Indicador elastico das abas: desliza ate a aba ativa, passa do ponto e volta
const indicator = document.createElement('span'); indicator.className = 'indicator'; $('nav').prepend(indicator);
function moveIndicator(animate = true) {
  const on = $('nav a.on'); if (!on) return;
  if (!animate) indicator.style.transition = 'none';
  indicator.style.left = on.offsetLeft + 'px'; indicator.style.width = on.offsetWidth + 'px';
  if (animate) { indicator.classList.add('squish'); setTimeout(() => indicator.classList.remove('squish'), 160); }
  else { void indicator.offsetWidth; indicator.style.transition = ''; } // aplica a posicao sem animar e religa a transicao
  on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto' });
}
addEventListener('resize', () => moveIndicator(false));
document.fonts?.ready.then(() => moveIndicator(false));
function show(tab, animate = true) {
  $$('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + tab; });
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  moveIndicator(animate);
  window.scrollTo({ top: 0 });
}
document.addEventListener('click', e => { const a = e.target.closest('[data-tab]'); if (a) { e.preventDefault(); history.replaceState(null, '', '#' + a.dataset.tab); show(a.dataset.tab); } });
show(['inicio', 'comandos', 'canal', 'conectar'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'inicio', false);
addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 4), { passive: true });

// ---------- playground: cada categoria mostra uma conversa de verdade ----------
// ['out', texto] = voce manda; ['in', texto, reacao?] = o bot responde; ['sticker', emoji]
const DEMOS = {
  figurinhas: [['out', '📷 foto do Lucas dormindo na aula\n/fig'], ['sticker', '😴'], ['out', '/brat hoje não'], ['sticker', '💚'], ['out', '/emojimix 😂+🔥'], ['sticker', '🥵']],
  musica: [['out', '/play coldplay yellow'], ['in', '🚀 *Pega a pipoca!* Já tô preparando seu som na qualidade máxima!', '🎵'], ['in', '🎧 _yellow.mp3_  4:26', '✅'], ['out', '/lyrics Queen - Bohemian Rhapsody'], ['in', '🎵 *Bohemian Rhapsody*\n👤 *Artista:* Queen\n\n📝 *Letra:*\n_(a letra completa vem aqui)_', '✅']],
  jogos: [['out', '/anagrama'], ['in', '🔤 *NOVO ANAGRAMA INICIADO!*\n\n👉 *SMONCAROID*\n💡 *Dica:* Aparelho para esquentar refeições\n⏳ 10 minutos', '🔤'], ['out', '/anagrama geladeira'], ['in', '❌ *Resposta Incorreta!* Tente novamente!'], ['out', '/anagrama microondas'], ['in', '🎉 *PARABÉNS! VOCÊ ACERTOU!*\n💰 *Prêmio:* +R$ 98,00\n⭐ *XP:* +14']],
  economia: [['out', '/daily'], ['in', '💰 *DAILY COLETADO*\n💵 *Recompensa:* +R$ 165,00\n✨ +24 XP\n💳 *Saldo:* R$ 340,00', '💰'], ['out', '/minerar'], ['in', '⛏️ *MINERAÇÃO*\n🎁 *Encontrou:* 💎 Diamante\n💵 +R$ 250,00', '⛏️'], ['out', '/roubar @Ana'], ['in', '🛡️ @Ana tinha um *Escudo Anti-Roubo*! O roubo falhou.']],
  zoeira: [['out', '/gado @Lucas'], ['in', '🐂 *GADÔMETRO*\n👤 @Lucas\n📊 _87%_  [▰▰▰▰▰▰▰▰▰▱]\n🌾 *Nível:* _PASTADOR PROFISSIONAL_', '🐂'], ['out', '/ship @Ana @Bia'], ['in', '💘 *SHIP*\n@Ana ❤️ @Bia\n❤️❤️❤️❤️❤️❤️❤️🤍🤍🤍 *73%*\n_Tem química aí! 🔥_', '💘']],
  moderacao: [['out', 'entra no meu grupo chat.whatsapp.com/xyz'], ['in', '⚠️ @Pedro, *link* não é permitido aqui! Advertência 1/3.'], ['out', '/fechargp 22:00'], ['in', '⏰ O grupo vai *fechar* todo dia às *22:00*.', '🔒'], ['out', '/msgbv'], ['in', '👋 Mensagem de boas-vindas *ativada*!']],
  utilidades: [['out', '/lembrete amanhã às 7h acordar'], ['in', '⏰ *LEMBRETE AGENDADO!*\n📅 *Disparo:* amanhã às 07:00\n💡 O bot te marca aqui na hora!', '⏰'], ['out', '/clima Brasília'], ['in', '🌍 *BRASÍLIA*\n• *Condição:* Parcialmente nublado ⛅\n• *Temperatura:* 24°C\n• 🌧️ *Chuva hoje:* 70%', '🌍']],
  canal: [['in', '💜 *_🧠 CURIOSIDADE DO DIA_*\n\nVocê sabia? Em 2025, ela foi nomeada uma das Mulheres do Ano da revista Time.\n\n💜- _Nick_'], ['in', '💜 *_🎮 JOGO DA NOITE: VERDADE OU MENTIRA?_*\n\n_"O primeiro EP saiu em 2023."_\n\n🤫 _A resposta tá escondida no Ler mais_ 👇'], ['in', '💜 *_CANAL OFF‼️_*\n\nBoa noite! Amanhã tem mais 💤']],
};
let demoRun = 0;
async function playDemo(key) {
  const run = ++demoRun, box = $('#demo-chat'), typing = $('#demo-typing');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
  $$('.topics button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.demo === key)));
  box.innerHTML = '';
  for (const [kind, text, react] of DEMOS[key]) {
    if (run !== demoRun) return;
    if (kind === 'out') { typing.textContent = text.split('\n').pop(); await wait(700); typing.textContent = 'Mensagem'; }
    else await wait(900);
    if (run !== demoRun) return;
    const d = document.createElement('div');
    d.className = 'msg ' + (kind === 'out' ? 'out' : kind === 'sticker' ? 'in sticker' : 'in');
    d.innerHTML = kind === 'sticker' ? esc(text) : (kind === 'in' && key !== 'canal' ? '<span class="who">Gumball</span>' : '') + wa(text) + (react ? `<br><span class="react">${esc(react)}</span>` : '');
    box.append(d); while (box.children.length > 6) box.firstChild.remove();
  }
}
$$('.topics button').forEach(b => b.addEventListener('click', () => playDemo(b.dataset.demo)));
if ($('#demo-chat')) playDemo('figurinhas');

// ---------- comandos ----------
fetch('commands.json').then(r => r.json()).then(data => {
  $('#stat-cmds').textContent = `${data.total}`;
  const render = q => {
    q = (q || '').toLowerCase().replace(/^\//, '');
    $('#cmd-list').innerHTML = data.categories.map(c => {
      const cmds = c.cmds.filter(x => !q || x.includes(q)); if (!cmds.length) return '';
      return `<div class="cmd-cat"><h3>${esc(c.cat)}</h3>${cmds.map(x => `<button class="cmd-chip">/${esc(x)}</button>`).join('')}</div>`;
    }).join('') || '<p class="muted">Nenhum comando encontrado.</p>';
  };
  render(); $('#cmd-search').addEventListener('input', e => render(e.target.value));
  $('#cmd-list').addEventListener('click', e => { const b = e.target.closest('.cmd-chip'); if (b) { navigator.clipboard?.writeText(b.textContent); const t = b.textContent; b.textContent = 'copiado'; setTimeout(() => { b.textContent = t; }, 800); } });
}).catch(() => {});

// ---------- conectar + painel (igual ZueiraBot: sem GitHub, sem conta) ----------
// O servidor roda num tunel cujo endereco muda a cada turno: ele publica o atual em endpoint.json
let API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : '';
async function apiBase(force) {
  if (API && !force) return API;
  // raw.githubusercontent nao tem limite por IP (a API do GitHub tem 60/hora, pouco para quem usa 4G); a API fica de reserva
  const tries = [`https://raw.githubusercontent.com/${REPO}/main/endpoint.json?t=${Date.now()}`, `https://api.github.com/repos/${REPO}/contents/endpoint.json?ref=main`];
  let j = null;
  for (const u of tries) {
    const r = await fetch(u, { headers: u.includes('api.github') ? { Accept: 'application/vnd.github.raw+json' } : {}, cache: 'no-store' }).catch(() => null);
    j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.url) break;
  }
  if (!j?.url) throw new Error(j?.trocando ? 'O servidor está trocando de turno. Tente de novo em 2 minutos.' : 'O servidor está fora do ar agora. Tente de novo em alguns minutos.');
  return (API = j.url);
}
let session = store.get('gb-sessao') || '';
async function api(path, opts = {}) {
  let base = await apiBase();
  // se o endereco antigo parou de responder, busca o novo uma vez
  const go = b => fetch(b + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let r = await go(base).catch(() => null);
  if (!r || r.status === 530 || r.status === 502) { base = await apiBase(true); r = await go(base).catch(() => null); }
  if (!r) throw new Error('Não consegui falar com o servidor. Confira sua internet e tente de novo.');
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path === '/api/painel') { session = ''; store.set('gb-sessao', ''); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
const view = id => ['cx-numero', 'cx-parear', 'cx-entrar', 'painel'].forEach(v => { $('#' + v).hidden = v !== id; });
const showErr = (el, msg) => { $(el).textContent = msg; $(el).hidden = !msg; };
let ticket = '', pollTimer = null;
$('#cx-form').addEventListener('submit', async e => {
  e.preventDefault(); showErr('#cx-erro', '');
  const btn = e.target.querySelector('button'); btn.disabled = true;
  try {
    const r = await api('/api/entrar', { method: 'POST', body: { telefone: e.target.telefone.value } });
    ticket = r.ticket; $$('.cx-num').forEach(el => { el.textContent = r.numero; });
    if (r.passo === 'parear') { $('#cx-code').textContent = r.codigo; view('cx-parear'); pollPair(); }
    else { view('cx-entrar'); $('#cx-login').codigo.focus(); }
  } catch (err) { showErr('#cx-erro', err.message); } finally { btn.disabled = false; }
});
function pollPair() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await api('/api/pareamento?ticket=' + ticket);
      if (r.codigo && r.codigo !== $('#cx-code').textContent) $('#cx-code').textContent = r.codigo; // codigo novo quando o anterior expira
      if (r.estado === 'conectado') { clearInterval(pollTimer); session = r.token; store.set('gb-sessao', session); openPanel(); }
      if (r.estado === 'expirado' || r.estado === 'erro') { clearInterval(pollTimer); view('cx-numero'); showErr('#cx-erro', r.estado === 'erro' ? 'O WhatsApp recusou o código. Tente de novo.' : 'O tempo acabou. Toque em Continuar para gerar outro código.'); }
    } catch {}
  }, 3000);
}
$('#cx-code').addEventListener('click', () => navigator.clipboard?.writeText($('#cx-code').textContent.replace('-', '')));
$('#cx-login').addEventListener('submit', async e => {
  e.preventDefault(); showErr('#cx-erro2', '');
  try { const r = await api('/api/login', { method: 'POST', body: { ticket, codigo: e.target.codigo.value } }); session = r.token; store.set('gb-sessao', session); openPanel(); }
  catch (err) { showErr('#cx-erro2', err.message); }
});
$$('.cx-voltar').forEach(b => b.addEventListener('click', () => { clearInterval(pollTimer); view('cx-numero'); }));

const ESTADOS = { connected: ['Conectado', 'on'], reconnecting: ['Reconectando', ''], starting: ['Ligando', ''], offline: ['Desligado', 'off'], 'logged-out': ['Desconectado no celular', 'off'] };
async function openPanel() {
  try {
    const p = await api('/api/painel'); view('painel');
    $('#pn-num').textContent = p.nome ? `${p.nome} (${p.numero})` : p.numero;
    const [txt, cls] = ESTADOS[p.estado] || [p.estado, '']; $('#pn-estado').textContent = txt; $('#pn-estado').className = 'estado ' + cls;
    $('#pn-privado').checked = !!p.config.privateChats;
    $('#pn-canais').innerHTML = p.canais.length ? p.canais.map(c => `<li><div><b>${esc(c.emoji || '📰')} ${esc(c.name || c.topic)}</b><p>${esc(c.topic)}${c.invite ? '' : '. Falta o link do canal.'}</p></div><button class="btn text" data-del="${esc(c.id)}">Remover</button></li>`).join('') : '<li><div><p>Nenhum canal ainda. Crie um sobre o assunto que quiser.</p></div></li>';
  } catch { view('cx-numero'); }
}
$('#pn-privado').addEventListener('change', async e => {
  try { await api('/api/config', { method: 'POST', body: { privateChats: e.target.checked } }); } catch (err) { e.target.checked = !e.target.checked; alert(err.message); }
});
$('#pn-canais').addEventListener('click', async e => { const id = e.target.dataset.del; if (id) { await api('/api/canais', { method: 'POST', body: { remover: id } }).catch(err => alert(err.message)); openPanel(); } });
$('#pn-sair').addEventListener('click', async () => { await api('/api/sair', { method: 'POST' }).catch(() => {}); session = ''; store.set('gb-sessao', ''); view('cx-numero'); });
$('#pn-desconectar').addEventListener('click', async () => {
  if (!confirm('Desconectar o bot do seu número e apagar seus dados do servidor? Não dá para desfazer.')) return;
  await api('/api/desconectar', { method: 'POST' }).catch(err => alert(err.message)); session = ''; store.set('gb-sessao', ''); view('cx-numero');
});
if (session) openPanel(); else view('cx-numero');


// ---------- gerador de canal ----------
const SLOTS = [
  ['on', '06:00', 'CANAL ON‼️', 'Abre o dia com o card do canal'],
  ['curiosidade', '08:00', '🧠 Curiosidade do dia', 'Fato real do assunto'],
  ['data', '09:00', '🎂 Datas especiais', 'Só posta quando tem data cadastrada'],
  ['musica', '10:00', '🎧 Música do dia', 'Capa + prévia oficial de 30 s'],
  ['icon', '12:00', '🖼️ Icon liberado', 'Imagem de licença livre'],
  ['isso', '14:00', '🤔 Isso ou aquilo', 'Enquete'],
  ['enquete', '15:00', '🗳️ Enquete do dia', 'Enquete'],
  ['figurinhas', '16:00', '🎨 Hora das figurinhas', '5 figurinhas do assunto'],
  ['quiz', '17:00', '🧠 Quiz', 'Enquete valendo'],
  ['resposta', '19:00', '✅ Resposta do quiz', 'Com explicação'],
  ['mecore', '20:00', '🖤 Me core', 'Melancólico + alívio cômico'],
  ['jogo', '21:30', '🎮 Jogo da noite', 'Resposta escondida no "Ler mais"'],
  ['off', '23:30', 'CANAL OFF‼️', 'Fecha o dia'],
  ['news', 'o dia todo', '📰 Notícias', 'Até 8 por dia'],
  ['videos', 'o dia todo', '🎬 Vídeos', 'Até 3 por dia'],
];
const ctx = {};
const timeout = (p, ms = 25000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('demorou demais')), ms))]);
function step(text) { const li = document.createElement('li'); li.className = 'run'; li.innerHTML = `<span class="ms">progress_activity</span><span>${esc(text)}</span>`; $('#canal-progress').append(li); return li; }
function done(li, ok, text) { li.className = ok ? 'ok' : 'err'; li.innerHTML = `<span class="ms">${ok ? 'check_circle' : 'error'}</span><span>${esc(text)}</span>`; }

async function wiki(topic) {
  for (const lang of ['pt', 'en']) {
    try {
      const s = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=1&format=json&origin=*`)).json();
      const title = s.query?.search?.[0]?.title; if (!title) continue;
      const p = await (await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts|pageimages&explaintext=1&piprop=original&titles=${encodeURIComponent(title)}&format=json&origin=*`)).json();
      const page = Object.values(p.query.pages)[0];
      if ((page.extract || '').length > 600) return { title, text: page.extract, image: page.original?.source, lang };
    } catch {}
  }
  return { title: topic, text: '' };
}
function sentences(text) {
  // corta secoes que sao listas (discografia, turnes, links, referencias)
  const cut = text.search(/\n==+\s*(Discografia|Turnês|Turnês?|Filmografia|Prêmios e indicações|Referências|Ligações externas|Bibliografia|Notas|Discography|Tours|References|External links|See also|Ver também)\s*==+/i);
  const body = cut > 0 ? text.slice(0, cut) : text;
  return body.split('\n').filter(l => l.length > 80 && /[.!?]$/.test(l.trim()) && !/^=+/.test(l)) // so paragrafos de verdade
    .join(' ').split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“])/)
    .map(s => s.replace(/\s*\([^)]*(:|\[|pinyin|IPA)[^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim())
    .filter(s => s.length > 60 && s.length < 240 && !/[{}|[\]]|\bISBN\b|\(\s*\)|;.*;/.test(s));
}
function jsonp(url) {
  return new Promise((res, rej) => {
    const cb = 'dz' + Math.random().toString(36).slice(2), s = document.createElement('script');
    window[cb] = d => { res(d); delete window[cb]; s.remove(); };
    s.onerror = () => { rej(new Error('Deezer indisponível')); s.remove(); };
    s.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`; document.head.append(s);
    setTimeout(() => rej(new Error('Deezer demorou')), 15000);
  });
}
async function images(n = 8) {
  const j = await (await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(ctx.topic)}&page_size=${n}&mature=false`)).json();
  return (j.results || []).map(r => ({ url: r.thumbnail || r.url, credit: `${r.creator || 'autor'} (${(r.license || '').toUpperCase()})` }));
}
const E = () => ctx.emoji || '📰';
const sign = () => (ctx.signature ? `\n\n${E()}- _${ctx.signature}_` : '');
const bubble = html => `<div class="msg in">${html}</div>`;
const poll = (q, opts) => `<div class="poll"><b>${esc(q)}</b>${opts.map(o => `<div>${esc(o)}</div>`).join('')}</div>`;
const card = (title, sub) => `<div style="background:var(--primary-container);color:var(--on-primary-container);border-radius:6px;padding:28px 12px;text-align:center;margin-bottom:4px"><div style="font-size:24px;font-weight:500">${esc(title)}</div><div style="font-size:13px;opacity:.8">${esc(sub)}</div></div>`;
const hiddenAnswer = ans => `${wa('🤫 _Pensou? Não vale trapacear! A resposta tá escondida aqui embaixo_ 👇')}<br><span class="readmore" onclick="this.nextElementSibling.classList.add('show');this.remove()">Ler mais</span><div class="hidden-answer">${wa('\n> ✔️ ' + ans)}</div>`;

function makeQuiz() {
  const withYear = ctx.sents.filter(s => /\b(19|20)\d{2}\b/.test(s));
  const s = withYear.length ? pick(withYear) : null; if (!s) return null;
  const year = +s.match(/\b(19|20)\d{2}\b/)[0];
  const maxY = new Date().getFullYear(); const opts = new Set([year]);
  for (let i = 0; opts.size < 4 && i < 50; i++) { const y = year + pick([-4, -3, -2, -1, 1, 2, 3]); if (y <= maxY) opts.add(y); }
  const options = [...opts].sort(() => Math.random() - 0.5).map(String);
  return { pergunta: `Complete: "${s.replace(String(year), '____')}"`, opcoes: options, correta: options.indexOf(String(year)), explicacao: s };
}
const BUILD = {
  on: async () => bubble(card('CANAL ON‼️', ctx.name) + wa(`${E()} *_CANAL ON‼️_*\n\nBom dia! Bora acompanhar tudo sobre *${ctx.topic}* hoje ✨${sign()}`)),
  off: async () => bubble(card('CANAL OFF‼️', ctx.name) + wa(`${E()} *_CANAL OFF‼️_*\n\nBoa noite! Amanhã tem mais 💤${sign()}`)),
  curiosidade: async () => { const s = pick(ctx.sents.filter(x => /\d/.test(x)).concat(ctx.sents)); if (!s) throw new Error('sem fatos na Wikipédia'); return bubble(wa(`${E()} *_🧠 CURIOSIDADE DO DIA_*\n\nVocê sabia? ${s}${sign()}`)); },
  data: async () => bubble(wa(`${E()} *_🎂 DATA ESPECIAL_*\n\n_Cadastre datas (aniversários, lançamentos) depois de aprovar, no campo "dates" do channels.json. Ex.: {"date":"13/12","text":"Aniversário!"}_`)),
  musica: async () => {
    if (!ctx.artist) return bubble(wa('_Sem artista definido: este post fica desligado. Preencha o campo do artista para ativar._'));
    const s = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(ctx.artist)}&limit=1`); const id = s.data?.[0]?.id; if (!id) throw new Error('artista não encontrado no Deezer');
    const t = pick((await jsonp(`https://api.deezer.com/artist/${id}/top?limit=25`)).data);
    return bubble(`<img src="${esc(t.album.cover_big)}" alt="">` + wa(`${E()} *_🎧 MÚSICA DO DIA_*\n\n🎵 *${t.title}*\n👤 ${t.artist.name}\n💿 _${t.album.title}_${sign()}`)) + bubble(`🎤 Prévia de 30 s<audio controls src="${esc(t.preview)}"></audio>`);
  },
  icon: async () => { const i = ctx.imgs[0]; if (!i) throw new Error('nenhuma imagem livre encontrada'); return bubble(`<img src="${esc(i.url)}" alt="">` + wa(`${E()} *_🖼️ ICON LIBERADO_*\n\nSalva e usa à vontade! 💅\n_📷 ${i.credit}_${sign()}`)); },
  figurinhas: async () => { const st = ctx.imgs.slice(1, 6); if (!st.length) throw new Error('nenhuma imagem livre encontrada'); return bubble(wa(`${E()} *_🎨 HORA DAS FIGURINHASSS‼️_*\n\nSegura aí ${st.length} figurinhas fresquinhas 👇`)) + `<div class="stickers">${st.map(i => `<img src="${esc(i.url)}" alt="">`).join('')}</div>`; },
  isso: async () => { const [a, b] = pick([['Fase antiga', 'Fase atual'], ['Ver ao vivo', 'Assistir no sofá'], ['Conhecer pessoalmente', 'Ganhar um autógrafo'], ['Camiseta oficial', 'Pôster gigante'], ['Maratonar tudo hoje', 'Ir com calma a semana toda']]); return poll(`🤔 ISSO OU AQUILO (${ctx.topic}): ${a} ou ${b}?`, [a, b]); },
  enquete: async () => poll(`🗳️ ENQUETE DO DIA: há quanto tempo você acompanha ${ctx.topic}?`, ['Desde o começo 👑', 'Uns 2 ou 3 anos', 'Cheguei este ano', 'Cheguei hoje 👀']),
  quiz: async () => { ctx.quiz = makeQuiz(); if (!ctx.quiz) throw new Error('sem datas na Wikipédia para montar o quiz'); return poll(`🧠 QUIZ: ${ctx.quiz.pergunta}`, ctx.quiz.opcoes); },
  resposta: async () => { const q = ctx.quiz; if (!q) throw new Error('o quiz não foi gerado'); return bubble(wa(`${E()} *_✅ RESPOSTA DO QUIZ_*\n\n👉 *${q.opcoes[q.correta]}*\n\n> ${q.explicacao}${sign()}`)); },
  mecore: async () => bubble(wa(`${E()} *_🖤 ME CORE_*\n\n${pick([`ser fã de ${ctx.topic} é sentir saudade de uma época que eu nem vivi... e depois lembrar que tenho prova amanhã 🫠`, `a vida passa, as estações mudam, e eu continuo aqui, pensando em ${ctx.topic} às 3 da manhã. normal. totalmente normal 🙂`, `às vezes eu olho pela janela e penso em ${ctx.topic}. aí o ônibus passa direto do meu ponto 🚌💨`])}${sign()}`)),
  jogo: async () => {
    const s = pick(ctx.sents.filter(x => /\b(19|20)\d{2}\b/.test(x))) || pick(ctx.sents); if (!s) throw new Error('sem fatos na Wikipédia');
    const truth = Math.random() < 0.5; let claim = s;
    if (!truth) { const y = s.match(/\b(19|20)\d{2}\b/); claim = y ? s.replace(y[0], String(+y[0] + pick([-3, -2, 2, 3]))) : s.replace(/\bnão\b/, '').replace(/\bé\b/, 'não é'); }
    return bubble(wa(`${E()} *_🎮 JOGO DA NOITE: VERDADE OU MENTIRA?_*\n\n_"${claim}"_\n\n✅ = verdade\n❌ = mentira\n\n`) + hiddenAnswer(truth || claim === s ? `É VERDADE! ${s}` : `É MENTIRA! O certo é: ${s}`) + wa(sign()));
  },
  news: async () => bubble(wa(`${E()} *_📰 [manchete mais recente sobre ${ctx.topic}]_*\n\n_O bot busca no Google News a cada 10 minutos e escreve um resumo com IA._\n\n🔗 `) + `<a href="https://news.google.com/search?q=${encodeURIComponent(ctx.topic)}&hl=pt-BR" target="_blank" rel="noopener">ver as notícias de agora</a>`),
  videos: async () => bubble(wa(`${E()} *_🎬 VÍDEO NOVO_*\n\nO bot procura vídeos novos sobre *${ctx.topic}* no YouTube e posta até 3 por dia.\n\n▶️ `) + `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent(ctx.topic)}&sp=CAI%253D" target="_blank" rel="noopener">ver exemplos</a>`),
};

$('#canal-form').addEventListener('submit', async e => {
  e.preventDefault();
  Object.assign(ctx, Object.fromEntries(new FormData(e.target)), { imgs: [], quiz: null }); ctx.name ||= ctx.topic;
  const btn = e.target.querySelector('button'); btn.disabled = true;
  $('#canal-progress').hidden = false; $('#canal-progress').innerHTML = ''; $('#canal-result').hidden = true;
  let s = step(`Pesquisando "${ctx.topic}" na Wikipédia`);
  ctx.wiki = await wiki(ctx.topic); ctx.sents = sentences(ctx.wiki.text);
  done(s, ctx.sents.length > 3, ctx.sents.length > 3 ? `Wikipédia: "${ctx.wiki.title}" (${ctx.sents.length} fatos encontrados)` : 'Pouca coisa na Wikipédia: alguns posts terão menos fatos');
  s = step('Buscando imagens de licença livre');
  try { ctx.imgs = await timeout(images(8)); done(s, ctx.imgs.length > 0, `${ctx.imgs.length} imagens encontradas`); } catch { done(s, false, 'Imagens indisponíveis agora'); }
  if (ctx.wiki.image) ctx.imgs.unshift({ url: ctx.wiki.image, credit: 'Wikimedia Commons' });
  s = step('Montando a grade com uma prévia de cada post');
  $('#r-topic').textContent = ctx.topic;
  $('#grade-body').innerHTML = SLOTS.map(([k, t, label, sub]) => `<li data-k="${k}"><div class="when">${t.includes(':') ? `<input type="time" value="${t}" aria-label="Horário de ${esc(label)}">` : `<small>${t}</small>`}</div><div class="kind"><b>${esc(label)}</b><small>${esc(sub)}</small></div><div class="preview" id="pv-${k}"><div class="msg in">gerando...</div></div><input type="checkbox" class="switch" aria-label="Ativar ${esc(label)}" ${k === 'musica' && !ctx.artist ? '' : 'checked'}></li>`).join('');
  $$('#grade-body li').forEach(li => li.classList.toggle('off', !li.querySelector('.switch').checked));
  $('#canal-result').hidden = false;
  let ok = 0;
  for (const [k] of SLOTS) { // em ordem: a resposta depende do quiz
    try { $('#pv-' + k).innerHTML = await timeout(BUILD[k](), 30000); ok++; } catch (err) { $('#pv-' + k).innerHTML = bubble(wa(`_Prévia indisponível (${err.message}). No canal, o bot tenta de novo na hora do post._`)); }
  }
  done(s, true, `${ok} de ${SLOTS.length} prévias prontas. Confira a grade abaixo.`);
  btn.disabled = false;
  $('#canal-result').scrollIntoView({ behavior: 'smooth' });
});
$('#grade-body').addEventListener('change', e => { if (e.target.classList.contains('switch')) e.target.closest('li').classList.toggle('off', !e.target.checked); });

function buildConfig() {
  const slots = {}, disabled = [];
  for (const li of $$('#grade-body li')) { const k = li.dataset.k, t = li.querySelector('input[type=time]'); if (t) slots[k] = t.value; if (!li.querySelector('.switch').checked) disabled.push(k); }
  const id = ctx.topic.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return { id, name: ctx.name, topic: ctx.topic, query: ctx.topic, emoji: ctx.emoji, signature: ctx.signature || undefined, tone: ctx.tone, artist: ctx.artist || undefined, invite: $('#ch-invite').value.trim(), slots, disabled, news: !disabled.includes('news'), videos: !disabled.includes('videos'), dates: [], enabled: true };
}
$('#btn-approve').addEventListener('click', () => {
  if (!/whatsapp\.com\/channel\//.test($('#ch-invite').value)) { $('#ch-invite').focus(); return; }
  $('#cfg-json').textContent = JSON.stringify(buildConfig(), null, 2); $('#approve-out').hidden = false;
});
$('#btn-copy').addEventListener('click', () => { navigator.clipboard?.writeText($('#cfg-json').textContent); $('#btn-copy').lastChild.textContent = 'Copiado'; });
$('#btn-github').addEventListener('click', async () => {
  const btn = $('#btn-github');
  if (!session) { alert('Entre no painel primeiro (aba Conectar / Painel). Depois volte aqui e toque de novo.'); return; }
  btn.disabled = true;
  try { await api('/api/canais', { method: 'POST', body: { canal: buildConfig() } }); btn.lastChild.textContent = 'Ativado! Começa em até 10 minutos'; }
  catch (err) { btn.disabled = false; alert(err.message); }
});
