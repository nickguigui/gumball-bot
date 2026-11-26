#!/bin/sh
# Publica o codigo novo no servidor: cancela o turno atual (ele salva a sessao ao cancelar) e liga outro.
export GH_TOKEN=${GH_TOKEN:-$(printf "protocol=https\nhost=github.com\n\n" | GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null | sed -n 's/^password=//p')}
G=${GH:-gh}; [ -x "/c/Program Files/GitHub CLI/gh.exe" ] && G="/c/Program Files/GitHub CLI/gh.exe"
R=$("$G" run list -R nickguigui/gumball-bot -w servidor.yml -s in_progress -L 1 --json databaseId -q '.[0].databaseId')
[ -n "$R" ] && "$G" run cancel "$R" -R nickguigui/gumball-bot
# so dispara se nao houver outro na fila
sleep 5; P=$("$G" run list -R nickguigui/gumball-bot -w servidor.yml -s pending -L 1 --json databaseId -q '.[0].databaseId'); Q=$("$G" run list -R nickguigui/gumball-bot -w servidor.yml -s queued -L 1 --json databaseId -q '.[0].databaseId')
[ -z "$P$Q" ] && "$G" workflow run servidor.yml -R nickguigui/gumball-bot && echo "novo turno disparado"
