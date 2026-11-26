// fetch com timeout e erros amigaveis.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

export class UserError extends Error { constructor(msg) { super(msg); this.userMessage = msg; } }

export async function http(url, { timeout = 20000, headers = {}, ...opts } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...headers }, signal: ac.signal });
    return r;
  } finally { clearTimeout(t); }
}
// Erros de servico externo viram aviso amigavel (sem "HTTP 429 em ...")
const friendly = (status, url) => {
  const host = new URL(url).host.replace(/^(www|api|pt|en)\./, '');
  return new UserError(status === 429 ? `⏳ O serviço (${host}) está ocupado agora. Tente de novo em alguns segundos.` : `😕 O serviço (${host}) não respondeu agora. Tente de novo daqui a pouco.`);
};
export async function getJson(url, opts) {
  const r = await http(url, opts);
  if (!r.ok) throw friendly(r.status, url);
  return r.json();
}
export async function getText(url, opts) {
  const r = await http(url, opts);
  if (!r.ok) throw friendly(r.status, url);
  return r.text();
}
export async function getBuffer(url, opts) {
  const r = await http(url, opts);
  if (!r.ok) throw friendly(r.status, url);
  return Buffer.from(await r.arrayBuffer());
}
