# Dominócito — Deploy Guide

## Pre-requisitos en la .3
- Node.js 20+ LTS (https://nodejs.org)
- PM2: `npm i -g pm2`
- Nginx (recomendado): `apt install nginx` o `yum install nginx`

## Estructura esperada en la .3

```
/opt/dominocito/
├── backend/
│   ├── dist/           ← contenido de backend-dist/
│   ├── package.json    ← de backend-package.json
│   ├── .env            ← crear manualmente (ver abajo)
│   └── node_modules/   ← `npm install --production` aquí
└── frontend/
    └── dist/           ← contenido de frontend-dist/
```

## Pasos

### 1. Backend
```bash
# Crear directorio
mkdir -p /opt/dominocito/backend
cd /opt/dominocito/backend

# Copiar dist/ y package.json del deploy-package
cp -r <ruta>/deploy-package/backend-dist/* ./dist/
cp <ruta>/deploy-package/backend-package.json ./package.json

# Instalar deps de producción
npm install --production

# Crear .env con las credenciales de la DB en .2
cat > .env << 'EOF'
DB_HOST=10.101.20.2
DB_PORT=5432
DB_NAME=dominocito
DB_USER=dominocito
DB_PASSWORD=<la_password_que_me_pasaste>
PORT=3200
NODE_ENV=production
EOF

# Correr migraciones (solo la primera vez)
node dist/db/migrate.js

# Iniciar con PM2
pm2 start dist/index.js --name dominocito-api
pm2 save
pm2 startup   # seguir instrucciones para auto-start en boot
```

### 2. Frontend
```bash
mkdir -p /var/www/dominocito-front
cp -r <ruta>/deploy-package/frontend-dist/* /var/www/dominocito-front/
```

### 3. Nginx (1 sola config que proxy ambos)
```nginx
server {
    listen 80;
    server_name 10.101.20.3;  # o tu dominio

    # Frontend estático
    location / {
        root /var/www/dominocito-front;
        try_files $uri /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3200/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar:
```bash
cp <este_archivo> /etc/nginx/sites-available/dominocito
ln -s /etc/nginx/sites-available/dominocito /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Verificación

```bash
# Backend directo
curl http://localhost:3200/health

# Frontend
curl http://localhost/

# API via nginx
curl http://10.101.20.3/api/health

# Logs
pm2 logs dominocito-api
tail -f /var/log/nginx/access.log
```

## Actualizar el front despues (cuando yo cambie BASE_URL)

1. Yo regenero `deploy-package/frontend-dist/`
2. Vos haces: `rm -rf /var/www/dominocito-front/* && cp -r frontend-dist/* /var/www/dominocito-front/`
3. No requiere reiniciar nada (nginx sirve estáticos directo)