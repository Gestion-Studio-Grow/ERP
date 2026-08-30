#!/usr/bin/env bash
# Base compartida por todos los scripts: ubica el proyecto y valida el entorno.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

rojo()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m%s\033[0m\n' "$*"; }

# docker compose (v2) o docker-compose (v1), lo que haya.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  rojo "No encuentro docker compose. Instalá Docker Desktop o el plugin compose."
  exit 1
fi

exigir_docker() {
  if ! docker info >/dev/null 2>&1; then
    rojo "El daemon de Docker no responde. ¿Está prendido Docker?"
    exit 1
  fi
}

# Lee UNA variable del .env sin ejecutarlo. No usamos `source .env` a propósito:
# un password con espacios, '#' o '$' rompería el source (o peor, ejecutaría cosas).
# Uso:  valor_env NOMBRE [default]
valor_env() {
  local linea v
  linea="$(grep -E "^${1}=" .env 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$linea" ]]; then
    printf '%s' "${2-}"
    return
  fi
  v="${linea#*=}"
  v="${v%$'\r'}"            # .env editado en Windows trae \r al final de cada línea
  v="${v#\"}"; v="${v%\"}"  # comillas dobles envolventes, si el usuario las puso
  printf '%s' "$v"
}

exigir_env() {
  if [[ ! -f .env ]]; then
    rojo "Falta el archivo .env"
    info  "Arreglalo así:  cp .env.example .env  y cambiá los CAMBIAME"
    exit 1
  fi
  if grep -q 'CAMBIAME' .env; then
    rojo "El .env todavía tiene passwords de ejemplo (CAMBIAME)."
    info  "Cambialos antes de levantar el server. No lo hago por vos a propósito."
    exit 1
  fi
  # Caracteres que rompen el parseo del .env (docker compose y estos scripts):
  # mejor frenar acá con un mensaje claro que debuggear un login que falla a las 2 AM.
  local var v
  for var in DB_ADMIN_PW OPENMU_ADMIN_PASSWORD; do
    v="$(valor_env "$var")"
    case "$v" in
      *[\ \#\$\"\']*|*\\*)
        rojo "El valor de $var tiene espacios, #, \$, comillas o barras."
        info  "Usá un password largo solo con letras, números, - y _ (largo > raro)."
        exit 1
        ;;
    esac
  done
  # El .env tiene los passwords del server: que no lo lea cualquier usuario de la
  # máquina. En Git Bash/Windows esto no hace nada, y no pasa nada.
  chmod 600 .env 2>/dev/null || true
}
