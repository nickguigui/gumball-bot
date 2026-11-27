// Pacotes iniciais da galeria (conteudo original: textos estilo brat + sons sintetizados com ffmpeg).
// Uso: DONO_PLATAFORMA=5561... node scripts/seed-galeria.mjs   (publica no ramo "galeria" do repositorio)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { bratWebp } from '../src/commands/10-stickers.js';
import { galeria } from '../src/galeria.js';

const DONO = (process.env.DONO_PLATAFORMA || '').replace(/\D/g, '');
if (!DONO) { console.error('Defina DONO_PLATAFORMA'); process.exit(1); }
const ff = (args, out) => { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args, out]); return fs.readFileSync(out); };
const CORES = [['#8ACE00', '#000'], ['#ffffff', '#000'], ['#ff9ecf', '#000'], ['#000000', '#fff'], ['#6b1028', '#fff'], ['#3b82f6', '#000']];

async function pack(nome, itens, comSom) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-')); const figs = [];
  for (const [i, it] of itens.entries()) {
    const n = String(i + 1).padStart(2, '0');
    const [bg, fg] = CORES[i % CORES.length];
    let webp = await bratWebp(it.t, bg, fg);
    if (webp.length > 95_000) webp = await sharp(webp).webp({ quality: 80 }).toBuffer();
    fs.writeFileSync(path.join(dir, `${n}.webp`), webp);
    let som = null, seg = 0;
    if (comSom && it.som) {
      // som sintetizado: expressao do aevalsrc -> ogg/opus mono
      ff(['-f', 'lavfi', '-i', `aevalsrc='${it.som}':s=48000:d=${it.d}`, '-af', 'afade=t=out:st=' + Math.max(0, it.d - 0.15) + ':d=0.15,volume=0.8', '-ac', '1', '-c:a', 'libopus', '-b:a', '64k'], path.join(dir, `${n}.ogg`));
      som = `${n}.ogg`; seg = it.d;
    }
    figs.push({ f: `${n}.webp`, som, somSeg: seg, emojis: [it.e], animada: false });
  }
  await sharp(path.join(dir, '01.webp')).resize(96, 96).png().toFile(path.join(dir, 'tray.png'));
  fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify({ nome, autor: 'Gumball', animado: false, figurinhas: figs }));
  return dir;
}

const reacoes = [
  { t: 'kkkkkkk', e: '😂' }, { t: 'socorro', e: '😱' }, { t: 'aff', e: '🙄' }, { t: 'real', e: '💯' }, { t: 'tô chorando', e: '😭' }, { t: 'mds', e: '🤯' },
  { t: 'bom dia', e: '☀️' }, { t: 'boa noite', e: '🌙' }, { t: 'oxe', e: '🤨' }, { t: 'que isso', e: '😳' }, { t: 'tmj', e: '🤝' }, { t: 'fui', e: '👋' },
];
// sons: f(t) em segundos; tudo original (senos, varreduras e ruido)
const comSom = [
  { t: 'acertou', e: '✅', d: 0.9, som: '0.6*sin(2*PI*880*t)*exp(-4*t)+0.4*sin(2*PI*1320*t)*exp(-5*t)' },
  { t: 'errou', e: '❌', d: 1.6, som: '0.5*sin(2*PI*(if(lt(t,0.4),392,if(lt(t,0.8),370,if(lt(t,1.2),349,330))))*t)' },
  { t: 'boing', e: '🤸', d: 0.8, som: '0.7*sin(2*PI*(150+400*exp(-6*t))*t*(1+0.3*sin(2*PI*12*t)))*exp(-2*t)' },
  { t: 'plot twist', e: '😮', d: 1.8, som: '0.6*sin(2*PI*(if(lt(t,0.35),196,if(lt(t,0.7),185,165)))*t)*if(lt(mod(t,0.35),0.3),1,0)' },
  { t: 'socorro', e: '🚨', d: 1.6, som: '0.5*sin(2*PI*(700+250*sin(2*PI*2*t))*t)' },
  { t: 'tchan', e: '✨', d: 1.2, som: '0.3*(sin(2*PI*523*t)+sin(2*PI*659*t)+sin(2*PI*784*t))*exp(-2.5*t)' },
  { t: 'aff', e: '😮‍💨', d: 0.9, som: '0.4*(random(0)-0.5)*exp(-3*t)+0.4*sin(2*PI*110*t)*exp(-3*t)' },
  { t: 'ding dong', e: '🔔', d: 1.4, som: 'if(lt(t,0.6),0.6*sin(2*PI*659*t)*exp(-3*t),0.6*sin(2*PI*523*(t-0.6))*exp(-3*(t-0.6)))' },
];

const G = galeria({}, () => {});
for (const [nome, itens, som] of [['Reações brat', reacoes, false], ['Reações com som', comSom, true]]) {
  const dir = await pack(nome, itens, som);
  const r = await G.publicar(DONO, dir);
  console.log('publicado', r);
}
process.exit(0);
