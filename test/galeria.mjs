// Teste do fluxo da galeria no bot (sem WhatsApp e sem GitHub de verdade):
// /novopacote -> figurinhas entram sozinhas -> /publicarpacote (num repositorio git falso) -> /apagarpacote
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'galtest-'));
execFileSync('git', ['init', '-q', '--bare', path.join(T, 'origin.git')]);
execFileSync('git', ['clone', '-q', path.join(T, 'origin.git'), path.join(T, 'clone')], { stdio: 'ignore' });
const git = a => execFileSync('git', a, { cwd: path.join(T, 'clone'), stdio: 'ignore' });
git(['config', 'user.name', 't']); git(['config', 'user.email', 't@t']); git(['commit', '-q', '--allow-empty', '-m', 'i']); git(['push', '-q', 'origin', 'HEAD:main']);
process.chdir(path.join(T, 'clone'));
Object.assign(process.env, { EDITOR_DIR: path.join(T, 'ed', 'x'), OWNER_NUMBERS: '5561911112222', GALERIA_DIR: path.join(T, 'wt'), MANAGED: '1', DONO_PLATAFORMA: '5561995548841' });

const { galeria } = await import('../src/galeria.js');
const G = galeria({}, () => {});
// "servidor" falso: responde os pedidos do bot como o manager faz
const listeners = [];
process.send = msg => {
  const ops = { 'galeria-publicar': () => G.publicar('5561911112222', msg.dir), 'galeria-apagar': () => G.apagar('5561911112222', msg.idPacote), 'galeria-meus': async () => G.meus('5561911112222'), 'galeria-ler': () => G.ler(msg.idPacote) };
  Promise.resolve(ops[msg.op]()).then(data => process.emit('message', { type: 'manager-reply', id: msg.id, data }), e => process.emit('message', { type: 'manager-reply', id: msg.id, erro: e.message }));
};
const { commands, stickerToDraft } = await import('../src/commands/16-galeria.js');
const cmd = n => commands.find(c => c.name === n);
const out = [];
const fig = async (cor, anim) => {
  const img = sharp({ create: { width: 300, height: 300, channels: 4, background: cor } });
  return anim ? sharp({ create: { width: 512, height: 1024, channels: 4, background: cor }, }).webp({ loop: 0, pageHeight: 512 }).toBuffer().then(b => sharp(b, { animated: true, pages: -1 }).webp().toBuffer()) : img.webp().toBuffer();
};
const ctx = (extra = {}) => ({ jid: 'g@g.us', isOwner: () => true, pushName: 'Nick', q: '', args: [], reply: async t => out.push(t), react: async e => out.push('react ' + e), media: async () => null, send: async m => out.push(Object.keys(m)[0]), sock: {}, ...extra });
const ok = (nome, cond) => console.log(cond ? '✅' : '❌', nome);

await cmd('novopacote').run(ctx({ q: 'Meu pacote' }));
ok('abre o pacote', /aberto/.test(out.at(-1)));
for (const cor of ['#f00', '#0f0', '#00f']) await stickerToDraft(ctx({ media: async () => ({ buffer: await fig(cor), raw: {} }) }));
ok('3 figurinhas entram sozinhas', out.filter(o => /^react/.test(o)).length === 3 && /Já dá pra publicar/.test(out.join('|')));
await stickerToDraft(ctx({ jid: 'outro@g.us', media: async () => ({ buffer: await fig('#ff0'), raw: {} }) }));
await cmd('rascunho').run(ctx()); ok('figurinha de outro chat não entra', /3\/30/.test(out.at(-1)));
await stickerToDraft(ctx({ isOwner: () => false, media: async () => ({ buffer: await fig('#0ff'), raw: {} }) }));
await cmd('rascunho').run(ctx()); ok('figurinha de outra pessoa não entra', /3\/30/.test(out.at(-1)));
await cmd('publicarpacote').run(ctx()); const pub = out.at(-1); ok('publica', /Publicado na galeria/.test(pub));
const id = /#figurinhas\/([a-z0-9]{6})/.exec(pub)?.[1];
const idx = JSON.parse(fs.readFileSync(path.join(T, 'wt', 'index.json'), 'utf8'));
ok('aparece no índice da galeria', idx.pacotes.some(p => p.id === id && p.qtd === 3));
ok('ícone 96x96 criado', fs.existsSync(path.join(T, 'wt', 'p', id, 'tray.png')));
await cmd('meuspacotes').run(ctx()); ok('meuspacotes lista', out.at(-1).includes(id));
await cmd('publicarpacote').run(ctx()); ok('rascunho some depois de publicar', /Nenhum pacote aberto/.test(out.at(-1)));
await cmd('novopacote').run(ctx({ q: 'Misturado' }));
await stickerToDraft(ctx({ media: async () => ({ buffer: await fig('#f00'), raw: {} }) }));
const animBuf = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#f0f' } }).webp().toBuffer();
// figurinha animada falsa: dois quadros
const frames = await sharp([await sharp({ create: { width: 512, height: 512, channels: 4, background: '#f0f' } }).png().toBuffer(), await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0ff' } }).png().toBuffer()], { join: { animated: true } }).webp({ loop: 0 }).toBuffer().catch(() => animBuf);
await stickerToDraft(ctx({ media: async () => ({ buffer: frames, raw: {} }) }));
ok('não mistura animada com parada', /não deixa misturar/.test(out.at(-1)) || frames === animBuf);
await cmd('cancelarpacote').run(ctx());
await cmd('apagarpacote').run(ctx({ args: [id] })); ok('apaga', /apagado/.test(out.at(-1)));
process.chdir(os.tmpdir()); try { fs.rmSync(T, { recursive: true, force: true }); } catch {}
process.exit(0);
