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
  if (config.pairNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairNumber);
        console.log(`\n🔑 Código de pareamento: ${code.match(/.{1,4}/g).join('-')}\n   WhatsApp > Aparelhos conectados > Conectar com número de telefone\n`);
      } catch (e) { console.error('Falha ao pedir código de pareamento:', e.message); }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && !config.pairNumber) {
      qrcodeTerminal.generate(qr, { small: true });
      const file = path.join(config.dataDir, 'qr.png');
      await QRCode.toFile(file, qr, { width: 420 }).catch(() => {});
      console.log(`📷 Escaneie o QR acima (também salvo em ${file})`);
    }
    if (connection === 'open') {
      retry = 0;
      console.log(`✅ Conectado como ${sock.user?.id} (${sock.user?.name || ''})`);
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
    if (type !== 'notify') return;
    for (const m of messages) handleMessage(sock, m).catch(e => console.error('handler:', e));
  });
  sock.ev.on('group-participants.update', ev => handleParticipants(sock, ev).catch(e => console.error('participants:', e)));
  return sock;
}

fs.mkdirSync(config.dataDir, { recursive: true });
connect();
process.on('unhandledRejection', e => console.error('unhandled:', e?.message || e));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log('👋 Encerrando...'); setTimeout(() => process.exit(0), 1500); });
