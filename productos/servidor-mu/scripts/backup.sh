#!/usr/bin/env bash
# Backup de la base (cuentas, personajes, items, config del server).
# Corré esto ANTES de cada actualización y, si hay gente jugando, todos los días.
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env
set -a; source .env; set +a

mkdir -p backups
ARCHIVO="backups/openmu-$(date +%Y%m%d-%H%M%S).sql.gz"

info "Volcando la base..."
"${DC[@]}" exec -T database \
  pg_dump -U "${DB_ADMIN_USER:-postgres}" -d openmu --clean --if-exists \
  | gzip > "$ARCHIVO"

# Un dump vacío pesa poco: si salió chico, algo falló y mejor enterarse ahora.
TAM=$(wc -c < "$ARCHIVO")
if (( TAM < 1024 )); then
  rojo "El backup salió de ${TAM} bytes: está vacío o falló. Lo borro."
  rm -f "$ARCHIVO"
  exit 1
fi

verde "Backup listo: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

# Retención: dejamos los últimos 14.
ls -1t backups/openmu-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --
info "Guardo los últimos 14 backups; los más viejos se borran solos."
info "Copiá backups/ a otro disco: un backup que vive en la misma máquina no es un backup."
