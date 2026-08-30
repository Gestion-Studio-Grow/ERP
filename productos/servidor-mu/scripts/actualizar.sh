#!/usr/bin/env bash
# Actualiza la imagen de OpenMU. Hace backup primero, siempre.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

info "Backup previo (si esto falla, no actualizo nada)..."
"$RAIZ/scripts/backup.sh"

info "Bajando la imagen nueva..."
"${DC[@]}" pull

info "Recreando contenedores..."
"${DC[@]}" up -d

verde "Actualizado. Mirá los logs por si la versión nueva pide migrar la base:"
info  "  ./scripts/estado.sh --logs"
