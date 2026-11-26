// Autoteste offline: carrega os comandos e simula mensagens num grupo falso.
// Nao conecta no WhatsApp. Uso: npm run check [-- comando1 comando2 ...]
process.env.DATA_DIR = process.env.DATA_DIR || './data-test';
process.env.SEND_MIN_MS = '0'; process.env.SEND_JITTER_MS = '0';
const { loadCommands, list, registry } = await import('./registry.js');
const { handleMessage } = await import('./handler.js');

await loadCommands();
console.log(`✓ ${list.length} comandos (${registry.size} nomes com aliases)`);

const GROUP = '120363000000000000@g.us', ME = '111111111111111@lid', BOT = '999999999999@s.whatsapp.net';
const sent = [];
const sock = {
  user: { id: BOT, lid: '222222222222222@lid', name: 'Bot' },
  sendMessage: async (jid, content, opts) => { sent.push({ jid, content, quoted: !!opts?.quoted }); return { key: { id: 'X' + sent.length } }; },
  groupMetadata: async () => ({ id: GROUP, subject: 'Grupo Teste', creation: 1700000000, participants: [{ id: ME, admin: 'admin' }, { id: '333333333333333@lid' }, { id: '444444444444444@lid' }, { id: sock.user.lid, admin: 'admin' }] }),
  profilePictureUrl: async () => { throw new Error('sem foto'); },
  groupInviteCode: async () => 'ABCDEF', fetchBlocklist: async () => [], updateMediaMessage: async m => m,
};
let n = 0;
async function say(text) {
  const before = sent.length;
  await handleMessage(sock, { key: { remoteJid: GROUP, id: 'M' + (++n), participant: ME, fromMe: false }, pushName: 'Tester', messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: text } });
  await new Promise(r => setTimeout(r, 30));
  return sent.slice(before);
}
const args = process.argv.slice(2);
const tests = args.length ? args : ['/menu', '/menuadm', '/ping', '/piada', '/chance de passar de ano', '/gado', '/ship @333333333333333', '/signo peixes', '/signo', '/calcular 2^10 + 3', '/calcular abc+', '/cpf', '/dados', '/daily', '/trabalhar', '/minerar', '/banco', '/depositar 50', '/perfil', '/loja', '/comprar alianca', '/inventario', '/raspadinha', '/apostar 10', '/anagrama', '/dica', '/anagrama errado', '/quiz', '/ppt pedra', '/bau', '/abrir', '/topcmd', '/lembrete daqui a 5 minutos testar', '/lembrete lista', '/comandoquenaoexiste', 'texto sem prefixo', '/MENU', '/fazernick gumball', '/escolher pizza, sushi', '/bot off', '/piada', '/bot on', '/antilink on', '/infogp', '/topxp', '/rankmsg', '/congelar @333333333333333', '/bebida', '/casal'];
let fails = 0;
for (const t of tests) {
  let out;
  try { out = await say(t); } catch (e) { console.log(`✗ ${t} -> EXCEPTION ${e.message}`); fails++; continue; }
  const texts = out.map(o => o.content.text ?? o.content.caption ?? (o.content.react ? `[react ${o.content.react.text}]` : Object.keys(o.content)[0]));
  const err = texts.find(x => /❌ \*Erro:\*/.test(x || ''));
  if (err) fails++;
  console.log(`${err ? '✗' : '•'} ${t}\n   ${texts.map(x => String(x).replace(/\s+/g, ' ').slice(0, 140)).join('\n   ') || '(silêncio)'}`);
}
console.log(`\n${fails ? `⚠️ ${fails} falha(s)` : '✅ tudo ok'}`);
process.exit(fails ? 1 : 0);
