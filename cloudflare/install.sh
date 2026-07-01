#!/bin/bash
# Cloudflare Tunnel Install Script - dominocito
# Ejecutar después de que Alex arregle cert CA

set -e

echo "=== [1/6] Extrayendo cloudflared ==="
cd /tmp
tar xzf cloudflared.tar.gz -C /tmp
chmod +x /tmp/cloudflared
sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
echo "✓ cloudflared instalado en /usr/local/bin"

echo "=== [2/6] Login con token (crea ~/.cloudflared/cert.pem) ==="
TOKEN='eyJhIjoiYjgwMTQ3MDUwYmE3YWQ3YTBkNDA4YzE5NDgxYTRkNGIiLCJ0IjoiNGI5ZTljYzYtYjU1NS00MjlmLTlkOWQtYjYxNWJhOTU5ZTA4IiwicyI6Ik9UYzBZMll3T0RZdE5qZG1OeTAwTW1WakxXRmxaalF0WTJWa05qSmhabVJtTTJRMiJ9'
sudo -u lottopro mkdir -p /home/lottopro/.cloudflared
# El token se usa con service install que crea el JSON automático
cloudflared service install $TOKEN

echo "=== [3/6] Configurando ingress ==="
sudo -u lottopro tee /home/lottopro/.cloudflared/config.yml > /dev/null <<YAML
tunnel: dominocito
credentials-file: /home/lottopro/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: dominocito.com
    service: http://localhost:80
  - hostname: www.dominocito.com
    service: http://localhost:80
  - service: http_status:404
YAML

echo "=== [4/6] Creando CNAMEs en Cloudflare ==="
cloudflared tunnel route dns dominocito dominocito.com
cloudflared tunnel route dns dominocito www
echo "✓ CNAMEs creados (Cloudflare los crea automático)"

echo "=== [5/6] Instalando como systemd service ==="
sudo /usr/local/bin/cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared --no-pager

echo "=== [6/6] Limpiando registros A viejos ==="
# (Solo si tenés Cloudflare API token configurado, lo hago manual desde dashboard)
echo "Ir a https://dash.cloudflare.com -> dominocito.com -> DNS"
echo "Eliminar: A @ 10.101.20.3"
echo "Eliminar: A www 10.101.20.3"
echo ""

echo "=== DONE ==="
echo "Probar:"
echo "  curl https://dominocito.com"
