# 🧹 Set lite por rubro — UI Comercio limpia (Ola 1, carril blueprints)

**Qué es:** el **set mínimo de módulos ON por rubro** en un **Comercio** (perfil lite), para que la UI del
backoffice muestre **solo lo que ese rubro usa** — limpia y vendible para los 4 tenants reales. Implementado
en `src/blueprints/presets-meta.ts` (carril blueprints, sin tocar nav/AdminShell/perfil — esos son de S2/S4).

**Autor:** Analista de mercado local (cubriendo el carril de S3, caído esta ola) · **Fecha:** 2026-07-08 ·
**Rama:** `claude/sprint-startup-generic-rf6x0m` · **Naming:** Comercio/Empresa · Sin Neon, sin merge a main.

---

## 1. El bug que se corrige (por qué la UI Comercio no estaba limpia)

Había **dos fuentes** de "módulos por defecto por rubro" que **discrepaban** para retail:

- **`src/lib/operator-config.ts`** (autoritativa, la usa el provisioning): carnicería = `pos, catalog,
  clients, reports, arca` → **ids de módulo de nav reales**. ✅
- **`src/blueprints/presets-meta.ts`** (la consumía la consola de operador): para los rubros retail devolvía
  el **vocabulario interno del blueprint retail** — `stock`, `venta-peso`, `venta-unidad`, `proveedores`,
  `cuenta-corriente` — que **NO son módulos de nav**. ❌

Efecto: la consola de operador contaba/mostraba "módulos" que no existen en la navegación (p. ej.
`venta-peso`), y el "set lite por rubro" del retail estaba expresado en un vocabulario que la nav no entiende
→ UI Comercio sucia e inconsistente.

## 2. La corrección (qué hace ahora)

`defaultModulesForBlueprint` **siempre** devuelve ids de módulo de nav reales (los de `MODULES`). Para
retail usa un **SET LITE POR RUBRO** curado (`retailLiteModules`) en vez del vocabulario interno. El campo
`modules: RetailModuleId[]` de `retail/rubros.ts` **se deja intacto** (es un concepto interno del blueprint,
usado para wording/semántica, no para la nav).

## 3. El set lite por rubro (qué módulos ve cada Comercio)

| Rubro (blueprint) | Tenant real | Set lite (módulos de nav ON) | Qué NO trae (y por qué) |
|---|---|---|---|
| **servicios** (familia Agenda) | **CH Estética** | `agenda · catalog · clients · waitlist · reminders · reports` | sin `pos` (no es mostrador), sin comisiones/reseñas por default |
| **carniceria** (retail) | **Magra** | `pos · catalog · clients · reports · arca` | sin `agenda`/`waitlist`/`commissions` (son de servicios); factura de mostrador → suma `arca` |
| **velas** (retail) | **Shine** | `pos · catalog · clients · reports` | sin agenda/espera/comisiones; sin `arca` hasta que el negocio lo pida |
| **padel** (retail) | **A Dos Manos** | `pos · catalog · clients · reports` | ídem |
| *otros retail* (verdulería, dietética, kiosco, fiambrería, indumentaria) | — | `pos · catalog · clients · reports` | piso de mostrador limpio |
| familia Oficios | — | `agenda · catalog · clients · reminders · reports · arca` | (sin cambios) |
| familia Gastronomía | — | `pos · catalog · clients · reports · arca` | (sin cambios) |
| **generico** (comodín) | demo Empresa | `[]` (honesto: 0, no inventa) | el operador arma el set a mano |

**Principio:** un Comercio muestra el circuito que **realmente** opera (vender/cobrar/catálogo/clientes/
reportes; + agenda si es servicios; + facturar si el rubro factura), y **nada** de otro arquetipo — un
mostrador no ve "Agenda"/"Lista de espera"/"Comisiones", un servicio no ve "Caja/POS".

## 4. Validación contra los 4 tenants reales

- **CH (servicios):** mantiene su set de agenda — sin regresión (es el histórico).
- **Magra (carnicería), Shine (velas), A Dos Manos (pádel):** ahora derivan un set **limpio de mostrador**
  (antes: vocabulario interno que ensuciaba el conteo). Ninguno arrastra pantallas de servicios.
- El invariante **`enterprise ⊇ lite`** no se toca: esto define el piso **lite** por rubro; Empresa hereda
  ese piso y suma lo suyo (carril S4).

## 5. Alcance y follow-up

- **Carril respetado:** solo `src/blueprints/presets-meta.ts` (+ su test). **No** se tocó
  `components/ui`, `compras`, `reportes`, `nav-groups`, `AdminShell`, `perfil` ni `flags` (S2/S4), ni
  `operator-config.ts` (otro carril).
- **Guarda de regresión:** el test `presets-meta.test.ts` ahora falla si un rubro devuelve algo que **no**
  es un módulo de nav (bloquea que el vocabulario interno vuelva a filtrarse).
- **Follow-up (fuera de este carril, para el PO):** existen **dos** `defaultModulesForBlueprint` paralelos
  (`operator-config.ts` y `presets-meta.ts`). Esta corrección los deja **consistentes** para retail, pero la
  **unificación en una sola fuente** queda como deuda a resolver por quien tenga el carril de `src/lib`.

## 6. Verdes

`tsc --noEmit` limpio · suite **618/618** verde · `presets-meta.test.ts` 7/7 (con las nuevas guardas).

— Elaborado por GSG (Analista de mercado local, cubriendo carril blueprints), 2026-07-08.
