// Fila unica de envio (anti-ban): tudo que o bot manda passa por aqui,
// com intervalo minimo + jitter aleatorio entre envios. Ideia herdada do Gumball antigo.
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';

class SendQueue {
  constructor() { this.items = []; this.running = false; this.last = 0; this.maxPending = 80; }
  push(task) {
    if (this.items.length >= this.maxPending) return Promise.reject(new Error('Fila de envio cheia'));
    return new Promise((resolve, reject) => { this.items.push({ task, resolve, reject }); this.drain(); });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.items.length) {
        const job = this.items.shift();
        const gap = config.sendMinMs + Math.random() * config.sendJitterMs;
        const wait = this.last + gap - Date.now();
        if (wait > 0) await sleep(wait);
        try { job.resolve(await job.task()); } catch (e) { job.reject(e); }
        this.last = Date.now();
      }
    } finally { this.running = false; }
  }
}
export const queue = new SendQueue();

// Reacoes sao leves e nao entram na fila longa (o Zenitsu reage antes de responder)
export const reactNow = (sock, jid, key, emoji) => sock.sendMessage(jid, { react: { text: emoji, key } }).catch(() => {});
