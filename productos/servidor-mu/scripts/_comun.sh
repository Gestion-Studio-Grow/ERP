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
}
