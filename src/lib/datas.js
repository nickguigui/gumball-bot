// Datas de promocao (Black Friday, datas duplas, comemorativas) e a linha de contagem dos posts:
// "FALTAM 2 DIAS PARA A BLACK FRIDAY!", "AMANHA JA E 11.11!", "HOJE E BLACK FRIDAY!".
import { config } from '../config.js';

const dia = (a, m, d) => new Date(Date.UTC(a, m - 1, d));
const nthDow = (a, m, dow, n) => { const d = dia(a, m, 1); const off = (dow - d.getUTCDay() + 7) % 7; return dia(a, m, 1 + off + (n - 1) * 7); };
const ultimaSexta = (a, m) => { const d = dia(a, m + 1, 0); return dia(a, m, d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7)); };

// janela = quantos dias antes comeca a contagem nos posts
export function eventos(ano) {
  const bf = ultimaSexta(ano, 11);
  const lista = [
    { nome: 'BLACK FRIDAY', data: bf, janela: 7, vespera: 'o esquenta da Black Friday' },
    { nome: 'CYBER MONDAY', data: new Date(bf.getTime() + 3 * 864e5), janela: 1 },
    { nome: 'DIA DO CONSUMIDOR', data: dia(ano, 3, 15), janela: 3, vespera: 'o Dia do Consumidor' },
    { nome: 'DIA DAS MÃES', data: nthDow(ano, 5, 0, 2), janela: 5 },
    { nome: 'DIA DOS PAIS', data: nthDow(ano, 8, 0, 2), janela: 5 },
    { nome: 'DIA DAS CRIANÇAS', data: dia(ano, 10, 12), janela: 5 },
    { nome: 'NATAL', data: dia(ano, 12, 25), janela: 7 },
  ];
  // datas duplas: 1.1, 2.2 ... 12.12 (as grandes lojas fazem promocao)
  for (let m = 1; m <= 12; m++) lista.push({ nome: `${m}.${m}`, data: dia(ano, m, m), janela: m >= 9 ? 3 : 2, dupla: true, vespera: `a promoção do ${m}.${m}` });
  return lista;
}
function hojeLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { data: dia(+p.year, +p.month, +p.day), hora: +p.hour, ano: +p.year };
}
// evento mais proximo dentro da janela (hoje ou nos proximos dias)
export function proximoEvento() {
  const h = hojeLocal(); let melhor = null;
  for (const e of [...eventos(h.ano), ...eventos(h.ano + 1)]) {
    const dias = Math.round((e.data - h.data) / 864e5);
    if (dias < 0 || dias > e.janela) continue;
    if (!melhor || dias < melhor.dias || (dias === melhor.dias && e.janela > melhor.janela)) melhor = { ...e, dias };
  }
  return melhor;
}
// linha do rodape: "> 🚨 _FALTAM 2 DIAS PARA A BLACK FRIDAY! Ative as notificações e fica ligado._"
export function linhaData() {
  const e = proximoEvento(); if (!e) return '';
  const art = e.dupla ? 'O' : /^(DIA|NATAL|CYBER)/.test(e.nome) ? (e.nome.startsWith('DIA') || e.nome === 'NATAL' ? 'O' : 'A') : 'A';
  const t = e.dias === 0 ? `HOJE É ${e.nome}!` : e.dias === 1 ? `AMANHÃ JÁ É ${e.nome}!` : `FALTAM ${e.dias} DIAS PARA ${art} ${e.nome}!`;
  return `> 🚨 _${t} Ativa as notificações e fica ligado!_`;
}
// post da vespera (as 21h do dia anterior): "A meia-noite ja comeca o esquenta da Black Friday!"
export function postVespera() {
  const e = proximoEvento(); if (!e || e.dias !== 1 || !e.vespera) return null;
  return { id: `vespera:${e.nome}:${e.data.toISOString().slice(0, 10)}`, texto: `🚨 *À meia-noite já começa ${e.vespera}!*\n\nOs primeiros cupons devem sair à meia-noite, e amanhã o ritmo de cupons e ofertas vai ser frenético! Já ativa as notificações, fixa o nosso canal e fica ligado pra não perder nada! 🔥` };
}
