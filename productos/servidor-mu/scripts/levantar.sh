#!/usr/bin/env bash
# Levanta el servidor completo (db + server + panel).
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

info "Bajando imágenes (la primera vez tarda: son ~1 GB)..."
"${DC[@]}" pull

info "Levantando..."
"${DC[@]}" up -d

set -a; source .env; set +a
verde ""
verde "Servidor arriba."
verde "  Panel:  http://${PANEL_BIND_ADDR:-127.0.0.1}:${PANEL_PORT:-8080}"
verde "  Cliente: apuntá el connect server a la IP de esta máquina, puerto 44405"
verde ""
info "La PRIMERA vez tenés que entrar al panel y correr el Setup (instala la base"
info "de datos con la config de Season 6). Ver docs/01-instalacion.md paso 4."
info ""
info "Ver logs en vivo:  ./scripts/estado.sh --logs"
