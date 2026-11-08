# Relevo · especialista UAT (08/11/2026)

Rama: `claude/especialista-uat-2026-11` (sin PR). Orquestadora vigente: session_01BtqRUHSdU8Bac9T68QiKkX (la saliente era session_01BtqRUHVZpvZrjVcuFXR5pm). Texto de magra y de CH ya enviado para Drive.

## Hecho
- T1 Factoque y T2 checklist del profe: enviados a la orquestadora. Checklist en
  `docs/tenants/matiasconsoli/CHECKLIST-VENTA-2026-11.md`.
- T3 UAT por tenant:
  - magra: `docs/tenants/magra/UAT-2026-11.md` (32 OK, 6 fallas, 4 callejones). Contenido enviado a la orquestadora.
  - beauty-spa: `docs/tenants/ch/UAT-2026-11.md` (42/42 nav, 72/72 matriz, 38 OK, 3 fallas, 1 callejón blando). Le pedí a la
    orquestadora que lo lea desde la rama; si no puede, mandárselo en texto.

  - adosmanos: `docs/tenants/adosmanos/UAT-2026-11.md` (44 OK, 11 fallas, 4 callejones). Texto enviado.
  - shinevelas: `docs/tenants/shinevelas/UAT-2026-11.md` (42 OK, 7 fallas, 6 callejones). Texto enviado.
- Hallazgo transversal (magra, adosmanos, shinevelas): navegación retail — Inicio con Agenda, Vender/Ventas fuera del
  menú y del buscador, modo simple pensado para agenda, permisos de Usuarios ≠ los que rigen. Una tanda los cierra.

## Falta
1. breakpoint, matiasconsoli y mia (si aplica): mismo brief que adosmanos, cambiando tenant, puerto y base.
2. Por cada tenant terminado: commit por pathspec, push, aviso a la orquestadora (≤ 300 palabras). La orquestadora es
   quien sube a Drive, con el título «UAT 2026-11 · <cliente>».

## Ojo
- `next dev` reescribe `AGENTS.md`. El bloque nuevo ya quedó commiteado en esta rama.
- Dos `next dev` no pueden correr en la misma carpeta: cada agente trabaja en una copia en el scratchpad (`cp -al` para
  node_modules). La copia `scratchpad/erp-uat` no se borró (`rm -rf` bloqueado).
- Decisiones del dueño que salieron de la UAT: cierre del día de Recepción en CH (cierre-diario.ts:714) y comprobante a la
  clienta (ventaSimple apagado en CH).
