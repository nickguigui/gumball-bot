// Teste offline do modo "so dono" (grupo + privado). Uso: node test/owner-only.mjs
process.env.DATA_DIR = './data-test'; process.env.SEND_MIN_MS = '0'; process.env.SEND_JITTER_MS = '0';
process.env.OWNER_ONLY = 'true'; process.env.ALLOW_SELF = 'true'; process.env.DEFAULT_BOT_ON = 'true';
const { loadCommands } = await import('../src/registry.js');
const { handleMessage } = await import('../src/handler.js');
await loadCommands();
const G = '120363000000000000@g.us', DM = '5511988887777@s.whatsapp.net', OTHER = '333333333333333@lid', ME = '5561900000000@s.whatsapp.net';
const sent = [];
const sock = {
  user: { id: ME, name: 'Eu' },
  sendMessage: async (jid, c, o) => { sent.push({ jid, c, id: o?.messageId }); return { key: { id: o?.messageId } }; },
  groupMetadata: async () => ({ id: G, subject: 'G', participants: [{ id: OTHER }, { id: ME, admin: 'admin' }] }),
  profilePictureUrl: async () => { throw 0; },
};
let n = 0;
async function msg(label, jid, fromMe, participant, text, expect) {
  const before = sent.length;
  await handleMessage(sock, { key: { remoteJid: jid, id: 'T' + (++n), fromMe, participant }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: text } });
  await new Promise(r => setTimeout(r, 30));
  const out = sent.slice(before).map(s => s.c.text ?? (s.c.react ? `[react ${s.c.react.text}]` : Object.keys(s.c)[0]));
  const ok = expect === 'silencio' ? out.length === 0 : out.some(t => String(t).includes(expect));
  console.log(`${ok ? '✅' : '❌'} ${label}: ${out.map(t => String(t).replace(/\s+/g, ' ').slice(0, 70)).join(' | ') || '(silêncio)'}`);
  return ok;
}
const r = [
  await msg('outra pessoa no grupo', G, false, OTHER, '/menu', 'silencio'),
  await msg('você no grupo', G, true, undefined, '/piada', 'Pergunta'),
  await msg('você no privado', DM, true, undefined, '/dados', 'DADO LANÇADO'),
  await msg('outra pessoa no privado', DM, false, undefined, '/dados', 'silencio'),
  await msg('comando de grupo no privado', DM, true, undefined, '/ban', 'só funciona em grupo'),
  await msg('ranking local no privado', DM, true, undefined, '/rankmsg', 'só funciona em grupo'),
];
// painel: "Responder no privado" desligado -> privado em silencio, grupo continua
const { settings } = await import('../src/settings.js');
settings.privateChats = false;
r.push(await msg('privado com a opção desligada', DM, true, undefined, '/dados', 'silencio'));
r.push(await msg('grupo com a opção desligada', G, true, undefined, '/dados', 'DADO LANÇADO'));
settings.privateChats = true;
// eco: a resposta do bot volta como mensagem "minha"; nao pode virar comando de novo
const last = sent.filter(s => !s.c.react).at(-1); // reacao nao tem id proprio
const before = sent.length;
await handleMessage(sock, { key: { remoteJid: DM, id: last.id, fromMe: true }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: '/dados' } });
const echoOk = sent.length === before; console.log(`${echoOk ? '✅' : '❌'} eco da própria resposta ignorado`);
process.exit(r.every(Boolean) && echoOk ? 0 : 1);
