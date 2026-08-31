#!/usr/bin/env bash
# Base compartida por todos los scripts: ubica el proyecto y valida el entorno.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

rojo()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m%s\033[0m\n' "$*"; }

# docker compose (v2) o docker-compose (v1), lo que haya.
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  rojo "No encuentro docker compose. Instalá Docker Desktop o el plugin compose."
  exit 1
fi

exigir_docker() {
  if ! docker info >/dev/null 2>&1; then
    rojo "El daemon de Docker no responde. ¿Está prendido Docker?"
    exit 1
  fi
}

# Lee UNA variable del .env sin ejecutarlo. No usamos `source .env` a propósito:
# un password con espacios, '#' o '$' rompería el source (o peor, ejecutaría cosas).
# Uso:  valor_env NOMBRE [default]
valor_env() {
  local linea v
  linea="$(grep -E "^${1}=" .env 2>/dev/null | tail -n 1 || true)"
  if [[ -z "$linea" ]]; then
    printf '%s' "${2-}"
    return
  fi
  v="${linea#*=}"
  v="${v%$'\r'}"            # .env editado en Windows trae \r al final de cada línea
  v="${v#\"}"; v="${v%\"}"  # comillas dobles envolventes, si el usuario las puso
  printf '%s' "$v"
}

exigir_env() {
  if [[ ! -f .env ]]; then
    rojo "Falta el archivo .env"
    info  "Arreglalo así:  cp .env.example .env  y cambiá los CAMBIAME"
    exit 1
  fi
  # PRIMERO los permisos, ANTES de cualquier validación que pueda cortar el script:
  # si esto quedaba al final, un .env con un password inválido salía por `exit 1` y el
  # archivo con los secretos se quedaba en 644 (legible por todos) para siempre.
  # En Git Bash/Windows esto no hace nada, y no pasa nada.
  chmod 600 .env 2>/dev/null || true

  if grep -qE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[^#]*CAMBIAME' .env; then
    rojo "El .env todavía tiene passwords de ejemplo (CAMBIAME)."
    info  "Cambialos antes de levantar el server. No lo hago por vos a propósito."
    exit 1
  fi
  # Caracteres que rompen el parseo del .env (docker compose y estos scripts):
  # mejor frenar acá con un mensaje claro que debuggear un login que falla a las 2 AM.
  local var v
  for var in DB_ADMIN_PW OPENMU_ADMIN_PASSWORD; do
    v="$(valor_env "$var")"
    case "$v" in
      *[\ \#\$\"\']*|*\\*)
        rojo "El valor de $var tiene espacios, #, \$, comillas o barras."
        info  "Usá un password largo solo con letras, números, - y _ (largo > raro)."
        exit 1
        ;;
    esac
  done
  # Los NOMBRES de usuario también se validan: DB_ADMIN_USER termina adentro del
  # healthcheck de Postgres (que corre en un shell), y OPENMU_ADMIN_USER en el archivo
  # de usuarios de nginx (donde ':' es el separador). Basura acá = comportamiento raro.
  for var in DB_ADMIN_USER OPENMU_ADMIN_USER; do
    v="$(valor_env "$var")"
    case "$v" in
      "") : ;;
      *[\ \#\$\"\'\:\;\&\|]*|*\\*)
        rojo "El valor de $var tiene caracteres que no puedo usar (espacios, : ; & | # \$ comillas o barras)."
        info  "Usá solo letras, números, - y _."
        exit 1
        ;;
    esac
  done
}

# ── Exposición del panel ─────────────────────────────────────────────────────
# El panel de admin controla el servidor ENTERO: rates, cuentas, GMs, y la base.
# Que quede escuchando fuera de esta máquina es la forma más fácil de regalarlo.

es_loopback() {
  case "$1" in
    127.*|localhost|::1|'[::1]') return 0 ;;
    *) return 1 ;;
  esac
}

# Define PANEL_EXPUESTO (0/1). Si el panel NO está en loopback, EXIGE un opt-in
# explícito en el .env. Antes esto solo imprimía un cartel rojo y seguía de largo:
# el cartel quedaba tapado por el "Servidor arriba" en verde de dos líneas más abajo,
# y `restart: unless-stopped` reaplicaba la exposición en cada reboot sin avisar nunca más.
revisar_exposicion_panel() {
  local addr ok
  addr="$(valor_env PANEL_BIND_ADDR 127.0.0.1)"
  if es_loopback "$addr"; then
    PANEL_EXPUESTO=0
    return 0
  fi
  PANEL_EXPUESTO=1
  ok="$(valor_env PANEL_EXPONER_A_LA_RED)"
  if [[ "$ok" != "si" ]]; then
    rojo "FRENO: PANEL_BIND_ADDR=$addr — el panel de admin NO quedaría solo en esta máquina."
    rojo "El panel controla el servidor entero (cuentas, GMs, config y la base)."
    if [[ "$addr" == "0.0.0.0" || "$addr" == "::" || "$addr" == "[::]" ]]; then
      rojo "Y 0.0.0.0 no es 'mi red': en un VPS son TODAS las IPs, o sea internet."
    fi
    info ""
    info "Lo que casi seguro querés (cero exposición):"
    info "  - Tailscale: dejá PANEL_BIND_ADDR=127.0.0.1 y entrá por la IP 100.x de la VPN"
    info "  - Túnel SSH: ssh -L 8080:127.0.0.1:8080 usuario@ip-del-servidor"
    info "  Los dos están en docs/04-operacion.md."
    info ""
    info "Si igual sabés lo que hacés, agregá esta línea al .env y volvé a intentar:"
    info "  PANEL_EXPONER_A_LA_RED=si"
    info "Al hacerlo, nginx pasa a pedir usuario y contraseña ANTES del panel."
    exit 1
  fi
  return 0
}

# Escribe la config de auth de nginx según PANEL_EXPUESTO. Se llama SIEMPRE antes de
# levantar, así el estado del archivo nunca queda desincronizado del .env.
escribir_auth_panel() {
  local dir="$RAIZ/nginx/auth" usuario pw hash
  mkdir -p "$dir"

  if [[ "${PANEL_EXPUESTO:-0}" != 1 ]]; then
    rm -f -- "$dir/.htpasswd"
    cat > "$dir/auth.conf" <<'EOF'
# Generado por ./scripts/levantar.sh — NO lo edites a mano, se pisa en cada levantada.
# Panel en loopback: el único que llega es quien ya está sentado en esta máquina,
# así que no agregamos una segunda contraseña que no aporta nada.
EOF
    return 0
  fi

  usuario="$(valor_env OPENMU_ADMIN_USER)"
  pw="$(valor_env OPENMU_ADMIN_PASSWORD)"
  if [[ -z "$usuario" || -z "$pw" ]]; then
    rojo "Para exponer el panel necesito OPENMU_ADMIN_USER y OPENMU_ADMIN_PASSWORD en el .env."
    exit 1
  fi
  if ! hash="$(sha1_base64 "$pw")" || [[ -z "$hash" ]]; then
    rojo "No encuentro openssl ni python3 para armar la contraseña de nginx."
    rojo "Sin eso no expongo el panel a la red. Volvé PANEL_BIND_ADDR a 127.0.0.1"
    info "y entrá por Tailscale o por túnel SSH (docs/04-operacion.md)."
    exit 1
  fi
  # 644 a propósito: el worker de nginx corre como otro usuario adentro del contenedor
  # y tiene que poder leerlo. Por eso guardamos un hash y no la contraseña en claro.
  printf '%s:{SHA}%s\n' "$usuario" "$hash" > "$dir/.htpasswd"
  chmod 644 "$dir/.htpasswd" 2>/dev/null || true
  cat > "$dir/auth.conf" <<'EOF'
# Generado por ./scripts/levantar.sh — NO lo edites a mano, se pisa en cada levantada.
# El panel está expuesto fuera de esta máquina: nginx pide usuario y contraseña ANTES
# de dejar pasar el request al panel. Es una capa independiente del login de OpenMU:
# aunque el panel arrancara sin login (primer arranque, antes del Setup), esto frena.
auth_basic           "Panel del servidor MU";
auth_basic_user_file /etc/nginx/auth/.htpasswd;
EOF
  return 0
}

# SHA-1 en base64, el formato {SHA} que entiende nginx. La contraseña va por stdin
# (printf es builtin de bash): nunca aparece en la lista de procesos.
sha1_base64() {
  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "$1" | openssl sha1 -binary | openssl base64
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$1" | python3 -c \
      'import sys,hashlib,base64;print(base64.b64encode(hashlib.sha1(sys.stdin.buffer.read()).digest()).decode())'
  else
    return 1
  fi
}

# Tacha de un texto los valores secretos del .env. Se usa antes de mostrar cualquier
# cosa que el usuario vaya a pegar en un foro/Discord. Reemplazo con expansión de bash,
# no con sed: así no importa qué caracteres raros tenga el password.
redactar() {
  local texto="$1" var v
  # Solo las CONTRASENAS: tachar el usuario ("postgres") destrozaria medio log
  # (aparece en el nombre de la imagen, en cada mensaje de pg) sin proteger nada.
  for var in DB_ADMIN_PW OPENMU_ADMIN_PASSWORD; do
    v="$(valor_env "$var")"
    # Ignoramos valores muy cortos o vacíos: tachar "a" tachearía medio texto.
    [[ ${#v} -ge 4 ]] || continue
    texto="${texto//"$v"/«TACHADO:$var»}"
  done
  printf '%s\n' "$texto"
}
