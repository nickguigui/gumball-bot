// Brincadeiras: metricas (%), acoes (autor -> alvo), sorteios de itens e extras.
import { bar, rand, pick, dateBR } from '../lib/text.js';
import { db } from '../db.js';
import { config } from '../config.js';
import * as C from '../data/content.js';

const CAT = '🤡 BRINCADEIRAS', EXT = '🎉 MAIS BRINCADEIRAS';

// ---------- METRICAS ----------
// [emoji, titulo, subtitulo, rotulo-nivel, [[nivel, diagnostico] x4 (0-25, 26-50, 51-75, 76-100)]]
const METRICS = {
  gado: ['🐂', 'MÉTRICA DE SUBMISSÃO (GADÔMETRO)', 'Análise comportamental baseada em amostragem emocional de grupo.', '🌾', [
    ['LIVRE COMO O VENTO', 'Não responde nem mensagem de bom dia. Coração blindado.'],
    ['BEZERRO EM TREINAMENTO', 'Já mandou "boa noite, se cuida" e ficou esperando resposta.'],
    ['BOI DE PIRANHA', 'Faz tudo que pedem e ainda agradece pela oportunidade.'],
    ['PASTADOR PROFISSIONAL', 'Já comprou curso de como conquistar alguém e vive curtindo os stories antigos de quem nem sabe que ele existe.']]],
  calvo: ['👨‍🦲', 'MÉTRICA CAPILAR (CALVÔMETRO)', 'Varredura folicular por satélite de alta resolução.', '💇', [
    ['JUBA DE LEÃO', 'Cabelo tão forte que entope o ralo do vizinho.'], ['ENTRADAS SUSPEITAS', 'A testa está ganhando território devagarinho.'],
    ['CLAREIRA NA FLORESTA', 'Já usa boné até dentro de casa.'], ['BOLA DE BILHAR', 'O sol reflete e cega quem olha. Economia infinita em shampoo.']]],
  burro: ['🫏', 'MÉTRICA COGNITIVA (BURRÔMETRO)', 'Teste de QI aplicado por um estagiário sem supervisão.', '🧠', [
    ['GÊNIO INCOMPREENDIDO', 'Resolve cubo mágico de olhos fechados.'], ['NA MÉDIA', 'Só erra o "mas" e o "mais" de vez em quando.'],
    ['TOPEIRA DIGITAL', 'Coloca o celular pra carregar e esquece de ligar na tomada.'], ['JUMENTO DE OURO', 'Tentou pegar o wi-fi com a mão.']]],
  corno: ['🦌', 'MÉTRICA DE GALHADA (CORNÔMETRO)', 'Medição de chifres com trena a laser homologada.', '🦌', [
    ['FIEL E BLINDADO', 'Relacionamento sólido igual concreto.'], ['DESCONFIADO', 'Já olhou o celular do outro "sem querer".'],
    ['ANTENA PARABÓLICA', 'Pega sinal de traição a 3 km.'], ['REI DO GADO', 'O chifre já tem CEP próprio.']]],
  forca: ['💪', 'MÉTRICA DE FORÇA (FORÇÔMETRO)', 'Dinamômetro calibrado com academia de bairro.', '🏋️', [
    ['FRANGO', 'Perde braço de ferro pra criança de 7 anos.'], ['NORMAL', 'Abre pote de azeitona na terceira tentativa.'],
    ['MAROMBA', 'Carrega todas as sacolas numa viagem só.'], ['HULK', 'Amassa lata de refri só de olhar.']]],
  inteligencia: ['🧠', 'MÉTRICA DE INTELIGÊNCIA (QI-ÔMETRO)', 'Avaliação neural com 3 perguntas de charada.', '📚', [
    ['WI-FI FRACO', 'O cérebro está em modo avião.'], ['ESFORÇADO', 'Passa de ano na recuperação, mas passa.'],
    ['NERD RAIZ', 'Corrige o português de todo mundo no grupo.'], ['EINSTEIN 2.0', 'Já está estudando a física do próximo universo.']]],
  beleza: ['✨', 'MÉTRICA DE BELEZA (BELEZÔMETRO)', 'Análise estética com filtros desligados.', '🪞', [
    ['BELEZA INTERIOR', 'O que importa é o coração, né?'], ['BONITINHO', 'Tem seus ângulos bons.'],
    ['GATO(A)', 'Para o trânsito na faixa de pedestre.'], ['DIVINO(A)', 'Até o espelho pede autógrafo.']]],
  charme: ['😎', 'MÉTRICA DE CHARME (CHARMÔMETRO)', 'Medição de carisma por presença de palco.', '🌹', [
    ['SEM GRAÇA', 'O carisma tirou férias.'], ['SIMPÁTICO', 'Conquista a vó de todo mundo.'],
    ['GALANTEADOR', 'Uma piscada e já está todo mundo rindo.'], ['IRRESISTÍVEL', 'Fala "oi" e o grupo inteiro se apaixona.']]],
  aura: ['🌀', 'MÉTRICA DE AURA (AURÔMETRO)', 'Leitura energética por scanner espiritual.', '🔮', [
    ['AURA NEGATIVA', '-1000 de aura por aquele vacilo de ontem.'], ['AURA NEUTRA', 'Nem fede nem cheira.'],
    ['AURA BRILHANTE', 'Entra na sala e todo mundo vira o pescoço.'], ['AURA INFINITA', 'Aura de protagonista de anime.']]],
  fofura: ['🥰', 'MÉTRICA DE FOFURA (FOFURÔMETRO)', 'Teste de fofura aplicado por um gatinho.', '🧸', [
    ['CACTO', 'Fofura de espinho.'], ['PELÚCIA', 'Dá vontade de apertar um pouquinho.'],
    ['FILHOTE', 'Faz carinha de coitado e ganha tudo.'], ['MOCHI HUMANO', 'Tão fofo que deveria ser ilegal.']]],
  loucura: ['🤪', 'MÉTRICA DE LOUCURA (DOIDÔMETRO)', 'Avaliação psiquiátrica feita pelo grupo.', '🌀', [
    ['ZEN', 'Calmo igual monge tibetano.'], ['MEIO PIRADO', 'Conversa com as plantas, mas elas não respondem.'],
    ['DOIDO VARRIDO', 'Come miojo cru com açúcar.'], ['HOSPÍCIO AMBULANTE', 'Até o médico pediu alta pra fugir.']]],
  preguica: ['🦥', 'MÉTRICA DE PREGUIÇA (PREGUIÇÔMETRO)', 'Medido enquanto o alvo estava deitado.', '🛌', [
    ['ELÉTRICO', 'Acorda 5h pra correr. Por vontade própria.'], ['NORMAL', 'Aperta soneca só 3 vezes.'],
    ['BICHO-PREGUIÇA', 'Pede delivery pra pegar o controle.'], ['LENDA DO SOFÁ', 'O sofá já tem o formato do corpo dele.']]],
  raiva: ['😡', 'MÉTRICA DE RAIVA (RAIVÔMETRO)', 'Termômetro emocional em tempo real.', '🌋', [
    ['PAZ E AMOR', 'Não se estressa nem com fila de banco.'], ['IRRITADINHO', 'Bufa quando a internet cai.'],
    ['PAVIO CURTO', 'Brigou com a impressora e perdeu.'], ['VULCÃO ATIVO', 'Sai fumaça das orelhas quando perde no jogo.']]],
  azar: ['🍀', 'MÉTRICA DE AZAR (AZARÔMETRO)', 'Cálculo probabilístico com gato preto de testemunha.', '🐈‍⬛', [
    ['SORTUDO', 'Acha dinheiro no bolso da calça velha.'], ['NA MÉDIA', 'Às vezes o pão cai com a manteiga pra cima.'],
    ['AZARADO', 'Pisa no único LEGO da casa.'], ['ZICA SUPREMA', 'O guarda-chuva quebra justo quando chove.']]],
  feio: ['👹', 'MÉTRICA DE FEIURA (FEIÔMETRO)', 'Leitura facial com câmera de segurança.', '🪞', [
    ['MODELO', 'Feiura indetectável.'], ['ACEITÁVEL', 'Com a luz certa vai.'], ['ASSUSTADOR', 'O espelho trincou de leve.'], ['HORROR', 'Assusta até o filme de terror.']]],
};
function metric(name) {
  const [emoji, title, sub, lvlEmoji, levels] = METRICS[name];
  return {
    name, category: name === 'feio' ? null : CAT, react: emoji, run: ctx => {
      const alvo = ctx.target();
      const p = rand(0, 100);
      const [nivel, diag] = levels[Math.min(3, Math.floor(p / 25.01))];
      db.updateMember(ctx.jid, alvo, mem => { mem.fun[name] = p; });
      return ctx.reply(`${emoji} *${title}*
        _${sub}_

        👤 *Alvo Mapeado:* ${ctx.tag(alvo)}
        📊 *Resultado:* _${p}%_
        📈 *Espectro:* ${bar(p)}

        ${lvlEmoji} *Nível:* _${nivel}_
        💬 *Diagnóstico:* _${diag}_`, { mentions: [alvo] });
    },
  };
}

// ---------- ACOES ----------
const ACTIONS = {
  tapa: ['👋', 'deu um tapa estalado em', ['A marca dos cinco dedos vai ficar por 3 dias.', 'O som ecoou pelo grupo inteiro.']],
  matar: ['🔪', 'eliminou', ['O corpo foi escondido no grupo da família.', 'Ninguém viu nada... ou viu? 👀']],
  magia: ['🪄', 'lançou um feitiço em', ['Agora só consegue falar rimando.', 'Virou um sapo por 24h. 🐸']],
  maldicao: ['🧿', 'rogou uma maldição em', ['Vai pisar em LEGO a semana inteira.', 'O wi-fi vai cair sempre na melhor parte.']],
  bencao: ['😇', 'abençoou', ['Que a sorte esteja sempre ao seu lado.', 'Recebeu proteção contra provas surpresa.']],
  transformar: ['🔄', 'transformou', ['Agora é um pinguim de geladeira. 🐧', 'Virou um pão de queijo falante. 🧀']],
  hipnotizar: ['🌀', 'hipnotizou', ['Agora obedece qualquer ordem com "por favor".', 'Está convencido de que é uma galinha. 🐔']],
  congelar: ['🧊', 'congelou', ['Virou picolé de gente.', 'Só descongela com abraço.']],
  queimar: ['🔥', 'tacou fogo em', ['Restou só a sombrancelha.', 'Virou churrasquinho de grupo. 🍢']],
  eletrocutar: ['⚡', 'eletrocutou', ['O cabelo ficou igual do Einstein.', 'Agora carrega celular com o dedo.']],
  envenenar: ['🧪', 'envenenou', ['Era só suco de chuchu, mas o susto foi real.', 'Está com a língua verde. 🤢']],
  ressuscitar: ['✨', 'ressuscitou', ['Voltou mais forte e com fome.', 'Voltou, mas esqueceu a senha do Wi-Fi.']],
  teletransportar: ['🌌', 'teletransportou', ['Foi parar no meio do Saara. 🏜️', 'Apareceu na sala da diretora.']],
  hackear: ['💻', 'hackeou', ['Trocou o nome dele no WhatsApp pra "Banana".', 'Vazou o histórico de pesquisa (era só receita de bolo).']],
  clonar: ['🧬', 'clonou', ['Agora existem dois. O grupo não aguenta.', 'O clone saiu com defeito e só fala "ué".']],
  miniaturizar: ['🔬', 'miniaturizou', ['Agora cabe numa caixa de fósforo.', 'Está do tamanho de uma formiga. 🐜']],
  gigantizar: ['🗼', 'gigantizou', ['Agora bate a cabeça nas nuvens.', 'Pisou num prédio sem querer.']],
  assombrar: ['👻', 'assombrou', ['Vai ouvir passos à noite por uma semana.', 'A luz do quarto pisca sozinha agora.']],
  possuir: ['😈', 'possuiu o corpo de', ['Agora fala ao contrário.', 'Só sai com água benta e meme.']],
  sequestrar: ['🚐', 'sequestrou', ['O resgate é um pacote de bolacha recheada.', 'Foi levado pra assistir aula de matemática.']],
};
function action(name) {
  const [emoji, verb, outcomes] = ACTIONS[name];
  return {
    name, category: CAT, react: emoji, run: ctx => {
      const alvo = ctx.target();
      if (alvo === ctx.sender) return ctx.reply(`${emoji} *Marque alguém* ou responda a mensagem da vítima!\n\nExemplo: _/${name} @pessoa_`);
      return ctx.reply(`${emoji} *${name.toUpperCase()}!*\n\n${ctx.tag(ctx.sender)} ${verb} ${ctx.tag(alvo)}!\n\n💬 _${pick(outcomes)}_`, { mentions: [ctx.sender, alvo] });
    },
  };
}

// ---------- SORTEIOS DE ITEM ----------
const PICKS = {
  bebida: ['🍹', 'BEBIDA IDEAL', ['Guaraná', 'Suco de maracujá', 'Café sem açúcar', 'Achocolatado', 'Água de coco', 'Chá gelado', 'Milkshake', 'Refri de uva', 'Leite com Nescau']],
  roupa: ['👕', 'ESTILO DE ROUPA', ['Moletom largo', 'Terno e gravata', 'Pijama de unicórnio', 'Camisa de time', 'Look all black', 'Chinelo com meia', 'Jaqueta jeans', 'Cosplay de anime']],
  serie: ['📺', 'SÉRIE DA SUA VIDA', ['Stranger Things', 'The Office', 'Round 6', 'Wandinha', 'Breaking Bad', 'Chaves', 'Todo Mundo Odeia o Chris', 'La Casa de Papel', 'Friends']],
  anime: ['🍥', 'ANIME QUE TE REPRESENTA', ['Naruto', 'One Piece', 'Demon Slayer', 'Jujutsu Kaisen', 'Dragon Ball', 'Attack on Titan', 'Spy x Family', 'Haikyuu!!', 'My Hero Academia', 'Pokémon']],
  time: ['⚽', 'TIME DO CORAÇÃO', ['Flamengo', 'Corinthians', 'Palmeiras', 'São Paulo', 'Vasco', 'Grêmio', 'Internacional', 'Cruzeiro', 'Atlético-MG', 'Santos', 'Botafogo', 'Fluminense']],
  pais: ['🌍', 'PAÍS DOS SONHOS', ['Japão', 'Canadá', 'Itália', 'Portugal', 'Noruega', 'Austrália', 'Coreia do Sul', 'Islândia', 'Nova Zelândia', 'Grécia']],
  profissao: ['💼', 'PROFISSÃO DO FUTURO', ['Astronauta', 'Youtuber', 'Médico', 'Programador', 'Chef de cozinha', 'Jogador de futebol', 'Influencer de gatos', 'Detetive', 'Piloto de avião']],
  crime: ['🚔', 'FICHA CRIMINAL', ['Roubou a última bolacha do pacote', 'Deu spoiler de série', 'Deixou o copo vazio na geladeira', 'Ouve áudio sem fone no ônibus', 'Responde "kkk" sem rir', 'Visualizou e não respondeu']],
  virtude: ['🌟', 'MAIOR VIRTUDE', ['Paciência', 'Lealdade', 'Bom humor', 'Coragem', 'Honestidade', 'Criatividade', 'Gentileza', 'Determinação']],
};
function pickCmd(name) {
  const [emoji, title, items] = PICKS[name];
  return {
    name, category: CAT, react: emoji, run: ctx => {
      const alvo = ctx.target();
      return ctx.reply(`${emoji} *${title}*\n\n👤 *Alvo:* ${ctx.tag(alvo)}\n🎯 *Resultado:* _${pick(items)}_`, { mentions: [alvo] });
    },
  };
}

// ---------- CHANCE (formato identico ao observado) ----------
const VEREDITOS = [
  [0, ['Impossível. Nem com milagre.', 'Esquece, não vai rolar.']], [21, ['Bem difícil, mas sonhar é de graça.', 'As chances estão contra você.']],
  [41, ['Meio a meio. Joga a moeda.', 'Pode ser que sim, pode ser que não.']], [61, ['As chances são boas! Já pode começar a acreditar.', 'Tá encaminhado, só não vacila.']],
  [81, ['Quase garantido! Só um desastre impede esse sucesso.', 'Chance altíssima. Pode comemorar no sigilo.']],
];
const veredito = p => pick([...VEREDITOS].reverse().find(([min]) => p >= min)[1]);

export const commands = [
  ...Object.keys(METRICS).map(metric),
  ...Object.keys(ACTIONS).map(action),
  ...Object.keys(PICKS).map(pickCmd),
  {
    name: 'chance', category: CAT, react: '🎲', run: ctx => {
      if (!ctx.q) return ctx.reply('🎲 *Uso:* /chance <algo>\n\nExemplo: _/chance de chover amanhã_');
      const p = rand(0, 100);
      return ctx.reply(`📊 *MÉTRICA DE PROBABILIDADE*
        _Análise estatística e simulação de amostragem concluída._

        👤 *Alvo mapeado:* ${ctx.tag(ctx.sender)}
        ❓ *Cenário Avaliado:* _"${ctx.q}"_

        📈 *Probabilidade:* _${p}%_
        📊 *Espectro:* ${bar(p)}

        ⚖️ *Veredito do Sistema:*
        _${veredito(p)}_`);
    },
  },
  {
    name: 'piada', category: CAT, react: '😂', run: ctx => {
      const [q, a] = pick(C.piadas);
      return ctx.reply(`
        ❓ *Pergunta:* _${q}_
        💡 *Resposta:* _${a}_
        `);
    },
  },
  {
    name: 'ship', category: CAT, react: '💘', run: async ctx => {
      let [a, b] = ctx.mentions;
      if (!a) return ctx.reply('💘 *Uso:* /ship @pessoa1 @pessoa2');
      if (!b) { b = a; a = ctx.sender; }
      const p = rand(0, 100);
      const hearts = '❤️'.repeat(Math.round(p / 10)) + '🤍'.repeat(10 - Math.round(p / 10));
      const msg = p > 80 ? 'Casal perfeito! Já podem marcar o casamento 💍' : p > 60 ? 'Tem química aí! 🔥' : p > 40 ? 'Pode dar certo com esforço 🤔' : p > 20 ? 'Melhor ficar na amizade 😅' : 'Nem com reza forte 💀';
      return ctx.reply(`💘 *SHIP*\n\n${ctx.tag(a)} ❤️ ${ctx.tag(b)}\n\n${hearts} *${p}%*\n\n_${msg}_`, { mentions: [a, b] });
    },
  },
  {
    name: 'foto', category: CAT, react: '📸', run: async ctx => {
      const alvo = ctx.target();
      const url = await ctx.sock.profilePictureUrl(alvo, 'image').catch(() => null);
      if (!url) return ctx.reply(`📸 ${ctx.tag(alvo)} não tem foto de perfil ou ela é privada.`, { mentions: [alvo] });
      return ctx.send({ image: { url }, caption: `📸 *Foto de perfil de* ${ctx.tag(alvo)}`, mentions: [alvo] }, { quoted: ctx.m });
    },
  },

  // ----- extras (estilo ZueiraBot) -----
  {
    name: 'casal', category: EXT, react: '💑', run: async ctx => {
      const today = dateBR();
      const g = ctx.group; let pair = g.settings.casalDia;
      if (!pair || pair.date !== today) {
        const ids = (await ctx.meta()).participants.map(p => p.id);
        if (ids.length < 2) return ctx.reply('Preciso de pelo menos 2 membros.');
        const a = pick(ids); let b = pick(ids); while (b === a) b = pick(ids);
        pair = { date: today, a, b };
        db.updateGroup(ctx.jid, gr => { gr.settings.casalDia = pair; });
      }
      return ctx.reply(`💑 *CASAL DO DIA* (${today})\n\n${ctx.tag(pair.a)} 💞 ${ctx.tag(pair.b)}\n\n_O destino escolheu, ninguém pode contestar!_`, { mentions: [pair.a, pair.b] });
    },
  },
  {
    name: 'sorteio', category: EXT, react: '🎁', run: async ctx => {
      const ids = (await ctx.meta()).participants.map(p => p.id);
      const w = pick(ids);
      return ctx.reply(`🎁 *SORTEIO${ctx.q ? `: ${ctx.q.toUpperCase()}` : ''}*\n\n🥁 E o vencedor é...\n\n🏆 ${ctx.tag(w)}!`, { mentions: [w] });
    },
  },
  { name: 'pergunta', category: EXT, react: '🎱', run: ctx => ctx.q ? ctx.reply(`🎱 *BOLA 8*\n\n❓ _${ctx.q}_\n\n💬 *${pick(C.bola8)}*`) : ctx.reply('🎱 *Uso:* /pergunta vou passar na prova?') },
  { name: 'moeda', category: EXT, react: '🪙', run: ctx => ctx.reply(`🪙 *CARA OU COROA*\n\n🎯 Deu: *${pick(['CARA 🙂', 'COROA 👑'])}*`) },
  { name: 'cantada', category: EXT, react: '😏', run: ctx => { const t = ctx.mentions[0]; return ctx.reply(`😏 *CANTADA*${t ? ` para ${ctx.tag(t)}` : ''}\n\n_${pick(C.cantadas)}_`, { mentions: t ? [t] : [] }); } },
  { name: 'conselho', category: EXT, react: '🧙', run: ctx => ctx.reply(`🧙 *CONSELHO DO DIA*\n\n_${pick(C.conselhos)}_`) },
  { name: 'fato', category: EXT, react: '🤓', run: ctx => ctx.reply(`🤓 *FATO CURIOSO*\n\n_${pick(C.fatos)}_`) },
  { name: 'frase', category: EXT, react: '💭', run: ctx => ctx.reply(`💭 *FRASE MOTIVACIONAL*\n\n_"${pick(C.frases)}"_`) },
  {
    name: 'escolher', category: EXT, react: '🤔', run: ctx => {
      const opts = ctx.q.split(/,|\bou\b/).map(s => s.trim()).filter(Boolean);
      if (opts.length < 2) return ctx.reply('🤔 *Uso:* /escolher pizza, sushi, hambúrguer');
      return ctx.reply(`🤔 *O BOT ESCOLHEU:*\n\n👉 *${pick(opts)}*`);
    },
  },
  {
    name: 'numero', category: EXT, react: '🔢', run: ctx => {
      let [a, b] = ctx.args.map(Number); if (!Number.isFinite(a)) [a, b] = [1, 100]; if (!Number.isFinite(b)) [a, b] = [1, a];
      return ctx.reply(`🔢 *NÚMERO ALEATÓRIO* (${Math.min(a, b)}–${Math.max(a, b)})\n\n🎯 *${rand(Math.min(a, b), Math.max(a, b))}*`);
    },
  },
  {
    name: 'eununca', category: EXT, react: '🙈', run: ctx => ctx.send({ poll: { name: `🙈 ${pick(C.eununca)}`, values: ['Eu já 😳', 'Eu nunca 😇'], selectableCount: 1 } }),
  },
  {
    name: 'vod', category: EXT, react: '🍾', run: async ctx => {
      const ids = (await ctx.meta()).participants.map(p => p.id);
      const a = pick(ids); let b = pick(ids); while (ids.length > 1 && b === a) b = pick(ids);
      return ctx.reply(`🍾 *A GARRAFA GIROU!*\n\n${ctx.tag(a)} pergunta para ${ctx.tag(b)}\n\n👉 Verdade (/verdade) ou desafio (/desafio)?`, { mentions: [a, b] });
    },
  },
  { name: 'verdade', category: EXT, react: '🗣️', run: ctx => { const t = ctx.target(); return ctx.reply(`🗣️ *VERDADE* para ${ctx.tag(t)}\n\n❓ _${pick(C.verdades)}_`, { mentions: [t] }); } },
  { name: 'desafio', category: EXT, react: '🔥', run: ctx => { const t = ctx.target(); return ctx.reply(`🔥 *DESAFIO* para ${ctx.tag(t)}\n\n🎯 _${pick(C.desafios)}_`, { mentions: [t] }); } },
];
export { METRICS };
