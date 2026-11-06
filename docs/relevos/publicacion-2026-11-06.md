# Relevo · Publicación del lote Gate 2 (06/11/2026)

Sesión de datos y deploy. Tramo #14 → #18 **cerrado y verificado**. Frenada por orden de la orquestadora;
el tramo siguiente lo toma una sesión nueva.

## Respaldo

- **Snapshot Neon** `respaldo-pre-lote-2026-11-06` · id `snap-hidden-heart-acrxsl7g` · de `main`
  (`br-floral-thunder-actj830m`) · 06/11 04:42 UTC, antes del #14. Se restaura con `restore_snapshot`.
- No se creó un branch: Neon free tope 10 y ya había 10. No se borró ninguno.
- Proyecto de producción: `old-frost-91078346` (org Vercel `org-holy-frost-86084816`).

## Publicado (cada uno: CI igual que main → merge → migración verificada → erp-ch READY sin errores nuevos)

| PR | Merge en main | Migración | Aplicada (UTC) | Tests rojos (main = 11) |
|---|---|---|---|---|
| #14 MIA Rendí | `238b292` | `20261104121000_rendiciones` | 05:16 | 10 |
| #15 Contabilidad ola 1 | `7e0df43` | `20261104122000_contabilidad_ola1` | 05:42 | 7 |
| #16 CH Servicio completo | `8560a72` | `20261104123000_servicio_completo` | 05:57 | 9 |
| #17 Matriz de permisos | `8c33275` | `20261105121000_user_permission_override` | 06:13 | 8 |
| #18 Venta y agenda simples | `1c8f2a8` | — (sin migración) | — | 7 |

- Producción quedó en `dpl_AMJWPtz29ejwwP1GEGExQ5WsiQCx` (`1c8f2a8`), READY.
- Cada tabla nueva: `relrowsecurity = true` y 1 policy. El build reporta RLS 126/126 sin drift y `app_rls` sin BYPASSRLS.
- Runtime: sólo los dos avisos viejos de `pg` (sslmode y `client.query` concurrente), presentes desde julio.
- Ningún tenant con `arcaHomologacion=false` (16 en homologación). `ARCA_REAL_TENANTS` no existe todavía en Vercel.

## Cómo integrar main en las ramas `gate2/*` (el «Update branch» de GitHub NO anda)

GitHub ve dos merge-bases y, con una sola, choca `prisma/lote-deploy.txt` (`mergeable_state: dirty`). El merge
recursivo de git lo resuelve limpio y deja el lote igual que el del PR. Procedimiento usado (fast-forward, sin reescribir):

```bash
git fetch --unshallow origin            # el clon viene shallow: sin esto el merge-base sale mal
git fetch origin "+refs/heads/main:refs/remotes/origin/main" "+refs/heads/<rama>:refs/remotes/origin/<rama>"
T=$(git merge-tree --write-tree --name-only origin/main origin/<rama>)   # exit 0 = sin conflictos
git show $T:prisma/lote-deploy.txt | grep -v '^#'                         # sólo la migración del PR
git diff --quiet origin/<rama> $T -- prisma/lote-deploy.txt               # lote = el del PR
C=$(git commit-tree $T -p origin/<rama> -p origin/main -m "Merge main en <rama> ... [sin-deploy]")
git push origin $C:refs/heads/<rama>
```

Después: esperar el CI del commit nuevo y recién ahí mergear (merge commit, no squash) con `expectedHeadSha`.
Chequeo extra que se hizo: todo archivo distinto de main viene de commits del PR (`git log origin/main..<rama> -- <archivo>`).

## Traba de Google Fonts en CI

`build (next build)` falla a veces con `Module not found: '@vercel/turbopack-next/internal/font/google/font'`
(red hacia fonts.gstatic). Corre dos veces por commit (push y pull_request): si una compila, la otra es red.
Si fallan las dos: `rerun_failed_jobs` sobre la corrida (en el #14 la re-corrida dio verde).

## Conteo de tests

El conector devuelve sólo las últimas 5000 líneas del log y la descarga directa está bloqueada. El resumen TAP
(`# tests/# pass/# fail/# skipped`) sí sale de esa cola; no se pudo listar qué tests fallan.

## Pendiente (no se tocó)

- Orden del tramo siguiente, a confirmar por el dueño: su orden original (#23 + enum → #13 → #20 + SQL → #22 → #21 → #12)
  vs. el de la orquestadora (#13 → #20 → #22 → #21 → #26 → #24 → #27 → #23 → #28 → #12).
- Enum `PaymentMethod.VOUCHER` (`prisma/pending-gate2/CH_voucher_enum.sql`): IRREVERSIBLE, a mano con psql sin
  transacción, después del #23 en READY y con orden del dueño escrita.
- #12 apunta a `claude/arca-prueba-cliente-nuevo`: cambiar la base a `main` antes de mergear.
- #23 está en borrador.
- `ensayo-lote-neon` quedó desactualizado: regenerar con `node scripts/ensayo-lote-neon.mjs` (runbook §6).

— Elaborado por GSG
