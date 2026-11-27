// Robo de promocoes: posta ofertas com link de afiliado em grupos e canais do WhatsApp.
// Fontes: fila manual (/promo link) e ofertas automaticas das APIs oficiais (Shopee, AliExpress).
// Config por numero em promos.json (painel do site ou /promocoes); estado no banco (kv).
import fs from 'node:fs';
import path from 'node:path';
import { generateMessageIDV2 } from 'baileys';
import { db } from './db.js';
import { config } from './config.js';
import { queue } from './queue.js';
import { sentIds } from './context.js';
import { enviarCanal } from './lib/canal.js';
import { getBuffer } from './lib/http.js';
import { converter, previa, shopeeOfertas, aliOfertas, brl, LOJAS } from './lib/afiliados.js';

const FILE = process.env.PROMOS_FILE || path.join(process.env.SETTINGS_FILE ? path.dirname(process.env.SETTINGS_FILE) : '.', 'promos.json');
export const PADRAO = { ativo: false, afiliados: {}, destinos: [], intervalo: 30, de: '08:00', ate: '22:00', buscas: [], descontoMin: 15, fontes: { shopee: true, aliexpress: true }, emoji: '🔥', assinatura: '' };
export function loadPromos() { try { return { ...PADRAO, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { return { ...PADRAO }; } }
export function savePromos(p) { fs.writeFileSync(FILE, JSON.stringify(p, null, 1)); return p; }

const agora = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
const min = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dentroDoHorario = p => { const n = agora(), a = min(p.de), b = min(p.ate); return a <= b ? n >= a && n < b : n >= a || n < b; };

export function legenda(o, p = loadPromos()) {
  const antigo = o.precoAntigo && o.precoAntigo > o.preco * 1.02 ? `~De ${brl(o.precoAntigo)}~\n` : '';
  const desc = o.desconto ? ` _(-${Math.round(o.desconto)}%)_` : '';
  const extra = [o.loja && `🏪 ${o.loja}`, o.vendas > 50 && `🛒 ${o.vendas.toLocaleString('pt-BR')} vendidos`, o.nota >= 4.5 && `⭐ ${o.nota.toFixed(1)}`].filter(Boolean).join(' · ');
  return `${p.emoji || '🔥'} *${String(o.titulo || 'Oferta').slice(0, 140)}*\n\n${antigo}${o.preco ? `💰 *Por ${brl(o.preco)}*${desc}\n` : ''}${o.cupom ? `🎟️ Cupom: *${o.cupom}*\n` : ''}${extra ? extra + '\n' : ''}\n👉 ${o.link}\n\n_Preço e estoque podem mudar a qualquer momento._${p.assinatura ? `\n\n${p.emoji || '🔥'}- _${p.assinatura}_` : ''}`;
}

const enviaGrupo = (sock, jid, content) => queue.push(() => { const messageId = generateMessageIDV2(sock.user?.id); sentIds.add(messageId); return sock.sendMessage(jid, content, { messageId }); });
async function jidDoCanal(sock, d) {
  if (d.jid) return d.jid;
  const meta = await sock.newsletterMetadata('invite', String(d.invite || '').split('/').pop().split('?')[0]);
  d.jid = meta.id; return d.jid;
}
// Posta uma oferta em todos os destinos; devolve quantos receberam
export async function postarOferta(sock, o, p = loadPromos()) {
  if (!p.destinos.length) throw new Error('Escolha pelo menos um grupo ou canal para as promoções.');
  const texto = legenda(o, p);
  const img = o.imagem ? await getBuffer(o.imagem, { timeout: 15000 }).catch(() => null) : null;
  const content = img ? { image: img, caption: texto } : { text: texto };
  let ok = 0, mudou = false;
  for (const d of p.destinos) {
    try {
      if (d.tipo === 'canal') { const had = d.jid; await enviarCanal(sock, await jidDoCanal(sock, d), content); if (!had) mudou = true; }
      else await enviaGrupo(sock, d.jid, content);
      ok++;
    } catch (e) { console.error(`[promos] ${d.nome || d.jid}: ${e.message}`); }
  }
  if (mudou) savePromos(p); // guarda o id do canal descoberto pelo convite
  return ok;
}

// Oferta manual: converte o link para afiliado e pega titulo/foto/preco da pagina (o que a pessoa nao informar)
export async function ofertaDoLink(url, extra = {}, p = loadPromos()) {
  const { loja, link } = await converter(url, p.afiliados);
  const pv = extra.titulo && extra.imagem ? {} : await previa(url);
  return { id: `manual:${link}`, loja: LOJAS[loja], titulo: extra.titulo || pv.titulo || 'Oferta imperdível', preco: extra.preco ?? pv.preco ?? null, precoAntigo: extra.precoAntigo ?? null, desconto: extra.precoAntigo && extra.preco ? Math.round((1 - extra.preco / extra.precoAntigo) * 100) : 0, imagem: extra.imagem || pv.imagem || null, link, cupom: extra.cupom || null };
}
export const fila = () => db.get('promo:fila', []);
export const setFila = f => db.set('promo:fila', f.slice(0, 200));

// Proxima oferta automatica: alterna fontes e buscas; so o que ainda nao foi postado e tem desconto bom
async function proximaAutomatica(p) {
  const postados = new Set(db.get('promo:postados', []));
  const fontes = [];
  if (p.fontes.shopee !== false && p.afiliados.shopee?.appId && p.afiliados.shopee?.secret) fontes.push(['shopee', k => shopeeOfertas(p.afiliados.shopee, k)]);
  if (p.fontes.aliexpress !== false && p.afiliados.aliexpress?.appKey && p.afiliados.aliexpress?.trackingId) fontes.push(['ali', k => aliOfertas(p.afiliados.aliexpress, k)]);
  if (!fontes.length) return null;
  const buscas = p.buscas.length ? p.buscas : [''];
  let giro = db.get('promo:giro', 0);
  for (let t = 0; t < fontes.length * buscas.length; t++, giro++) {
    const [nome, fn] = fontes[giro % fontes.length]; const busca = buscas[Math.floor(giro / fontes.length) % buscas.length];
    const lista = await fn(busca).catch(e => { console.error(`[promos] ${nome}: ${e.message}`); db.set('promo:erro', { em: Date.now(), fonte: nome, msg: e.message }); return []; });
    const boa = lista.filter(o => !postados.has(o.id) && o.preco > 0 && o.link && o.imagem && (o.desconto || 0) >= (p.descontoMin || 0))
      .sort((a, b) => (b.desconto || 0) - (a.desconto || 0) || (b.vendas || 0) - (a.vendas || 0))[0];
    if (boa) { db.set('promo:giro', giro + 1); return boa; }
  }
  db.set('promo:giro', giro); return null;
}

let ocupado = false;
export async function tickPromos(sock) {
  if (ocupado) return; ocupado = true;
  try {
    const p = loadPromos(); if (!p.ativo || !p.destinos.length || !dentroDoHorario(p)) return;
    const ultimo = db.get('promo:ultimo', 0); if (Date.now() - ultimo < Math.max(5, p.intervalo || 30) * 60_000) return;
    const f = fila(); let o = f.shift();
    if (o) setFila(f); else o = await proximaAutomatica(p);
    if (!o) return;
    db.set('promo:ultimo', Date.now());
    const n = await postarOferta(sock, o, p);
    db.set('promo:postados', [...db.get('promo:postados', []), o.id].slice(-3000));
    db.set('promo:hoje', (() => { const h = db.get('promo:hoje', { dia: '', n: 0 }); const dia = new Date().toLocaleDateString('pt-BR', { timeZone: config.timezone }); return { dia, n: (h.dia === dia ? h.n : 0) + 1 }; })());
    console.log(`🛒 promoção postada em ${n} destino(s): ${String(o.titulo).slice(0, 50)}`);
  } catch (e) { console.error('[promos]', e.message); }
  finally { ocupado = false; }
}
// resumo para painel e /promocoes (sem mostrar segredos)
export function resumo(p = loadPromos()) {
  const a = p.afiliados || {};
  return {
    ativo: !!p.ativo, intervalo: p.intervalo, de: p.de, ate: p.ate, descontoMin: p.descontoMin, buscas: p.buscas, fontes: p.fontes, emoji: p.emoji, assinatura: p.assinatura,
    destinos: p.destinos.map(d => ({ tipo: d.tipo, nome: d.nome, jid: d.tipo === 'grupo' ? d.jid : undefined, invite: d.tipo === 'canal' ? d.invite : undefined })),
    lojas: { amazon: a.amazon || '', mercadolivre: !!(a.mercadolivre?.tool || a.mercadolivre?.word), shopee: !!(a.shopee?.appId && a.shopee?.secret), aliexpress: !!(a.aliexpress?.appKey && a.aliexpress?.secret && a.aliexpress?.trackingId) },
    fila: fila().length, hoje: (() => { const h = db.get('promo:hoje', { dia: '', n: 0 }); return h.dia === new Date().toLocaleDateString('pt-BR', { timeZone: config.timezone }) ? h.n : 0; })(), erro: db.get('promo:erro', null),
  };
}
