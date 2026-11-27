// GUMBALL SERVIDOR: hospeda o bot de varias pessoas, cada numero num processo isolado,
// e expoe a API que o site usa (conectar por codigo, entrar no painel, configuracoes).
// Uso: node src/manager.js   (PORT, ALLOWED_ORIGINS, DATA_ROOT no .env)
import http from 'node:http';
import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { galeria } from './galeria.js';

const ROOT = path.resolve(process.env.DATA_ROOT || './data/tenants');
const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nickguigui.github.io,http://localhost:8790,http://127.0.0.1:8790').split(',').map(s => s.trim());
const MAX_TENANTS = Number(process.env.MAX_TENANTS || 200);
const BOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js');
fs.mkdirSync(ROOT, { recursive: true });

// ---------- estado ----------
const REG = path.join(ROOT, '..', 'registry.json');
const reg = fs.existsSync(REG) ? JSON.parse(fs.readFileSync(REG, 'utf8')) : { tenants: {}, sessions: {} };
const saveReg = () => fs.writeFileSync(REG, JSON.stringify(reg, null, 1));
const G = galeria(reg, saveReg);
const procs = new Map();   // phone -> { child, state, code, codeAt, waiters:[] }
const logins = new Map();  // phone -> { code, until, tries }
const tickets = new Map(); // ticket -> { phone, until }
const hits = new Map();    // chave de rate limit -> [timestamps]
const dead = new Map();    // phone -> ultimo log de um processo que saiu
const dir = phone => path.join(ROOT, phone);

function limited(key, max, windowMs) {
  const now = Date.now(); const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { hits.set(key, list); return true; }
  list.push(now); hits.set(key, list); return false;
}
function normPhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 10 || p.length === 11) p = '55' + p; // so DDD + numero: Brasil
  return p.length >= 12 && p.length <= 15 ? p : null;
}
const mask = p => `+${p.slice(0, 2)} ${p.slice(2, 4)} •••••-${p.slice(-4)}`;
const isRegistered = phone => { try { return JSON.parse(fs.readFileSync(path.join(dir(phone), 'auth', 'creds.json'), 'utf8')).registered === true; } catch { return false; } };

// ---------- processos ----------
function start(phone, { pairing = false } = {}) {
  const existing = procs.get(phone);
  if (existing?.child && existing.child.exitCode === null) return existing;
  const d = dir(phone); fs.mkdirSync(d, { recursive: true });
  const settingsFile = path.join(d, 'settings.json');
  if (!fs.existsSync(settingsFile)) fs.writeFileSync(settingsFile, JSON.stringify({ privateChats: true }, null, 1));
  const env = {
    ...process.env, MANAGED: '1',
    AUTH_DIR: path.join(d, 'auth'), DATA_DIR: path.join(d, 'data'), SETTINGS_FILE: settingsFile, CHANNELS_FILE: path.join(d, 'channels.json'),
    OWNER_NUMBERS: phone, OWNER_NAME: '', OWNER_ONLY: 'true', ALLOW_SELF: 'true', DEFAULT_BOT_ON: 'true',
    PAIR_NUMBER: pairing ? phone : '', PORT: '', CI: '', EDITOR_DIR,
  };
  const child = fork(BOT, [], { env, cwd: path.dirname(path.dirname(BOT)), execArgv: ['--no-warnings=ExperimentalWarning'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.on('data', b => { const s = b.toString().trim(); if (s) { p.log?.push(`${new Date().toISOString().slice(11, 19)} ${s.slice(0, 300)}`); if (p.log?.length > 200) p.log.shift(); } });
  const p = { child, state: pairing ? 'pairing' : 'starting', code: null, codeAt: 0, waiters: [], startedAt: Date.now() };
  procs.set(phone, p);
  p.log = [];
  child.stderr.on('data', b => {
    const s = b.toString().trim(); if (!s || /ExperimentalWarning/.test(s)) return;
    console.warn(`[${mask(phone)}] ${s.slice(0, 300)}`);
    p.log.push(`${new Date().toISOString().slice(11, 19)} ${s.slice(0, 500)}`); if (p.log.length > 200) p.log.shift();
  });
  // log persistente (vai junto no estado criptografado), sem conteudo de mensagem
  const logFile = path.join(ROOT, phone, 'diag.log');
  try { const old = fs.readFileSync(logFile, 'utf8').split('\n'); if (old.length > 600) fs.writeFileSync(logFile, old.slice(-300).join('\n')); } catch {}
  const _push = p.log.push.bind(p.log);
  p.log.push = (...l) => { try { fs.appendFileSync(logFile, l.join('\n') + '\n'); } catch {} return _push(...l); };
  child.on('message', msg => {
    p.log?.push(`${new Date().toISOString().slice(11, 19)} [ipc] ${msg.type}${msg.error ? ': ' + msg.error : ''}`);
    if (msg.type === 'pair') { p.state = 'pairing'; p.code = msg.code; p.codeAt = Date.now(); }
    if (msg.type === 'pair-error') { p.state = 'error'; p.error = msg.error; }
    if (msg.type === 'connected') {
      p.state = 'connected'; p.code = null;
      reg.tenants[phone] = { ...(reg.tenants[phone] || { createdAt: Date.now() }), name: msg.name, connectedAt: Date.now() }; saveReg();
    }
    if (msg.type === 'reconnecting' && p.state === 'connected') p.state = 'reconnecting';
    if (msg.type === 'logged-out') p.state = 'logged-out';
    // pedidos do bot para o servidor (galeria): responde com manager-reply
    if (msg.type === 'manager') {
      const ops = { 'galeria-publicar': () => G.publicar(phone, msg.dir), 'galeria-ler': () => G.ler(String(msg.idPacote || '')), 'galeria-meus': async () => G.meus(phone), 'galeria-apagar': () => G.apagar(phone, String(msg.idPacote || '')), 'galeria-reexibir': () => G.reexibir(phone, String(msg.idPacote || '')) };
      const fn = ops[msg.op];
      Promise.resolve(fn ? fn() : Promise.reject(new Error('Pedido desconhecido.')))
        .then(data => p.child.send({ type: 'manager-reply', id: msg.id, data }), e => p.child.send({ type: 'manager-reply', id: msg.id, erro: e.message || 'Deu erro no servidor.' }));
    }
    for (const w of p.waiters.splice(0)) w(msg);
  });
  child.on('exit', code => {
    p.log.push(`${new Date().toISOString().slice(11, 19)} [saiu] código ${code}`);
    dead.set(phone, { at: Date.now(), code, log: p.log.slice(-40) }); // para o diagnostico
    const wasConnected = isRegistered(phone);
    if (procs.get(phone) === p) procs.delete(phone);
    if (code === 4) { // desconectado no celular ou pelo painel: apaga tudo desse numero
      delete reg.tenants[phone]; for (const [t, s] of Object.entries(reg.sessions)) if (s.phone === phone) delete reg.sessions[t]; saveReg();
      fs.rmSync(dir(phone), { recursive: true, force: true });
    } else if (code === 3 && !wasConnected) { // pareamento expirou sem conectar
      fs.rmSync(dir(phone), { recursive: true, force: true });
    } else if (wasConnected && code !== 0) { // caiu: religa
      setTimeout(() => start(phone), 5000);
    }
  });
  return p;
}
// Pergunta algo ao processo do numero e espera a resposta (por id)
function ask(p, msg, ms = 15000) {
  const id = crypto.randomBytes(6).toString('hex');
  return new Promise(res => {
    const t = setTimeout(() => res(null), ms);
    p.waiters.push(function w(m) { if (m.type === 'reply' && m.id === id) { clearTimeout(t); res(m.data); } else p.waiters.push(w); });
    p.child.send({ ...msg, id });
  });
}
const waitFor = (p, types, ms) => new Promise(res => {
  if (types.includes(p.state === 'pairing' && p.code ? 'pair' : p.state)) return res({ type: p.state === 'pairing' ? 'pair' : p.state });
  const t = setTimeout(() => res({ type: 'timeout' }), ms);
  p.waiters.push(function w(msg) { if (types.includes(msg.type)) { clearTimeout(t); res(msg); } else p.waiters.push(w); });
});

// ---------- HTTP ----------
function send(res, status, body, origin) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}), 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req, max = 20000) {
  let s = ''; for await (const c of req) { s += c; if (s.length > max) throw new Error('grande demais'); }
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}
function auth(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  const s = t && reg.sessions[crypto.createHash('sha256').update(t).digest('hex')];
  return s && s.until > Date.now() ? s.phone : null;
}
// Editor de figurinhas: pastas temporarias criadas pelo bot (/editarfig), fora dos dados salvos
const EDITOR_DIR = process.env.EDITOR_DIR || path.join(os.tmpdir(), 'gumball-editor');
const figDir = t => (/^[A-Za-z0-9_-]{20,40}$/.test(t || '') ? path.join(EDITOR_DIR, t) : null);
function figMeta(url) {
  const d = figDir(url.searchParams.get('t')); if (!d) return null;
  try { const m = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); return m.exp > Date.now() && m.phone ? m : null; } catch { return null; }
}
// Corpo binario direto para arquivo, com limite de tamanho
function rawToFile(req, file, max) {
  return new Promise(res => {
    let n = 0; const out = fs.createWriteStream(file); let done = false;
    const fail = () => { if (done) return; done = true; out.destroy(); fs.rmSync(file, { force: true }); req.resume(); res(false); };
    req.on('data', c => { n += c.length; if (n > max) return fail(); out.write(c); });
    req.on('end', () => { if (done) return; done = true; out.end(() => res(n > 0)); });
    req.on('error', fail);
  });
}
async function promoAsk(req, msg, ms = 30_000) {
  const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
  const p = procs.get(phone); if (p?.state !== 'connected') return [409, { erro: 'O bot está ligando. Tente em alguns segundos.' }];
  const r = await ask(p, msg, ms); if (!r) return [504, { erro: 'O bot não respondeu. Tente de novo.' }];
  return r.erro ? [400, r] : [200, r];
}
const ip = req =>(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

const routes = {
  // Diagnostico (so com a chave ADMIN_KEY do servidor): estado e log de um numero
  'GET /api/diag': async (req, url) => {
    const k = url.searchParams.get('k') || '';
    if (!process.env.ADMIN_KEY || k.length !== process.env.ADMIN_KEY.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(process.env.ADMIN_KEY))) return [404, { erro: 'Não encontrado' }];
    const phone = normPhone(url.searchParams.get('tel')); const p = phone && procs.get(phone);
    return [200, { procs: [...procs.entries()].map(([ph, x]) => ({ num: mask(ph), state: x.state, code: !!x.code, since: x.startedAt })), alvo: p ? { state: p.state, error: p.error, log: p.log } : null, morto: phone ? dead.get(phone) || null : null, historico: phone ? (() => { try { return fs.readFileSync(path.join(ROOT, phone, 'diag.log'), 'utf8').trim().split('\n').slice(-Number(url.searchParams.get('n') || 120)); } catch { return []; } })() : [], editor: (() => { try { return { dir: EDITOR_DIR, links: fs.readdirSync(EDITOR_DIR).map(t => { try { const m = JSON.parse(fs.readFileSync(path.join(EDITOR_DIR, t, 'meta.json'), 'utf8')); return `${t.slice(0, 4)}… ${m.phone ? 'ok' : 'sem número'} ${Math.round((m.exp - Date.now()) / 60000)} min`; } catch (e) { return `${t.slice(0, 4)}… ${e.code || e.message}`; } }) }; } catch (e) { return { dir: EDITOR_DIR, erro: e.code }; } })(), instalacao: (() => { try { return fs.readFileSync('instalar.log', 'utf8').trim().split(String.fromCharCode(10)).slice(-5); } catch { return null; } })() }];
  },
  'GET /api/saude': async () => [200, { ok: true, numeros: Object.keys(reg.tenants).length, online: [...procs.values()].filter(p => p.state === 'connected').length, pareando: [...procs.values()].filter(p => p.state === 'pairing').length }],

  // 1) Entrar: numero nao conectado -> codigo de 8 letras; conectado -> codigo de entrada na conversa "Voce"
  'POST /api/entrar': async (req) => {
    const { telefone } = await body(req); const phone = normPhone(telefone);
    if (!phone) return [400, { erro: 'Número inválido. Use DDD + número, ou o código do país para números de fora.' }];
    if (limited('ip:' + ip(req), 12, 3600_000) || limited('tel:' + phone, 5, 3600_000)) return [429, { erro: 'Muitas tentativas. Espere uns minutos e tente de novo.' }];
    const ticket = crypto.randomBytes(16).toString('hex'); tickets.set(ticket, { phone, until: Date.now() + 15 * 60_000 });
    if (isRegistered(phone)) {
      const p = start(phone); if (p.state !== 'connected') await waitFor(p, ['connected'], 30_000);
      if (p.state !== 'connected') return [409, { erro: 'O bot desse número está reconectando. Tente em 1 minuto.' }];
      const code = String(crypto.randomInt(100000, 999999)); logins.set(phone, { code, until: Date.now() + 10 * 60_000, tries: 0 });
      p.child.send({ type: 'login-code', code });
      return [200, { passo: 'entrar', ticket, numero: mask(phone) }];
    }
    if (Object.keys(reg.tenants).length >= MAX_TENANTS) return [429, { erro: 'O servidor está lotado agora. Tente mais tarde.' }];
    const p = start(phone, { pairing: true });
    // responde rapido; o site pergunta em /api/pareamento ate o codigo ficar pronto
    if (!(p.code && Date.now() - p.codeAt < 90_000)) await waitFor(p, ['pair', 'pair-error'], 8_000);
    if (p.state === 'error') return [422, { erro: 'O WhatsApp recusou o pedido de código. Confira o número.' }];
    return [200, { passo: 'parear', ticket, codigo: p.code || null, numero: mask(phone) }];
  },

  // 2) Acompanhar o pareamento (o site pergunta a cada poucos segundos)
  'GET /api/pareamento': async (req, url) => {
    const t = tickets.get(url.searchParams.get('ticket')); if (!t || t.until < Date.now()) return [404, { erro: 'Sessão expirada. Comece de novo.' }];
    const p = procs.get(t.phone);
    if (isRegistered(t.phone) && p?.state === 'connected') {
      const token = crypto.randomBytes(32).toString('base64url');
      reg.sessions[crypto.createHash('sha256').update(token).digest('hex')] = { phone: t.phone, until: Date.now() + 30 * 864e5 }; saveReg(); tickets.delete(url.searchParams.get('ticket'));
      return [200, { estado: 'conectado', token }];
    }
    if (!p) return [200, { estado: 'expirado' }];
    return [200, { estado: p.state === 'error' ? 'erro' : 'aguardando', codigo: p.code }];
  },

  // 3) Login com o codigo recebido na conversa "Voce"
  'POST /api/login': async (req) => {
    const { ticket, codigo } = await body(req); const t = tickets.get(ticket);
    if (!t || t.until < Date.now()) return [404, { erro: 'Sessão expirada. Comece de novo.' }];
    const l = logins.get(t.phone);
    if (!l || l.until < Date.now()) return [410, { erro: 'O código expirou. Peça outro.' }];
    if (++l.tries > 5) { logins.delete(t.phone); return [429, { erro: 'Muitas tentativas. Peça outro código.' }]; }
    if (String(codigo).replace(/\D/g, '') !== l.code) return [401, { erro: 'Código errado. Confira a mensagem na sua conversa "Você".' }];
    logins.delete(t.phone); tickets.delete(ticket);
    const token = crypto.randomBytes(32).toString('base64url');
    reg.sessions[crypto.createHash('sha256').update(token).digest('hex')] = { phone: t.phone, until: Date.now() + 30 * 864e5 }; saveReg();
    return [200, { token }];
  },

  // 4) Painel
  'GET /api/painel': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const p = procs.get(phone); const d = dir(phone);
    const read = (f, def) => { try { return JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); } catch { return def; } };
    return [200, { numero: mask(phone), nome: reg.tenants[phone]?.name || '', estado: p?.state || 'offline', desde: reg.tenants[phone]?.createdAt, config: read('settings.json', {}), canais: read('channels.json', { channels: [] }).channels }];
  },
  'POST /api/config': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const b = await body(req); const f = path.join(dir(phone), 'settings.json');
    const cur = JSON.parse(fs.readFileSync(f, 'utf8')); if (typeof b.privateChats === 'boolean') cur.privateChats = b.privateChats;
    fs.writeFileSync(f, JSON.stringify(cur, null, 1)); procs.get(phone)?.child.send({ type: 'reload-settings' });
    return [200, { config: cur }];
  },
  // Grupos do numero, cada um com suas configuracoes (o bot responde por IPC)
  'GET /api/grupos': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const p = procs.get(phone); if (p?.state !== 'connected') return [409, { erro: 'O bot está ligando. Tente em alguns segundos.' }];
    const r = await ask(p, { type: 'groups' }); return r ? [200, { grupos: r }] : [404, { erro: 'O bot não respondeu. Tente de novo.' }];
  },
  'POST /api/grupo': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const { jid, bot, cfg } = await body(req);
    if (!/^[\d-]+@g\.us$/.test(jid || '')) return [400, { erro: 'Grupo inválido.' }];
    const p = procs.get(phone); if (p?.state !== 'connected') return [409, { erro: 'O bot está ligando. Tente em alguns segundos.' }];
    const r = await ask(p, { type: 'group-set', jid, patch: { bot, cfg } }); return r ? [200, r] : [404, { erro: 'O bot não respondeu. Tente de novo.' }];
  },
  'POST /api/canais': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const { canal, remover } = await body(req); const f = path.join(dir(phone), 'channels.json');
    const data = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { channels: [] };
    if (remover) data.channels = data.channels.filter(c => c.id !== remover);
    if (canal?.id && canal.topic) { if (data.channels.length >= 5 && !data.channels.some(c => c.id === canal.id)) return [400, { erro: 'Máximo de 5 canais por número.' }]; data.channels = [...data.channels.filter(c => c.id !== canal.id), canal]; }
    fs.writeFileSync(f, JSON.stringify(data, null, 1));
    return [200, { canais: data.channels }];
  },
  'POST /api/desconectar': async (req) => {
    const phone = auth(req); if (!phone) return [401, { erro: 'Entre de novo.' }];
    const p = procs.get(phone); if (p) p.child.send({ type: 'logout' }); else { fs.rmSync(dir(phone), { recursive: true, force: true }); delete reg.tenants[phone]; saveReg(); }
    return [200, { ok: true }];
  },
  // ---------- Editor de figurinhas (link do /editarfig; o token e a "senha" do link) ----------
  'GET /api/fig': async (req, url) => {
    const m = figMeta(url); if (!m) return [410, { erro: 'Esse link expirou ou o bot reiniciou. Mande /editarfig de novo no WhatsApp.' }];
    const p = procs.get(m.phone);
    return [200, { chat: m.chatName, expira: m.exp, base: m.base?.kind || null, pacote: m.pack, autor: m.author, feitas: m.made, online: p?.state === 'connected', figurinha: m.figurinha || null, arquivos: m.files || [], modo: m.modo || null, mudo: !!m.mudo, pacoteAberto: (() => { try { const d = JSON.parse(fs.readFileSync(path.join(path.dirname(EDITOR_DIR), 'gumball-rascunho', m.phone, 'rascunho.json'), 'utf8')); return d.exp > Date.now() ? { nome: d.nome, qtd: d.figs.length, animado: d.animado } : null; } catch { return null; } })() }];
  },
  'GET /api/fig/midia': async (req, url) => {
    const m = figMeta(url); if (!m) return [404, { erro: 'Sem mídia.' }];
    // ?arquivo=original.webp|som.ogg|som.mp3 (pecas da figurinha); sem nada = a midia base
    const nome = url.searchParams.get('arquivo');
    if (nome) {
      if (!(m.files || []).includes(nome)) return [404, { erro: 'Esse arquivo não existe.' }];
      const tipo = { webp: 'image/webp', ogg: 'audio/ogg', mp3: 'audio/mpeg' }[nome.split('.').pop()] || 'application/octet-stream';
      return [200, fs.readFileSync(path.join(figDir(url.searchParams.get('t')), nome)), tipo];
    }
    if (!m.base) return [404, { erro: 'Sem mídia.' }];
    const f = path.join(figDir(url.searchParams.get('t')), m.base.file);
    return [200, fs.readFileSync(f), m.base.kind === 'video' ? 'video/mp4' : 'image/' + (m.base.file.endsWith('png') ? 'png' : 'jpeg')];
  },
  'POST /api/fig/arquivo': async (req, url) => {
    const m = figMeta(url); if (!m) return [410, { erro: 'Esse link expirou. Mande /editarfig de novo.' }];
    const campo = url.searchParams.get('campo'); const ext = (url.searchParams.get('ext') || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const max = { video: 60, audio: 40, overlay: 4, final: 6 }[campo]; if (!max) return [400, { erro: 'Arquivo inválido.' }];
    if (limited('fig:' + url.searchParams.get('t'), 60, 30 * 60_000)) return [429, { erro: 'Envios demais por esse link. Mande /editarfig de novo.' }];
    const d = figDir(url.searchParams.get('t'));
    for (const f of fs.readdirSync(d)) if (f.startsWith(campo + '.')) fs.rmSync(path.join(d, f), { force: true });
    const ok = await rawToFile(req, path.join(d, `${campo}.${ext}`), max * 1024 * 1024);
    if (!ok) return [413, { erro: `Arquivo grande demais (máximo ${max} MB).` }];
    return [200, { ok: true }];
  },
  'POST /api/fig/criar': async (req, url) => {
    const m = figMeta(url); if (!m) return [410, { erro: 'Esse link expirou. Mande /editarfig de novo.' }];
    const p = procs.get(m.phone); if (p?.state !== 'connected') return [409, { erro: 'O bot está ligando. Tente de novo em alguns segundos.' }];
    if (limited('figc:' + url.searchParams.get('t'), 20, 30 * 60_000)) return [429, { erro: 'Figurinhas demais por esse link. Mande /editarfig de novo.' }];
    const r = await ask(p, { type: 'fig-make', token: url.searchParams.get('t'), opts: await body(req) }, 170_000);
    if (!r) return [504, { erro: 'Demorou demais para montar. Tente um trecho menor.' }];
    return r.erro ? [400, r] : [200, r];
  },
  // Robo de promocoes: o bot guarda e responde (as chaves secretas nunca voltam para o site)
  'GET /api/promos': async (req) => promoAsk(req, { type: 'promos-get' }),
  'POST /api/promos': async (req) => promoAsk(req, { type: 'promos-set', dados: await body(req) }),
  'POST /api/promos/link': async (req) => promoAsk(req, { type: 'promos-link', url: (await body(req)).url }),
  'POST /api/promos/testar': async (req) => promoAsk(req, { type: 'promos-testar' }, 60_000),
  'POST /api/promos/oferta': async (req) => { const b = await body(req, 1_500_000); /* pode vir com foto */ return promoAsk(req, { type: 'promos-oferta', url: b.url, extra: b.extra, agora: !!b.agora }, 60_000); },
  'POST /api/promos/limpar': async (req) => promoAsk(req, { type: 'promos-limpar' }),
  'POST /api/promos/criarcanal': async (req) => { const b = await body(req, 2_000_000); /* pode vir com foto */ return promoAsk(req, { type: 'promos-criarcanal', nome: b.nome, descricao: b.descricao, fotoB64: b.fotoB64, usarNoRobo: b.usarNoRobo }, 60_000); },
  // Galeria: denuncia de um pacote (3 pessoas diferentes escondem ate o dono da plataforma olhar)
  'POST /api/galeria/denunciar': async (req) => {
    if (limited('den:' + ip(req), 10, 3600_000)) return [429, { erro: 'Denúncias demais. Tente mais tarde.' }];
    const { id, motivo } = await body(req);
    if (!/^[a-z0-9]{6}$/.test(id || '')) return [400, { erro: 'Pacote inválido.' }];
    const r = await G.denunciar(id, ip(req), motivo);
    if (!r.ja && G.DONO) procs.get(G.DONO)?.child.send({ type: 'avisar-dono', text: `🚩 *Denúncia na galeria*\n\n📦 ${r.nome} (\`${id}\`)\n📝 ${String(motivo || 'sem motivo').slice(0, 200)}\n👥 ${r.total} denúncia(s)${r.oculto ? '\n\n🙈 Escondido da galeria até você decidir.' : ''}\n\n🗑️ */apagarpacote ${id}*${r.oculto ? `\n👁️ */mostrarpacote ${id}*` : ''}\n🔗 https://nickguigui.github.io/gumball-bot/#figurinhas/${id}` });
    return [200, { ok: true, oculto: !!r.oculto }];
  },
  'POST /api/sair': async (req) => {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/, ''); delete reg.sessions[crypto.createHash('sha256').update(t).digest('hex')]; saveReg();
    return [200, { ok: true }];
  },
};

http.createServer(async (req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) ? req.headers.origin : null;
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } : {}) }); return res.end(); }
  const url = new URL(req.url, 'http://x'); const h = routes[`${req.method} ${url.pathname}`];
  if (!h) return send(res, 404, { erro: 'Não encontrado' }, origin);
  try {
    const [s, b, type] = await h(req, url);
    if (Buffer.isBuffer(b)) { res.writeHead(s, { 'Content-Type': type || 'application/octet-stream', 'Content-Length': b.length, 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }); return res.end(b); }
    send(res, s, b, origin);
  } catch (e) { console.error(e); send(res, 500, { erro: 'Erro interno. Tente de novo.' }, origin); }
}).listen(PORT, () => {
  console.log(`🟢 Gumball servidor na porta ${PORT} (${Object.keys(reg.tenants).length} números)`);
  for (const phone of Object.keys(reg.tenants)) if (isRegistered(phone)) start(phone); // religa todo mundo
});
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { for (const p of procs.values()) p.child.kill('SIGTERM'); setTimeout(() => process.exit(0), 2000); });
