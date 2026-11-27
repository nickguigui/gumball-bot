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

## YouTube (/play, /ytmp4) — resolvido
O YouTube bloqueia os servidores do GitHub. Agora o bot usa os cookies da sua conta secundária (Secret `YTDLP_COOKIES`, fora do código) e o servidor instala o Deno (o yt-dlp precisa dele para os links do YouTube). Também corrigi o ffmpeg, que não era encontrado. Testado: `/play` por nome e por link mandam o áudio; `/ytmp4` manda o vídeo.
Quando os cookies vencerem (semanas ou meses), o bot avisa "O YouTube está bloqueando o servidor": é só exportar de novo numa janela anônima e me passar o arquivo.

---

# Editor de figurinhas (27/11)

Mande **/editarfig** no WhatsApp (ou responda uma foto, vídeo ou figurinha com /editarfig) e o bot manda um link só seu, que vale 30 minutos. O editor não aparece nas abas do site.

- **Mídia:** a que você respondeu, uma foto, um vídeo/GIF ou só desenho (fundo transparente).
- **Ferramentas:** pintar (cores e tamanho), borracha (apaga só o desenho), texto (6 fontes, cor, contorno, tamanho, arrastar), emojis, desfazer/refazer, zoom com dois dedos ou rodinha, girar, espelhar, brilho/contraste/saturação, fundo transparente/branco/preto/cor.
- **Vídeo:** escolhe o trecho (início e duração, até 8 s).
- **Som:** sem som, som do próprio vídeo, arquivo de áudio (MP3…), áudio de outro vídeo (MP4…) ou gravar na hora pelo microfone; dá para escolher de onde o som começa e ouvir antes.
- **Mandar no WhatsApp:** o bot monta a figurinha (com ou sem som) e manda no chat onde você pediu.
- Testado ao vivo no grupo "Eu ;-;": foto com desenho, texto e som de arquivo; vídeo com texto e som do próprio vídeo. O microfone não deu para testar daqui (precisa de você).

Também corrigido: o servidor às vezes conectava e ficava "surdo" (o WhatsApp não liberava as mensagens pendentes). Agora um vigia libera e, se preciso, reconecta sozinho.

---

# Figurinhas prontas, galeria e app (27/11)

## /abrirfig — "Acrobat de figurinhas"
Responda qualquer figurinha (de quem for, feita no site ou não) com **/abrirfig** (ou /editarfig). O link abre a tela **Peças da figurinha**:
- Mostra tudo: animada ou parada, se tem som (e quanto dura), pacote, autor, emojis, tamanho, quadros e duração.
- **Baixar cada peça**: a figurinha original (.webp), a imagem (.png) ou a animação (.mp4), o som (.mp3 e .ogg).
- **Editar** mantendo o som original, **Trocar o som** (MP3, outro vídeo, gravar) ou **Tirar o som**.

## Galeria de figurinhas (aba "Figurinhas" do site, estilo sticker.ly)
- **Publicar pelo WhatsApp**: `/novopacote Nome` → mande as figurinhas na mesma conversa (entram sozinhas; com som continua com som; de outra pessoa: responda com `/addfig`) → `/publicarpacote`. De 3 a 30 figurinhas, sem misturar animadas com paradas (regra do WhatsApp). `/rascunho`, `/cancelarpacote`, `/meuspacotes`, `/apagarpacote código`.
- **No site**: busca, filtros (com som, animados, parados), ouvir o som de cada figurinha, baixar uma ou o pacote todo (.zip), compartilhar o link, **Mandar no meu WhatsApp** (o comando `/baixarpacote código` faz o seu Gumball mandar todas, **com som**) e **Adicionar ao WhatsApp** (pelo app Android).
- **Denúncias**: botão em cada pacote. Você recebe o aviso na sua conversa "Você"; com 3 denúncias de pessoas diferentes o pacote some até você decidir (`/apagarpacote código` ou `/mostrarpacote código`). Você pode apagar qualquer pacote; os outros só apagam os próprios.
- Os pacotes ficam no ramo `galeria` do GitHub. Já tem 2 pacotes originais: "Reações brat" e "Reações com som" (sons sintetizados, sem direito autoral de ninguém).

## Apps
- **Android**: APK "Gumball Figurinhas" (baixe na aba Figurinhas, botão "Baixar o app Android"). Abre a galeria e o botão **Adicionar ao WhatsApp** coloca o pacote direto no WhatsApp, como o sticker.ly. Assinado com uma chave só sua (`app/gumball-release.jks`, senha em `secrets.txt`, os dois fora do GitHub): **não perca esse arquivo**, sem ele as próximas versões não instalam por cima.
- **iPhone**: o site instala como app (Compartilhar → Adicionar à Tela de Início). App na App Store precisa de Mac e da conta paga da Apple.
- ⚠️ Pelo app, o **som** das figurinhas não entra no pacote (o WhatsApp não aceita pacote de app com som). Com som: "Mandar no meu WhatsApp" / `/baixarpacote`.

---

# Robô de promoções com link de afiliado (27/11, noite)

Posta ofertas com o **seu** link de afiliado em grupos e canais. Nada de senha: cada loja dá um código no painel de afiliado e você cola no Gumball.

| Loja | O que o bot faz | O que você precisa |
|---|---|---|
| Amazon | Converte qualquer link (inclusive amzn.to) | Código de Associado (`seucodigo-20`) |
| Mercado Livre | Converte qualquer link do ML | Um link de afiliado gerado no painel do ML (eu copio o código dele) |
| Shopee | Converte links **e busca ofertas sozinho** | AppID + Secret da Open API (pedir acesso no painel) |
| AliExpress | Converte links **e busca ofertas sozinho** | App Key + Secret + Tracking ID |

- **Site**: painel › Robô de promoções: ligar/desligar, grupos e canais, frequência, horário, buscas (ex.: fone, air fryer), desconto mínimo, emoji, assinatura, as 4 lojas com passo a passo, "Postar uma oferta" (com foto) e "Só converter o link". As chaves secretas nunca voltam para o site.
- **WhatsApp**: `/comoafiliar` (passo a passo), `/afiliados`, `/afiliado <link>`, `/promo <link> 129,90 de 199,90 cupom X | Título` (mande como legenda de uma foto para a foto ir junto; `/promo agora ...` posta na hora), `/promocoes` (ligar, aqui, canal, intervalo, horario, busca, desconto, fila, testar...).
- Ofertas automáticas: Shopee e AliExpress pelas APIs oficiais, sem repetir produto, as de maior desconto primeiro. Amazon e ML entram pelos links que você colar (a Amazon só libera a API de produtos depois das 3 primeiras vendas, e o ML não tem API de afiliado).
- Testado ao vivo no grupo "Eu ;-;": converter link da Amazon, postar oferta com preço/desconto/cupom, postar pelo site com foto. As APIs da Shopee e do AliExpress foram chamadas de verdade e respondem; só falta a sua chave aprovada.
- Banco de dados do Google: não foi preciso, as configurações ficam no servidor do Gumball, criptografadas.

## Criar canal e tutorial (27/11, noite)
- **Criar canal pelo painel** (Robô de promoções › Onde postar › "Ainda não tem canal? Criar um agora"): foto, nome e descrição; o canal é criado no seu número e já entra no robô. No WhatsApp: `/criarcanal Nome | Descrição` como legenda de uma foto. `/apagarcanal <link> confirmar` apaga um canal seu.
- O primeiro teste mostrou que o seu número ainda não aceitou os **termos de Canais do WhatsApp**; o bot agora aceita na hora de criar (avisado na tela). Ainda não criei canal de teste porque isso aceitaria os termos na sua conta: precisa do seu ok.
- **Tutorial**: https://nickguigui.github.io/gumball-bot/afiliados.html (Amazon, Mercado Livre, Shopee, AliExpress: criar conta, gerar link na mão, chaves de API, ligar no Gumball e regras). Botão no painel e link no `/comoafiliar`.
- Os posts agora avisam que é link de afiliado (a Amazon exige).
