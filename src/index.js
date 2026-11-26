// GUMBALL BOT: um numero de WhatsApp. Roda sozinho (PC/Actions) ou gerenciado pelo
// servidor (src/manager.js), que conversa com este processo por IPC.
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
const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });
db.set('startedAt', Date.now());

await loadCommands();
if (!MANAGED) console.log(`✓ ${list.length} comandos carregados`);

let retry = 0; let current = null;
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  // versao atual do WhatsApp Web (a lista embutida no Baileys envelhece e o WhatsApp recusa o login)
  const { version } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion()).catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version, logger, auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false, syncFullHistory: false, generateHighQualityLinkPreview: false,
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
        const code = (await sock.requestPairingCode(config.pairNumber)).match(/.{1,4}/g).join('-');
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
      if (!MANAGED) console.log(`✅ Conectado como ${sock.user?.name || 'bot'}`);
      tell({ type: 'connected', name: sock.user?.name || '' });
      if (config.pairNumber) publishPair({ status: 'conectado', at: Date.now() });
      startScheduler(sock);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
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
    for (const m of messages) {
      // O que voce digita no celular pode chegar como 'append' (sincronizacao entre aparelhos).
      // Aceita so se for seu e recente (evita reprocessar historico).
      if (type !== 'notify') {
        const age = Date.now() / 1000 - Number(m.messageTimestamp || 0);
        if (!(type === 'append' && m.key.fromMe && age < 120)) continue;
      }
      handleMessage(sock, m).catch(e => console.error('handler:', e));
    }
  });
  sock.ev.on('group-participants.update', ev => handleParticipants(sock, ev).catch(e => console.error('participants:', e)));
  return sock;
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
