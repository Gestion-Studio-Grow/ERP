#!/usr/bin/env bash
# Levanta el servidor completo (db + server + panel).
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

# Guardarraíl del panel: si PANEL_BIND_ADDR no es loopback, esto FRENA salvo que el
# .env tenga PANEL_EXPONER_A_LA_RED=si. Y cuando está expuesto, la línea de abajo
# hace que nginx pida usuario/contraseña antes del panel.
revisar_exposicion_panel
escribir_auth_panel

# A propósito NO hacemos `pull` acá: con OPENMU_TAG=latest, un pull en cada
# levantada te puede cambiar la versión del server sin que lo pidas (por ejemplo
# al reiniciar la máquina). `up -d` baja las imágenes solo si faltan; actualizar
# a conciencia es trabajo de ./scripts/actualizar.sh, que hace backup antes.
info "Levantando (la primera vez baja ~1 GB de imágenes, tarda)..."
"${DC[@]}" up -d

PANEL_ADDR="$(valor_env PANEL_BIND_ADDR 127.0.0.1)"
PANEL_PORT_V="$(valor_env PANEL_PORT 8080)"
verde ""
verde "Servidor arriba."
if [[ "${PANEL_EXPUESTO:-0}" == 1 ]]; then
  verde "  Panel:  http://<la IP de esta máquina>:$PANEL_PORT_V   (escuchando en $PANEL_ADDR)"
else
  verde "  Panel:  http://127.0.0.1:$PANEL_PORT_V"
fi
verde "  Cliente: apuntá el connect server a la IP de esta máquina, puerto 44405"
verde ""
info "La PRIMERA vez tenés que entrar al panel y correr el Setup (instala la base"
info "de datos con la config de Season 6). Ver docs/01-instalacion.md paso 4."
info ""
info "Ver logs en vivo:  ./scripts/estado.sh --logs"
info "Si algo no camina:  ./scripts/diagnostico.sh"

# El aviso va ÚLTIMO a propósito: si lo ponemos antes, queda tapado por el
# "Servidor arriba" en verde y nadie lo lee.
BIND_JUEGO="$(valor_env BIND_ADDR 0.0.0.0)"
if [[ "${PANEL_EXPUESTO:-0}" == 1 ]]; then
  echo
  rojo "RECORDATORIO: el panel de admin está escuchando en $PANEL_ADDR, no solo acá."
  rojo "nginx le puso usuario/contraseña adelante, pero va por HTTP sin cifrar:"
  rojo "en una red que no controlás, esa contraseña viaja en claro."
  info "La opción sin riesgo sigue siendo Tailscale o túnel SSH (docs/04-operacion.md)."
fi
if [[ "$BIND_JUEGO" == "0.0.0.0" || "$BIND_JUEGO" == "::" ]]; then
  echo
  info "Nota: los puertos del juego escuchan en $BIND_JUEGO."
  info "En tu casa eso es tu LAN. En un VPS es internet entera, y Docker publica"
  info "los puertos SALTEÁNDOSE ufw/firewalld. Detalle en docs/04-operacion.md."
fi
