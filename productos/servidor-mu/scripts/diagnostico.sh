#!/usr/bin/env bash
# Diagnóstico para cuando algo anda mal: junta todo lo relevante en una salida
# que podés leer o pegar cuando pidas ayuda. NO imprime passwords.
# Corre aunque el .env esté roto o Docker apagado: justo ahí es cuando lo necesitás.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

titulo() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

titulo "Versiones"
docker --version 2>/dev/null || echo "docker: NO INSTALADO"
"${DC[@]}" version 2>/dev/null | head -n 2 || true

titulo "Daemon de Docker"
if docker info >/dev/null 2>&1; then
  echo "Responde."
  HAY_DOCKER=1
else
  echo "NO responde. ¿Está prendido Docker Desktop / el servicio docker?"
  HAY_DOCKER=0
fi

titulo "Archivo .env"
if [[ ! -f .env ]]; then
  echo "FALTA. Arreglalo:  cp .env.example .env  y cambiá los CAMBIAME"
elif grep -q 'CAMBIAME' .env; then
  echo "Existe pero todavía tiene CAMBIAME: los scripts no van a levantar así."
else
  echo "Existe y no tiene CAMBIAME. (No muestro los valores a propósito.)"
fi

if [[ "$HAY_DOCKER" == 1 ]]; then
  titulo "Contenedores"
  "${DC[@]}" ps 2>/dev/null || true

  titulo "Salud (healthchecks)"
  for c in mu-db mu-server mu-panel; do
    printf '%-10s %s\n' "$c" \
      "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo 'no existe')"
  done

  titulo "Últimas 30 líneas de log por servicio"
  for s in database openmu nginx; do
    echo "--- $s ---"
    "${DC[@]}" logs --tail=30 "$s" 2>&1 || true
  done
fi

titulo "Disco"
df -h . 2>/dev/null || true

titulo "Memoria"
# free existe en Linux; en Mac/Git Bash mostramos lo que haya.
free -h 2>/dev/null || vm_stat 2>/dev/null | head -n 5 || echo "(sin datos de memoria en este sistema)"

titulo "Backups"
CANT=$( (ls -1 backups/openmu-*.sql.gz 2>/dev/null || true) | wc -l | tr -d ' ')
echo "Cantidad: $CANT"
if (( CANT > 0 )); then
  echo "Más nuevo: $(ls -1t backups/openmu-*.sql.gz | head -n 1)"
  echo "Si el más nuevo tiene más de un día y hay gente jugando, te falta el cron (docs/04)."
fi

titulo "Fin"
echo "Si vas a pedir ayuda, pegá esta salida completa: no tiene passwords."
