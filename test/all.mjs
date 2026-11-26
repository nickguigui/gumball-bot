// Roda TODOS os comandos num grupo falso e aponta crashes ("❌ *Erro:*" generico ou excecao).
// Uso: node test/all.mjs
process.env.DATA_DIR = './data-test-all'; process.env.SEND_MIN_MS = '0'; process.env.SEND_JITTER_MS = '0'; process.env.DEFAULT_BOT_ON = 'true';
const { loadCommands, list } = await import('../src/registry.js');
const { handleMessage } = await import('../src/handler.js');
await loadCommands();
const G = '120363000000000009@g.us', ME = '111111111111111@lid', OUTRO = '333333333333333@lid';
const sent = [];
const sock = {
  user: { id: '999999999999@s.whatsapp.net', lid: '222222222222222@lid' },
  sendMessage: async (j, c, o) => { sent.push(c); return { key: { id: o?.messageId || 'S' + sent.length } }; },
  groupMetadata: async () => ({ id: G, subject: 'Teste', participants: [{ id: ME, admin: 'admin' }, { id: OUTRO }, { id: '222222222222222@lid', admin: 'admin' }] }),
  groupFetchAllParticipating: async () => ({}), profilePictureUrl: async () => { throw new Error('sem'); },
  groupInviteCode: async () => 'X', fetchBlocklist: async () => [], groupParticipantsUpdate: async () => [], groupSettingUpdate: async () => {},
  groupUpdateSubject: async () => {}, groupUpdateDescription: async () => {}, groupRevokeInvite: async () => 'Y', groupRequestParticipantsList: async () => [],
  updateMediaMessage: async m => m, newsletterMetadata: async () => ({ id: 'x@newsletter' }),
};
// argumentos de exemplo para os que precisam
const ARGS = { chance: 'de dar certo', calcular: '2+2', signo: 'leao', clima: 'Brasilia', traduzir: 'ingles oi', escolher: 'a, b', numero: '1 10', ship: '@333333333333333', casar: '@333333333333333', pix: '@333333333333333 1', roubar: '@333333333333333', ppt: 'pedra', ttp: 'oi', attp: 'oi', brat: 'oi', qr: 'oi', fazernick: 'oi', cep: '01001000', ddd: '61', wiki: 'Brasil', anotar: 'nota', niver: '25/12', lista: 'Futebol', lembrete: 'daqui a 5 minutos teste', config: 'links todos', vermodo: 'liberar', anti: 'video', addpalavra: 'x', permddi: '351', agendar: '08:00 oi', addresposta: 'oi | ola', enquete: 'P | a | b', depositar: '1', retirar: '1', apostar: '10', roleta: '10 preto', comprar: 'flores', vender: 'flores', converter: '10 usd brl', canal: 'x', previacanal: 'x', velha: '@333333333333333', duelo: '@333333333333333' };
const SKIP = new Set(['play', 'ytmp3', 'ytmp4', 'tkk', 'insta', 'face', 'pin', 'baixar', 'ytsearch', 'lyrics', 'gpt', 'resumir', 'filme', 'cinema', 'celular', 'noticias', 'futebol', 'dolarhoje', 'feriados', 'encurtar', 'falar', 'transcrever', 'bot', 'resetarsaldo']); // rede pesada ou muda estado global; testados a parte
let n = 0, fails = [], silent = [];
for (const c of list) {
  if (SKIP.has(c.name)) continue;
  const before = sent.length;
  const text = `/${c.name}${ARGS[c.name] ? ' ' + ARGS[c.name] : ''}`;
  try {
    await Promise.race([handleMessage(sock, { key: { remoteJid: G, id: 'A' + (++n), participant: ME }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: text } }), new Promise((_, r) => setTimeout(() => r(new Error('demorou >20s')), 20000))]);
    await new Promise(r => setTimeout(r, 15));
  } catch (e) { fails.push(`${text} -> EXCECAO ${e.message}`); continue; }
  const out = sent.slice(before).map(x => x.text || x.caption || '');
  const err = out.find(t => /❌ \*Erro:\*/.test(t));
  if (err) fails.push(`${text} -> ${err.replace(/\s+/g, ' ').slice(0, 140)}`);
  if (!sent.slice(before).some(x => !x.react)) silent.push(text);
}
console.log(`testados: ${n} | crashes: ${fails.length} | sem resposta de texto: ${silent.length}`);
for (const f of fails) console.log('✗ ' + f);
if (silent.length) console.log('(sem resposta de texto: ' + silent.join(' ') + ')');
process.exit(fails.length ? 1 : 0);
