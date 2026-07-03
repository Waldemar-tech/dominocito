# Dominócito — Deploy en Producción (Servidor 10.101.20.3)

**Fecha:** 2026-07-01  
**Tunnel Cloudflare:** `dominocito-prod` (ID: `4b9e9cc6-b555-429f-9d9d-b615ba959e08`)  
**Dominio:** `dominocito.com` + `www.dominocito.com`  
**Stack:** Backend Node.js + Frontend estático + nginx + Cloudflare Tunnel

---

## 📋 Pre-requisitos en la .3

```bash
# Conectarse a la .3
ssh usuario@10.101.20.3
# (o vía VPN si es necesario)

# Verificar versiones
node --version    # debe ser v20+ LTS
nginx --version   # debe estar instalado
pm2 --version     # debe estar instalado
```

Si falta algo:
```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# nginx
sudo apt install -y nginx

# PM2
sudo npm install -g pm2
```

---

## 🚀 Pasos de Deploy

### 1. Crear estructura de directorios

```bash
sudo mkdir -p /opt/dominocito/backend
sudo mkdir -p /var/www/dominocito-front
sudo mkdir -p /etc/cloudflared
sudo chown -R $USER:$USER /opt/dominocito /var/www/dominocito-front
```

### 2. Subir el paquete desde tu Mac mini

En tu Mac mini (NO en la .3):
```bash
scp /tmp/dominocito-prod-deploy-20260701_162058.tar.gz usuario@10.101.20.3:/tmp/
```

En la .3:
```bash
cd /opt/dominocito
tar -xzf /tmp/dominocito-prod-deploy-20260701_162058.tar.gz
```

### 3. Instalar backend

```bash
cd /opt/dominocito/backend

# Copiar dist compilado
cp -r ../backend-dist/* ./dist/ 2>/dev/null || (mkdir -p dist && cp -r ../backend-dist/* dist/)

# Copiar .env de producción
cp ../production/.env.production ./.env
chmod 600 .env

# Instalar dependencias de producción
npm install --production

# (Solo primera vez) Correr migraciones
node dist/db/migrate.js

# Probar que arranca
node dist/index.js
# Debería ver "Server listening on port 3200"
# Ctrl+C para detener
```

### 4. Instalar y configurar nginx

```bash
# Copiar configuración
sudo cp /opt/dominocito/server-setup/nginx.conf /etc/nginx/sites-available/dominocito

# Activar sitio
sudo ln -sf /etc/nginx/sites-available/dominocito /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default  # desactivar default

# Validar configuración
sudo nginx -t

# Recargar nginx
sudo systemctl reload nginx
```

### 5. Copiar frontend estático

```bash
sudo cp -r /opt/dominocito/frontend-dist/* /var/www/dominocito-front/
sudo chown -R www-data:www-data /var/www/dominocito-front
```

### 6. Instalar cloudflared

```bash
# Descargar cloudflared (Linux amd64)
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb

# Verificar instalación
cloudflared --version
```

### 7. Configurar tunnel de Cloudflare

```bash
# Copiar config del tunnel
sudo cp /opt/dominocito/server-setup/cloudflared-config.yml /etc/cloudflared/config.yml

# Copiar credenciales del tunnel (token JWT)
# ⚠️ IMPORTANTE: el archivo dominocito-prod.json contiene el token secreto
sudo cp /opt/dominocito/server-setup/dominocito-prod.json /etc/cloudflared/dominocito-prod.json
sudo chmod 600 /etc/cloudflared/dominocito-prod.json
```

**⚠️ Si el archivo `dominocito-prod.json` no está en el paquete, créalo manualmente en la .3 con este contenido:**

```json
{
  "AccountTag": "b80147050ba7ad7a0d408c19481a4d4b",
  "TunnelSecret": "eyJhIjoiYjgwMTQ3MDUwYmE3YWQ3YTBkNDA4YzE5NDgxYTRkNGIiLCJ0IjoiNGI5ZTljYzYtYjU1NS00MjlmLTlkOWQtYjYxNWJhOTU5ZTA4IiwicyI6Ik9UYzBZMll3T0RZdE5qZG1OeTAwTW1WakxXRmxaalF0WTJWa05qSmhabVJtTTJRMiJ9",
  "TunnelID": "4b9e9cc6-b555-429f-9d9d-b615ba959e08"
}
```

### 8. Instalar cloudflared como servicio systemd

```bash
sudo cp /opt/dominocito/server-setup/cloudflared.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

### 9. Iniciar backend con PM2

```bash
cd /opt/dominocito/backend

# Iniciar backend
pm2 start dist/index.js --name dominocito-api

# Configurar auto-start en boot
pm2 startup
# (ejecutar el comando que PM2 muestra)

pm2 save

# Verificar que está corriendo
pm2 status
pm2 logs dominocito-api --lines 50
```

### 10. Verificar todo

```bash
# Backend responde directamente
curl http://localhost:3200/health

# nginx sirve el frontend
curl http://localhost/

# nginx proxy al backend
curl http://localhost/api/health

# Tunnel está conectado
sudo systemctl status cloudflared
sudo journalctl -u cloudflared --lines 30
```

**Desde tu Mac mini (probando acceso externo):**

```bash
# Debe responder con el HTML del frontend
curl https://dominocito.com

# Debe responder con JSON del health check
curl https://dominocito.com/api/health
```

---

## 🔧 Troubleshooting

### Backend no arranca
```bash
cd /opt/dominocito/backend
pm2 logs dominocito-api
# Verificar que el .env tiene DB_PASSWORD correcto
# Verificar conectividad a DB: nc -zv 10.101.20.2 5432
```

### Nginx da 502 Bad Gateway
```bash
# Verificar que el backend está corriendo
pm2 status
curl http://localhost:3200/health

# Ver logs de nginx
sudo tail -f /var/log/nginx/dominocito.error.log
```

### Tunnel no conecta
```bash
sudo journalctl -u cloudflared -f
# Verificar que /etc/cloudflared/dominocito-prod.json tiene el TunnelSecret correcto
# Verificar que /etc/cloudflared/config.yml tiene el TunnelID correcto
```

### DNS no resuelve
```bash
# Verificar desde tu Mac
dig dominocito.com
nslookup dominocito.com
# Debe apuntar a un IP de Cloudflare (no 10.101.20.3)
```

---

## 📊 Resumen de Servicios

| Servicio | Puerto | Comando | Auto-restart |
|----------|--------|---------|--------------|
| nginx | 80 | `sudo systemctl status nginx` | systemd |
| cloudflared | - | `sudo systemctl status cloudflared` | systemd |
| dominocito-api | 3200 | `pm2 status` | pm2 + systemd (con startup) |

---

## 🔐 Secrets de Producción (NO COMMITEAR)

Los siguientes secrets están en `/opt/dominocito/backend/.env`:

- `JWT_SECRET` — firma de access tokens
- `ENCRYPTION_KEY` — cifrado AES-256-GCM de emails y transacciones
- `SERVICE_TOKEN` — auth entre servicios internos
- `ADMIN_API_KEY` — header `X-Admin-Key` para endpoints admin
- `DB_PASSWORD` — password de PostgreSQL

**⚠️ CRÍTICO:** Si pierdes `ENCRYPTION_KEY`, los datos cifrados en `dc_users.email` y `dc_wallet_transactions.descripcion` son irrecuperables. Hacer backup cifrado de este archivo.

---

**Última actualización:** 2026-07-01 16:20 EDT
