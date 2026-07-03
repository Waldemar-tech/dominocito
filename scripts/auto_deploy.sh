#!/bin/bash
# Dominócito — Auto-deploy watcher
# Vigila pushes a main en GitLab y hace deploy al .3

set -a
source ~/clawd/credentials/gitlab.env
set +a

# Evitar truncación de token con cut
TOKEN=$(grep GITLAB_TOKEN ~/clawd/credentials/gitlab.env | cut -d= -f2 | cut -d'"' -f2)
PROJECT_ID=83990754
LAST_SHA=""

echo "👀 Dominócito Auto-Deploy Watcher"
echo "   Vigila pushes a main → deploy al .3"
echo "   Ctrl+C para detener"
echo ""

while true; do
    # Obtener el SHA del último commit en main
    RESP=$(curl -s -H "PRIVATE-TOKEN: $TOKEN" "https://gitlab.com/api/v4/projects/$PROJECT_ID/repository/commits/main")
    SHA=$(echo "$RESP" | python3 -c "import sys, json; print(json.load(sys.stdin).get('sha',''))" 2>/dev/null)

    if [ -z "$SHA" ]; then
        echo "[$(date +%H:%M:%S)] ❌ No se pudo obtener SHA"
        sleep 30
        continue
    fi

    if [ "$SHA" != "$LAST_SHA" ] && [ -n "$LAST_SHA" ]; then
        echo ""
        echo "[$(date +%H:%M:%S)] 🚀 Nuevo push detectado: ${SHA:0:8}"
        echo "[$(date +%H:%M:%S)] ⏳ Esperando 5s para que terminen los jobs..."
        sleep 5

        # Verificar que test:backend y test:frontend pasaron
        PIPELINE=$(curl -s -H "PRIVATE-TOKEN: $TOKEN" "https://gitlab.com/api/v4/projects/$PROJECT_ID/pipelines?sha=$SHA" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')")
        if [ -z "$PIPELINE" ]; then
            echo "[$(date +%H:%M:%S)] ⚠️  Pipeline no encontrada"
        else
            STATUS=$(curl -s -H "PRIVATE-TOKEN: $TOKEN" "https://gitlab.com/api/v4/projects/$PROJECT_ID/pipelines/$PIPELINE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status',''))")
            if [ "$STATUS" != "success" ]; then
                echo "[$(date +%H:%M:%S)] ⚠️  Pipeline status: $STATUS (no se hace deploy)"
                LAST_SHA=$SHA
                sleep 15
                continue
            fi
        fi

        echo "[$(date +%H:%M:%S)] 📥 Haciendo deploy al .3..."
        /tmp/deploy_to_server.sh && echo "[$(date +%H:%M:%S)] ✅ Deploy OK" || echo "[$(date +%H:%M:%S)] ❌ Deploy falló"
    fi

    LAST_SHA=$SHA
    echo -n "."
    sleep 15
done