# Relatório da madrugada (26/11/2026)

Tudo abaixo está publicado em https://github.com/nickguigui/gumball-bot e no site https://nickguigui.github.io/gumball-bot/.

## Funcionando e testado AO VIVO no seu número (grupo "Eu ;-;", via ponte)
`/ping` (415 ms, ótima) · `/piada` · `/dados` · `/signo peixes` · `/lyrics promise laufey` (agora acha "Promise", não "Promiscuous") · `/painel` (26 opções) · `/clima Brasília` · `/cpf` · `/daily` · `/ver` · `/chance` · `/brat` e `/attp` (figurinhas).

## Corrigido nesta madrugada
- **Figurinha "bugada e embaçada"**: foto agora sai com qualidade 92 + nitidez; vídeo com qualidade 80 (só abaixa se passar do limite de 500 KB do WhatsApp); brat sem o borrão.
- **/s num vídeo**: aceita até 30 s e sai como **figurinha com som** (o recurso novo do WhatsApp). `/s mudo` faz sem som. Foto mandada respondendo um áudio vira figurinha com aquele áudio. `/take` mantém o som.
- **/toimg** numa figurinha animada ou com som agora devolve **vídeo** (com o som).
- **/ver e /permitirver**: o consentimento era gravado num tipo de ID e procurado em outro (número x LID); agora vale pelos dois. Os admins escolhem por grupo: restrito, só quem liberar, ou todos menos quem bloquear (`/vermodo` ou no painel). ⚠️ Limite do WhatsApp: aparelhos conectados (o bot é um) às vezes não recebem a chave da mídia de visualização única; aí o bot explica isso em vez de dar erro.
- **Explicações de uso** apareciam como "❌ Erro: 💚 Uso: ..." em 35 comandos; agora aparece só a explicação.
- **Fonte do site**: a arredondada anterior desenhava o "i" sem o pingo; troquei pela Nunito (o título "Seu grupo pede, o bot faz." continua como você pediu).

## Novidades
- **Painel igual ao do ZueiraBot** (aba Conectar / Painel): lista "Seus grupos" e uma página por grupo com tudo (bot ligado, brincadeiras, boas-vindas com prévia, links em 3 modos, só admins, apagadas/editadas, visualização única, auto-figurinha, espera, saída, captcha, só Brasil, regras, moderação, 13 tipos de mensagem, horários, nome das figurinhas, respostas automáticas, comandos ligados, mensagens agendadas).
- **O mesmo painel no WhatsApp**: `/painel` mostra tudo; `/config <opção> <valor>` muda (só admins).
- **Menu** com os comandos do Zenitsu e do ZueiraBot juntos em cada categoria + 11 comandos do ZueiraBot que faltavam (antiapagar, antieditar, anti, addpalavra, rmpalavra, permddi, medidores, interacoes, bots, botprincipal, suporte, conectar). Total: **340 comandos**.

## Testes automáticos (todos passando)
- `node test/all.mjs`: os 316 comandos sem rede pesada, **0 crash**.
- `node test/owner-only.mjs`: só você usa, privado liga/desliga, eco ignorado (9/9).
- `node test/viewonce.mjs`: consentimento do /ver (5/5).
- Rede/figurinhas: clima, cotação, notícias, futebol, feriados, celular, filme, lyrics, gpt, brat, attp, qc (12/12).
- A sessão do seu número **sobrevive à troca de servidor** (reconectou sozinha 4 vezes, sem pedir código).

## O que ficou com você
1. **Ponte do WhatsApp MCP**: repareada às 01:32 ✅. Ela vai ligar sozinha quando o PC ligar.
2. **ZueiraBot e Gumball respondem em dobro** no seu número. Se o Gumball já te atende, remova o aparelho do ZueiraBot em Aparelhos conectados (libera vaga: o limite é 4 aparelhos).
3. **Testar a figurinha com som** mandando um vídeo com `/s` (não dá para mandar vídeo pela ponte).

## Como o servidor funciona (sem cartão, sem PC)
GitHub Actions (`servidor.yml`) roda ~5h40, salva os dados criptografados a cada 5 min e liga o próximo turno; o site acha o endereço do túnel em `endpoint.json`. Na troca de turno o bot fica 1–2 min fora.

---

# Atualização (26/11, tarde)

- **Chaves cadastradas** como Secrets do GitHub (fora do código): TMDB ✅, football-data ✅, GNews ✅, OpenAI ⚠️ (válida, mas **sem crédito**: o /gpt tenta ela e cai na IA grátis; colocando crédito, passa a usar a OpenAI sozinho).
- **/filme e /cinema** com TMDB (pôster, nota, filmes em cartaz). **/futebol** com football-data (`/futebol brasileirao`, `champions`, `premier`...; reserva: ESPN). **/noticias** com GNews e busca por assunto (`/noticias Laufey`; reservas: Google Notícias e G1).
- **/emojimix** agora funciona **sem chave** (Emoji Kitchen direto do Google).
- **/placa e /placaloli** iguais ao script `Atualizar_Placaloli.sh` antigo (a imagem da placa).
- Erros de serviço externo viram aviso amigável ("o serviço está ocupado, tente de novo").
- **Testado ao vivo no seu número**: /filme, /cinema, /gpt, /placaloli, /futebol brasileirao, /noticias Laufey, /emojimix, /wiki. Bateria automática: 316 comandos, 0 crash.
- **Backup**: `E:\backups\gumball-bot_2026-11-26_1249.zip` (cópia em `D:\backups`), com o projeto, a engenharia reversa, a memória e as chaves de acesso locais.

---

# Atualização (26/11, noite) — "o bot não funcionava com o PC desligado"

## Causa
Não era o PC. Quando o servidor trocava de turno (ou era reiniciado), ele voltava com os dados salvos **até 5 minutos antes**. A criptografia entre o seu celular e o bot muda a cada mensagem, então os dados velhos ficavam dessincronizados (`Bad MAC`) e o bot **não conseguia ler o que você mandava do celular** (principalmente no privado). Além disso, um turno cancelado disparava um turno extra.

## Corrigido
- Sessão salva **a cada 1 minuto** num ramo separado (`estado`, um commit só, o histórico não incha) e **também quando o turno é cancelado ou cai**. Testado em 6 trocas seguidas: zero erro de criptografia.
- Turno cancelado não dispara mais um turno extra e avisa o site que está trocando.
- Comando mandado durante a troca de turno (1–2 min fora) é respondido quando o bot volta.
- Diagnóstico: o servidor registra o tipo de cada mensagem recebida (sem conteúdo) e os erros, e o registro sobrevive às trocas.

## Outros bugs achados testando ao vivo (grupo, privado e site)
- Rankings do grupo (/rank, /ativos, /inativos, /casais...) diziam "Sem dados" porque comparavam número com o ID novo do WhatsApp (LID). Agora aceitam os dois.
- /wiki levava bloqueio da Wikipédia; /cotacao (/dolarhoje) caía quando a API de câmbio falhava: agora tem reserva.
- /lembrete agora entende "daqui 1 minuto", "em 5 min", "dentro de 2h".
- /forca <letra> durante o jogo da forca vale como palpite.
- Menu te chamava de "Usuário" nas suas próprias mensagens; e quem conectasse pelo site veria "Dono: Nick" (agora é o nome do perfil de cada um).
- Novos apelidos: /saldo, /carteira, /cotacao, /dolar. Comando digitado errado: "Quis dizer /minerar?" (só para você).
- Conteúdo bem maior (50 piadas, 46 perguntas de quiz, 60 bandeiras, 51 palavras de forca...) e sem repetir até passar por todas.
- Canal: /canaldata cadastra datas especiais pelo WhatsApp; prévia do site sem frases cortadas.
- Site: botões das categorias com a fonte certa; painel espera o servidor reiniciar em vez de cair na tela de entrar; links diretos (#canal) funcionam; grupos em ordem alfabética; "sem admin" não aparece mais como erro vermelho.

## Testado ao vivo e funcionando
Grupo: menu, ping, medidores, piada, quiz, forca, bandeira, charada, daily, minerar, perfil, banco, rank, ativos, clima, traduzir, calcular, feriados, signo, conselho, fato, gpt, lyrics, filme, notícias, futebol, celular, ff, cep, ddd, qr, encurtar, ytsearch, falar, figurinha de vídeo e de foto (/s), TikTok, regras, enquete, lembrete, totag, painel, config. Privado: menu, cotação, piada, comandos de grupo explicam que só funcionam em grupo. Site: login com código, lista de grupos, salvar opção do grupo (refletiu no /painel do WhatsApp), canal automático, celular e computador.

## Pendente (depende de você)
- **/play e downloads do YouTube**: o YouTube bloqueia todos os servidores do GitHub ("confirme que não é um robô"). TikTok e outros funcionam. Para o YouTube voltar, é preciso cookies de uma conta do YouTube (de preferência uma conta secundária) guardados como Secret `YTDLP_COOKIES` — o bot já está pronto para usar.
