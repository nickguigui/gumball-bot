// Galeria de figurinhas (aba "Figurinhas"): pacotes publicados pelo bot no ramo "galeria" do repositorio.
const $ = s => document.querySelector(s);
const REPO = 'nickguigui/gumball-bot';
const RAW = `https://raw.githubusercontent.com/${REPO}/galeria`;
const APK = `https://github.com/${REPO}/releases/latest/download/gumball-figurinhas.apk`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isAndroid = /Android/i.test(navigator.userAgent), isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// dentro do app Android: o app abre o site com ?app=1 (guardado para a navegacao toda) e injeta o Capacitor
try { if (/[?&]app=1/.test(location.search)) sessionStorage.setItem('gumball-app', '1'); } catch {}
const inApp = /GumballApp/i.test(navigator.userAgent) || !!window.Capacitor?.isNativePlatform?.() || (() => { try { return sessionStorage.getItem('gumball-app') === '1'; } catch { return false; } })();

// raw.githubusercontent guarda por ate 5 min; a API do GitHub e a reserva (sempre atual)
async function getJson(file) {
  const tries = [`${RAW}/${file}?t=${Date.now()}`, `https://api.github.com/repos/${REPO}/contents/${file}?ref=galeria`];
  for (const u of tries) {
    const r = await fetch(u, { cache: 'no-store', headers: u.includes('api.github') ? { Accept: 'application/vnd.github.raw+json' } : {} }).catch(() => null);
    if (r?.ok) { const j = await r.json().catch(() => null); if (j) return j; }
  }
  return null;
}
let index = null, atual = null, tocando = null;

async function carregar() {
  if (index) return render();
  index = await getJson('index.json') || { pacotes: [] };
  render();
}
function render() {
  const q = ($('#gal-busca').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const f = document.querySelector('input[name=gf]:checked')?.value;
  const list = index.pacotes.filter(p => !p.oculto)
    .filter(p => !q || `${p.nome} ${p.autor}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
    .filter(p => !f || (f === 'som' ? p.comSom : f === 'anim' ? p.animado : !p.animado));
  $('#gal-grid').innerHTML = list.length ? list.map(p => `
    <a class="gal-card" href="#figurinhas/${esc(p.id)}">
      <img loading="lazy" src="${RAW}/p/${esc(p.id)}/${esc(p.capa)}" alt="">
      <span class="gal-nome">${esc(p.nome)}</span>
      <span class="gal-meta">${p.qtd} figurinhas${p.autor ? ` · ${esc(p.autor)}` : ''}</span>
      <span class="gal-tags">${p.animado ? '<span title="Animado">🎞️</span>' : ''}${p.comSom ? `<span title="${p.comSom} com som">🔊</span>` : ''}</span>
    </a>`).join('') : `<p class="muted">${index.pacotes.length ? 'Nenhum pacote com esse filtro.' : 'Ainda não tem pacotes. Seja o primeiro: mande <code>/novopacote Nome</code> no WhatsApp para o seu Gumball.'}</p>`;
}
$('#gal-busca').addEventListener('input', () => index && render());
$('#gal-filtro').addEventListener('change', () => index && render());

async function abrir(id) {
  $('#gal-lista').hidden = true; $('#gal-pacote').hidden = false; $('#gp-dica').hidden = true;
  $('#gp-nome').textContent = 'Carregando…'; $('#gp-sub').textContent = ''; $('#gp-figs').innerHTML = '';
  const pack = await getJson(`p/${id}/pack.json`);
  if (!pack) { $('#gp-nome').textContent = 'Pacote não encontrado'; $('#gp-sub').textContent = 'Ele pode ter sido apagado por quem publicou.'; return; }
  atual = pack;
  const base = `${RAW}/p/${pack.id}`;
  $('#gp-tray').src = `${base}/${pack.tray || pack.figurinhas[0].f}`;
  $('#gp-nome').textContent = pack.nome;
  const som = pack.figurinhas.filter(f => f.som).length;
  $('#gp-sub').textContent = `${pack.figurinhas.length} figurinhas ${pack.animado ? 'animadas' : 'paradas'}${som ? ` · ${som} com som` : ''}${pack.autor ? ` · por ${pack.autor}` : ''}`;
  $('#gp-figs').innerHTML = pack.figurinhas.map((f, i) => `
    <figure class="gp-fig">
      <img loading="lazy" src="${base}/${esc(f.f)}" alt="Figurinha ${i + 1} ${esc((f.emojis || []).join(' '))}">
      ${f.som ? `<button class="gp-som" data-som="${esc(f.som)}" aria-label="Ouvir o som"><span class="ms">volume_up</span></button>` : ''}
      <a class="gp-dl" href="${base}/${esc(f.f)}" download="${esc(pack.nome)}-${i + 1}.webp" aria-label="Baixar"><span class="ms">download</span></a>
    </figure>`).join('');
  // "Adicionar ao WhatsApp": no app Android abre direto; no celular Android sem o app, baixa o app
  $('#gp-app').href = inApp || isAndroid ? `gumball://pacote/${pack.id}` : '#';
  window.scrollTo({ top: 0 });
}
$('#gp-figs').addEventListener('click', e => {
  const b = e.target.closest('.gp-som'); if (!b) return;
  if (tocando) { tocando.pause(); tocando.btn.classList.remove('on'); if (tocando.btn === b) { tocando = null; return; } }
  const a = new Audio(`${RAW}/p/${atual.id}/${b.dataset.som}`); a.btn = b; b.classList.add('on'); a.onended = () => b.classList.remove('on'); a.play().catch(() => { dica('Seu navegador não toca esse áudio. Baixe o pacote ou mande no WhatsApp para ouvir.'); b.classList.remove('on'); }); tocando = a;
});
function dica(html) { $('#gp-dica').innerHTML = html; $('#gp-dica').hidden = false; }
$('#gp-app').addEventListener('click', e => {
  if (inApp) return; // o app intercepta gumball://
  if (isAndroid) { setTimeout(() => { if (!document.hidden) dica(`Não achei o app do Gumball neste celular. <a href="${APK}">Baixar o app (Android)</a> e depois toque de novo em "Adicionar ao WhatsApp". ${atual.figurinhas.some(f => f.som) ? '<br><small>O som das figurinhas não vai junto pelo app (regra do WhatsApp). Para ter o som, use "Mandar no meu WhatsApp".</small>' : ''}`); }, 1600); return; }
  e.preventDefault();
  dica(isIOS ? 'No iPhone, o WhatsApp não deixa sites adicionarem pacotes. Use <b>Mandar no meu WhatsApp</b>: o seu Gumball manda todas as figurinhas (com som) e você salva nas favoritas.' : `No computador, use <b>Mandar no meu WhatsApp</b> ou baixe o <a href="${APK}">app Android</a> no celular.`);
});
$('#gp-zap').addEventListener('click', () => {
  const cmd = `/baixarpacote ${atual.id}`;
  dica(`Mande <code>${cmd}</code> para o seu Gumball (no grupo ou na conversa com você mesmo) e ele manda todas as figurinhas${atual.figurinhas.some(f => f.som) ? ', <b>com som</b>' : ''}. <button class="btn text small" id="gp-copiar"><span class="ms">content_copy</span>Copiar</button><br><small>Ainda não tem o Gumball? <a href="#conectar">Coloque no seu número</a>, é grátis.</small>`);
  $('#gp-copiar').onclick = () => navigator.clipboard?.writeText(cmd).then(() => { $('#gp-copiar').innerHTML = '<span class="ms">check</span>Copiado'; });
});
$('#gp-zip').addEventListener('click', async () => {
  const b = $('#gp-zip'); b.disabled = true; const t = b.innerHTML; b.innerHTML = '<span class="ms spin">progress_activity</span>Preparando…';
  try {
    if (!window.JSZip) await new Promise((res, rej) => { const s = Object.assign(document.createElement('script'), { src: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', onload: res, onerror: rej }); document.head.append(s); });
    const zip = new JSZip(); const base = `${RAW}/p/${atual.id}`;
    for (const [i, f] of atual.figurinhas.entries()) {
      zip.file(`${String(i + 1).padStart(2, '0')}.webp`, await (await fetch(`${base}/${f.f}`)).blob());
      if (f.som) zip.file(`${String(i + 1).padStart(2, '0')}-som.ogg`, await (await fetch(`${base}/${f.som}`)).blob());
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await zip.generateAsync({ type: 'blob' })), download: `${atual.nome.replace(/[^\p{L}\p{N}]+/gu, '-')}.zip` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.parentNode?.removeChild(a); }, 3000);
  } catch { dica('Não consegui montar o .zip agora. Tente de novo.'); }
  b.disabled = false; b.innerHTML = t;
});
$('#gp-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#figurinhas/${atual.id}`;
  if (navigator.share) return navigator.share({ title: atual.nome, text: `Pacote de figurinhas "${atual.nome}"`, url }).catch(() => {});
  await navigator.clipboard?.writeText(url); dica('Link copiado! Cole onde quiser.');
});
$('#gp-denunciar').addEventListener('click', async () => {
  const motivo = prompt('Por que este pacote não deveria estar aqui? (ex.: conteúdo sexual, violência, ódio, golpe)');
  if (motivo === null) return;
  try { await window.gumballApi('/api/galeria/denunciar', { method: 'POST', body: { id: atual.id, motivo } }); dica('Obrigado. A denúncia foi enviada para o dono do Gumball.'); }
  catch (e) { dica(esc(e.message || 'Não consegui enviar a denúncia agora.')); }
});
$('#gal-voltar').addEventListener('click', () => { location.hash = 'figurinhas'; });

window.galeriaRota = sub => {
  if (tocando) { tocando.pause(); tocando = null; }
  if (/^[a-z0-9]{6}$/.test(sub)) abrir(sub);
  else { $('#gal-pacote').hidden = true; $('#gal-lista').hidden = false; carregar(); }
};
// a aba pode ter sido aberta antes deste arquivo carregar
const [t, sub] = location.hash.slice(1).split('/'); if (t === 'figurinhas') window.galeriaRota(sub || '');

// Instalar: Android baixa o APK (adiciona pacotes no WhatsApp) ou instala o site; iPhone instala o site pela tela de inicio
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isAndroid && !inApp) $('#baixar-apk').hidden = false;
let promptEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvt = e; if (!standalone && !inApp) $('#instalar').hidden = false; });
$('#instalar').addEventListener('click', async () => { if (!promptEvt) return; promptEvt.prompt(); await promptEvt.userChoice.catch(() => {}); promptEvt = null; $('#instalar').hidden = true; });
if (isIOS && !standalone) { $('#instalar').hidden = false; $('#instalar').onclick = () => { $('#instalar-ios').hidden = false; }; }
