# Inventario de cementerio git — para aprobación del dueño (NO ejecutado)

Generado durante auditoría total (rama `calidad/auditoria-total`, base origin/main a6b96a5).
`rm -rf` / borrado de ramas vedado por config → esto es **lista para el OK del dueño**, nada se borró.

## Ramas locales: 86 total
- **46 MERGEADAS en origin/main → borrado SEGURO** (su contenido ya está en main):
  chore/mirror-backup, ci/senal-verde, claude/sprint-startup-generic-rf6x0m, core/pagos,
  deploy/land-f1b, diseno/magra-fable, diseno/shine-resumido, fase1/invariantes-i2-i7,
  fase2/consola-operador, fase2/fabrica-tenants, feat/ch-front-fable, feature/liquidacion-comisiones,
  feature/modulo-localizacion, feature/multi-tenant, fix-handoff, fix-handoff2,
  fix/gate-visual-operador, frente/diseno, frente/diseno-vidrieras, frente/facturacion-arca,
  frente/facturacion-bancaria, frente/plataforma, frente/producto-contador, frente/producto-rubros,
  frente/reliability, frente/whatsapp-cta, front-shine, front-shine-fiel, front-shine-sello,
  front-shine2, fundacion/consolidacion-diseno, integ-estado, integ-magrabo, integ-olas01,
  integ-segc, integ-tienda, integ/fiscal, land-inventario-f1b, land-inventario-f2,
  land-inventario-ledger, main-deploy, operador/reset-password, perf/agenda-estetica, probe-sprint,
  qa/superficies-cliente, seguridad/cert-por-tenant

- **36 NO mergeadas** (tienen commits únicos). La mayoría son ramas de integración de 1 commit,
  fechadas 07-12/07-13, cuyo contenido probablemente entró a main por merge inverso (verificar tip
  antes de borrar). Con trabajo único REAL a revisar antes de descartar:
  - `land/gsg-lab` (8 ahead, 07-07)
  - `feat/imagen-ia` (7 ahead, 07-11)
  - `frente/producto` (7 ahead, 07-05)
  - `fase2/aceitar-alta` (4 ahead, 07-11) — memoria "fase2-alta-aceitado"
  - `frente/calidad` (4 ahead, 07-05) — histórico del oversell fix (ya en main, ADR I6)
  - `frente/fiscal` (4 ahead, 07-05)
  - Resto: 1-3 ahead, ramas de integración/diseño recientes (evaluar caso por caso).

## Worktrees: ~44 registrados (`git worktree list`)
Muchos apuntan a ramas ya mergeadas (stale, seguros de remover con `git worktree remove`).
Recomendación: `git worktree prune` + remover los que apunten a las 46 ramas mergeadas.
Los worktrees en `%TEMP%/claude/.../scratchpad/` son de sesiones viejas → higiene.

> Acción del dueño (§C·I5). Método sugerido no destructivo: `git worktree remove <path>` para cada
> stale, luego `git branch -d <rama>` (solo -d, borra únicamente si está mergeada; falla si no).
