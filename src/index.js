import crypto from 'node:crypto';
// GUMBALL BOT: um numero de WhatsApp. Roda sozinho (PC/Actions) ou gerenciado pelo
// servidor (src/manager.js), que conversa com este processo por IPC.
import './lib/soundsticker.js'; // figurinha com som: precisa entrar antes de qualquer mensagem
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, fetchLatestWaWebVersion, Browsers, jidNormalizedUser } from 'baileys';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { config } from './config.js';
import { loadCommands, list } from './registry.js';
import { handleMessage, handleParticipants } from './handler.js';
import { startScheduler } from './scheduler.js';
import { refreshSettings } from './settings.js';
import { db } from './db.js';

const MANAGED = !!process.send; // filho do gerenciador
const tell = msg => { if (MANAGED) process.send(msg); };
const logger = pino({ level: process.env.LOG_LEVEL || 'error' }, pino.destination(2));
db.set('startedAt', Date.now());

await loadCommands();
if (!MANAGED) console.log(`✓ ${list.length} comandos carregados`);

let retry = 0; let current = null;
// Codigo de pareamento FIXO enquanto o processo vive: o WhatsApp fecha a conexao de pareamento depois
// de ~1 min e o bot reconecta; antes isso gerava um codigo novo e o que a pessoa digitava no celular
// (o antigo) dava erro. Agora o mesmo codigo vale em todas as reconexoes.
const CROCKFORD = '123456789ABCDEFGHJKLMNPQRSTVWXYZ';
let pairCode = null;
const novoCodigo = () => Array.from(crypto.randomBytes(8), b => CROCKFORD[b % 32]).join('');
let lastUpsert = 0, watchdogKicks = 0; // vigia: conectado mas sem receber nada (buffer do Baileys preso)
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  // versao atual do WhatsApp Web (a lista embutida no Baileys envelhece e o WhatsApp recusa o login)
  const { version } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion()).catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version, logger, auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
    qrTimeout: 60_000, // pareamento: cada etapa vive 1 min (a conexao de pareamento dura ~6 min em vez de ~2)
  });
  current = sock;

  // No GitHub Actions o log e publico: sem sessao e sem pareamento pedido, nao mostra QR, so sai.
  if (process.env.CI && !MANAGED && !sock.authState.creds.registered && !config.pairNumber) {
    console.error('❌ Sem sessão do WhatsApp. Rode o workflow com pair = "sim" para conectar.');
    process.exit(3);
  }

  let pairingAsked = false;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // Pareamento por codigo: pede no primeiro evento de QR (o socket ja esta pronto)
    if (qr && config.pairNumber && !pairingAsked && !sock.authState.creds.registered) {
      pairingAsked = true;
      try {
        pairCode = pairCode || novoCodigo();
        const code = (await sock.requestPairingCode(config.pairNumber, pairCode)).match(/.{1,4}/g).join('-');
        if (!MANAGED) console.log(`\n🔑 Código de pareamento: ${code}\n   WhatsApp > Aparelhos conectados > Conectar com número de telefone\n`);
        tell({ type: 'pair', code }); publishPair({ status: 'codigo', code, at: Date.now() });
      } catch (e) {
        console.error('Falha ao pedir código de pareamento:', e.message);
        tell({ type: 'pair-error', error: e.message }); publishPair({ status: 'erro', error: e.message, at: Date.now() });
      }
    }
    if (qr && !config.pairNumber && !MANAGED) {
      qrcodeTerminal.generate(qr, { small: true });
      const file = path.join(config.dataDir, 'qr.png');
      await QRCode.toFile(file, qr, { width: 420 }).catch(() => {});
      console.log(`📷 Escaneie o QR acima (também salvo em ${file})`);
    }
    if (connection === 'open') {
      retry = 0;
      // cada numero conectado e dono do proprio bot: o nome do dono e o do perfil dele
      if (MANAGED && !process.env.OWNER_NAME) config.ownerName = sock.user?.name || sock.user?.verifiedName || 'Dono';
      if (!MANAGED) console.log(`✅ Conectado como ${sock.user?.name || 'bot'}`);
      tell({ type: 'connected', name: sock.user?.name || '' });
      if (config.pairNumber) publishPair({ status: 'conectado', at: Date.now() });
      startScheduler(sock);
      // Vigia: o Baileys segura os eventos ate o WhatsApp avisar que mandou as pendentes. Se esse aviso
      // nao chega, o bot fica conectado e surdo. Sem nenhuma mensagem: libera o buffer (90 s) e, se
      // continuar mudo, reconecta (6 min; no maximo 3 vezes por processo).
      const openedAt = Date.now();
      setTimeout(() => { if (current === sock && lastUpsert < openedAt) { console.error('[vigia] sem mensagens 90 s após conectar: liberando o buffer'); try { sock.ev.flush(); } catch {} } }, 90_000).unref();
      setTimeout(() => { if (current === sock && lastUpsert < openedAt && watchdogKicks < 3) { watchdogKicks++; console.error('[vigia] ainda sem mensagens: reconectando'); sock.end(new Error('vigia: sem mensagens')); } }, 6 * 60_000).unref();
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      // Codigo de pareamento expirou sem ser digitado: o WhatsApp fecha com 401. Recomeca do zero e gera outro.
      if (code === DisconnectReason.loggedOut && config.pairNumber && !sock.authState.creds.registered) {
        fs.rmSync(config.authDir, { recursive: true, force: true });
        tell({ type: 'pair-renew' });
        setTimeout(connect, 1500);
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        console.error('❌ Sessão encerrada no celular.');
        tell({ type: 'logged-out' });
        process.exit(MANAGED ? 4 : 1);
      }
      const wait = Math.min(60_000, 2000 * 2 ** retry++);
      tell({ type: 'reconnecting', code: code ?? null });
      if (!MANAGED) console.warn(`⚠️ Conexão caiu (${code ?? lastDisconnect?.error?.message}). Reconectando em ${wait / 1000}s...`);
      setTimeout(connect, wait);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    lastUpsert = Date.now();
    for (const m of messages) {
      // diagnostico sem conteudo: tipo, grupo/privado, se e seu, tipos de mensagem, falha de decifrar
      try {
        const j = m.key.remoteJid || '';
        console.log(`[msg] ${type} ${j.endsWith('@g.us') ? 'grupo' : j.endsWith('@newsletter') ? 'canal' : j.endsWith('status@broadcast') ? 'status' : 'privado'} eu=${m.key.fromMe ? 1 : 0} ${Object.keys(m.message || {}).slice(0, 3).join(',') || '-'}${m.messageStubType ? ' stub=' + m.messageStubType + (m.messageStubParameters ? ':' + String(m.messageStubParameters[0]).slice(0, 60) : '') : ''}`);
      } catch {}
      // O que voce digita no celular pode chegar como 'append' (sincronizacao entre aparelhos).
      // Aceita so se for seu e recente (evita reprocessar historico).
      if (type !== 'notify') {
        const age = Date.now() / 1000 - Number(m.messageTimestamp || 0);
        if (!(type === 'append' && m.key.fromMe && age < 600)) continue; // 10 min: cobre a troca de turno do servidor
      }
      handleMessage(sock, m).catch(e => console.error('handler:', e));
    }
  });
  sock.ev.on('group-participants.update', ev => handleParticipants(sock, ev).catch(e => console.error('participants:', e)));
  return sock;
}

// Opcoes de grupo que o painel pode mudar (nome -> tipo)
const GROUP_KEYS = {
  antilink: 'boolean', antifake: 'boolean', antipalavra: 'boolean', badwords: 'object', antiflood: 'boolean', antispam: 'boolean',
  antifoto: 'boolean', antiaudio: 'boolean', antivideo: 'boolean', antisticker: 'boolean', antidocumento: 'boolean', antiloc: 'boolean', anticontato: 'boolean',
  antiapagar: 'boolean', antieditar: 'boolean', captcha: 'boolean', autosticker: 'boolean', welcome: 'boolean', welcomeText: 'string', bye: 'boolean', byeText: 'string',
  soadm: 'boolean', noFun: 'boolean', tempocmd: 'number', maxadv: 'number', autoOpen: 'string', autoClose: 'string', rules: 'string', prefix: 'string',
  blockedCmds: 'object', stickerPack: 'string', stickerAuthor: 'string', allowLinks: 'object',
  viewOnceMode: 'string', linkMode: 'string', banLinks: 'boolean', antiTypes: 'object', allowDDI: 'object', autoreplies: 'object', agendas: 'object', welcomePhoto: 'boolean', byePhoto: 'boolean',
};
const pickGroupCfg = s => Object.fromEntries(Object.keys(GROUP_KEYS).filter(k => s[k] !== undefined && s[k] !== null).map(k => [k, s[k]]));


// Configuracao de promocoes vinda do painel: so campos conhecidos; chave vazia = mantem a atual
function aplicarPromos(p, d, A) {
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  if (typeof d.ativo === 'boolean') p.ativo = d.ativo;
  if (Number.isFinite(+d.intervalo) && +d.intervalo >= 5) p.intervalo = Math.min(1440, Math.round(+d.intervalo));
  for (const k of ['de', 'ate']) if (/^\d{2}:\d{2}$/.test(d[k] || '')) p[k] = d[k];
  if (Number.isFinite(+d.descontoMin)) p.descontoMin = Math.max(0, Math.min(90, Math.round(+d.descontoMin)));
  if (Array.isArray(d.buscas)) p.buscas = d.buscas.map(b => str(b, 60)).filter(Boolean).slice(0, 20);
  if (d.fontes && typeof d.fontes === 'object') p.fontes = { shopee: d.fontes.shopee !== false, aliexpress: d.fontes.aliexpress !== false };
  if (d.emoji !== undefined) p.emoji = str(d.emoji, 8) || '🔥';
  if (d.assinatura !== undefined) p.assinatura = str(d.assinatura, 60);
  if (['profissional', 'fofo'].includes(d.estilo)) p.estilo = d.estilo;
  if (typeof d.datas === 'boolean') p.datas = d.datas;
  if (typeof d.apoio === 'boolean') p.apoio = d.apoio;
  if (d.cupons && typeof d.cupons === 'object') p.cupons = { auto: d.cupons.auto !== false, lojas: (Array.isArray(d.cupons.lojas) ? d.cupons.lojas : p.cupons?.lojas || []).filter(l => ['mercadolivre', 'amazon', 'shopee', 'aliexpress'].includes(l)) };
  if (Array.isArray(d.destinos)) p.destinos = d.destinos.slice(0, 30).map(x => x.tipo === 'canal'
    ? { tipo: 'canal', invite: str(x.invite, 200), nome: str(x.nome, 80) || 'Canal', jid: (p.destinos.find(o => o.invite === x.invite) || {}).jid }
    : { tipo: 'grupo', jid: str(x.jid, 60), nome: str(x.nome, 80) || 'Grupo' }).filter(x => x.tipo === 'canal' ? /whatsapp\.com\/channel\//.test(x.invite) : /@g\.us$/.test(x.jid));
  const a = (p.afiliados = p.afiliados || {}), n = d.afiliados || {};
  if (n.amazon !== undefined) { const t = str(n.amazon, 40); if (t && !/^[\w.-]+-2\d$/.test(t)) throw new Error('O código da Amazon termina com -20 (ex.: seucodigo-20).'); a.amazon = t; }
  if (n.mercadolivre !== undefined) { const t = str(n.mercadolivre, 600); if (!t) delete a.mercadolivre; else { const c = A.mlCodigos(t); if (!c) throw new Error('Cole um link de afiliado do Mercado Livre com matt_tool/matt_word (o endereço completo).'); a.mercadolivre = c; } }
  for (const [loja, campos] of [['shopee', ['appId', 'secret']], ['aliexpress', ['appKey', 'secret', 'trackingId']]]) {
    const v = n[loja]; if (!v) continue;
    if (v.remover) { delete a[loja]; continue; }
    const cur = a[loja] || {};
    for (const c of campos) { const t = str(v[c], 200); if (t) cur[c] = t; } // vazio = mantem
    a[loja] = cur;
  }
  return p;
}

// ---------- comandos do gerenciador (IPC) ----------
if (MANAGED) {
  process.on('message', async msg => {
    try {
      if (msg.type === 'login-code') {
        // codigo de entrada no painel vai para a conversa "Voce" (so o dono do numero ve)
        const self = jidNormalizedUser(current.user.id);
        await current.sendMessage(self, { text: `🔐 *Código de entrada no painel do Gumball:* ${msg.code}\n\n_Vale por 10 minutos. Se não foi você, ignore._` });
        tell({ type: 'login-code-sent', id: msg.id });
      }
      if (msg.type === 'reload-settings') await refreshSettings();
      // Painel: lista os grupos do numero com as configuracoes de cada um
      if (msg.type === 'groups') {
        const all = await current.groupFetchAllParticipating();
        const me = [current.user.id, current.user.lid].filter(Boolean).map(j => jidNormalizedUser(j).split('@')[0]);
        const list = Object.values(all).map(g => {
          const d = db.group(g.id);
          const p = g.participants.find(x => [x.id, x.lid, x.phoneNumber].filter(Boolean).some(j => me.includes(String(j).split('@')[0].split(':')[0])));
          return { jid: g.id, nome: g.subject, membros: g.participants.length, admin: !!p?.admin, bot: d.bot !== false, cfg: pickGroupCfg(d.settings) };
        }).sort((a, b) => a.nome.localeCompare(b.nome));
        tell({ type: 'reply', id: msg.id, data: list });
      }
      if (msg.type === 'group-set') {
        const before = db.group(msg.jid).settings.viewOnceMode || 'optin';
        const g = db.updateGroup(msg.jid, gr => {
          if (typeof msg.patch.bot === 'boolean') gr.bot = msg.patch.bot;
          for (const [k, v] of Object.entries(msg.patch.cfg || {})) if (GROUP_KEYS[k] && typeof v === GROUP_KEYS[k]) gr.settings[k] = v;
          return gr;
        });
        // ligou "todos" na visualizacao unica pelo painel: avisa o grupo (quem nao quiser pode bloquear)
        if (g.settings.viewOnceMode === 'optout' && before !== 'optout') {
          const { VO_AVISO } = await import('./commands/45-viewonce.js');
          await current.sendMessage(msg.jid, { text: VO_AVISO }).catch(() => {});
        }
        tell({ type: 'reply', id: msg.id, data: { jid: msg.jid, bot: g.bot !== false, cfg: pickGroupCfg(g.settings) } });
      }
      // Editor de figurinhas do site: monta e manda a figurinha
      if (msg.type === 'fig-make') {
        const { makeSticker } = await import('./lib/editor.js');
        const data = await makeSticker(current, msg.token, msg.opts).catch(e => ({ erro: e.message || 'Não consegui montar a figurinha.' }));
        tell({ type: 'reply', id: msg.id, data });
      }
      // Robo de promocoes (painel do site)
      if (msg.type?.startsWith('promos-')) {
        const P = await import('./promos.js'); const A = await import('./lib/afiliados.js');
        const r = await (async () => {
          if (msg.type === 'promos-get') return P.resumo();
          if (msg.type === 'promos-set') return { resumo: P.resumo(P.savePromos(aplicarPromos(P.loadPromos(), msg.dados || {}, A))) };
          if (msg.type === 'promos-link') return A.converter(String(msg.url || ''), P.loadPromos().afiliados);
          if (msg.type === 'promos-testar') return { n: await P.postarOferta(current, { titulo: 'Teste do robô de promoções', preco: 99.9, precoAntigo: 149.9, desconto: 33, loja: 'Gumball', link: 'https://nickguigui.github.io/gumball-bot/' }) };
          if (msg.type === 'promos-oferta') {
            const o = await P.ofertaDoLink(String(msg.url || ''), msg.extra || {});
            if (msg.agora) return { postada: await P.postarOferta(current, o), oferta: o };
            const f = P.fila(); f.push(o); P.setFila(f); return { naFila: f.length, oferta: o };
          }
          if (msg.type === 'promos-limpar') { P.setFila([]); return P.resumo(); }
          if (msg.type === 'promos-cupom') {
            const lista = String(msg.codigos || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [codigo, ...d] = l.split(/\s+/); return { codigo: codigo.toUpperCase(), titulo: '', desc: d.join(' ').replace(/^[-–:]\s*/, '') }; }).filter(c => /^[A-Z0-9_-]{3,30}$/.test(c.codigo));
            if (!lista.length) throw new Error('Escreva pelo menos um código (um por linha: CODIGO descrição).');
            if (!['mercadolivre', 'amazon', 'shopee', 'aliexpress'].includes(msg.loja)) throw new Error('Escolha a loja.');
            return { postado: await P.postarCupons(current, msg.loja, lista, { link: msg.link || undefined, manual: true }), resumo: P.resumo() };
          }
          if (msg.type === 'promos-esgotou') return { postado: await P.postarEsgotados(current, [String(msg.codigo || '').toUpperCase()]), resumo: P.resumo() };
          if (msg.type === 'promos-criarcanal') return P.criarCanal(current, { nome: msg.nome, descricao: msg.descricao, foto: msg.fotoB64 ? Buffer.from(String(msg.fotoB64), 'base64') : null, usarNoRobo: msg.usarNoRobo !== false });
        })().catch(e => ({ erro: e.message }));
        tell({ type: 'reply', id: msg.id, data: r });
      }
      // Canal/grupo automatico: post escrito pela pessoa (agora ou agendado) e a agenda
      if (msg.type?.startsWith('canal-')) {
        const C = await import('./channels.js');
        const r = await (async () => {
          const ch = C.loadChannels().find(c => c.id === msg.idCanal); if (!ch) throw new Error('Canal não encontrado.');
          if (msg.type === 'canal-post') {
            const foto = msg.fotoB64 ? Buffer.from(String(msg.fotoB64), 'base64') : null;
            if (msg.em && msg.em > Date.now() + 60_000) { C.agendar(ch, { em: msg.em, texto: String(msg.texto || '').slice(0, 4000), fotoB64: msg.fotoB64 || null }); return { agendado: true, agenda: C.agenda(ch) }; }
            await C.postarTexto(current, ch, { texto: String(msg.texto || '').slice(0, 4000), foto }); return { postado: true, agenda: C.agenda(ch) };
          }
          if (msg.type === 'canal-agenda') return { agenda: C.agenda(ch) };
          if (msg.type === 'canal-desagendar') { C.desagendar(ch, msg.em); return { agenda: C.agenda(ch) }; }
        })().catch(e => ({ erro: e.message }));
        tell({ type: 'reply', id: msg.id, data: r });
      }
      // aviso do servidor para o dono da plataforma (ex.: denuncia na galeria), na conversa "Voce"
      if (msg.type === 'avisar-dono') await current.sendMessage(jidNormalizedUser(current.user.id), { text: msg.text });
      if (msg.type === 'logout') { await current?.logout().catch(() => {}); process.exit(4); }
      if (msg.type === 'stop') process.exit(0);
    } catch (e) { tell({ type: 'error', id: msg.id, error: e.message }); }
  });
}

// ---------- GitHub Actions: publica o codigo em pair/code.json para o site antigo ----------
let pairChain = Promise.resolve();
function publishPair(data) {
  if (!process.env.CI || MANAGED) return;
  pairChain = pairChain.then(async () => {
    const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const run = promisify(execFile);
    fs.mkdirSync('pair', { recursive: true });
    fs.writeFileSync('pair/code.json', JSON.stringify({ ...data, run: process.env.GITHUB_RUN_ID || null }) + '\n');
    try {
      await run('git', ['add', 'pair/code.json']);
      await run('git', ['commit', '-q', '-m', `bot: pareamento ${data.status}`]);
      await run('git', ['pull', '-q', '--rebase', '--autostash']).catch(() => {});
      await run('git', ['push', '-q']);
    } catch (e) { console.warn('⚠️ não consegui publicar o código:', e.message.split('\n')[0]); }
  });
}
// Sem parear em 10 minutos: desiste
if (config.pairNumber) setTimeout(() => {
  const f = path.join(config.authDir, 'creds.json');
  const ok = fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).registered;
  if (!ok) { tell({ type: 'pair-expired' }); publishPair({ status: 'expirado', at: Date.now() }); setTimeout(() => process.exit(3), MANAGED ? 500 : 8000); }
}, 10 * 60_000);

fs.mkdirSync(config.dataDir, { recursive: true });
connect();
process.on('unhandledRejection', e => console.error('unhandled:', e?.message || e));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { if (!MANAGED) console.log('👋 Encerrando...'); setTimeout(() => process.exit(0), 1500); });
