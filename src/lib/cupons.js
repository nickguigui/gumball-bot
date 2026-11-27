// Cupons publicos das lojas, lidos da pagina de cupons da Cuponomia (codigos que ela mostra abertos).
// So o codigo e a condicao sao usados; o link do post e sempre o link de afiliado de quem usa o bot.
// Cupons exclusivos da Cuponomia (parceria deles) ficam de fora.
import * as cheerio from 'cheerio';
import { getText } from './http.js';

export const SLUG = { mercadolivre: 'mercado-livre', amazon: 'amazon', shopee: 'shopee', aliexpress: 'aliexpress' };
const limpa = s => String(s || '').replace(/\s+/g, ' ').trim();
const EXCLUSIVO = /CUPON[O0]M|CUP0N|CUPOM?IA|exclusiv/i;

export async function cuponsDaLoja(loja) {
  const html = await getText(`https://www.cuponomia.com.br/desconto/${SLUG[loja]}`, { timeout: 20000, headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
  const $ = cheerio.load(html);
  const out = [];
  $('ul.valid-coupons > li[data-type="code"]').each((_, el) => {
    const li = $(el);
    const codigo = limpa(li.find('.js-itemCode').first().text()).toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return;
    const bruto = li.text();
    if (EXCLUSIVO.test(codigo) || EXCLUSIVO.test(bruto)) return;
    const titulo = limpa(li.find('.smallTitle').first().text()).replace(/\s*\+.*$/, '');
    // a condicao (ex.: "Em compras acima de R$599, com desconto máximo limitado a R$200.")
    const partes = bruto.split(/\s{2,}|\n/).map(limpa).filter(Boolean);
    const cond = [...partes].reverse().find(s => /compra|acima|a partir|primeira|selecionad|todo o site|limite/i.test(s) && !/cashback|usados|Verificado|Ver Cupom|Cadastre|extensão/i.test(s)) || '';
    out.push({ codigo, titulo, desc: cond.replace(/\s*\+?\s*[\d,.]+%\s*de cashback/gi, '').slice(0, 160), loja });
  });
  return out;
}
