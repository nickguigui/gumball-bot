# Gumball Bot

Bot de WhatsApp para **grupos** e **canais**, grátis, que roda no seu próprio número pelo GitHub Actions (sem PC ligado).

- **300+ comandos**: figurinhas (fig, attp, ttp, brat em 7 cores, qc, emojimix, filtros), downloads (play, ytmp4, TikTok, Insta, X), letras em 5 fontes, economia (daily, trabalhar, minerar, pescar, banco com juros, loja, raspadinha, roleta, pix, roubar), jogos (anagrama, quiz, forca, velha, bandeira, matemática, adedonha, charada, duelo, baú), brincadeiras, casamentos, rankings, utilidades (lembretes em português, clima, cotações, CEP, filmes, notícias, tradutor, IA) e moderação completa (antilink, antifake, captcha, advertências, mute, boas-vindas, abrir e fechar no horário).
- **Canal automático** sobre qualquer assunto, com a mesma grade do canal da Laufey: CANAL ON/OFF, curiosidade, datas, música do dia com prévia, icon, figurinhas, isso ou aquilo, enquete, quiz e resposta, me core, jogo da noite (resposta escondida no "Ler mais"), notícias e vídeos. 40 s entre posts, sem repetir conteúdo.
- **Site** em `docs/` (GitHub Pages): lista de comandos, gerador de canal com prévia de cada post e guia de conexão.

## Como funciona

| Parte | Arquivo |
|---|---|
| Conexão (Baileys) e reconexão | `src/index.js` |
| Despachante: prefixo, silêncio em comando desconhecido, reação → resposta citada → reação final | `src/handler.js` |
| Fila de envio anti-ban (intervalo + jitter) | `src/queue.js` |
| Banco (node:sqlite) | `src/db.js` |
| Comandos por categoria | `src/commands/*.js` |
| Antis, AFK, captcha, autofigurinha | `src/middlewares.js` |
| Lembretes, agendas, abrir/fechar grupo, aniversários | `src/scheduler.js` |
| Canais (envio de mídia/enquete em canal sem o erro 479) | `src/channels.js`, `src/lib/canal.js` |
| Sessão criptografada para o Actions | `scripts/state.mjs`, `.github/workflows/bot.yml` |

## Rodar no PC

```bash
npm install
```
```bash
cp .env.example .env
```
```bash
npm start
```
Escaneie o QR (ou defina `PAIR_NUMBER` para receber um código). Teste offline, sem WhatsApp: `npm run check`.

## Rodar no GitHub Actions (grátis, 24/7)

Veja a aba **Conectar** do site. Resumo: fork público → secrets `STATE_KEY` (gere com `node scripts/state.mjs newkey`), `PAIR_NUMBER`, `OWNER_NUMBERS` → Actions › Gumball Bot › Run workflow com `pair = sim` → digite o código no celular.

Nada sensível vai para o repositório: a sessão e o banco ficam em `state/state.enc`, criptografados com AES-256-GCM. Chaves e números ficam nos Secrets.

> ⚠️ O WhatsApp não tem API oficial para isso. O bot usa o Baileys, que funciona como um WhatsApp Web. Há risco de ban; para zerar o risco, use um chip secundário.

Apoie o projeto: https://livepix.gg/nickguigui
