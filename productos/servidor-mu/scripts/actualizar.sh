#!/usr/bin/env bash
# Actualiza la imagen de OpenMU. Hace backup primero, siempre.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

# Este script también hace `up -d`, así que también recrea la publicación de puertos:
# sin esto, alguien podía cambiar PANEL_BIND_ADDR y exponer el panel esquivando el
# guardarraíl de levantar.sh. Y regenera el auth de nginx para que no quede desfasado.
revisar_exposicion_panel
escribir_auth_panel

info "Backup previo (si esto falla, no actualizo nada)..."
"$RAIZ/scripts/backup.sh"

info "Bajando la imagen nueva..."
"${DC[@]}" pull

info "Recreando contenedores..."
"${DC[@]}" up -d

verde "Actualizado. Mirá los logs por si la versión nueva pide migrar la base:"
info  "  ./scripts/estado.sh --logs"
