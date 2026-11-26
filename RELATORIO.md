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
