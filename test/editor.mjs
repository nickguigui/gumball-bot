// Teste da montagem do editor de figurinhas (sem WhatsApp): node test/editor.mjs <video.mp4> <foto.jpg>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
process.env.EDITOR_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ed-'));
process.env.OWNER_NUMBERS = '5561900000000';
const E = await import('../src/lib/editor.js');
const [video, foto] = process.argv.slice(2);
const sent = [];
const sock = { sendMessage: async (j, m) => { sent.push(m.sticker.length); }, waUploadToServer: async () => ({ mediaUrl: 'https://x', directPath: '/x' }) };
const ov = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: Buffer.from('<svg width="512" height="512"><text x="256" y="460" font-size="80" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="6">OI</text></svg>') }]).png().toBuffer();
const step = async (nome, fn) => { const t0 = Date.now(); try { console.log('✅', nome, JSON.stringify(await fn()), `${Date.now() - t0} ms`); } catch (e) { console.log('❌', nome, e.message); } };

await step('video + desenho + som do video', async () => {
  const t = E.createToken({ jid: 'g@g.us', chatName: 'Eu', base: { buffer: fs.readFileSync(video), ext: 'mp4', kind: 'video' } });
  fs.writeFileSync(path.join(E.tokenDir(t), 'overlay.png'), ov);
  return E.makeSticker(sock, t, { tipo: 'video', inicio: 0.5, duracao: 3, som: 'video', escala: 0.8, largura: 480, altura: 480, x: 40, y: 20 });
});
await step('foto pronta + som de arquivo', async () => {
  const t = E.createToken({ jid: 'g@g.us' });
  fs.writeFileSync(path.join(E.tokenDir(t), 'final.png'), await sharp(foto).resize(512, 512).composite([{ input: ov }]).png().toBuffer());
  fs.copyFileSync(video, path.join(E.tokenDir(t), 'audio.mp4'));
  return E.makeSticker(sock, t, { tipo: 'image', som: 'arquivo', somInicio: 1, somDuracao: 2 });
});
await step('video enviado, sem posicao, sem som', async () => {
  const t = E.createToken({ jid: 'g@g.us' });
  fs.copyFileSync(video, path.join(E.tokenDir(t), 'video.mp4'));
  return E.makeSticker(sock, t, { tipo: 'video', duracao: 8, som: 'nenhum' });
});
await step('link vencido', async () => E.makeSticker(sock, 'x'.repeat(24), {}));
console.log('figurinhas enviadas (bytes):', sent);
fs.rmSync(process.env.EDITOR_DIR, { recursive: true, force: true });
process.exit(0);
