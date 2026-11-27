// Layout dos menus (mesma estrutura do menu do Zenitsu).
import { config } from './config.js';
import { registry } from './registry.js';
import { boldSans, boldItalicSans, duration, greeting, numId } from './lib/text.js';
import { db } from './db.js';

const LINE = '────────────────────────';
export const MENU = [
  ['𝗠𝗘𝗡𝗨 𝗣𝗥𝗜𝗡𝗖𝗜𝗣𝗔𝗟', [
    ['🤝 SUPORTE DO BOT', 'topcmd alugar teste suporte conectar bots'],
    ['🎨 FIGURINHAS & STICKERS', 'fig s editarfig qc attp ttp textofig emojimix toimg togif take rename wasted procurado preso rip smeme brat brat2 bratanimado bratbranco bratrosa bratpreto bratvinho bratazul redonda pacote addpacote limparpacote'],
    ['🛒 PROMOÇÕES', 'promocoes promo afiliado afiliados comoafiliar criarcanal'],
    ['🖼️ EDIÇÃO DE FOTOS', 'grid logo sfundo placa mudarfundo desfoque pixel inverter cinza sepia espelho triste brilho contraste'],
    ['⬇️ DOWNLOADS', 'tkk ytmp3 play play2 ytmp4 playvideo ytsearch baixar insta face pin lyrics'],
    ['🎥 VÍDEO', 'videoreverso videolento videorapido cortarvideo letreiro'],
    ['🎵 ÁUDIO', 'tomp3 voz falar transcrever estourar grave reverb audioreverso audiorapido audiolento cortaraudio'],
    ['🧰 UTILITÁRIOS', 'gpt ping admins linkgp listablock infogp dolarhoje moedas converter celular afk futebol dados qr calcular signo filme cpf traduzir resumir clima ff lembrete lembretes noticias ver permitirver bloquearver cinema palavras cep ddd feriados wiki encurtar fazernick tagme wame notas anotar rmnota niver aniversarios lista vou naovou fecharlista'],
  ]],
  ['𝗝𝗢𝗚𝗢𝗦 𝗘 𝗗𝗜𝗩𝗘𝗥𝗦𝗔𝗢', [
    ['💰 ECONOMIA', 'loja comprar inventario banco depositar retirar vender raspadinha perfil daily apostar trabalhar pix roubar resetarsaldo minerar pescar roleta'],
    ['🤡 BRINCADEIRAS', 'gado foto piada tapa ship chance casal sorteio pergunta moeda cantada conselho fato frase escolher numero eununca vod verdade desafio medidores interacoes level matar calvo burro corno magia maldicao bencao transformar hipnotizar congelar queimar eletrocutar envenenar ressuscitar teletransportar hackear clonar miniaturizar gigantizar assombrar possuir sequestrar forca inteligencia beleza charme aura fofura loucura preguica raiva azar bebida roupa serie anime time pais profissao crime virtude'],
    ['🎮 JOGOS', 'duelo ppt bau anagrama quiz jogodaforca velha bandeira matematica adedonha charada parar rankjogos'],
    ['💍 MATRIMÔNIOS', 'casar trair divorciar beijar abracar brigar flores joia ursinho chocolate casais amigosecreto participar sairamigo meuamigo'],
    ['🌐 RANKINGS GLOBAIS', 'topxp toplevel topmsg topladrao toprico topbanco topcasal topsortudo'],
    ['🏰 RANKINGS LOCAIS', 'rank rankxp ranklevel rankmsg rankafk rankfeio rankcasal rankcalvo rankburro rankcorno rankladrao rankbanco ranksortudo'],
  ]],
];
export const MENU_ADM = [
  ['🎛️ PAINEL', 'painel config vermodo'],
  ['⚙️ GESTÃO DE GRUPO', 'ban del fotogp promoveradm removeradm fechargp limpar abrirgp totag msgbv msgbv2 msgsaiu msgsaiu2 sorteio revogarlink agendafc agendaab mutar desmutar mutados nomegp descgp soadm ativos fantasma inativos banghost adv rmadv zeraradv advs maxadv prefixo aprovar recusar solicitacoes blacklist listabranca membros bot botprincipal bloqcmd desbloqcmd tempocmd modobrincadeira regras setregras agendar agendas rmagenda addresposta rmresposta respostas grupoinfo enquete setautor'],
  ['🛡️ SEGURANÇA & ANTIS', 'antilink permlink antifake permddi antipalavra addpalavra rmpalavra antiflood antispam anti antifoto antiaudio antivideo antisticker antidocumento antiloc anticontato antiapagar antieditar captcha autosticker'],
];

function line(name) {
  if (!registry.has(name)) return null;
  if (config.blocked.includes(name)) return `› ~/${name}~ _[Bloqueado]_ 🚫`;
  return `› /${name}`;
}
export function validity() {
  if (!config.licenseUntil) return 'Vitalícia ♾️';
  const left = new Date(config.licenseUntil).getTime() - Date.now();
  return left > 0 ? duration(left).replace(/ \d+s$/, '') : 'Expirada ❌';
}
export function header(ctx, pingMs) {
  const started = db.get('startedAt', Date.now());
  return [
    `⚡ *${boldSans(config.botName.toUpperCase())} ${boldSans('MENU')}* ⚡`, LINE,
    `Olá, *${ctx.pushName || 'Usuário'}* (${ctx.tag(ctx.sender)})! ${greeting(config.timezone)}`, '',
    `• 👑 *Dono:* ${config.ownerName}`,
    `• 🚀 *Uptime:* ${duration(Date.now() - started)}`,
    `• 📶 *Ping:* ${pingMs}ms`,
    `• 💎 *Licença:* Ativa ✅`,
    `• ⏳ *Validade:* ${validity()}`,
    `• 🔧 *Prefixo:* [ ${config.prefix} ]`, LINE,
  ].join('\n');
}
export function buildMenu(ctx, pingMs, only) {
  const out = [header(ctx, pingMs), ''];
  MENU.forEach(([title, cats], i) => {
    const blocks = cats.filter(([c]) => !only || c.toLowerCase().includes(only)).map(([cat, names]) => {
      const lines = names.split(' ').map(line).filter(Boolean);
      return lines.length ? `❖ *${cat}*\n${lines.join('\n')}` : null;
    }).filter(Boolean);
    if (!blocks.length) return;
    out.push(`❖ *${boldSans(config.botName.toUpperCase())} ${title}*`, '', blocks.join('\n\n'), '', LINE, '');
  });
  out.push(`💡 *Menu de Administração:* Digite *${config.prefix}menuadm*`);
  out.push(`✦ ${boldSans(config.botName.toUpperCase())} ${boldItalicSans('BOT')} © ✨`);
  return out.join('\n');
}
export function buildMenuAdm(ctx) {
  const name = boldSans(config.botName.toUpperCase());
  const out = [
    `⚡ *${name} ${boldItalicSans('ADMIN PANEL')}* ⚡`, LINE,
    `Olá, ${ctx.tag(ctx.sender)}! ${greeting(config.timezone)}`,
    `• 💎 *Licença:* Ativa ✅`, `• ⏳ *Validade:* ${validity()}`, '',
  ];
  for (const [cat, names] of MENU_ADM) {
    const lines = names.split(' ').map(line).filter(Boolean);
    out.push(`❖ *${cat}*`, ...lines, '');
  }
  out.push(LINE, `_Voltar ao Menu Completo: *${config.prefix}menu*_`, `✦ ${name} ${boldItalicSans('BOT')} © ✨`);
  return out.join('\n');
}
export const pingOf = ctx => Math.max(1, Date.now() - Number(ctx.m.messageTimestamp || 0) * 1000);
export { numId };
