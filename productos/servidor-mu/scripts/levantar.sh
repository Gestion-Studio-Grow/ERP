#!/usr/bin/env bash
# Levanta el servidor completo (db + server + panel).
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

# Guardarraíl: el panel de admin en algo que no sea loopback es la forma más
# fácil de regalar el server entero. Avisamos fuerte, pero no bloqueamos:
# atarlo a una IP de Tailscale (100.x) es un uso legítimo.
PANEL_ADDR="$(valor_env PANEL_BIND_ADDR 127.0.0.1)"
if [[ "$PANEL_ADDR" != 127.* ]]; then
  rojo "OJO: PANEL_BIND_ADDR=$PANEL_ADDR — el panel de admin NO está solo en esta máquina."
  if [[ "$PANEL_ADDR" == "0.0.0.0" ]]; then
    rojo "0.0.0.0 lo expone a toda tu red (y a internet si hay port forwarding)."
    info "Para entrar desde afuera usá Tailscale o túnel SSH: docs/04-operacion.md."
  fi
fi

# A propósito NO hacemos `pull` acá: con OPENMU_TAG=latest, un pull en cada
# levantada te puede cambiar la versión del server sin que lo pidas (por ejemplo
# al reiniciar la máquina). `up -d` baja las imágenes solo si faltan; actualizar
# a conciencia es trabajo de ./scripts/actualizar.sh, que hace backup antes.
info "Levantando (la primera vez baja ~1 GB de imágenes, tarda)..."
"${DC[@]}" up -d

PANEL="http://$(valor_env PANEL_BIND_ADDR 127.0.0.1):$(valor_env PANEL_PORT 8080)"
verde ""
verde "Servidor arriba."
verde "  Panel:  $PANEL"
verde "  Cliente: apuntá el connect server a la IP de esta máquina, puerto 44405"
verde ""
info "La PRIMERA vez tenés que entrar al panel y correr el Setup (instala la base"
info "de datos con la config de Season 6). Ver docs/01-instalacion.md paso 4."
info ""
info "Ver logs en vivo:  ./scripts/estado.sh --logs"
info "Si algo no camina:  ./scripts/diagnostico.sh"
