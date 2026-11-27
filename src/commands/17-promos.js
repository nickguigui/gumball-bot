// Robo de promocoes com link de afiliado (Amazon, Mercado Livre, Shopee, AliExpress) para grupos e canais.
import { converter, mlCodigos, brl, LOJAS } from '../lib/afiliados.js';
import { loadPromos, savePromos, resumo, ofertaDoLink, postarOferta, fila, setFila, legenda, criarCanal } from '../promos.js';

const C = '🛒 PROMOÇÕES';
const SITE = 'https://nickguigui.github.io/gumball-bot/#conectar';
const linkDe = t => (String(t || '').match(/https?:\/\/\S+/) || [])[0];
// "/promo link 129,90 de 199,90 cupom ABC | Titulo"
function lerExtras(q) {
  const [antes, titulo] = q.replace(/https?:\/\/\S+/, '').split('|');
  const num = s => s && Number(s.replace(/\./g, '').replace(',', '.'));
  const de = /\bde\s+(?:r\$\s*)?([\d.,]+)/i.exec(antes); const cupom = /\bcupom\s+(\S+)/i.exec(antes);
  const preco = /(?:^|\s)(?:por\s+)?(?:r\$\s*)?([\d.]*\d,\d{2}|\d+(?:\.\d{3})*)(?=\s|$)/i.exec(antes.replace(de?.[0] || '#', ' '));
  return { preco: num(preco?.[1]) || undefined, precoAntigo: num(de?.[1]) || undefined, cupom: cupom?.[1], titulo: titulo?.trim() || undefined };
}
const GUIA = `🛒 *COMO CRIAR SUAS CONTAS DE AFILIADO*\n_(é grátis; nada de senha no bot: você só cola o código que cada loja te dá)_\n
*1. Amazon Associados*
• associados.amazon.com.br → Inscreva-se (use seu site, canal ou rede social)
• O seu código aparece no topo do painel, tipo *seunome-20*
• Mande: */afiliados amazon seunome-20*\n
*2. Mercado Livre Afiliados*
• mercadolivre.com.br/afiliados → Quero ser afiliado
• No painel, gere o link de qualquer produto e *copie o link completo*
• Mande: */afiliados mercadolivre <cole o link>* (eu copio o seu código dele)\n
*3. Shopee Afiliados* (ofertas automáticas!)
• affiliate.shopee.com.br → Cadastre-se e espere a aprovação
• Depois: Ferramentas → *Open API* → copie o *AppID* e o *Secret*
• Cole no site (painel › Promoções) ou, no privado: */afiliados shopee APPID SECRET*\n
*4. AliExpress Portals* (ofertas automáticas!)
• portals.aliexpress.com → Cadastre-se
• Depois: open.aliexpress.com → crie um app de afiliado e pegue *App Key* e *Secret*; o *Tracking ID* fica no Portals
• Cole no site ou: */afiliados aliexpress APPKEY SECRET TRACKINGID*\n
Depois: */promocoes aqui* (neste grupo) ou */promocoes canal <link do canal>*, e */promocoes ligar*. 🚀

📖 Tutorial completo (passo a passo e regras): https://nickguigui.github.io/gumball-bot/afiliados.html`;

export const commands = [
  {
    name: 'comoafiliar', aliases: ['afiliar', 'guiaafiliados'], category: C, react: '📖', run: ctx => ctx.reply(GUIA),
  },
  {
    name: 'afiliados', category: C, react: '🔑', run: async ctx => {
      const p = loadPromos(); const [loja, ...v] = ctx.args; const r = resumo(p).lojas;
      if (!loja) return ctx.reply(`🔑 *SUAS LOJAS*\n\n${r.amazon ? `✅ Amazon (${r.amazon})` : '❌ Amazon'}\n${r.mercadolivre ? '✅' : '❌'} Mercado Livre\n${r.shopee ? '✅' : '❌'} Shopee _(ofertas automáticas)_\n${r.aliexpress ? '✅' : '❌'} AliExpress _(ofertas automáticas)_\n\n📖 Passo a passo: */comoafiliar*\n💻 Mais fácil pelo site: ${SITE}`);
      const L = loja.toLowerCase().replace(/[^a-z]/g, '');
      const segredo = ['shopee', 'aliexpress'].includes(L);
      // chave secreta no grupo fica visivel para todo mundo: so no privado (e a mensagem e apagada)
      if (segredo && ctx.isGroup) return ctx.reply('🔒 Chave secreta não se manda em grupo! Mande no privado (conversa com você mesmo) ou cole no site.');
      if (segredo && ctx.m.key.fromMe) ctx.sock.sendMessage(ctx.jid, { delete: ctx.m.key }).catch(() => {});
      p.afiliados = p.afiliados || {};
      if (L === 'amazon') { if (!/^[\w.-]+-2\d$/.test(v[0] || '')) return ctx.reply('🔑 Use: */afiliados amazon seucodigo-20* (o código termina com -20 ou -21)'); p.afiliados.amazon = v[0]; }
      else if (L === 'mercadolivre' || L === 'ml') { const c = mlCodigos(linkDe(ctx.q)); if (!c) return ctx.reply('🔑 Cole um link de afiliado *gerado no painel do Mercado Livre* (ele tem matt_tool/matt_word).\nEx.: */afiliados mercadolivre https://www.mercadolivre.com.br/...?matt_tool=...*\n\n💡 Se o painel só te der link curto (meli.la), abra ele no navegador e copie o endereço completo.'); p.afiliados.mercadolivre = c; }
      else if (L === 'shopee') { if (v.length < 2) return ctx.reply('🔑 Use: */afiliados shopee APPID SECRET* (no privado)'); p.afiliados.shopee = { appId: v[0], secret: v[1] }; }
      else if (L === 'aliexpress' || L === 'ali') { if (v.length < 3) return ctx.reply('🔑 Use: */afiliados aliexpress APPKEY SECRET TRACKINGID* (no privado)'); p.afiliados.aliexpress = { appKey: v[0], secret: v[1], trackingId: v[2] }; }
      else return ctx.reply('🔑 Lojas: amazon, mercadolivre, shopee, aliexpress. Passo a passo: */comoafiliar*');
      savePromos(p);
      return ctx.reply(`✅ *${LOJAS[L === 'ml' ? 'mercadolivre' : L === 'ali' ? 'aliexpress' : L]}* configurada!${segredo ? ' (apaguei a mensagem com a chave)' : ''}\n💡 Teste: */afiliado <link de um produto>*`);
    },
  },
  {
    name: 'afiliado', aliases: ['linkafiliado'], category: C, react: '🔗', run: async ctx => {
      const url = linkDe(ctx.q) || linkDe(ctx.quoted?.text); if (!url) return ctx.reply('🔗 *Uso:* /afiliado <link do produto>\nFunciona com Amazon, Mercado Livre, Shopee e AliExpress.');
      try { const r = await converter(url, loadPromos().afiliados); return ctx.reply(`🔗 *Seu link de afiliado (${LOJAS[r.loja]}):*\n\n${r.link}`); }
      catch (e) { return ctx.reply(`🔗 ${e.message}\n\n📖 Como configurar: */comoafiliar*`); }
    },
  },
  {
    name: 'promo', aliases: ['oferta', 'addpromo'], category: C, react: '🛒', run: async ctx => {
      const url = linkDe(ctx.q) || linkDe(ctx.quoted?.text);
      if (!url) return ctx.reply('🛒 *Uso:* /promo <link> [preço] [de preço antigo] [cupom X] [| título]\nEx.: */promo https://amzn.to/xyz 129,90 de 199,90 cupom DESC10*\n📷 Mande como *legenda de uma foto* para a foto ir junto no post.\n\nEntra na fila do robô. Para postar já: */promo agora <link>...*');
      const p = loadPromos(); const agora = /^agora\b/i.test(ctx.q.trim());
      let o; try { o = await ofertaDoLink(url, lerExtras(ctx.q.replace(/^agora\s+/i, '')), p); } catch (e) { return ctx.reply(`🛒 ${e.message}\n\n📖 */comoafiliar*`); }
      // foto mandada junto (legenda /promo ...) ou respondida: vai no post (a Amazon nao deixa pegar a foto pela pagina)
      const foto = await ctx.media(['imageMessage']).catch(() => null);
      if (foto?.buffer && foto.buffer.length < 900_000) o.imagemB64 = foto.buffer.toString('base64');
      if (agora) { const n = await postarOferta(ctx.sock, o, p); return ctx.reply(`🛒 Postada em ${n} destino(s)!`); }
      const f = fila(); f.push(o); setFila(f);
      return ctx.reply(`🛒 *Na fila (${f.length}º)!* Assim vai ficar:\n\n${legenda(o, p)}\n\n${p.ativo ? `⏰ Sai em até ${p.intervalo} min (entre ${p.de} e ${p.ate}).` : '⚠️ O robô está desligado: */promocoes ligar*'}`);
    },
  },
  {
    name: 'promocoes', aliases: ['promoções', 'robopromo'], category: C, react: '🛒', run: async ctx => {
      const p = loadPromos(); const [op, ...rest] = ctx.args; const val = rest.join(' ').trim(); const O = (op || '').toLowerCase();
      const ok = t => { savePromos(p); return ctx.reply(`✅ ${t}`); };
      if (O === 'ligar' || O === 'on') { if (!p.destinos.length) return ctx.reply('🛒 Antes escolha onde postar: */promocoes aqui* (este grupo) ou */promocoes canal <link do canal>*.'); p.ativo = true; return ok(`Robô de promoções *ligado*! Uma oferta a cada ${p.intervalo} min, das ${p.de} às ${p.ate}.`); }
      if (O === 'desligar' || O === 'off') { p.ativo = false; return ok('Robô de promoções *desligado*.'); }
      if (O === 'aqui') {
        if (!ctx.isGroup) return ctx.reply('🛒 Mande */promocoes aqui* dentro do grupo de promoções. Para canal: */promocoes canal <link>*.');
        if (p.destinos.some(d => d.jid === ctx.jid)) return ctx.reply('🛒 Este grupo já recebe as promoções.');
        p.destinos.push({ tipo: 'grupo', jid: ctx.jid, nome: (await ctx.meta())?.subject || 'Grupo' }); return ok('Este grupo vai receber as promoções.');
      }
      if (O === 'canal') { const l = linkDe(val); if (!/whatsapp\.com\/channel\//.test(l || '')) return ctx.reply('🛒 Use: */promocoes canal https://whatsapp.com/channel/...*\n_(o número do bot precisa ser admin do canal)_');
        try { const m = await ctx.sock.newsletterMetadata('invite', l.split('/').pop().split('?')[0]); p.destinos.push({ tipo: 'canal', invite: l, jid: m.id, nome: m.thread_metadata?.name?.text || m.name || 'Canal' }); } catch { return ctx.reply('🛒 Não achei esse canal. Confira o link.'); }
        return ok('Canal adicionado às promoções.'); }
      if (O === 'remover') { const i = parseInt(val) - 1; if (!(i >= 0 && i < p.destinos.length)) return ctx.reply('🛒 Use: */promocoes remover <número>* (veja os números em */promocoes*)'); const [d] = p.destinos.splice(i, 1); return ok(`${d.nome} não recebe mais promoções.`); }
      if (O === 'intervalo') { const n = parseInt(val); if (!(n >= 5 && n <= 1440)) return ctx.reply('🛒 Intervalo de 5 a 1440 minutos. Ex.: */promocoes intervalo 30*'); p.intervalo = n; return ok(`Uma oferta a cada *${n} min*.`); }
      if (O === 'horario' || O === 'horário') { const m = /(\d{1,2}):?(\d{2})?\s*(?:-|a|às|ate|até)\s*(\d{1,2}):?(\d{2})?/.exec(val); if (!m) return ctx.reply('🛒 Ex.: */promocoes horario 08:00-22:00*'); p.de = `${m[1].padStart(2, '0')}:${m[2] || '00'}`; p.ate = `${m[3].padStart(2, '0')}:${m[4] || '00'}`; return ok(`Posta das *${p.de}* às *${p.ate}*.`); }
      if (O === 'busca' || O === 'buscas') { p.buscas = val ? val.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20) : []; return ok(p.buscas.length ? `Ofertas automáticas sobre: *${p.buscas.join(', ')}*` : 'Ofertas automáticas de tudo (mais vendidos).'); }
      if (O === 'desconto') { const n = parseInt(val); if (!(n >= 0 && n <= 90)) return ctx.reply('🛒 Ex.: */promocoes desconto 20* (só posta com 20% ou mais)'); p.descontoMin = n; return ok(`Só ofertas com *${n}%* ou mais de desconto.`); }
      if (O === 'assinatura') { p.assinatura = val.slice(0, 60); return ok(p.assinatura ? `Assinatura: _${p.assinatura}_` : 'Sem assinatura.'); }
      if (O === 'emoji') { p.emoji = val.slice(0, 8) || '🔥'; return ok(`Emoji das ofertas: ${p.emoji}`); }
      if (O === 'fila') { const f = fila(); return ctx.reply(f.length ? `🛒 *FILA (${f.length})*\n\n${f.slice(0, 15).map((o, i) => `${i + 1}. ${String(o.titulo).slice(0, 50)} — ${brl(o.preco) || 's/ preço'} (${o.loja})`).join('\n')}\n\n🗑️ */promocoes limpar*` : '🛒 A fila está vazia. Adicione com */promo <link>*.'); }
      if (O === 'limpar') { setFila([]); return ctx.reply('🗑️ Fila de promoções esvaziada.'); }
      if (O === 'testar') { const n = await postarOferta(ctx.sock, { titulo: 'Teste do robô de promoções', preco: 99.9, precoAntigo: 149.9, desconto: 33, loja: 'Gumball', link: 'https://nickguigui.github.io/gumball-bot/' }, p).catch(e => { ctx.reply('🛒 ' + e.message); return -1; }); return n >= 0 ? ctx.reply(`🛒 Post de teste enviado para ${n} destino(s).`) : null; }
      const r = resumo(p);
      return ctx.reply(`🛒 *ROBÔ DE PROMOÇÕES* ${r.ativo ? '🟢 ligado' : '🔴 desligado'}\n
📍 *Onde posta:*\n${r.destinos.length ? r.destinos.map((d, i) => `${i + 1}. ${d.tipo === 'canal' ? '📢' : '👥'} ${d.nome}`).join('\n') : '_nenhum ainda_'}\n
⏰ A cada *${r.intervalo} min*, das *${r.de}* às *${r.ate}* · hoje: ${r.hoje} post(s)
🏷️ Desconto mínimo: *${r.descontoMin}%* · 🔎 Buscas: ${r.buscas.length ? r.buscas.join(', ') : '_mais vendidos_'}
📥 Fila manual: ${r.fila}
🔑 Lojas: ${['amazon', 'mercadolivre', 'shopee', 'aliexpress'].map(k => `${r.lojas[k] ? '✅' : '❌'} ${LOJAS[k]}`).join(' · ')}${r.erro && Date.now() - r.erro.em < 6 * 3600e3 ? `\n⚠️ Último erro (${r.erro.fonte}): ${r.erro.msg}` : ''}\n
*Comandos:* /promocoes ligar|desligar · aqui · canal <link> · remover <n> · intervalo <min> · horario 08:00-22:00 · busca fone, air fryer · desconto 20 · assinatura · fila · limpar · testar
/promo <link> · /afiliado <link> · /afiliados · /comoafiliar
💻 Ou tudo pelo site: ${SITE}`);
    },
  },
  {
    // cria o canal (nome | descricao; foto = legenda de uma foto) e ja liga no robo de promocoes
    name: 'criarcanal', aliases: ['novocanal'], category: C, react: '📢', run: async ctx => {
      const [nome, ...desc] = ctx.q.split('|');
      if (!nome?.trim()) return ctx.reply('📢 *Uso:* /criarcanal Nome do canal | Descrição do canal\n📷 Mande como *legenda de uma foto* para ela virar a foto do canal.\n\nO canal já entra no robô de promoções. Ao criar, você aceita os termos de Canais do WhatsApp (whatsapp.com/legal/channels-guidelines). Também dá pelo site: ' + SITE);
      const foto = await ctx.media(['imageMessage']).catch(() => null);
      const r = await criarCanal(ctx.sock, { nome, descricao: desc.join('|'), foto: foto?.buffer });
      return ctx.reply(`📢 *Canal criado!*\n\n*${r.nome}*\n🔗 ${r.invite}\n\n✅ Já está no robô de promoções. Ligue com */promocoes ligar* (ou no site).\n💡 Compartilhe o link para as pessoas seguirem.`);
    },
  },
  {
    // apaga um canal do proprio numero (pede confirmacao) e tira do robo de promocoes
    name: 'apagarcanal', category: C, react: '🗑️', run: async ctx => {
      const l = linkDe(ctx.q);
      if (!/whatsapp\.com\/channel\//.test(l || '')) return ctx.reply('🗑️ *Uso:* /apagarcanal <link do canal> confirmar\n⚠️ Apaga o canal de vez, com todas as mensagens e seguidores. Só funciona em canal que é seu.');
      let meta; try { meta = await ctx.sock.newsletterMetadata('invite', l.split('/').pop().split('?')[0]); } catch { return ctx.reply('🗑️ Não achei esse canal.'); }
      const nome = meta.thread_metadata?.name?.text || meta.name || 'canal';
      if (!/\bconfirmar\b/i.test(ctx.q)) return ctx.reply(`🗑️ Vai apagar o canal *${nome}* de vez (mensagens e seguidores). Para confirmar: */apagarcanal ${l} confirmar*`);
      try { await ctx.sock.newsletterDelete(meta.id); } catch (e) { return ctx.reply(`🗑️ O WhatsApp não deixou apagar (${e.message}). Só o dono do canal pode apagar.`); }
      const p = loadPromos(); p.destinos = p.destinos.filter(d => d.jid !== meta.id && d.invite !== l); savePromos(p);
      return ctx.reply(`🗑️ Canal *${nome}* apagado.`);
    },
  },
];
