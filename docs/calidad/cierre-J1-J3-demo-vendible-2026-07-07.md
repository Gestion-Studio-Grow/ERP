# Cierre J-1 / J-3 — Demo consultor→backoffice VENDIBLE (F3)

**Frente:** F3 `frente/demo-vendible` (Consultores/Agencia Digital + Producto por rubro).
**Fecha:** 2026-07-07 · **Modelo de ejecución:** reversible (apta Sonnet; ver nota). **Gate:** pendiente (Opus).
**Método:** playbook `demo-publica-costo-cero.md` + `generador-preset-ia.md` (FASE 1, sin secretos, sin datos reales).

## Qué cerró

Los defectos **J-1** (no había entrada al backoffice-demo sin password) y **J-3** (la `/demo`
prometía "Entrá al backoffice real (demo)" y entregaba un muro de login) estaban **parcialmente**
resueltos en código (`/probar` + middleware sandbox + fixtures de agenda/caja/reportes, DX-1), pero
quedaba el defecto **"forma final"**: el backoffice-demo era navegable y **lleno de callejones sin
salida**. El OWNER ficticio veía los **16 módulos** del nav, pero solo agenda/caja/reportes tenían
fixtures; **el resto (incluido el Dashboard, landing al que `/probar` invita directo) pegaba a Prisma
sin DB → error 500.**

## Cambios (reversibles, gateados por `DEMO_MODE_ENABLED`, sin tocar schema/RLS/auth)

1. **Dashboard demo cableado** — `getDemoDashboardData()` (`demo-sandbox.ts`) + branch en
   `getDashboardData()` (`actions.ts`). El landing del Panel del Dueño ya no crashea; reusa la agenda
   del día + el total de reportes (KPIs coherentes con lo que se ve al entrar a Agenda/Reportes).
2. **Clientes demo cableado** — `getDemoClients()` / `getDemoClient()` + branches. Lista poblada
   (pool de 12 clientes ficticios) y ficha navegable; historial de turnos solo para familias con
   agenda (mostrador → sin turnos, honesto). Sin escrituras, sin secretos.
3. **Nav de demo acotado al set con fixtures** — `demoNavHrefs()` (`demo-consultor.ts`, puro) deriva
   de la **recomendación del consultor** ∩ **allowlist wired** (Dashboard + Agenda/Caja + Clientes +
   Reportes). `AdminShell` filtra el nav con ese set en modo demo. **Estructuralmente no hay
   callejones:** los módulos sin fixture no se linkean. Coherente con consultor→backoffice.
4. **Aclaración honesta en `/probar`** (zona humana) — línea que distingue lo que se recorre en la
   demo con datos de ejemplo de lo que "se enciende cuando activás tu negocio". Vende sin prometer de
   más.

## Vallas (verde)

- `npx tsc --noEmit` → **0 errores**.
- `npm test` → **560/560** (incluye tests nuevos de las fixtures Clientes/Dashboard y de `demoNavHrefs`:
  ninguna ruta del nav de demo cae fuera del set cableado, para 5 rubros).
- `npm run build` → **OK** (con y sin la flag; `/demo` sigue `force-static`).

## QA — recorrido end-to-end (server local `DEMO_MODE_ENABLED=true`, build con la flag)

| Paso | Resultado |
|---|---|
| `/demo` (tour Stories) → botón **"Ver el backoffice (demo)"** → `/probar` | ✓ (aparece; J-3) |
| `/probar` muestra recomendación del consultor + aclaración + CTA a `/admin/turnos` | ✓ |
| `/admin` (Dashboard, landing) | **200 ✓** (antes 500 — callejón faro) |
| `/admin/turnos` · `/admin/clientes` · `/admin/reportes` · `/admin/caja` | **200 ✓** |
| Nav en demo: **solo** Dashboard/Agenda/Clientes/Reportes; ocultos los 11 sin fixture | ✓ (cero callejones) |
| `/admin/facturacion`, `/admin/catalogo` por URL directa | 500 (esperado; **no** alcanzables por nav) |

> Los 500 por URL directa confirman que esos módulos habrían sido callejones; el filtro de nav los
> deja fuera del recorrido. Cablearlos con fixtures es follow-up opcional (no bloquea la venta).

## Límite repo-ERP ↔ repo-Agencia

La parte que corre **sobre el ERP** (probador/demo del flujo consultor→backoffice) vive en este
worktree del ERP. La Agencia Digital tiene **repos/deploys separados** (la vende y le suma features);
no se mezcla acá. El deploy de demo es un proyecto Vercel aislado con `DEMO_MODE_ENABLED=true` (build +
runtime), **sin `DATABASE_URL` productiva ni secretos** (FASE 1).

## Elevado (no ejecutado — irreversible / fuera de alcance)

- Activar persistencia / pegar credenciales del deploy de demo → **dueño** (FASE 2, post-venta).
- Cablear fixtures para los módulos restantes (catálogo/facturación/espera/…) → follow-up reversible,
  no bloqueante.
- Branding del backoffice-demo por rubro (hoy cae a `DEFAULT_BRAND` vía try/catch; **cosmético**, no
  callejón).

## Nota de norma

Frente de ejecución reversible → correspondía **Sonnet** (`/model sonnet`); la sesión quedó en Opus.
Señalado para el PMO. El **Gate de Excelencia** va **siempre en Opus** (sin cambio).

— Elaborado por **Gestión Studio Grow (GSG)** · Equipo F3
