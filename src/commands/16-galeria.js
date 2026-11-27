// Galeria de figurinhas do site (estilo sticker.ly): montar um pacote no WhatsApp e publicar,
// baixar pacotes da galeria (com som!) e apagar. As figurinhas ficam no ramo "galeria" do GitHub.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { askManager } from '../lib/ipc.js';
import { isAnimatedWebp, readExif, addExif } from '../lib/media.js';
import { attachSound, stickerSound } from '../lib/soundsticker.js';
import { config } from '../config.js';
import { UserError } from '../lib/http.js';

const C = '🎨 FIGURINHAS & STICKERS';
const SITE = 'https://nickguigui.github.io/gumball-bot/#figurinhas';
const MAX = 30, MIN = 3, TTL = 12 * 3600_000;
const DIR = path.join(process.env.EDITOR_DIR ? path.dirname(process.env.EDITOR_DIR) : os.tmpdir(), 'gumball-rascunho', config.owners[0] || 'local');
const draftFile = () => path.join(DIR, 'rascunho.json');
function draft() { try { const d = JSON.parse(fs.readFileSync(draftFile(), 'utf8')); return d.exp > Date.now() ? d : null; } catch { return null; } }
const saveDraft = d => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(draftFile(), JSON.stringify(d)); };
const clearDraft = () => { try { fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 3 }); } catch { try { fs.rmSync(draftFile(), { force: true }); } catch {} } };

// Coloca a figurinha no rascunho no formato que o WhatsApp aceita em pacotes (512x512, ate 100/500 KB)
async function addSticker(ctx, m, d, somPronto) {
  if (d.figs.length >= MAX) throw new UserError(`📦 O pacote já tem ${MAX} figurinhas (o máximo do WhatsApp). Mande */publicarpacote*.`);
  const animada = isAnimatedWebp(m.buffer);
  if (d.animado === null) d.animado = animada;
  if (d.animado !== animada) throw new UserError(`📦 O WhatsApp não deixa misturar figurinhas animadas e paradas no mesmo pacote. Esse pacote é de figurinhas *${d.animado ? 'animadas' : 'paradas'}*.`);
  let webp = m.buffer;
  const meta = await sharp(webp, { animated: true }).metadata().catch(() => ({}));
  if ((meta.width !== 512 || (meta.pageHeight || meta.height) !== 512) || (!animada && webp.length > 100_000) || (animada && webp.length > 500_000)) {
    for (const q of animada ? [70, 55, 40, 30] : [90, 80, 65, 50]) {
      webp = await sharp(m.buffer, { animated: animada }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: q, effort: 5 }).toBuffer();
      if (webp.length <= (animada ? 500_000 : 100_000)) break;
    }
    if (webp.length > (animada ? 500_000 : 100_000)) throw new UserError('📦 Essa figurinha é pesada demais para um pacote do WhatsApp.');
  }
  const n = String(d.figs.length + 1).padStart(2, '0');
  fs.writeFileSync(path.join(DIR, `${n}.webp`), webp);
  const som = somPronto || await stickerSound(m.raw).catch(() => null);
  if (som) fs.writeFileSync(path.join(DIR, `${n}.ogg`), som.buffer);
  const emojis = (readExif(m.buffer)?.emojis || []).filter(e => typeof e === 'string').slice(0, 3);
  d.figs.push({ f: `${n}.webp`, som: som ? `${n}.ogg` : null, somSeg: som?.seconds || 0, emojis: emojis.length ? emojis : ['🙂'], animada });
  saveDraft(d);
  return d.figs.length;
}

// Editor do site: a figurinha montada tambem entra no pacote aberto (se houver)
export async function bufferToDraft(webp, ogg, seconds) {
  const d = draft(); if (!d) return null;
  return addSticker(null, { buffer: webp, raw: {} }, d, ogg ? { buffer: ogg, seconds } : null).then(n => ({ n, nome: d.nome }), e => ({ erro: e.userMessage || e.message }));
}

// Chamado pelo handler: com um pacote aberto, toda figurinha que o dono manda naquele chat entra nele
export async function stickerToDraft(ctx) {
  const d = draft(); if (!d || d.jid !== ctx.jid || !ctx.isOwner()) return false;
  const m = await ctx.media(['stickerMessage']).catch(() => null); if (!m) return false;
  try { const n = await addSticker(ctx, m, d); await ctx.react(n >= MIN ? '📦' : '➕'); if (n === MIN) await ctx.reply(`📦 Já dá pra publicar (${n} figurinhas). Continue mandando ou use */publicarpacote*.`); }
  catch (e) { await ctx.reply(e.userMessage || '📦 Não consegui colocar essa figurinha no pacote.'); }
  return true;
}

const fmtPack = p => `📦 *${p.nome}*${p.autor ? ` · por ${p.autor}` : ''} · ${p.figurinhas?.length ?? p.qtd} figurinhas`;

export const commands = [
  {
    name: 'novopacote', aliases: ['criarpacote', 'montarpacote'], category: C, react: '📦', run: async ctx => {
      if (!process.env.MANAGED) return ctx.reply('🌐 A galeria funciona com o bot conectado pelo site.');
      const nome = ctx.q.trim(); if (!nome) return ctx.reply(`📦 *Uso:* /novopacote Nome do pacote\n\nDepois é só mandar as figurinhas aqui (de ${MIN} a ${MAX}; com som também) e usar */publicarpacote*. Elas vão para a galeria do site, onde qualquer um baixa:\n${SITE}`);
      const old = draft(); if (old?.figs.length && !/\bnovo\b/i.test('')) clearDraft();
      clearDraft(); saveDraft({ nome: nome.slice(0, 60), autor: ctx.pushName || '', jid: ctx.jid, figs: [], animado: null, exp: Date.now() + TTL });
      return ctx.reply(`📦 *Pacote "${nome.slice(0, 60)}" aberto!*\n\nAgora manda as figurinhas *aqui nesta conversa* (de ${MIN} a ${MAX}). Figurinha com som continua com som. 🔊\nTambém dá pra responder a figurinha de outra pessoa com */addfig*.\n\n• */rascunho* mostra quantas já entraram\n• */publicarpacote* manda para a galeria do site\n• */cancelarpacote* desiste\n\n⚠️ _Animadas e paradas não podem ficar no mesmo pacote (regra do WhatsApp). O rascunho dura 12 horas._`);
    },
  },
  {
    name: 'addfig', aliases: ['colocarfig', 'addpack'], category: C, react: '➕', run: async ctx => {
      const d = draft(); if (!d) return ctx.reply('📦 Primeiro abra um pacote com */novopacote Nome*.');
      const m = await ctx.media(['stickerMessage']); if (!m) return ctx.reply('📦 Responda uma *figurinha* com /addfig.');
      const n = await addSticker(ctx, m, d);
      return ctx.reply(`📦 Figurinha ${n} adicionada a *${d.nome}*.${n >= MIN ? ' Já dá pra */publicarpacote*.' : ` Faltam ${MIN - n} para poder publicar.`}`);
    },
  },
  {
    name: 'rascunho', aliases: ['meupacote'], category: C, react: '📦', run: ctx => {
      const d = draft(); if (!d) return ctx.reply('📦 Nenhum pacote aberto. Use */novopacote Nome*.');
      const som = d.figs.filter(f => f.som).length;
      return ctx.reply(`📦 *${d.nome}*\n\n🧩 ${d.figs.length}/${MAX} figurinhas${d.animado !== null ? ` (${d.animado ? 'animadas' : 'paradas'})` : ''}${som ? ` · 🔊 ${som} com som` : ''}\n⏳ Vale até ${new Date(d.exp).toLocaleTimeString('pt-BR', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' })}\n\n${d.figs.length >= MIN ? '✅ Pronto para */publicarpacote*' : `Faltam ${MIN - d.figs.length} para poder publicar.`}`);
    },
  },
  {
    name: 'cancelarpacote', category: C, react: '🗑️', run: ctx => { const d = draft(); clearDraft(); return ctx.reply(d ? `🗑️ Pacote *${d.nome}* descartado.` : '📦 Não havia pacote aberto.'); },
  },
  {
    name: 'publicarpacote', aliases: ['publicar'], category: C, react: '🚀', done: '✅', run: async ctx => {
      const d = draft(); if (!d) return ctx.reply('📦 Nenhum pacote aberto. Use */novopacote Nome*.');
      if (d.figs.length < MIN) return ctx.reply(`📦 O WhatsApp pede pelo menos ${MIN} figurinhas por pacote. Faltam ${MIN - d.figs.length}.`);
      // icone do pacote (96x96, primeiro quadro da primeira figurinha)
      await sharp(fs.readFileSync(path.join(DIR, d.figs[0].f)), { animated: false }).resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(DIR, 'tray.png'));
      fs.writeFileSync(path.join(DIR, 'pack.json'), JSON.stringify({ nome: d.nome, autor: d.autor, animado: !!d.animado, figurinhas: d.figs }));
      const r = await askManager('galeria-publicar', { dir: DIR }, 180_000);
      clearDraft();
      return ctx.reply(`🚀 *Publicado na galeria!*\n\n📦 *${r.nome}* · ${r.qtd} figurinhas\n🔗 ${SITE}/${r.id}\n\nQualquer um baixa pelo site, pelo app ou mandando */baixarpacote ${r.id}* para o próprio bot.\n🗑️ Para tirar do ar: */apagarpacote ${r.id}*`);
    },
  },
  {
    name: 'baixarpacote', aliases: ['pegarpacote'], category: C, react: '📥', done: '✅', run: async ctx => {
      const id = (ctx.args[0] || '').replace(/^.*figurinhas\//, '').toLowerCase();
      if (!id) return ctx.reply(`📥 *Uso:* /baixarpacote código\n\nOs códigos estão na galeria: ${SITE}`);
      const { pack, dir } = await askManager('galeria-ler', { idPacote: id }, 60_000);
      await ctx.reply(`${fmtPack(pack)}\n\n_Mandando as figurinhas…_`);
      for (const f of pack.figurinhas) {
        const webp = await addExif(fs.readFileSync(path.join(dir, f.f)), pack.nome, pack.autor || config.botName);
        if (f.som && fs.existsSync(path.join(dir, f.som))) await attachSound(ctx.sock, webp, fs.readFileSync(path.join(dir, f.som)), f.somSeg || 5);
        await ctx.send({ sticker: webp });
      }
    },
  },
  {
    name: 'meuspacotes', category: C, react: '📦', run: async ctx => {
      const l = await askManager('galeria-meus', {});
      return ctx.reply(l.length ? `📦 *SEUS PACOTES NA GALERIA*\n\n${l.map(p => `• *${p.nome}* — \`${p.id}\`\n  ${SITE}/${p.id}`).join('\n')}\n\n🗑️ Apagar: */apagarpacote código*` : `📦 Você ainda não publicou nenhum pacote. Comece com */novopacote Nome*.`);
    },
  },
  {
    name: 'apagarpacote', category: C, react: '🗑️', run: async ctx => {
      const id = (ctx.args[0] || '').toLowerCase(); if (!id) return ctx.reply('🗑️ *Uso:* /apagarpacote código (veja em /meuspacotes)');
      await askManager('galeria-apagar', { idPacote: id });
      return ctx.reply(`🗑️ Pacote \`${id}\` apagado da galeria.`);
    },
  },
  {
    name: 'mostrarpacote', category: null, hidden: true, react: '👁️', run: async ctx => {
      const id = (ctx.args[0] || '').toLowerCase(); if (!id) return ctx.reply('👁️ *Uso:* /mostrarpacote código');
      await askManager('galeria-reexibir', { idPacote: id }); return ctx.reply(`👁️ Pacote \`${id}\` visível de novo na galeria.`);
    },
  },
];
