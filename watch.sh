#!/bin/bash
# Monitor Dominócito — verifica que backend y frontend estén corriendo
# Si están caídos, los reinicia. NO toca el código (eso lo hace com.dominocito.autodeploy)

BACKEND_DIR=~/clawd-dev/dominocito/backend
FRONTEND_DIR=~/clawd-dev/dominocito/pinta-y-gana
LOG=~/clawd-dev/dominocito/watch.log

echo "[$(date)] Monitor iniciado" >> $LOG

while true; do
  # Backend 3200
  if ! curl -s --max-time 2 http://localhost:3200/health > /dev/null 2>&1; then
    echo "[$(date)] Backend caído — reiniciando..." >> $LOG
    pkill -f "ts-node-dev.*dominocito" 2>/dev/null
    pkill -f "node.*backend/src/index" 2>/dev/null

    # Preferir LaunchAgent si existe, sino manual
    if launchctl list 2>/dev/null | grep -q "com.dominocito.backend"; then
      launchctl kickstart -k "gui/$(id -u)/com.dominocito.backend" >> $LOG 2>&1
    else
      cd $BACKEND_DIR && npm run dev >> ~/clawd-dev/dominocito/backend.log 2>&1 &
      sleep 5
    fi
  fi

  # Frontend 5173
  if ! curl -s --max-time 2 http://localhost:5173 > /dev/null 2>&1; then
    echo "[$(date)] Frontend caído — reiniciando..." >> $LOG
    pkill -f "vite.*pinta-y-gana" 2>/dev/null

    if launchctl list 2>/dev/null | grep -q "com.dominocito.frontend"; then
      launchctl kickstart -k "gui/$(id -u)/com.dominocito.frontend" >> $LOG 2>&1
    else
      cd $FRONTEND_DIR && npm run dev >> ~/clawd-dev/dominocito/frontend.log 2>&1 &
      sleep 5
    fi
  fi

  sleep 30
done