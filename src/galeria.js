// Galeria de pacotes de figurinhas (estilo sticker.ly), guardada no ramo "galeria" do repositorio.
// O site le galeria/index.json e os arquivos pelo raw.githubusercontent. Quem conecta o bot publica
// pelo WhatsApp; o dono da plataforma (DONO_PLATAFORMA) apaga qualquer pacote; denuncias escondem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const WT = process.env.GALERIA_DIR || path.join(os.tmpdir(), 'gumball-galeria');
const BRANCH = 'galeria';
const DONO = (process.env.DONO_PLATAFORMA || '').replace(/\D/g, '');
const MAX_POR_NUMERO = 20;
let chain = Promise.resolve(); // uma operacao de git por vez
const serial = fn => (chain = chain.then(fn, fn));
const git = (args, cwd = WT) => run('git', args, { cwd, maxBuffer: 16 << 20, timeout: 120000 });

let pronto = null;
async function prepare() {
  if (pronto) return pronto;
  pronto = (async () => {
    if (fs.existsSync(path.join(WT, '.git'))) { await git(['pull', '-q', '--rebase', 'origin', BRANCH]).catch(() => {}); return; }
    fs.rmSync(WT, { recursive: true, force: true });
    const has = await git(['ls-remote', '--exit-code', '--heads', 'origin', BRANCH], process.cwd()).then(() => true, () => false);
    if (has) { await git(['fetch', '-q', 'origin', BRANCH], process.cwd()); await git(['worktree', 'add', '-f', '-B', BRANCH, WT, 'FETCH_HEAD'], process.cwd()); }
    else {
      await git(['worktree', 'add', '-f', '--detach', WT], process.cwd());
      await git(['checkout', '-q', '--orphan', BRANCH]); await git(['rm', '-rfq', '.']).catch(() => {});
      fs.mkdirSync(path.join(WT, 'p'), { recursive: true });
      fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify({ atualizado: Date.now(), pacotes: [] }));
      fs.writeFileSync(path.join(WT, 'README.md'), '# Galeria do Gumball Bot\n\nPacotes de figurinhas publicados pelo bot. Veja em https://nickguigui.github.io/gumball-bot/#figurinhas\n');
      await git(['add', '-A']); await git(['commit', '-qm', 'galeria: inicio']); await git(['push', '-q', '-u', 'origin', BRANCH]);
    }
  })().catch(e => { pronto = null; throw e; });
  return pronto;
}
const readIndex = () => { try { return JSON.parse(fs.readFileSync(path.join(WT, 'index.json'), 'utf8')); } catch { return { pacotes: [] }; } };
async function commit(msg) {
  const idx = readIndex(); idx.atualizado = Date.now(); fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify(idx));
  await git(['add', '-A']);
  await git(['commit', '-qm', msg]).catch(() => {});
  for (let i = 0; i < 4; i++) {
    try { await git(['push', '-q', 'origin', BRANCH]); return; } catch { await git(['pull', '-q', '--rebase', 'origin', BRANCH]).catch(() => {}); }
  }
  throw new Error('Não consegui salvar na galeria agora. Tente de novo em alguns minutos.');
}

// reg = registro do servidor (guarda quem publicou cada pacote, fora do repositorio publico)
export function galeria(reg, saveReg) {
  reg.galeria = reg.galeria || {}; reg.denuncias = reg.denuncias || {};
  return {
    // dir: pasta com pack.json ({nome, autor, figurinhas:[{f, som, emojis, animada}]}) + arquivos
    publicar: (phone, dir) => serial(async () => {
      await prepare();
      const meus = Object.values(reg.galeria).filter(g => g.phone === phone).length;
      if (meus >= MAX_POR_NUMERO && phone !== DONO) throw new Error(`Você já publicou ${MAX_POR_NUMERO} pacotes. Apague algum com /apagarpacote.`);
      const pk = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
      let id; do id = crypto.randomBytes(4).toString('base64url').replace(/[-_]/g, '').slice(0, 6).toLowerCase(); while (id.length < 6 || fs.existsSync(path.join(WT, 'p', id)));
      const dest = path.join(WT, 'p', id); fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(dir)) if (f !== 'pack.json' && /^[a-z0-9]+\.(webp|ogg|png)$/.test(f)) fs.copyFileSync(path.join(dir, f), path.join(dest, f));
      const pack = { id, nome: String(pk.nome).slice(0, 60), autor: String(pk.autor || '').slice(0, 60), criado: Date.now(), animado: !!pk.animado, figurinhas: pk.figurinhas, tray: 'tray.png' };
      fs.writeFileSync(path.join(dest, 'pack.json'), JSON.stringify(pack));
      const idx = readIndex();
      idx.pacotes.unshift({ id, nome: pack.nome, autor: pack.autor, criado: pack.criado, qtd: pack.figurinhas.length, animado: pack.animado, comSom: pack.figurinhas.filter(f => f.som).length, capa: pack.figurinhas[0]?.f });
      fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify(idx));
      await commit(`galeria: ${pack.nome}`);
      reg.galeria[id] = { phone, nome: pack.nome, criado: pack.criado }; saveReg();
      return { id, nome: pack.nome, qtd: pack.figurinhas.length };
    }),
    apagar: (phone, id) => serial(async () => {
      await prepare();
      const dono = reg.galeria[id]?.phone;
      if (!fs.existsSync(path.join(WT, 'p', id))) throw new Error('Não achei esse pacote.');
      if (dono !== phone && phone !== DONO) throw new Error('Só quem publicou (ou o dono do Gumball) pode apagar esse pacote.');
      fs.rmSync(path.join(WT, 'p', id), { recursive: true, force: true });
      const idx = readIndex(); idx.pacotes = idx.pacotes.filter(p => p.id !== id); fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify(idx));
      await commit(`galeria: apaga ${id}`);
      delete reg.galeria[id]; delete reg.denuncias[id]; saveReg();
      return { id };
    }),
    // pacote + caminhos locais dos arquivos (o bot manda as figurinhas no WhatsApp)
    ler: id => serial(async () => {
      await prepare(); await git(['pull', '-q', '--rebase', 'origin', BRANCH]).catch(() => {});
      const dir = path.join(WT, 'p', String(id).toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (!fs.existsSync(path.join(dir, 'pack.json'))) throw new Error('Não achei esse pacote. Confira o código na galeria do site.');
      return { pack: JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8')), dir };
    }),
    meus: phone => Object.entries(reg.galeria).filter(([, g]) => g.phone === phone).map(([id, g]) => ({ id, nome: g.nome, criado: g.criado })),
    // denuncia: 3 pessoas diferentes escondem o pacote ate o dono da plataforma olhar
    denunciar: (id, quem, motivo) => serial(async () => {
      await prepare();
      if (!fs.existsSync(path.join(WT, 'p', id))) throw new Error('Não achei esse pacote.');
      const d = (reg.denuncias[id] = reg.denuncias[id] || { quem: [], motivos: [] });
      const h = crypto.createHash('sha256').update(quem).digest('hex').slice(0, 16);
      if (d.quem.includes(h)) return { ja: true, total: d.quem.length };
      d.quem.push(h); d.motivos.push(String(motivo || '').slice(0, 200)); saveReg();
      let oculto = false;
      if (d.quem.length >= 3) {
        const idx = readIndex(); const e = idx.pacotes.find(p => p.id === id);
        if (e && !e.oculto) { e.oculto = true; fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify(idx)); await commit(`galeria: esconde ${id} (denúncias)`); oculto = true; }
      }
      return { total: d.quem.length, oculto, nome: reg.galeria[id]?.nome || id };
    }),
    reexibir: (phone, id) => serial(async () => {
      if (phone !== DONO) throw new Error('Só o dono do Gumball pode fazer isso.');
      await prepare(); const idx = readIndex(); const e = idx.pacotes.find(p => p.id === id); if (!e) throw new Error('Não achei esse pacote.');
      delete e.oculto; fs.writeFileSync(path.join(WT, 'index.json'), JSON.stringify(idx)); delete reg.denuncias[id]; saveReg();
      await commit(`galeria: mostra ${id}`); return { id };
    }),
    DONO,
  };
}
