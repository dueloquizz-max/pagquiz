#!/bin/bash
# PagQUIZ — lance le serveur + un lien public gratuit (tunnel Cloudflare).
# Aucun compte requis. Ferme avec Ctrl+C.

set -e
cd "$(dirname "$0")"

PORT=${PORT:-3000}
# Jeton animateur fixe (change-le si tu veux) :
export HOST_TOKEN=${HOST_TOKEN:-$(node -e "console.log(require('crypto').randomBytes(3).toString('hex'))")}

echo ""
echo "===================================================="
echo "  PagQUIZ  ⚽   — démarrage"
echo "===================================================="
echo "  Jeton animateur : $HOST_TOKEN"
echo "  (à taper sur l'écran animateur)"
echo "===================================================="
echo ""

# Démarre le serveur en arrière-plan
node server.js &
SERVER_PID=$!

# Nettoyage à la sortie
cleanup() {
  echo ""
  echo "Arrêt de PagQUIZ…"
  kill $SERVER_PID 2>/dev/null || true
  kill $TUNNEL_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

sleep 1

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "⚠️  cloudflared n'est pas installé — pas de lien public."
  echo "    Installe-le avec :  brew install cloudflared"
  echo ""
  echo "    En attendant, sur le MÊME wifi, les joueurs peuvent utiliser :"
  IP=$(ipconfig getifaddr en0 2>/dev/null || echo "TON-IP-LOCALE")
  echo "      Joueurs   : http://$IP:$PORT/"
  echo "      Animateur : http://$IP:$PORT/host"
  wait $SERVER_PID
  exit 0
fi

echo "Création du lien public (patiente ~5s)…"
echo ""

# Lance le tunnel et affiche l'URL publique
cloudflared tunnel --protocol http2 --url "http://localhost:$PORT" 2>&1 | while read -r line; do
  echo "$line"
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com")
    if [ -n "$URL" ]; then
      echo ""
      echo "===================================================="
      echo "  ✅  C'EST EN LIGNE !"
      echo "===================================================="
      echo "  👉 Lien JOUEURS (à partager) : $URL/"
      echo "  🎛️  Lien ANIMATEUR (toi)      : $URL/host"
      echo "  🔑 Jeton animateur           : $HOST_TOKEN"
      echo "===================================================="
      echo ""
    fi
  fi
done &
TUNNEL_PID=$!

wait $SERVER_PID
