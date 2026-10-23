#!/usr/bin/env bash
# ============================================================================
# Prepara una sesión de Claude Code EN LA NUBE para correr tandas (tsc, tests y el arnés Postgres).
# Idempotente: lo ya hecho se saltea. Cero tokens: el orquestador no arma el entorno a mano
# (magra 2b, 23/10/2026: 12 llamadas del orquestador, ~1 M de tokens, sólo en esto).
#
#   bash .claude/scripts/preparar-nube.sh                         # el repo: Postgres + dependencias + Prisma
#   bash .claude/scripts/preparar-nube.sh --worktree <ruta> <rama> <base>   # además, el worktree de la tanda
#   bash .claude/scripts/preparar-nube.sh --si-es-nube            # (SessionStart) no hace nada fuera de la nube
#
# Qué deja:
#   · Postgres local como lo espera el arnés (src/test/base-efimera.ts): puerto 5433, socket en /tmp/pgrun,
#     autenticación `trust`. Nunca toca Neon: es un servidor local y efímero.
#   · node_modules y src/generated. Si una dependencia viene de una URL que el proxy bloquea (xlsx desde
#     cdn.sheetjs.com), la instala desde el registro de npm y DEVUELVE package.json y package-lock.json
#     a como estaban: el repo no cambia.
#   · Worktree con node_modules por enlaces duros (cp -al) y su propio `prisma generate`.
#   · /tmp/factory-gsg apuntando al clon de Factory-GSG si está en /home/user/factory-gsg.
# Salida: una línea por paso. El detalle va a /tmp/preparar-nube.log, nunca al contexto.
# ============================================================================
set -u
LOG=/tmp/preparar-nube.log
: >"$LOG"
REPO="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
paso() { echo "preparar-nube · $*"; }

if [ "${1:-}" = "--si-es-nube" ]; then
  [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
  shift
fi

# ── Postgres del arnés ─────────────────────────────────────────────────────────
postgres() {
  local url="postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun"
  if psql "$url" -tAc "select 1" >/dev/null 2>&1; then paso "Postgres: ya estaba (5433)"; return; fi
  command -v pg_lsclusters >/dev/null || { paso "Postgres: no instalado (los tests de base se saltean)"; return; }
  local ver conf
  ver=$(pg_lsclusters -h | awk 'NR==1{print $1}')
  conf="/etc/postgresql/$ver/main"
  [ -d "$conf" ] || { paso "Postgres: sin cluster en $conf"; return; }
  mkdir -p /tmp/pgrun && chown postgres /tmp/pgrun
  sed -i -E "s/^#?port = [0-9]+/port = 5433/; s|^#?unix_socket_directories.*|unix_socket_directories = '/var/run/postgresql,/tmp/pgrun'|" "$conf/postgresql.conf"
  sed -i -E 's/^(local|host)(.*)(peer|scram-sha-256|md5)$/\1\2trust/' "$conf/pg_hba.conf"
  service postgresql restart >>"$LOG" 2>&1
  if psql "$url" -tAc "select 1" >/dev/null 2>&1; then paso "Postgres: listo (5433, /tmp/pgrun)"; else paso "Postgres: NO arrancó (ver $LOG)"; fi
}

# ── Dependencias ───────────────────────────────────────────────────────────────
dependencias() {
  local dir="$1"
  if [ -d "$dir/node_modules/.bin" ]; then paso "dependencias: ya estaban"; return; fi
  if (cd "$dir" && npm ci --no-audit --no-fund >>"$LOG" 2>&1); then paso "dependencias: npm ci"; return; fi
  # Dependencias por URL (p. ej. https://cdn.sheetjs.com/…): se cambian por la última del registro sólo para instalar.
  local urls
  urls=$(cd "$dir" && node -e 'const p=require("./package.json");for(const k of ["dependencies","devDependencies"])for(const[n,v]of Object.entries(p[k]||{}))if(/^https?:/.test(v))console.log(n)')
  if [ -z "$urls" ]; then paso "dependencias: npm ci FALLÓ (ver $LOG)"; return; fi
  (
    cd "$dir" || exit 1
    for n in $urls; do
      v=$(npm view "$n" version 2>>"$LOG")
      [ -n "$v" ] && node -e 'const f="package.json",p=require("./"+f),[n,v]=process.argv.slice(1);for(const k of ["dependencies","devDependencies"])if(p[k]&&p[k][n])p[k][n]=v;require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$n" "$v"
      echo "$n → $v (registro de npm)" >>"$LOG"
    done
    npm install --no-audit --no-fund >>"$LOG" 2>&1
    ok=$?
    git checkout -- package.json package-lock.json
    exit $ok
  ) && paso "dependencias: instaladas; desde el registro de npm: $(echo $urls) (package.json intacto)" || paso "dependencias: FALLÓ (ver $LOG)"
}

prisma() {
  local dir="$1"
  if [ -d "$dir/src/generated/prisma" ]; then paso "Prisma: ya generado"; return; fi
  (cd "$dir" && npx prisma generate >>"$LOG" 2>&1) && paso "Prisma: generado" || paso "Prisma: FALLÓ (ver $LOG)"
}

factory() {
  if [ -d /home/user/factory-gsg/entorno/tokens ] && [ ! -e /tmp/factory-gsg ]; then ln -s /home/user/factory-gsg /tmp/factory-gsg; fi
  if [ -d /tmp/factory-gsg/entorno/tokens ]; then paso "Factory-GSG: /tmp/factory-gsg"; else paso "Factory-GSG: sin clon (agregalo a la sesión y clonalo en /home/user/factory-gsg)"; fi
}

postgres
dependencias "$REPO"
prisma "$REPO"
factory

if [ "${1:-}" = "--worktree" ]; then
  WT="${2:?ruta del worktree}"; RAMA="${3:?rama}"; BASE="${4:?commit base}"
  if [ ! -d "$WT" ]; then
    mkdir -p "$(dirname "$WT")"
    git -C "$REPO" worktree add -b "$RAMA" "$WT" "$BASE" >>"$LOG" 2>&1 || { paso "worktree: FALLÓ (ver $LOG)"; exit 1; }
  fi
  [ -d "$WT/node_modules" ] || cp -al "$REPO/node_modules" "$WT/node_modules"
  prisma "$WT"
  paso "worktree: $WT (rama $RAMA, base $(git -C "$WT" rev-parse --short HEAD))"
  # Las herramientas de .claude/scripts pueden no existir en un commit base viejo: se usan las del repo.
  [ -f "$WT/.claude/scripts/mapa-codigo.mjs" ] || paso "mapa de código: usá node $REPO/.claude/scripts/mapa-codigo.mjs (la base no lo trae)"
fi
exit 0
