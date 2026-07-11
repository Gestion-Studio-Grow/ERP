---
id: ADR-083
nivel: fundacional
dominio: [Operaciones, Plataforma]
depends_on: [ADR-070, ADR-029, ADR-041]
---
# ADR-083: `main` auto-deploya a PRODUCCIÓN en Vercel — la verdad operativa (la doc del repo decía lo contrario y era falso)

**Estado:** Aceptado — **fundamento operativo**. **Corrige** la afirmación previa del repo ("el auto-publish
está apagado; el push a `main` no publica ni gasta créditos") que era **empíricamente falsa** para el setup
actual de Vercel.
**Fecha:** 2026-07-11
**Depende de:** ADR-070 (disciplina de release: un deploy para todos, rama→entorno), ADR-029 (ruteo
multi-tenant por hostname: un proyecto Vercel sirve N tenants), ADR-041 (dos fases de credenciales / el deploy
como acto del dueño)
**Relacionado:** ADR-082 (render roto en `main` = deploy roto en prod), ADR-084/086/088 (schema-ahead: la
migración va SIEMPRE antes del merge) · memoria de proyecto `push-main-auto-deploya-vercel`

---

## Contexto

`CLAUDE.md`/`docs/ESTADO-ACTUAL.md §2` y la lección "PD-2" afirmaban: *"el auto-publish de Netlify está apagado
(`stop_builds`), así que el push a `main` no publica ni gasta créditos"*. Sobre esa premisa se operaba
"push-libre a `main`" como si fuese inocuo.

**Verificación 2026-07-11:** un fast-forward de `origin/main` (front de CH) **disparó un deploy de producción
automático** en el proyecto Vercel `erp-ch`. Antes del push, `chestetica-erp.vercel.app` servía el diseño
viejo; ~2–3 min después del push servía el nuevo (confirmado con `fetch('/', {cache:'no-store'})`). El stack
ya **no es Netlify** (migró a Vercel, ADR de ruteo 029): **`main` es la production branch con Git auto-deploy
ACTIVO**. La doc quedó describiendo un mundo que ya no existía.

Esto **cambia la naturaleza de todo push a `main`**: no es "guardar en GitHub", es **publicar en producción**.
Y el proyecto `erp-ch` sirve los **4 tenants** (CH/Magra/Shine/ADM) vía `TENANT_HOST_MAP` (ADR-029) → un solo
deploy **redeploya a todos**. El incidente CH del 2026-07-09 (sitio caído por `main` *schema-ahead* de la DB de
CH) fue **exactamente esto**: `main` llevaba modelos Prisma sin su migración aplicada, se auto-deployó, y el
client consultó columnas inexistentes.

## Decisión

**Se trata todo push a `main` como un deploy a producción real** (gasta build, publica, redeploya a los N
tenants del proyecto). En consecuencia, reglas duras:

1. **Nada entra a `main` sin el Gate verde** (ADR-040 + la valla de render de ADR-082 + `tsc`/build/test). Un
   `main` rojo es un **prod roto**, no un "lo arreglo después".
2. **La migración va SIEMPRE antes del merge**, nunca después. Si un cambio agrega/edita modelos Prisma, su
   migración se **aplica a la DB** (Gate 2, OK del dueño) **antes** de que el código llegue a `main` — o el
   código llega detrás de un patrón *fail-safe* que tolera el schema viejo (ADR-086: `ProvisioningRun` por SQL
   crudo con fallback; hotfixes defensivos de CH). Es la **causa raíz del incidente CH del 09-07**.
3. **Rollback = revert del merge + redeploy.** No hay "despublicar": se revierte el commit de merge en `main`
   y el propio auto-deploy publica el estado anterior.
4. **`main` siempre verde y sin migración pendiente.** Porque un deploy redeploya a los 4 tenants, un rojo o un
   schema-ahead los tumba a todos juntos.
5. **La doc se corrige.** `ESTADO-ACTUAL.md §2` y PD-2 quedan **derogados** en su afirmación "no publica"; esta
   decisión es la fuente de verdad. (No hay `.vercel/` link ni `VERCEL_TOKEN` local → no se puede `vercel
   --prod` desde la sesión, pero **el push a `main` alcanza y publica**.)

> **En una línea:** *push a `main` = deploy a prod de los N tenants; por eso el Gate y la migración son
> pre-condición del merge, no del deploy.*

## Consecuencias

- **(+)** Se elimina un supuesto peligroso ("push inocuo") que ya había causado una caída de prod. La operación
  se alinea con la realidad medida.
- **(+)** Refuerza el porqué de ADR-082 (render) y del Gate: son la última red antes de publicar a clientes
  reales, sin paso humano intermedio que atrape el error.
- **(+)** Modelo de rollback simple y auditado (revert + redeploy), coherente con "IDs/commits inmutables".
- **(−)** **Se pierde el colchón** "push ahora, deployo cuando quiera": cada merge es un acto de publicación.
  Sube el costo de un merge apresurado.
- **(−)** Presiona para **branch protection en `main`** (hoy pendiente, decisión #4 del roadmap) — sin ella, un
  push directo publica sin gate.
- **(−)** El acoplamiento "un proyecto = 4 tenants" (ADR-029) amplifica el blast radius de un deploy malo; la
  mitigación de fondo es la separación de bases/proyectos por producto (ADR-060), aún pendiente.

## Alternativas descartadas

- **Mantener la doc como estaba ("no publica").** Rechazada: es falsa y ya costó una caída. La verdad medida
  manda sobre la doc (regla de ESTADO-ACTUAL: "si algo choca con el repo/prod, gana el repo").
- **Apagar el auto-deploy de Vercel para volver al modelo "gate manual de deploy".** Es una opción válida a
  futuro (daría de nuevo el colchón), pero **es infra = Gate del dueño** y hoy no está hecho; hasta entonces la
  realidad es auto-deploy, y se opera según la realidad, no según la preferencia.
- **Deployar con `vercel --prod` desde la sesión para controlar el momento.** No hay token/link local y sería
  un acto de deploy del agente (viola ADR-041). Rechazada.

— Elaborado por GSG (Plataforma / Release — verdad operativa; el control del deploy es del dueño, ADR-041)
