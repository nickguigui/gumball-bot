// Banco persistente (node:sqlite, sem dependencias nativas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const sql = new DatabaseSync(path.join(config.dataDir, 'bot.db'));
sql.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(
  jid TEXT PRIMARY KEY, seq INTEGER, name TEXT, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS groups(
  jid TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS members(
  gjid TEXT, jid TEXT, data TEXT NOT NULL DEFAULT '{}', PRIMARY KEY(gjid, jid));
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
`);

const USER_DEFAULT = () => ({
  wallet: 0, bank: 0, xp: 0, msgs: 0, cmds: 0, jobs: 0, steals: 0, luck: 0,
  cooldowns: {}, inventory: {}, spouse: null, marriedAt: null, stats: {}, bankAt: Date.now(),
});
const GROUP_DEFAULT = () => ({
  // No numero pessoal o bot esta em TODOS os grupos: por padrao fica desligado ate /bot on
  vault: 50000, settings: {}, bot: process.env.DEFAULT_BOT_ON !== 'false', warns: {}, blacklist: [], game: null, event: null,
});
const MEMBER_DEFAULT = () => ({ msgs: 0, afk: null, lastSeen: 0, warns: 0, fun: {} });

function load(table, key, def, keyCols = ['jid']) {
  const where = keyCols.map(c => `${c}=?`).join(' AND ');
  const row = sql.prepare(`SELECT data FROM ${table} WHERE ${where}`).get(...key);
  return row ? { ...def(), ...JSON.parse(row.data) } : def();
}

export const db = {
  user(jid) {
    const u = load('users', [jid], USER_DEFAULT);
    u.jid = jid;
    const row = sql.prepare('SELECT seq, name FROM users WHERE jid=?').get(jid);
    if (row) { u.seq = row.seq; u.name = row.name; }
    return u;
  },
  saveUser(u) {
    const { jid, seq, name, ...data } = u;
    const exists = sql.prepare('SELECT seq FROM users WHERE jid=?').get(jid);
    if (exists) sql.prepare('UPDATE users SET data=?, name=? WHERE jid=?').run(JSON.stringify(data), name ?? null, jid);
    else {
      const next = (sql.prepare('SELECT MAX(seq) m FROM users').get().m || 0) + 1;
      sql.prepare('INSERT INTO users(jid, seq, name, data) VALUES(?,?,?,?)').run(jid, next, name ?? null, JSON.stringify(data));
      u.seq = next;
    }
    return u;
  },
  setName(jid, name) {
    if (!name) return;
    sql.prepare('UPDATE users SET name=? WHERE jid=?').run(name, jid);
  },
  group(jid) { const g = load('groups', [jid], GROUP_DEFAULT); g.jid = jid; return g; },
  saveGroup(g) {
    const { jid, ...data } = g;
    sql.prepare('INSERT INTO groups(jid,data) VALUES(?,?) ON CONFLICT(jid) DO UPDATE SET data=excluded.data').run(jid, JSON.stringify(data));
  },
  member(gjid, jid) { const m = load('members', [gjid, jid], MEMBER_DEFAULT, ['gjid', 'jid']); m.gjid = gjid; m.jid = jid; return m; },
  saveMember(m) {
    const { gjid, jid, ...data } = m;
    sql.prepare('INSERT INTO members(gjid,jid,data) VALUES(?,?,?) ON CONFLICT(gjid,jid) DO UPDATE SET data=excluded.data').run(gjid, jid, JSON.stringify(data));
  },
  members(gjid) {
    return sql.prepare('SELECT jid, data FROM members WHERE gjid=?').all(gjid).map(r => ({ jid: r.jid, gjid, ...MEMBER_DEFAULT(), ...JSON.parse(r.data) }));
  },
  allUsers() {
    return sql.prepare('SELECT jid, seq, name, data FROM users').all().map(r => ({ jid: r.jid, seq: r.seq, name: r.name, ...USER_DEFAULT(), ...JSON.parse(r.data) }));
  },
  get(k, d = null) { const r = sql.prepare('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : d; },
  set(k, v) { sql.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v)); },
  // Atualizacao atomica: fn recebe o usuario e o devolve salvo
  updateUser(jid, fn) { const u = db.user(jid); const r = fn(u); db.saveUser(u); return r ?? u; },
  updateGroup(jid, fn) { const g = db.group(jid); const r = fn(g); db.saveGroup(g); return r ?? g; },
  updateMember(gjid, jid, fn) { const m = db.member(gjid, jid); const r = fn(m); db.saveMember(m); return r ?? m; },
};

// Nivel: 0-149 xp = nivel 1, depois cada nivel pede +100
export const levelOf = xp => (xp < 150 ? 1 : 2 + Math.floor((xp - 150) / 100));
export const nextLevelXp = xp => { const l = levelOf(xp); return l === 1 ? 150 : 150 + (l - 1) * 100; };
export const PATENTES = [
  [1, '🌱', 'Iniciante', '📗'], [5, '⚔️', 'Aprendiz', '📘'], [10, '🛡️', 'Guerreiro', '📙'],
  [20, '🔥', 'Veterano', '📕'], [35, '💎', 'Elite', '📓'], [50, '👑', 'Lenda', '📒'],
];
export const patente = lvl => [...PATENTES].reverse().find(p => lvl >= p[0]);
