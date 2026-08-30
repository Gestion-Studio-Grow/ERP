#!/usr/bin/env bash
# Restaura un backup. PISA la base actual: lo que haya ahora se pierde.
#   ./scripts/restaurar.sh backups/openmu-20260830-120000.sql.gz
source "$(dirname "${BASH_SOURCE[0]}")/_comun.sh"
exigir_docker
exigir_env
set -a; source .env; set +a

ARCHIVO="${1:-}"
if [[ -z "$ARCHIVO" || ! -f "$ARCHIVO" ]]; then
  rojo "Pasame un backup existente."
  info  "Uso:  ./scripts/restaurar.sh backups/openmu-AAAAMMDD-HHMMSS.sql.gz"
  info  "Disponibles:"
  ls -1t backups/openmu-*.sql.gz 2>/dev/null || echo "  (ninguno)"
  exit 1
fi

rojo "Esto PISA la base actual con $ARCHIVO. Se pierde todo lo que haya ahora."
read -r -p "Escribí 'si' para seguir: " ok
[[ "$ok" == "si" ]] || { info "Cancelado."; exit 0; }

info "Parando el server para que nadie escriba mientras restauro..."
"${DC[@]}" stop openmu

gunzip -c "$ARCHIVO" | "${DC[@]}" exec -T database \
  psql -U "${DB_ADMIN_USER:-postgres}" -d openmu -v ON_ERROR_STOP=1

info "Levantando el server..."
"${DC[@]}" start openmu
verde "Restaurado desde $ARCHIVO"
