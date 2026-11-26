// Guarda a sessao do WhatsApp + banco num unico arquivo criptografado (AES-256-GCM),
// para o GitHub Actions retomar entre execucoes sem expor nada no repositorio publico.
// Uso: node scripts/state.mjs pack|unpack|newkey   (chave em STATE_KEY, 64 hex)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

// STATE_DIRS=./data (servidor: todos os numeros + registry.json) ou o padrao do bot de um numero
const DIRS = process.env.STATE_DIRS ? process.env.STATE_DIRS.split(',') : [process.env.AUTH_DIR || './auth', process.env.DATA_DIR || './data'];
const OUT = process.env.STATE_FILE || './state/state.enc';
// o -wal guarda as gravacoes recentes do SQLite: vai junto (o -shm e recriado sozinho)
const SKIP = /\.(png|db-shm)$|^qr\./;

function key() {
  const k = process.env.STATE_KEY || '';
  if (!/^[0-9a-f]{64}$/i.test(k)) throw new Error('STATE_KEY ausente ou inválida (64 caracteres hex).');
  return Buffer.from(k, 'hex');
}
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : SKIP.test(e.name) ? [] : [p];
  });
}
const cmd = process.argv[2];
if (cmd === 'newkey') { console.log(crypto.randomBytes(32).toString('hex')); process.exit(0); }
if (cmd === 'pack') {
  // checkpoint do SQLite antes de empacotar
  try { const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(path.join(DIRS[1], 'bot.db')); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); } catch {}
  const files = {};
  for (const d of DIRS) for (const f of walk(d)) files[f.replace(/\\/g, '/')] = fs.readFileSync(f).toString('base64');
  const plain = zlib.gzipSync(Buffer.from(JSON.stringify(files)), { level: 9 });
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.concat([iv, c.getAuthTag(), enc]));
  console.log(`🔒 ${Object.keys(files).length} arquivos salvos em ${OUT}`);
} else if (cmd === 'unpack') {
  if (!fs.existsSync(OUT)) { console.log('ℹ️ Sem estado salvo ainda (primeira execução).'); process.exit(0); }
  const buf = fs.readFileSync(OUT);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28));
  const files = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()])).toString());
  for (const [f, b64] of Object.entries(files)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); }
  console.log(`🔓 ${Object.keys(files).length} arquivos restaurados`);
} else { console.error('uso: node scripts/state.mjs pack|unpack|newkey'); process.exit(1); }
