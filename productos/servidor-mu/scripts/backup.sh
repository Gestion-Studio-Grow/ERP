#!/usr/bin/env bash
# Backup de la base (cuentas, personajes, items, config del server).
# Corré esto ANTES de cada actualización y, si hay gente jugando, todos los días.
#
# OJO con lo que estás creando: el dump tiene TODAS las cuentas de tus jugadores
# (con sus hashes de contraseña) y la config entera. Tratalo como un archivo secreto:
# por eso lo escribimos con permisos 600 y la carpeta backups/ en 700.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

DB_USER="$(valor_env DB_ADMIN_USER postgres)"

# umask ANTES de crear nada: sin esto el dump salía 644, o sea legible por cualquier
# otro usuario de la máquina (el escenario "un amigo tiene cuenta en el VPS").
umask 077
mkdir -p backups
chmod 700 backups 2>/dev/null || true

ARCHIVO="backups/openmu-$(date +%Y%m%d-%H%M%S).sql.gz"
# Volcamos a un .parcial y renombramos recién al final: si algo se corta a mitad
# de camino, nunca queda un archivo con nombre de backup bueno que en realidad
# está roto (y que restaurar.sh o vos podrían agarrar confiados).
PARCIAL="$ARCHIVO.parcial"
# INT/TERM/HUP además de EXIT: un Ctrl+C en el medio del dump también tiene que
# limpiar el parcial, no solo una salida ordenada.
trap 'rm -f -- "$PARCIAL"' EXIT INT TERM HUP

info "Volcando la base..."
if ! "${DC[@]}" exec -T database \
    pg_dump -U "$DB_USER" -d openmu --clean --if-exists \
    | gzip > "$PARCIAL"; then
  rojo "pg_dump falló (¿está corriendo la base? probá ./scripts/estado.sh)."
  exit 1
fi

# Tres chequeos baratos que juntos garantizan que esto se puede restaurar:
# el gzip no está truncado, el dump llegó hasta el final, y no está vacío.
if ! gzip -t "$PARCIAL" 2>/dev/null; then
  rojo "El archivo quedó corrupto (gzip truncado). No lo guardo."
  exit 1
fi
# Guardamos la cola en una variable y después buscamos: encadenar
# `gunzip | tail | grep -q` con pipefail puede dar un falso negativo si grep corta
# el pipe antes de tiempo, y un backup bueno reportado como roto es peor que inútil.
COLA="$(gunzip -c "$PARCIAL" | tail -n 20)"
if [[ "$COLA" != *'PostgreSQL database dump complete'* ]]; then
  rojo "El dump no tiene el cierre de pg_dump: salió incompleto. No lo guardo."
  exit 1
fi
TAM=$(wc -c < "$PARCIAL")
if (( TAM < 1024 )); then
  rojo "El backup salió de ${TAM} bytes: está vacío o falló. No lo guardo."
  exit 1
fi

mv -- "$PARCIAL" "$ARCHIVO"
chmod 600 "$ARCHIVO" 2>/dev/null || true
trap - EXIT INT TERM HUP
verde "Backup listo y verificado: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# Retención: dejamos los últimos 14. Sin xargs -r (no existe en macOS/BSD).
(ls -1t backups/openmu-*.sql.gz 2>/dev/null || true) | tail -n +15 \
  | while IFS= read -r viejo; do rm -f -- "$viejo"; done
info "Guardo los últimos 14 backups; los más viejos se borran solos."
info "Copiá backups/ a otro disco: un backup que vive en la misma máquina no es un backup."
info "Y donde lo copies, que no sea una carpeta compartida: adentro están las cuentas."
