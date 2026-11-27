// Painel > Robo de promocoes: onde postar, frequencia, lojas (codigos de afiliado) e postar ofertas.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (...a) => window.gumballApi(...a);
let canais = [], atual = null, grupos = [], marcados = new Set(), todos = false;
// lista de grupos: escolhidos primeiro, busca, e so 6 ate tocar em "Ver todos" (tem gente com 100+ grupos)
function renderGrupos() {
  const q = ($('#pr-busca').value || '').toLowerCase();
  const lista = grupos.filter(x => !q || x.nome.toLowerCase().includes(q)).sort((a, b) => marcados.has(b.jid) - marcados.has(a.jid));
  const mostrar = q || todos ? lista : lista.slice(0, Math.max(6, [...marcados].length));
  $('#pr-grupos').innerHTML = mostrar.length ? mostrar.map(x => `<li><div><b>👥 ${esc(x.nome)}</b><p>${x.membros} ${x.membros === 1 ? 'pessoa' : 'pessoas'}</p></div><input type="checkbox" class="switch" data-jid="${esc(x.jid)}" data-nome="${esc(x.nome)}" ${marcados.has(x.jid) ? 'checked' : ''} aria-label="Postar em ${esc(x.nome)}"></li>`).join('') : `<li class="muted">${grupos.length ? 'Nenhum grupo com esse nome.' : 'Seu número ainda não está em nenhum grupo.'}</li>`;
  contar();
  const sobra = lista.length - mostrar.length; $('#pr-todos').hidden = sobra <= 0; $('#pr-todos').textContent = `Ver todos os grupos (${lista.length})`;
}
$('#pr-grupos').addEventListener('change', e => { const i = e.target.closest('input[data-jid]'); if (i) { i.checked ? marcados.add(i.dataset.jid) : marcados.delete(i.dataset.jid); contar(); } });
$('#pr-busca').addEventListener('input', renderGrupos);
$('#pr-todos').addEventListener('click', () => { todos = true; renderGrupos(); });

function status(r) {
  const l = r.lojas;
  $('#pr-st-amazon').textContent = l.amazon ? `✅ Configurada (${l.amazon})` : 'Não configurada';
  $('#pr-st-ml').textContent = l.mercadolivre ? '✅ Configurada (cole outro link só se quiser trocar)' : 'Não configurada';
  $('#pr-st-shopee').textContent = l.shopee ? '✅ Configurada, ofertas automáticas (campos vazios = mantém as chaves)' : 'Não configurada';
  $('#pr-st-ali').textContent = l.aliexpress ? '✅ Configurada, ofertas automáticas (campos vazios = mantém as chaves)' : 'Não configurada';
  $('#pr-status').textContent = r.ativo ? `Ligado · ${r.hoje} post(s) hoje${r.erro && Date.now() - r.erro.em < 6 * 3600e3 ? ` · ⚠️ ${r.erro.msg}` : ''}` : 'Desligado';
  $('#pr-fila').textContent = r.fila ? `📥 ${r.fila} oferta(s) na fila.` : '';
}
function renderCanais() {
  $('#pr-canais').innerHTML = canais.map((c, i) => `<li><div><b>📢 ${esc(c.nome || 'Canal')}</b><p>${esc(c.invite)}</p></div><button type="button" class="btn text" data-rm="${i}">Remover</button></li>`).join('');
  contar();
}
$('#pr-canais').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { canais.splice(+b.dataset.rm, 1); renderCanais(); } });
// criar um canal novo (foto, nome, descricao) e ja usar no robo
let ncFoto = null;
$('#nc-foto').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  ncFoto = await fotoB64(f, 640); $('#nc-prev').src = 'data:image/jpeg;base64,' + ncFoto;
});
$('#nc-criar').addEventListener('click', async () => {
  const nome = $('#nc-nome').value.trim(), m = $('#nc-msg'), b = $('#nc-criar');
  const show = (h, erro) => { m.innerHTML = h; m.hidden = false; m.style.background = erro ? 'var(--error-container)' : ''; m.style.color = erro ? 'var(--on-error-container)' : ''; };
  if (nome.length < 2) return show('Dê um nome ao canal.', true);
  b.disabled = true; show('Criando o canal no seu WhatsApp…');
  try {
    const r = await api('/api/promos/criarcanal', { method: 'POST', body: { nome, descricao: $('#nc-desc').value, fotoB64: ncFoto } });
    canais = canais.filter(c => c.invite !== r.invite).concat([{ tipo: 'canal', invite: r.invite, nome: r.nome }]); renderCanais();
    show(`✓ Canal <b>${esc(r.nome)}</b> criado e já ligado no robô! <a href="${esc(r.invite)}" target="_blank" rel="noopener">Abrir no WhatsApp</a> · <button type="button" class="btn text small" id="nc-copiar"><span class="ms">content_copy</span>Copiar link</button>`);
    $('#nc-copiar').onclick = () => navigator.clipboard?.writeText(r.invite);
    $('#nc-nome').value = ''; $('#nc-desc').value = ''; ncFoto = null; $('#nc-prev').src = 'icons/icon-192.png';
  } catch (e) { show(esc(e.message), true); }
  b.disabled = false;
});
$('#pr-canal-add').addEventListener('click', () => {
  const l = $('#pr-canal-link').value.trim();
  if (!/whatsapp\.com\/channel\//.test(l)) return say('#pr-salvo', 'Cole o link de convite do canal (https://whatsapp.com/channel/…).');
  if (!canais.some(c => c.invite === l)) canais.push({ tipo: 'canal', invite: l, nome: 'Canal (salve para confirmar)' });
  $('#pr-canal-link').value = ''; renderCanais();
});
const say = (sel, t) => { $(sel).textContent = t; };

async function abrir() {
  window.gumballView('pn-promos'); window.scrollTo({ top: 0 });
  $('#pr-grupos').innerHTML = '<li class="muted">Carregando…</li>';
  try {
    const [r, g] = await Promise.all([api('/api/promos'), api('/api/grupos').catch(() => ({ grupos: [] }))]);
    atual = r; const f = $('#pr-form');
    f.ativo.checked = r.ativo; f.intervalo.value = String(r.intervalo); if (!f.intervalo.value) f.intervalo.value = '30';
    f.de.value = r.de; f.ate.value = r.ate; f.buscas.value = (r.buscas || []).join(', '); f.descontoMin.value = r.descontoMin; f.emoji.value = r.emoji || '🔥'; f.assinatura.value = r.assinatura || '';
    f.amazon.value = r.lojas.amazon || ''; f.mercadolivre.value = ''; for (const n of ['shopeeAppId', 'shopeeSecret', 'aliAppKey', 'aliSecret', 'aliTracking']) f[n].value = '';
    marcados = new Set(r.destinos.filter(d => d.tipo === 'grupo').map(d => d.jid)); todos = false; $('#pr-busca').value = '';
    grupos = (g.grupos || []).filter(x => x.nome);
    renderGrupos();
    canais = r.destinos.filter(d => d.tipo === 'canal'); renderCanais(); status(r); say('#pr-salvo', '');
    lado(canais.length && !marcados.size ? 'canais' : 'grupos');
  } catch (e) { $('#pr-grupos').innerHTML = `<li class="muted">${esc(e.message)}</li>`; }
}
$('#pn-promo-abrir').addEventListener('click', abrir);
$('#pr-voltar').addEventListener('click', () => { window.gumballView('painel'); resumoPainel(); });

$('#pr-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const btn = f.querySelector('[type=submit]'); btn.disabled = true; say('#pr-salvo', 'Salvando…');
  const destinos = grupos.filter(x => marcados.has(x.jid)).map(x => ({ tipo: 'grupo', jid: x.jid, nome: x.nome })).concat(canais);
  const afiliados = { amazon: f.amazon.value.trim() };
  if (f.mercadolivre.value.trim()) afiliados.mercadolivre = f.mercadolivre.value.trim();
  if (f.shopeeAppId.value.trim() || f.shopeeSecret.value.trim()) afiliados.shopee = { appId: f.shopeeAppId.value.trim(), secret: f.shopeeSecret.value.trim() };
  if (f.aliAppKey.value.trim() || f.aliSecret.value.trim() || f.aliTracking.value.trim()) afiliados.aliexpress = { appKey: f.aliAppKey.value.trim(), secret: f.aliSecret.value.trim(), trackingId: f.aliTracking.value.trim() };
  if (f.ativo.checked && !destinos.length) { btn.disabled = false; return say('#pr-salvo', 'Escolha pelo menos um grupo ou canal antes de ligar.'); }
  try {
    const { resumo: r } = await api('/api/promos', { method: 'POST', body: { ativo: f.ativo.checked, intervalo: +f.intervalo.value, de: f.de.value, ate: f.ate.value, buscas: f.buscas.value.split(',').map(s => s.trim()).filter(Boolean), descontoMin: +f.descontoMin.value || 0, emoji: f.emoji.value, assinatura: f.assinatura.value, destinos, afiliados } });
    atual = r; canais = r.destinos.filter(d => d.tipo === 'canal'); renderCanais(); status(r);
    for (const n of ['mercadolivre', 'shopeeAppId', 'shopeeSecret', 'aliAppKey', 'aliSecret', 'aliTracking']) f[n].value = '';
    say('#pr-salvo', 'Salvo ✓');
  } catch (err) { say('#pr-salvo', err.message); }
  btn.disabled = false;
});
$('#pr-testar').addEventListener('click', async () => {
  say('#pr-salvo', 'Mandando…');
  try { const r = await api('/api/promos/testar', { method: 'POST', body: {} }); say('#pr-salvo', `Post de teste enviado para ${r.n} destino(s). Salve antes se mudou os destinos.`); } catch (e) { say('#pr-salvo', e.message); }
});

// postar uma oferta / converter link
const num = v => { const s = String(v || '').replace(/[^\d,.]/g, ''); if (!s) return undefined; return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
const msg = (t, ok) => { const m = $('#pr-oferta-msg'); m.innerHTML = t; m.hidden = !t; m.style.background = ok === false ? 'var(--error-container)' : ''; m.style.color = ok === false ? 'var(--on-error-container)' : ''; };
$('#pr-oferta').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const agora = e.submitter?.name === 'agora';
  const extra = { preco: num(f.preco.value), precoAntigo: num(f.precoAntigo.value), cupom: f.cupom.value.trim() || undefined, titulo: f.titulo.value.trim() || undefined, imagemB64: f.foto.files[0] ? await fotoB64(f.foto.files[0]) : undefined };
  msg(agora ? 'Postando…' : 'Colocando na fila…');
  try {
    const r = await api('/api/promos/oferta', { method: 'POST', body: { url: f.url.value.trim(), extra, agora } });
    msg(agora ? `✓ Postada em ${r.postada} destino(s): <b>${esc(r.oferta.titulo)}</b>` : `✓ Na fila (${r.naFila}º): <b>${esc(r.oferta.titulo)}</b>${r.oferta.preco ? ` · R$ ${esc(r.oferta.preco.toFixed(2).replace('.', ','))}` : ''}`);
    f.reset(); $('#pr-foto-txt').textContent = 'Foto do produto (opcional)';
  } catch (err) { msg(esc(err.message), false); }
});
// foto reduzida no navegador (ate 900px, JPEG) para caber no envio
function fotoB64(file, max = 900) {
  return new Promise(res => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)); const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85).split(',')[1]); URL.revokeObjectURL(img.src);
    }; img.onerror = () => res(undefined); img.src = URL.createObjectURL(file);
  });
}
document.querySelector('#pr-oferta').foto.addEventListener('change', e => { document.querySelector('#pr-foto-txt').textContent = e.target.files[0] ? `📷 ${e.target.files[0].name}` : 'Foto do produto (opcional)'; });
$('#pr-converter').addEventListener('click', async () => {
  const url = $('#pr-oferta').url.value.trim(); if (!url) return msg('Cole o link de um produto.', false);
  try { const r = await api('/api/promos/link', { method: 'POST', body: { url } }); msg(`Seu link de afiliado: <a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.link)}</a> <button type="button" class="btn text small" id="pr-copiar"><span class="ms">content_copy</span>Copiar</button>`); $('#pr-copiar').onclick = () => navigator.clipboard?.writeText(r.link); }
  catch (err) { msg(esc(err.message), false); }
});

// resumo no painel principal
async function resumoPainel() {
  try { const r = await api('/api/promos'); const lojas = Object.values(r.lojas).filter(Boolean).length; $('#pn-promo-resumo').textContent = r.ativo ? `Ligado · ${r.destinos.length} destino(s) · ${r.hoje} post(s) hoje` : `Desligado · ${lojas} de 4 lojas configuradas`; } catch {}
}
new MutationObserver(() => { if (!$('#painel').hidden) resumoPainel(); }).observe($('#painel'), { attributes: true, attributeFilter: ['hidden'] });

// Interruptor Grupos | Canal: mostra um lado de cada vez (as escolhas dos dois lados continuam valendo)
function lado(qual) {
  document.querySelectorAll('.lado-toggle button').forEach(b => { const on = b.dataset.lado === qual; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  document.querySelector('.lado-toggle').classList.toggle('direita', qual === 'canais');
  $('#pr-lado-grupos').hidden = qual !== 'grupos'; $('#pr-lado-canais').hidden = qual !== 'canais';
}
document.querySelector('.lado-toggle').addEventListener('click', e => { const b = e.target.closest('button[data-lado]'); if (b) lado(b.dataset.lado); });
// contadores de escolhidos em cada lado
function contar() {
  $('#pr-n-grupos').textContent = marcados.size ? marcados.size : '';
  $('#pr-n-canais').textContent = canais.length ? canais.length : '';
}
