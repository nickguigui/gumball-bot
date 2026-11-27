#!/bin/sh
# Publica o codigo novo no servidor: cancela o turno atual (ele salva a sessao ao cancelar),
# cancela turnos na fila (podem estar com codigo antigo) e liga um novo com o codigo de agora.
export GH_TOKEN=${GH_TOKEN:-$(printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')}
G=${GH:-gh}; [ -x "/c/Program Files/GitHub CLI/gh.exe" ] && G="/c/Program Files/GitHub CLI/gh.exe"
R=nickguigui/gumball-bot
for st in pending queued waiting in_progress; do
  for id in $("$G" run list -R $R -w servidor.yml -s $st -L 5 --json databaseId -q '.[].databaseId'); do "$G" run cancel "$id" -R $R >/dev/null 2>&1 && echo "cancelado $id ($st)"; done
done
sleep 5
"$G" workflow run servidor.yml -R $R && echo "novo turno disparado"
