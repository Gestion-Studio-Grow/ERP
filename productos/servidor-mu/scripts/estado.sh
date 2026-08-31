#!/usr/bin/env bash
# Estado de los contenedores. Con --logs, sigue los logs en vivo.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker

"${DC[@]}" ps
if [[ "${1:-}" == "--logs" ]]; then
  echo
  info "Logs en vivo (Ctrl+C para salir):"
  "${DC[@]}" logs -f --tail=100
fi
