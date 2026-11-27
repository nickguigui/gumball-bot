#!/bin/sh
# Publica o codigo novo no servidor: cancela o turno atual (ele salva a sessao ao cancelar),
# cancela turnos na fila (podem estar com codigo antigo) e liga um novo com o codigo de agora.
export GH_TOKEN=${GH_TOKEN:-$(printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')}
G=${GH:-gh}; [ -x "/c/Program Files/GitHub CLI/gh.exe" ] && G="/c/Program Files/GitHub CLI/gh.exe"
R=nickguigui/gumball-bot
# alguem no meio do pareamento (digitando o codigo)? reiniciar agora derruba: espera ate 10 min (FORCE=1 pula)
if [ -z "$FORCE" ]; then
  U=$(curl -s "https://api.github.com/repos/$R/contents/endpoint.json?ref=main" -H "Accept: application/vnd.github.raw+json" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
  for i in $(seq 40); do
    n=$(curl -s -m 10 "$U/api/saude" | sed -n 's/.*"pareando":\([0-9]*\).*/\1/p')
    if [ -z "$n" ] || [ "$n" = "0" ]; then break; fi
    echo "aguardando $n pareamento(s) terminar antes de reiniciar..."; sleep 15
  done
fi
for st in pending queued waiting in_progress; do
  for id in $("$G" run list -R $R -w servidor.yml -s $st -L 5 --json databaseId -q '.[].databaseId'); do "$G" run cancel "$id" -R $R >/dev/null 2>&1 && echo "cancelado $id ($st)"; done
done
sleep 5
"$G" workflow run servidor.yml -R $R && echo "novo turno disparado"
