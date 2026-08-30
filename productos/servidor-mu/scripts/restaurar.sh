#!/usr/bin/env bash
# Restaura un backup. PISA la base actual: lo que haya ahora se pierde.
#   ./scripts/restaurar.sh backups/openmu-20260830-120000.sql.gz
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env

DB_USER="$(valor_env DB_ADMIN_USER postgres)"

ARCHIVO="${1:-}"
if [[ -z "$ARCHIVO" || ! -f "$ARCHIVO" ]]; then
  rojo "Pasame un backup existente."
  info  "Uso:  ./scripts/restaurar.sh backups/openmu-AAAAMMDD-HHMMSS.sql.gz"
  info  "Disponibles:"
  ls -1t backups/openmu-*.sql.gz 2>/dev/null || echo "  (ninguno)"
  exit 1
fi

# Verificar el archivo ANTES de tocar la base: si el gzip está roto, mejor
# enterarse ahora y no con la base ya pisada a la mitad.
if ! gzip -t "$ARCHIVO" 2>/dev/null; then
  rojo "$ARCHIVO está corrupto (gzip truncado). No toco la base."
  exit 1
fi

rojo "Esto PISA la base actual con $ARCHIVO. Se pierde todo lo que haya ahora."
read -r -p "Escribí 'si' para seguir: " ok || ok=""
[[ "$ok" == "si" || "$ok" == "sí" ]] || { info "Cancelado."; exit 0; }

info "Parando el server para que nadie escriba mientras restauro..."
"${DC[@]}" stop openmu

if ! gunzip -c "$ARCHIVO" | "${DC[@]}" exec -T database \
    psql -q -U "$DB_USER" -d openmu -v ON_ERROR_STOP=1 >/dev/null; then
  rojo "La restauración FALLÓ a mitad de camino: la base puede haber quedado inconsistente."
  rojo "Dejo el server APAGADO a propósito. Probá restaurar otro backup de backups/."
  info "Cuando lo resuelvas:  ${DC[*]} start openmu"
  exit 1
fi

info "Levantando el server..."
"${DC[@]}" start openmu
verde "Restaurado desde $ARCHIVO"
