#!/usr/bin/env bash
# Apaga el servidor. Los datos (cuentas, personajes) quedan en los volúmenes.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
"${DC[@]}" down
verde "Servidor apagado. Los datos siguen en los volúmenes de Docker."
info  "Para borrar TAMBIÉN los datos:  docker compose down -v   (no hay vuelta atrás)"
