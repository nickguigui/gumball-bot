#!/usr/bin/env bash
# Instala o servidor do Gumball numa maquina Ubuntu (Oracle Cloud Always Free).
# Uso (na maquina): curl -fsSL https://raw.githubusercontent.com/nickguigui/gumball-bot/main/scripts/setup-server.sh | sudo bash
set -euo pipefail
APP=/opt/gumball; USER_APP=gumball

echo "==> Pacotes"
apt-get update -qq
apt-get install -y -qq curl git gpg ffmpeg fonts-dejavu fonts-noto-color-emoji ca-certificates iptables-persistent >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 24 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp

echo "==> Codigo"
id -u $USER_APP >/dev/null 2>&1 || useradd -r -m -d $APP -s /usr/sbin/nologin $USER_APP
if [ -d $APP/app/.git ]; then sudo -u $USER_APP git -C $APP/app pull -q; else sudo -u $USER_APP git clone -q https://github.com/nickguigui/gumball-bot.git $APP/app; fi
cd $APP/app && sudo -u $USER_APP npm ci --omit=dev --no-audit --no-fund >/dev/null
[ -f $APP/app/.env ] || cat > $APP/app/.env <<EOF
PORT=8787
DATA_ROOT=$APP/data/tenants
ALLOWED_ORIGINS=https://nickguigui.github.io
MAX_TENANTS=200
BOT_NAME=GUMBALL
OWNER_NAME=Nick
BLOCKED_COMMANDS=face
EOF
chown $USER_APP: $APP/app/.env; mkdir -p $APP/data && chown -R $USER_APP: $APP/data

echo "==> Servico (liga sozinho com a maquina e religa se cair)"
cat > /etc/systemd/system/gumball.service <<EOF
[Unit]
Description=Gumball Bot (servidor multi-numero)
After=network-online.target
Wants=network-online.target
[Service]
User=$USER_APP
WorkingDirectory=$APP/app
ExecStart=/usr/bin/npm run server
Restart=always
RestartSec=5
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable --now gumball

echo "==> HTTPS automatico (Caddy + Let's Encrypt) em ${DOMINIO:=bot.nickguigui.qzz.io}"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
printf '%s {
  reverse_proxy localhost:8787
}
' "$DOMINIO" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy
for port in 80 443; do iptables -C INPUT -p tcp --dport $port -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport $port -j ACCEPT; done
netfilter-persistent save >/dev/null 2>&1 || true

sleep 3; curl -s localhost:8787/api/saude && echo && echo "✅ Gumball no ar."
