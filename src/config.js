// Configuracao lida do .env (veja .env.example).
const env = process.env;
const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

export const config = {
  botName: env.BOT_NAME || 'GUMBALL',
  ownerName: env.OWNER_NAME || 'Dono',
  // numeros do dono, so digitos, separados por virgula (ex.: 5561999999999)
  owners: (env.OWNER_NUMBERS || '').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),
  prefix: env.PREFIX || '/',
  timezone: env.TIMEZONE || 'America/Sao_Paulo',
  dataDir: env.DATA_DIR || './data',
  authDir: env.AUTH_DIR || './auth',
  // pareamento por codigo (sem QR): numero do bot so com digitos
  pairNumber: (env.PAIR_NUMBER || '').replace(/\D/g, ''),
  // Fila de envio anti-ban: intervalo minimo + jitter aleatorio entre envios
  sendMinMs: int(env.SEND_MIN_MS, 2500),
  sendJitterMs: int(env.SEND_JITTER_MS, 4000),
  // Responder tambem a comandos enviados pelo proprio numero do bot
  allowSelf: env.ALLOW_SELF === 'true',
  // So funcionar em grupos (como o Zenitsu)
  groupsOnly: env.GROUPS_ONLY !== 'false',
  // Licenca exibida no menu (dias a partir de LICENSE_START, ou vazio = vitalicia)
  licenseUntil: env.LICENSE_UNTIL || '',
  // Integracoes
  tmdbKey: env.TMDB_API_KEY || '',
  spicyKey: env.SPICY_LYRICS_KEY || '',
  spicyOrigin: env.SPICY_LYRICS_ORIGIN || '',
  openaiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBase: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  gptPersona: env.GPT_PERSONA || '',
  ytdlp: env.YTDLP_PATH || 'yt-dlp',
  ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
  maxDownloadMB: int(env.MAX_DOWNLOAD_MB, 60),
  // Comandos desligados (aparecem riscados no menu como "[Bloqueado]")
  blocked: (env.BLOCKED_COMMANDS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
};
