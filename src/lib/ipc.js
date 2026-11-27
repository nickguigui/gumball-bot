// Pedidos do bot (processo filho) para o servidor (manager) e a resposta, por id.
import crypto from 'node:crypto';

const pending = new Map();
if (process.send) {
  process.on('message', m => {
    if (m?.type !== 'manager-reply' || !pending.has(m.id)) return;
    const { res, rej, t } = pending.get(m.id); pending.delete(m.id); clearTimeout(t);
    m.erro ? rej(Object.assign(new Error(m.erro), { userMessage: m.erro })) : res(m.data);
  });
}
export function askManager(op, data = {}, ms = 120_000) {
  if (!process.send) return Promise.reject(Object.assign(new Error('Isso só funciona com o bot conectado pelo site.'), { userMessage: '🌐 Isso só funciona com o bot conectado pelo site.' }));
  const id = crypto.randomBytes(6).toString('hex');
  return new Promise((res, rej) => {
    const t = setTimeout(() => { pending.delete(id); rej(Object.assign(new Error('timeout'), { userMessage: '⏳ O servidor demorou para responder. Tente de novo.' })); }, ms);
    pending.set(id, { res, rej, t });
    process.send({ type: 'manager', id, op, ...data });
  });
}
