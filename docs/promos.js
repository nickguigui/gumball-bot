// Painel > Robo de promocoes: onde postar, frequencia, lojas (codigos de afiliado) e postar ofertas.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = (...a) => window.gumballApi(...a);
let canais = [], atual = null;

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
}
$('#pr-canais').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { canais.splice(+b.dataset.rm, 1); renderCanais(); } });
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
    const marcados = new Set(r.destinos.filter(d => d.tipo === 'grupo').map(d => d.jid));
    const grupos = (g.grupos || []).filter(x => x.nome);
    $('#pr-grupos').innerHTML = grupos.length ? grupos.map(x => `<li><div><b>👥 ${esc(x.nome)}</b><p>${x.membros} ${x.membros === 1 ? 'pessoa' : 'pessoas'}</p></div><input type="checkbox" class="switch" data-jid="${esc(x.jid)}" data-nome="${esc(x.nome)}" ${marcados.has(x.jid) ? 'checked' : ''} aria-label="Postar em ${esc(x.nome)}"></li>`).join('') : '<li class="muted">Seu número ainda não está em nenhum grupo.</li>';
    canais = r.destinos.filter(d => d.tipo === 'canal'); renderCanais(); status(r); say('#pr-salvo', '');
  } catch (e) { $('#pr-grupos').innerHTML = `<li class="muted">${esc(e.message)}</li>`; }
}
$('#pn-promo-abrir').addEventListener('click', abrir);
$('#pr-voltar').addEventListener('click', () => { window.gumballView('painel'); resumoPainel(); });

$('#pr-form').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const btn = f.querySelector('[type=submit]'); btn.disabled = true; say('#pr-salvo', 'Salvando…');
  const destinos = [...document.querySelectorAll('#pr-grupos input[data-jid]:checked')].map(i => ({ tipo: 'grupo', jid: i.dataset.jid, nome: i.dataset.nome })).concat(canais);
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
  const extra = { preco: num(f.preco.value), precoAntigo: num(f.precoAntigo.value), cupom: f.cupom.value.trim() || undefined, titulo: f.titulo.value.trim() || undefined };
  msg(agora ? 'Postando…' : 'Colocando na fila…');
  try {
    const r = await api('/api/promos/oferta', { method: 'POST', body: { url: f.url.value.trim(), extra, agora } });
    msg(agora ? `✓ Postada em ${r.postada} destino(s): <b>${esc(r.oferta.titulo)}</b>` : `✓ Na fila (${r.naFila}º): <b>${esc(r.oferta.titulo)}</b>${r.oferta.preco ? ` · R$ ${esc(r.oferta.preco.toFixed(2).replace('.', ','))}` : ''}`);
    f.reset();
  } catch (err) { msg(esc(err.message), false); }
});
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
