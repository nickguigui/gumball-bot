// GUMBALL BOT: ponto de entrada. Conecta no WhatsApp (Baileys) e despacha mensagens.
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, fetchLatestWaWebVersion, Browsers } from 'baileys';
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { config } from './config.js';
import { loadCommands, list } from './registry.js';
import { handleMessage, handleParticipants } from './handler.js';
import { startScheduler } from './scheduler.js';
import { db } from './db.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });
export const started = Date.now();
db.set('startedAt', started);

await loadCommands();
console.log(`✓ ${list.length} comandos carregados`);

let retry = 0;
async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  // versao atual do WhatsApp Web (a lista embutida no Baileys envelhece e o WhatsApp recusa o login)
  const { version } = await fetchLatestWaWebVersion().catch(() => fetchLatestBaileysVersion()).catch(() => ({ version: undefined }));
  const sock = makeWASocket({
    version, logger, auth: state,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  // No GitHub Actions o log e publico: sem sessao e sem pareamento pedido, nao mostra QR, so sai.
  if (process.env.CI && !sock.authState.creds.registered && !config.pairNumber) {
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
        console.log(`\n🔑 Código de pareamento: ${code}\n   WhatsApp > Aparelhos conectados > Conectar com número de telefone\n`);
        publishPair({ status: 'codigo', code, at: Date.now() });
      } catch (e) { console.error('Falha ao pedir código de pareamento:', e.message); publishPair({ status: 'erro', error: e.message, at: Date.now() }); }
    }
    if (qr && !config.pairNumber) {
      qrcodeTerminal.generate(qr, { small: true });
      const file = path.join(config.dataDir, 'qr.png');
      await QRCode.toFile(file, qr, { width: 420 }).catch(() => {});
      console.log(`📷 Escaneie o QR acima (também salvo em ${file})`);
    }
    if (connection === 'open') {
      retry = 0;
      console.log(`✅ Conectado como ${sock.user?.name || 'bot'}`);
      if (config.pairNumber) publishPair({ status: 'conectado', at: Date.now() });
      startScheduler(sock);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('❌ Sessão encerrada no celular. Apague a pasta auth/ e conecte de novo.');
        process.exit(1);
      }
      const wait = Math.min(60_000, 2000 * 2 ** retry++);
      console.warn(`⚠️ Conexão caiu (${code ?? lastDisconnect?.error?.message}). Reconectando em ${wait / 1000}s...`);
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

// Publica o codigo de pareamento/status em pair/code.json para o site mostrar (so no GitHub Actions).
// O codigo sozinho nao da acesso a nada: ele so funciona se for digitado no celular do numero.
let pairChain = Promise.resolve();
function publishPair(data) {
  if (!process.env.CI) return;
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
// Sem parear em 10 minutos: desiste (nao fica gastando o Actions)
if (config.pairNumber) setTimeout(() => { if (!fs.existsSync(path.join(config.authDir, 'creds.json')) || !JSON.parse(fs.readFileSync(path.join(config.authDir, 'creds.json'), 'utf8')).registered) { publishPair({ status: 'expirado', at: Date.now() }); setTimeout(() => process.exit(3), 8000); } }, 10 * 60_000);

fs.mkdirSync(config.dataDir, { recursive: true });
connect();
process.on('unhandledRejection', e => console.error('unhandled:', e?.message || e));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log('👋 Encerrando...'); setTimeout(() => process.exit(0), 1500); });
