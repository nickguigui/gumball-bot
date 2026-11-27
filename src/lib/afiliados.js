// Links de afiliado e ofertas das lojas (Amazon, Mercado Livre, Shopee, AliExpress).
// Nada de senha: cada pessoa cola no painel o codigo/chave que a propria loja da no painel de afiliado.
//  - Amazon: tag de Associado (ex.: seucodigo-20) vai no parametro tag=
//  - Mercado Livre: matt_tool/matt_word, tirados de um link de afiliado que a pessoa gerou no painel do ML
//  - Shopee: API oficial de afiliados (AppID + Secret): link curto e ofertas
//  - AliExpress: API oficial de afiliados (App Key + Secret + Tracking ID): link e ofertas
import crypto from 'node:crypto';
import { http } from './http.js';

export const LOJAS = { amazon: 'Amazon', mercadolivre: 'Mercado Livre', shopee: 'Shopee', aliexpress: 'AliExpress' };
export function lojaDe(url) {
  const h = (() => { try { return new URL(url).host.toLowerCase(); } catch { return ''; } })();
  if (/(^|\.)amazon\.|(^|\.)amzn\.(to|eu)$|(^|\.)a\.co$/.test(h)) return 'amazon';
  if (/mercadoli[bv]re|(^|\.)meli\.la$|mercadolivre\.com/.test(h)) return 'mercadolivre';
  if (/shopee\.|(^|\.)shp\.ee$/.test(h)) return 'shopee';
  if (/aliexpress\.|(^|\.)a\.aliexpress\.com$|s\.click\.aliexpress\.com/.test(h)) return 'aliexpress';
  return null;
}
// segue redirecionamentos de link curto (amzn.to, s.shopee, a.aliexpress...)
export async function expandir(url) {
  let u = url;
  for (let i = 0; i < 5; i++) {
    const r = await http(u, { redirect: 'manual', method: 'GET', timeout: 10000 }).catch(() => null);
    const loc = r?.headers?.get('location');
    if (!r || r.status < 300 || r.status >= 400 || !loc) break;
    u = new URL(loc, u).toString();
  }
  return u;
}
const RUIDO = /^(ref|ref_|tag|pd_rd_|pf_rd_|psc|th|qid|sr|keywords|crid|sprefix|smid|spla|linkCode|linkId|camp|creative|ascsubtag|_encoding|content-id|social_share|sp_csd|dib|dib_tag|utm_)/i;

export function amazon(url, tag) {
  const u = new URL(url);
  const asin = (u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i) || [])[1];
  // link limpo do produto + tag (o formato mais aceito pela Amazon)
  const out = asin ? new URL(`https://${u.host}/dp/${asin.toUpperCase()}`) : u;
  if (!asin) for (const k of [...out.searchParams.keys()]) if (RUIDO.test(k)) out.searchParams.delete(k);
  out.searchParams.set('tag', tag);
  return out.toString();
}
// tira matt_tool/matt_word de um link de afiliado do ML que a pessoa colou uma vez
export function mlCodigos(linkAfiliado) {
  try { const u = new URL(linkAfiliado); const tool = u.searchParams.get('matt_tool'), word = u.searchParams.get('matt_word'); return tool || word ? { tool, word } : null; } catch { return null; }
}
export function mercadolivre(url, { tool, word }) {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (/^(matt_|utm_|tracking_id|searchVariation|position|search_layout|type|deal_print_id|sid|c_)/.test(k)) u.searchParams.delete(k);
  u.hash = '';
  if (tool) u.searchParams.set('matt_tool', tool);
  if (word) u.searchParams.set('matt_word', word);
  return u.toString();
}

// ---------- Shopee (API oficial de afiliados, GraphQL) ----------
async function shopeeGql(keys, query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHash('sha256').update(`${keys.appId}${ts}${payload}${keys.secret}`).digest('hex');
  const r = await http('https://open-api.affiliate.shopee.com.br/graphql', { method: 'POST', timeout: 20000, headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${keys.appId}, Timestamp=${ts}, Signature=${sig}` }, body: payload });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) {
    const msg = j.errors[0].message || '';
    if (/10035|do not have access/i.test(msg)) throw new Error('Shopee: sua conta de afiliado ainda não tem acesso à API. No painel da Shopee Afiliados, peça acesso em "Open API" e espere a aprovação.');
    if (/10020|10031|sign|credential|auth/i.test(msg)) throw new Error('Shopee: AppID ou Secret errado. Copie de novo do painel (Open API).');
    throw new Error(`Shopee: ${msg || 'erro na API'}`);
  }
  if (!r.ok) throw new Error(`Shopee respondeu ${r.status}`);
  return j.data;
}
export async function shopeeLink(url, keys) {
  const d = await shopeeGql(keys, 'mutation($u:String!){generateShortLink(input:{originUrl:$u,subIds:["gumball"]}){shortLink}}', { u: url });
  return d.generateShortLink.shortLink;
}
export async function shopeeOfertas(keys, palavra, { limite = 20 } = {}) {
  const d = await shopeeGql(keys, `query($k:String,$l:Int){productOfferV2(keyword:$k,sortType:2,page:1,limit:$l){nodes{itemId productName priceMin priceMax priceDiscountRate imageUrl offerLink sales shopName ratingStar}}}`, { k: palavra || null, l: limite });
  return (d.productOfferV2?.nodes || []).map(n => ({
    id: `shopee:${n.itemId}`, loja: 'Shopee', titulo: n.productName, preco: Number(n.priceMin), desconto: Number(n.priceDiscountRate) || 0,
    precoAntigo: n.priceDiscountRate ? Number(n.priceMin) / (1 - n.priceDiscountRate / 100) : null, imagem: n.imageUrl, link: n.offerLink, vendas: Number(n.sales) || 0, nota: Number(n.ratingStar) || 0,
  }));
}

// ---------- AliExpress (API oficial de afiliados) ----------
async function aliApi(keys, method, params) {
  const all = { app_key: keys.appKey, method, sign_method: 'sha256', timestamp: String(Date.now()), format: 'json', v: '2.0', ...params };
  const base = Object.keys(all).sort().map(k => k + all[k]).join('');
  all.sign = crypto.createHmac('sha256', keys.secret).update(base).digest('hex').toUpperCase();
  const r = await http('https://api-sg.aliexpress.com/sync?' + new URLSearchParams(all), { timeout: 20000 });
  const j = await r.json().catch(() => ({}));
  if (j.error_response) throw new Error(/App ?Key is invalid|IncompleteSignature|Invalid ?Signature/i.test(j.error_response.msg || '') ? 'AliExpress: App Key ou Secret errado. Copie de novo do open.aliexpress.com.' : `AliExpress: ${j.error_response.msg || j.error_response.code}`);
  return j;
}
export async function aliLink(url, keys) {
  const j = await aliApi(keys, 'aliexpress.affiliate.link.generate', { promotion_link_type: '0', source_values: url, tracking_id: keys.trackingId });
  const l = j.aliexpress_affiliate_link_generate_response?.resp_result?.result?.promotion_links?.promotion_link?.[0];
  if (!l?.promotion_link) throw new Error('AliExpress não gerou o link (esse produto pode não ter comissão).');
  return l.promotion_link;
}
export async function aliOfertas(keys, palavra, { limite = 20 } = {}) {
  const j = await aliApi(keys, palavra ? 'aliexpress.affiliate.product.query' : 'aliexpress.affiliate.hotproduct.query', {
    ...(palavra ? { keywords: palavra } : {}), page_size: String(limite), target_currency: 'BRL', target_language: 'PT', ship_to_country: 'BR', sort: 'LAST_VOLUME_DESC', tracking_id: keys.trackingId,
  });
  const res = Object.values(j)[0]?.resp_result?.result?.products?.product || [];
  return res.map(p => ({
    id: `ali:${p.product_id}`, loja: 'AliExpress', titulo: p.product_title, preco: Number(p.target_sale_price || p.sale_price), precoAntigo: Number(p.target_original_price || p.original_price) || null,
    desconto: parseInt(p.discount) || 0, imagem: p.product_main_image_url, link: p.promotion_link, vendas: Number(p.lastest_volume) || 0, nota: 0,
  }));
}

// ---------- converter qualquer link ----------
// cfg = promos.afiliados ; devolve { loja, link } ou lanca erro explicando o que falta
export async function converter(url, cfg = {}) {
  const longo = await expandir(url);
  const loja = lojaDe(longo) || lojaDe(url);
  if (!loja) throw new Error('Esse link não é da Amazon, Mercado Livre, Shopee nem AliExpress.');
  if (loja === 'amazon') { if (!cfg.amazon) throw new Error('Falta o seu código de Associado da Amazon (ex.: seucodigo-20).'); return { loja, link: amazon(longo, cfg.amazon) }; }
  if (loja === 'mercadolivre') {
    if (!cfg.mercadolivre?.tool && !cfg.mercadolivre?.word) throw new Error('Falta um link de afiliado do Mercado Livre para eu copiar o seu código.');
    if (/meli\.la|\/sec\//.test(url)) return { loja, link: url }; // ja e link de afiliado pronto
    return { loja, link: mercadolivre(longo, cfg.mercadolivre) };
  }
  if (loja === 'shopee') { if (!cfg.shopee?.appId || !cfg.shopee?.secret) throw new Error('Falta o AppID e o Secret da API de afiliados da Shopee.'); return { loja, link: await shopeeLink(longo, cfg.shopee) }; }
  if (!cfg.aliexpress?.appKey || !cfg.aliexpress?.secret || !cfg.aliexpress?.trackingId) throw new Error('Faltam o App Key, o Secret e o Tracking ID do AliExpress.');
  return { loja, link: await aliLink(longo, cfg.aliexpress) };
}

// Titulo, imagem e preco de uma pagina de produto (tags og:), para posts manuais. Melhor esforco.
export async function previa(url) {
  try {
    const r = await http(url, { timeout: 12000, headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
    const html = (await r.text()).slice(0, 600_000);
    const meta = p => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]+content=["']([^"']+)`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${p}["']`, 'i')) || [])[1];
    const dec = s => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").trim();
    const preco = Number(meta('product:price:amount') || meta('og:price:amount') || (html.match(/"price"\s*:\s*"?([\d.]+)/) || [])[1]) || null;
    return { titulo: dec(meta('og:title') || (html.match(/<title>([^<]+)/i) || [])[1]), imagem: dec(meta('og:image')), preco };
  } catch { return {}; }
}

export const brl = v => (v == null || !isFinite(v) ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
