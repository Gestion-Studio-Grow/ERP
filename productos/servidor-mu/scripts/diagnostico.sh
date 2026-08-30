#!/usr/bin/env bash
# Diagnóstico para cuando algo anda mal: junta todo lo relevante en una salida
# que podés leer o pegar cuando pidas ayuda.
# Corre aunque el .env esté roto o Docker apagado: justo ahí es cuando lo necesitás.
#
# Todo lo que imprime pasa por un filtro que TACHA los passwords del .env antes de
# mostrarlos. Hace falta: cuando OpenMU no puede conectarse a la base, .NET suele
# escupir la cadena de conexión completa en el log — con el password adentro. Sin el
# filtro, el propio script te invitaba a pegar eso en un foro.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"

titulo() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

reporte() {
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
  elif grep -qE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CAMBIAME' .env; then
    echo "Existe pero todavía tiene CAMBIAME: los scripts no van a levantar así."
  else
    echo "Existe y no tiene CAMBIAME. (No muestro los valores a propósito.)"
    echo "Permisos: $(ls -l .env 2>/dev/null | cut -d' ' -f1) (querés -rw------- en Linux/Mac)"
  fi

  # Lo más importante de todo el diagnóstico: qué está escuchando y para quién.
  titulo "Exposición de red (lo que más importa)"
  local paddr pport baddr
  paddr="$(valor_env PANEL_BIND_ADDR 127.0.0.1)"
  pport="$(valor_env PANEL_PORT 8080)"
  baddr="$(valor_env BIND_ADDR 0.0.0.0)"
  if es_loopback "$paddr"; then
    echo "Panel de admin: $paddr:$pport — solo esta máquina. BIEN."
  else
    echo "Panel de admin: $paddr:$pport — EXPUESTO fuera de esta máquina."
    if [[ -s nginx/auth/.htpasswd ]]; then
      echo "  nginx le pide usuario/contraseña adelante (auth_basic activo)."
    else
      echo "  Y NO hay auth_basic en nginx: cualquiera que llegue al puerto ve el panel."
      echo "  Corré ./scripts/levantar.sh para que lo regenere, o volvelo a 127.0.0.1."
    fi
    echo "  Va por HTTP sin cifrar: la contraseña viaja en claro."
  fi
  echo "Puertos del juego: $baddr (en un VPS, 0.0.0.0 = internet entera)"
  echo "Recordá: Docker publica puertos por debajo de ufw/firewalld — ver docs/04."

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
  local cant
  cant=$( (ls -1 backups/openmu-*.sql.gz 2>/dev/null || true) | wc -l | tr -d ' ')
  echo "Cantidad: $cant"
  if (( cant > 0 )); then
    # El `|| true` no es adorno: con pipefail, head cerrando el pipe le manda SIGPIPE
    # a ls y el subshell del reporte se cortaba justo antes del final.
    echo "Más nuevo: $( (ls -1t backups/openmu-*.sql.gz | head -n 1) 2>/dev/null || true)"
    echo "Si el más nuevo tiene más de un día y hay gente jugando, te falta el cron (docs/04)."
  fi

  titulo "Fin"
  echo "Los passwords del .env salen tachados como «TACHADO:...»."
  echo "Aun así, leé la salida antes de pegarla en un foro: si tenías un password"
  echo "viejo en un log, este filtro no lo conoce y no lo puede tachar."
}

# Todo (stdout Y stderr) pasa por el filtro antes de llegar a la pantalla.
SALIDA="$(reporte 2>&1 || true)"
redactar "$SALIDA"
