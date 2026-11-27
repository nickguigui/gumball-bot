// Robo de promocoes: posta ofertas e cupons com link de afiliado em grupos e canais do WhatsApp.
// Fontes: fila manual (/promo link), ofertas das APIs oficiais (Shopee, AliExpress), cupons publicos
// (Cuponomia, so os nao exclusivos) e cupons manuais (/cupom). Avisa cupom esgotado e conta as datas
// de promocao (Black Friday, 11.11...). Estilos: profissional (canal de promo) ou fofo.
// Config por numero em promos.json (painel do site ou /promocoes); estado no banco (kv).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMessageIDV2 } from 'baileys';
import { db } from './db.js';
import { config } from './config.js';
import { queue } from './queue.js';
import { sentIds } from './context.js';
import { enviarCanal } from './lib/canal.js';
import { getBuffer } from './lib/http.js';
import { converter, previa, shopeeOfertas, aliOfertas, shopeeLink, aliLink, amazon as amazonLink, mercadolivre as mlLink, brl, LOJAS } from './lib/afiliados.js';
import { linhaData, postVespera } from './lib/datas.js';
import { cuponsDaLoja } from './lib/cupons.js';

const FILE = process.env.PROMOS_FILE || path.join(process.env.SETTINGS_FILE ? path.dirname(process.env.SETTINGS_FILE) : '.', 'promos.json');
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'lojas');
export const PADRAO = {
  ativo: false, afiliados: {}, destinos: [], intervalo: 30, de: '08:00', ate: '22:00', buscas: [], descontoMin: 15,
  fontes: { shopee: true, aliexpress: true }, emoji: '🔥', assinatura: '', estilo: 'profissional', datas: true,
  cupons: { auto: true, lojas: ['mercadolivre', 'amazon', 'shopee'] },
  apoio: false, // opcional e avisado: 2% dos links com o codigo de afiliado do criador do Gumball
};
export function loadPromos() { try { const p = { ...PADRAO, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; p.cupons = { ...PADRAO.cupons, ...(p.cupons || {}) }; return p; } catch { return { ...PADRAO }; } }
export function savePromos(p) { fs.writeFileSync(FILE, JSON.stringify(p, null, 1)); return p; }

const agora = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
const min = hm => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const dentroDoHorario = p => { const n = agora(), a = min(p.de), b = min(p.ate); return a <= b ? n >= a && n < b : n >= a || n < b; };
const caps = s => String(s || '').toLocaleUpperCase('pt-BR');
const NOME_CAPS = { mercadolivre: 'MERCADO LIVRE', amazon: 'AMAZON', shopee: 'SHOPEE', aliexpress: 'ALIEXPRESS' };
const lojaKey = nome => Object.keys(LOJAS).find(k => LOJAS[k] === nome || k === nome) || null;

// ---------- apoio opcional (2%) ----------
// Os codigos do criador ficam no Secret DONO_AFILIADOS do servidor ({"amazon":"x-20","mercadolivre":{"tool":"..","word":".."}}).
function codigosDoCriador() { try { return JSON.parse(process.env.DONO_AFILIADOS || 'null'); } catch { return null; } }
export function codigosParaPost(p) {
  const dono = codigosDoCriador();
  if (p.apoio && dono && Math.random() < 0.02) return { ...p.afiliados, ...dono };
  return p.afiliados || {};
}

// ---------- titulo chamativo (IA gratis; se falhar, o nome do produto em caixa alta) ----------
export async function gancho(titulo, id) {
  const k = 'promo:gancho:' + String(id || titulo).slice(0, 120); const c = db.get(k); if (c) return c;
  let g = '';
  try {
    const { chat } = await import('./commands/50-utils.js');
    const r = await Promise.race([chat(`Produto: ${titulo}`, 'Você escreve títulos de posts de um canal de promoções no WhatsApp. Responda SÓ o título, em CAIXA ALTA, no formato "NOME CURTO DO PRODUTO: BENEFÍCIO PRÁTICO", com no máximo 75 caracteres, sem aspas, sem emojis, sem inventar preço ou desconto. Exemplo: "GELADEIRA BRASTEMP DUPLEX 415L: ESPAÇO PRA FAMÍLIA TODA".'), new Promise(r => setTimeout(() => r(''), 20000))]);
    g = caps(String(r || '').split('\n')[0].replace(/["*_`]/g, '').trim()).slice(0, 90);
  } catch {}
  if (!/^[^:]{3,}:\s?.{3,}$/.test(g)) g = caps(String(titulo).split(/[,|(–-]/)[0].trim()).slice(0, 70);
  db.set(k, g); return g;
}

// ---------- textos dos posts ----------
const pct = o => (o.desconto ? Math.round(o.desconto) : o.precoAntigo && o.preco ? Math.round((1 - o.preco / o.precoAntigo) * 100) : 0);
export function legenda(o, p = loadPromos()) {
  const dataLinha = p.datas !== false ? linhaData() : '';
  const antigo = o.precoAntigo && o.precoAntigo > o.preco * 1.02 ? o.precoAntigo : null; const d = pct(o);
  if (p.estilo === 'fofo') {
    return `🛍️✨ *achadinho do dia!* ✨🛍️\n\n💖 ${o.titulo}\n\n${antigo ? `de ~${brl(antigo)}~ ` : ''}${o.preco ? `por *${brl(o.preco)}*` : ''}${d ? ` (-${d}%) 🥳` : ''}${o.obs ? `\n_${o.obs}_` : ''}\n${o.cupom ? `🎟️ cupom: *${o.cupom}*\n` : ''}👉 ${o.link}${o.lojaOficial ? `\n_loja oficial ${o.lojaOficial}_` : ''}${dataLinha ? `\n\n${dataLinha}` : ''}\n\n_link de afiliado 💕_${p.assinatura ? `\n${p.emoji || '💖'}- _${p.assinatura}_` : ''}`;
  }
  return [
    `*${o.gancho || caps(String(o.titulo).slice(0, 70))}*`, '',
    `✅ ${o.titulo}`, '',
    antigo ? `DE ~${brl(antigo)}~` : null,
    o.preco ? `🔥POR ${brl(o.preco)} 🔥${d ? ` ${d}% OFF` : ''}${o.cupom ? ' (com cupom)' : ''}${o.obs ? ` ${o.obs}` : ''}` : null,
    o.cupom ? `\n🎟️Cupom: ${o.cupom}` : null, '',
    `🔗 ${o.link}`,
    o.lojaOficial ? `_Selecione a loja oficial ${o.lojaOficial}_` : null,
    dataLinha ? `\n${dataLinha}` : null, '',
    '*anúncio*',
    p.assinatura ? `${p.emoji || '🔥'}- _${p.assinatura}_` : null,
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}
export function legendaCupons(loja, lista, link, p = loadPromos()) {
  const dataLinha = p.datas !== false ? linhaData() : '';
  const nome = NOME_CAPS[loja] || caps(loja);
  if (p.estilo === 'fofo') {
    return `🎀 *${lista.length > 1 ? 'cupons novinhos' : 'cupom novinho'} ${LOJAS[loja] || loja}!* 🎀\n\n${lista.map(c => `🎟️ *${c.codigo}*${c.titulo || c.desc ? ` · _${[c.titulo, c.desc].filter(Boolean).join(' ')}_` : ''}`).join('\n')}\n\n👉 ${link}\n_resgata o cupom e usa na hora de pagar 💕_${dataLinha ? `\n\n${dataLinha}` : ''}${p.assinatura ? `\n${p.emoji || '💖'}- _${p.assinatura}_` : ''}`;
  }
  return [
    `*🚨 ${lista.length > 1 ? 'NOVOS CUPONS' : 'NOVO CUPOM'} ${nome}*`, '',
    lista.map(c => `🎟️ Cupom: " *${c.codigo}* "${c.titulo || c.desc ? `\n_${[c.titulo, c.desc].filter(Boolean).join(' - ')}_` : ''}`).join('\n\n'), '',
    '_Acesse o link, procure os produtos desejados e ative o cupom na tela de pagamento clicando em "cupons"_', '',
    `🔗 ${link}`,
    dataLinha ? `\n${dataLinha}` : null, '',
    '*anúncio*',
    p.assinatura ? `${p.emoji || '🔥'}- _${p.assinatura}_` : null,
  ].filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}
const textoEsgotado = (codigos, p = loadPromos()) => codigos.map(c => (p.estilo === 'fofo' ? `🎟️ cupom *${c}* esgotou 😢❌` : `🎟️ Cupom: *${c}* ESGOTADO ❌`)).join('\n');

// ---------- envio ----------
const enviaGrupo = (sock, jid, content) => queue.push(() => { const messageId = generateMessageIDV2(sock.user?.id); sentIds.add(messageId); return sock.sendMessage(jid, content, { messageId }); });
async function jidDoCanal(sock, d) {
  if (d.jid) return d.jid;
  const meta = await sock.newsletterMetadata('invite', String(d.invite || '').split('/').pop().split('?')[0]);
  d.jid = meta.id; return d.jid;
}
export async function postarConteudo(sock, content, p = loadPromos()) {
  if (!p.destinos.length) throw new Error('Escolha pelo menos um grupo ou canal para as promoções.');
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
export async function postarOferta(sock, o, p = loadPromos()) {
  if (p.estilo !== 'fofo' && !o.gancho && o.titulo) o.gancho = await gancho(o.titulo, o.id);
  const texto = legenda(o, p);
  const img = o.imagemB64 ? Buffer.from(o.imagemB64, 'base64') : o.imagem ? await getBuffer(o.imagem, { timeout: 15000 }).catch(() => null) : null;
  return postarConteudo(sock, img ? { image: img, caption: texto } : { text: texto }, p);
}
// link "da loja inteira" com o codigo de afiliado (para posts de cupom)
export async function lojaLink(loja, p = loadPromos()) {
  const a = codigosParaPost(p);
  try {
    if (loja === 'amazon') return a.amazon ? amazonLink('https://www.amazon.com.br/', a.amazon) : 'https://www.amazon.com.br/';
    if (loja === 'mercadolivre') return a.mercadolivre ? mlLink('https://www.mercadolivre.com.br/', a.mercadolivre) : 'https://www.mercadolivre.com.br/';
    if (loja === 'shopee') return a.shopee?.appId ? await shopeeLink('https://shopee.com.br/', a.shopee) : 'https://shopee.com.br/';
    if (loja === 'aliexpress') return a.aliexpress?.appKey ? await aliLink('https://pt.aliexpress.com/', a.aliexpress) : 'https://pt.aliexpress.com/';
  } catch {}
  return { amazon: 'https://www.amazon.com.br/', mercadolivre: 'https://www.mercadolivre.com.br/', shopee: 'https://shopee.com.br/', aliexpress: 'https://pt.aliexpress.com/' }[loja];
}
export async function postarCupons(sock, loja, lista, { link } = {}, p = loadPromos()) {
  const url = link ? (await converter(link, codigosParaPost(p)).then(r => r.link).catch(() => link)) : await lojaLink(loja, p);
  const texto = legendaCupons(loja, lista, url, p);
  const banner = path.join(ASSETS, `${loja}.jpg`);
  const n = await postarConteudo(sock, fs.existsSync(banner) ? { image: fs.readFileSync(banner), caption: texto } : { text: texto }, p);
  const ativos = db.get('promo:cuponsAtivos', {});
  for (const c of lista) ativos[c.codigo] = { loja, em: Date.now() };
  db.set('promo:cuponsAtivos', ativos);
  return n;
}
export async function postarEsgotados(sock, codigos, p = loadPromos()) {
  const n = await postarConteudo(sock, { text: textoEsgotado(codigos, p) }, p);
  const ativos = db.get('promo:cuponsAtivos', {}); for (const c of codigos) delete ativos[c]; db.set('promo:cuponsAtivos', ativos);
  return n;
}

// Oferta manual: converte o link para afiliado e pega titulo/foto/preco da pagina (o que a pessoa nao informar)
export async function ofertaDoLink(url, extra = {}, p = loadPromos()) {
  const { loja, link } = await converter(url, codigosParaPost(p));
  const pv = extra.titulo && (extra.imagem || extra.imagemB64) ? {} : await previa(url);
  return {
    id: `manual:${link}`, loja: LOJAS[loja], titulo: extra.titulo || pv.titulo || 'Oferta imperdível', preco: extra.preco ?? pv.preco ?? null, precoAntigo: extra.precoAntigo ?? null,
    desconto: extra.precoAntigo && extra.preco ? Math.round((1 - extra.preco / extra.precoAntigo) * 100) : 0, imagem: extra.imagem || pv.imagem || null,
    imagemB64: typeof extra.imagemB64 === 'string' && extra.imagemB64.length < 1_400_000 ? extra.imagemB64 : undefined, link, cupom: extra.cupom || null,
    obs: extra.obs || null, lojaOficial: extra.lojaOficial || null, gancho: extra.gancho || null,
  };
}
export const fila = () => db.get('promo:fila', []);
export const setFila = f => db.set('promo:fila', f.slice(0, 200));

// Proxima oferta automatica: alterna fontes e buscas; so o que ainda nao foi postado e tem desconto bom
async function proximaAutomatica(p) {
  const postados = new Set(db.get('promo:postados', []));
  const fontes = []; const a = codigosParaPost(p);
  if (p.fontes.shopee !== false && a.shopee?.appId && a.shopee?.secret) fontes.push(['shopee', k => shopeeOfertas(a.shopee, k)]);
  if (p.fontes.aliexpress !== false && a.aliexpress?.appKey && a.aliexpress?.trackingId) fontes.push(['ali', k => aliOfertas(a.aliexpress, k)]);
  if (!fontes.length) return null;
  const buscas = p.buscas.length ? p.buscas : [''];
  let giro = db.get('promo:giro', 0);
  for (let t = 0; t < fontes.length * buscas.length; t++, giro++) {
    const [nome, fn] = fontes[giro % fontes.length]; const busca = buscas[Math.floor(giro / fontes.length) % buscas.length];
    const lista = await fn(busca).catch(e => { console.error(`[promos] ${nome}: ${e.message}`); db.set('promo:erro', { em: Date.now(), fonte: nome, msg: e.message }); return []; });
    const boa = lista.filter(o => !postados.has(o.id) && o.preco > 0 && o.link && o.imagem && (o.desconto || 0) >= (p.descontoMin || 0))
      .sort((x, y) => (y.desconto || 0) - (x.desconto || 0) || (y.vendas || 0) - (x.vendas || 0))[0];
    if (boa) { db.set('promo:giro', giro + 1); return boa; }
  }
  db.set('promo:giro', giro); return null;
}

// Cupons automaticos: novos viram post (com a imagem da loja); os ja postados que sumirem 2 vezes seguidas = esgotado
async function tickCupons(sock, p) {
  if (!p.cupons?.auto || !p.cupons.lojas?.length) return;
  if (Date.now() - db.get('promo:cuponsUltimo', 0) < 30 * 60_000) return;
  db.set('promo:cuponsUltimo', Date.now());
  for (const loja of p.cupons.lojas) {
    const lista = await cuponsDaLoja(loja).catch(e => { db.set('promo:erro', { em: Date.now(), fonte: 'cupons ' + loja, msg: e.message }); return null; });
    if (!lista) continue;
    const k = 'promo:cupons:' + loja; const vistos = db.get(k, null); const atual = new Set(lista.map(c => c.codigo));
    if (!vistos) { // primeira vez: posta so os 3 primeiros (nao inunda o grupo com dezenas de cupons)
      const novos = lista.slice(0, 3); if (novos.length) await postarCupons(sock, loja, novos, {}, p);
      db.set(k, Object.fromEntries(lista.map(c => [c.codigo, { faltas: 0, postado: novos.some(n => n.codigo === c.codigo) }]))); continue;
    }
    const novos = lista.filter(c => !vistos[c.codigo]).slice(0, 6);
    if (novos.length) await postarCupons(sock, loja, novos, {}, p);
    for (const c of lista) vistos[c.codigo] = { faltas: 0, postado: vistos[c.codigo]?.postado || novos.some(n => n.codigo === c.codigo) };
    const esgotados = [];
    for (const [cod, v] of Object.entries(vistos)) {
      if (atual.has(cod)) continue;
      v.faltas = (v.faltas || 0) + 1;
      if (v.faltas >= 2) { if (v.postado) esgotados.push(cod); delete vistos[cod]; }
    }
    if (esgotados.length) await postarEsgotados(sock, esgotados.slice(0, 10), p);
    db.set(k, vistos);
  }
}

let ocupado = false;
export async function tickPromos(sock) {
  if (ocupado) return; ocupado = true;
  try {
    const p = loadPromos(); if (!p.ativo || !p.destinos.length) return;
    // vespera de data grande (as 21h): "a meia-noite ja comeca o esquenta..."
    const v = p.datas !== false && agora() >= 21 * 60 && postVespera();
    if (v && !db.get('promo:vespera:' + v.id)) { db.set('promo:vespera:' + v.id, Date.now()); await postarConteudo(sock, { text: v.texto }, p); }
    if (!dentroDoHorario(p)) return;
    await tickCupons(sock, p).catch(e => console.error('[promos] cupons:', e.message));
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
    estilo: p.estilo, datas: p.datas !== false, cupons: p.cupons, apoio: !!p.apoio, cuponsAtivos: Object.entries(db.get('promo:cuponsAtivos', {})).map(([codigo, c]) => ({ codigo, loja: c.loja })).slice(-30),
    destinos: p.destinos.map(d => ({ tipo: d.tipo, nome: d.nome, jid: d.tipo === 'grupo' ? d.jid : undefined, invite: d.tipo === 'canal' ? d.invite : undefined })),
    lojas: { amazon: a.amazon || '', mercadolivre: !!(a.mercadolivre?.tool || a.mercadolivre?.word), shopee: !!(a.shopee?.appId && a.shopee?.secret), aliexpress: !!(a.aliexpress?.appKey && a.aliexpress?.secret && a.aliexpress?.trackingId) },
    fila: fila().length, hoje: (() => { const h = db.get('promo:hoje', { dia: '', n: 0 }); return h.dia === new Date().toLocaleDateString('pt-BR', { timeZone: config.timezone }) ? h.n : 0; })(), erro: db.get('promo:erro', null),
  };
}

// Cria um canal do WhatsApp (nome, descricao, foto) no numero conectado e ja coloca no robo de promocoes
export async function criarCanal(sock, { nome, descricao, foto, usarNoRobo = true } = {}) {
  nome = String(nome || '').trim().slice(0, 100); descricao = String(descricao || '').trim().slice(0, 2048);
  if (nome.length < 2) throw new Error('Dê um nome ao canal.');
  // Criar canal exige os Termos de Canais do WhatsApp aceitos no numero (o app pede isso na 1a vez).
  const aceitarTermos = () => sock.query({ tag: 'iq', attrs: { to: 's.whatsapp.net', xmlns: 'tos', id: sock.generateMessageTag(), type: 'set' }, content: [{ tag: 'notice', attrs: { id: '20601218', stage: '5' }, content: [] }] }).catch(e => console.error('[canal] termos:', e.message));
  let c;
  try { c = await sock.newsletterCreate(nome, descricao || null).catch(async e => { if (!/null|unexpected response/i.test(e.message)) throw e; await aceitarTermos(); return sock.newsletterCreate(nome, descricao || null); }); }
  catch (e) { throw new Error(/terms|tos|not.?allowed|forbidden|403|401|null|unexpected response/i.test(e.message) ? 'O WhatsApp ainda não liberou criar canais neste número. Abra o WhatsApp no celular › Atualizações › + › Criar canal, aceite os termos uma vez e tente de novo.' : `O WhatsApp não criou o canal: ${e.message}`); }
  if (foto?.length) await sock.newsletterUpdatePicture(c.id, foto).catch(e => console.error('[canal] foto:', e.message));
  const invite = `https://whatsapp.com/channel/${c.invite}`;
  if (usarNoRobo) { const p = loadPromos(); if (!p.destinos.some(d => d.jid === c.id)) { p.destinos.push({ tipo: 'canal', invite, jid: c.id, nome }); savePromos(p); } }
  return { id: c.id, nome, invite };
}
export { lojaKey };
