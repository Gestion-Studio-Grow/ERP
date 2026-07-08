# ADR-057: Representación de dinero — `number`/Float con redondeo único, `Decimal(14,2)` en el borde fiscal

**Estado:** Aceptado — **decisión de arquitectura**. Resuelve dos pendientes documentados: la divergencia
`Float` vs `Decimal(14,2)` de `Invoice` (ESTADO-ACTUAL §5 / nota en `prisma/schema.prisma`) y **R4**
(unificar `round2`/`redondear`, `src/lib/round.ts`). La parte **reversible** (redondeo único) va a código con
su Gate; la **migración a `Decimal`** es **§C · Gate 2** (la ejecuta el dueño al encender ARCA real).
**Fecha:** 2026-07-08
**Depende de:** ADR-002 (Core/Blueprint/Plugin), ADR-006 (cálculo del Core), ADR-022 (plugin ARCA)
**Relacionado:** ADR-044 (Argentinizar SAP — fiscal ARCA), CORE-SCHEMA-SPEC §1 (pide `Decimal(14,2)`)
**Decisiones que cierra:** ESTADO-ACTUAL §5 (dinero Float vs Decimal) · **R4** (`round.ts`: dos redondeos)

---

## Contexto
Hoy **todo el sistema mueve importes como `number`** (JS = IEEE-754 double): el contrato del plugin ARCA
(`core-contract` → `base`/`importe`/`neto`/`total`) y el cálculo de IVA del Core son `number`; en Prisma se
persisten como `Float`. El **spec fiscal** (CORE-SCHEMA-SPEC §1) pide **`Decimal(14,2)`** para exactitud al
centavo. Además arrastramos **dos reglas de redondeo** distintas (R4):
- **POS/caja/compras** (`src/lib/round.ts` `round2`): `Math.round(n*100)/100` — histórico.
- **Fiscal** (`src/lib/fiscal.ts` `redondear`): variante **EPSILON-safe**
  `Math.round((n + Number.EPSILON)*100)/100`, que corrige la frontera binaria `x.xx5` (p. ej. `1.005 → 1.01`).

El riesgo real del `number` no es guardar (un double representa exacto los centavos dentro del rango de
pesos de una pyme), sino **acumular** error en sumas de alícuotas y **redondear distinto** en dos caminos.

## Decisión
**1. La unidad NO cambia: importes en `number` = pesos con 2 decimales.** Se **rechaza** migrar a
   **centavos-enteros**: cambiaría el contrato de punta a punta (plugin, IVA del Core, UI `$`) — más blast
   radius que la alternativa del §3 — y complica el formato criollo. El contrato del plugin/Core **queda `number`**.

**2. Regla de redondeo ÚNICA y EPSILON-safe (resuelve R4).** Se unifica en **una sola** `round2`
   EPSILON-safe (`Math.round((n + Number.EPSILON)*100)/100`) para **todo** el camino de dinero (POS + fiscal).
   Es el redondeo comercial/AFIP **"medio hacia arriba"** y **es el correcto**: elimina la deriva de `x.xx5`.
   Implica un **cambio de comportamiento del POS en el medio centavo** (`1.005 → 1.01` en vez de `1.00`) — se
   **asume a propósito** (antes divergía de la factura). **Reversible:** código + tests, sin tocar datos ni prod.

**3. Persistencia fiscal a `Decimal(14,2)` en el BORDE, no en el contrato.** Al **encender ARCA real**, las
   columnas de dinero de `Invoice` (`neto`, `iva`, `total`) pasan a **`Decimal(14,2)`** (exactitud de
   almacenamiento/auditoría, alineado al spec §1). La conversión **`Decimal ↔ number` se confina al borde del
   repositorio de `Invoice`** (lectura `.toNumber()`; la escritura acepta `number`). El resto del sistema **no
   se entera**. **Es migración → §C · Gate 2 (el dueño).** Hoy, en stub/gateado, sigue `Float` — no bloquea.

**4. Orden de ejecución.** (2) es **reversible → ahora** (con su Gate). (3) se **eleva** y se aplica **cuando
   el dueño encienda ARCA real** (junto con cert + homologación, §C·I3, y las migraciones fiscales, §C·I2).

## Consecuencias
- **(+)** Una sola regla de dinero → el POS y la factura **redondean igual**; se cierra R4.
- **(+)** Exactitud fiscal al centavo en el almacenamiento, **sin** reescribir el contrato `number`.
- **(+)** Blast radius contenido: Decimal solo vive en el borde del repo de `Invoice`.
- **(−)** El POS cambia el redondeo en la frontera `x.xx5` (asumido; es lo correcto).
- **(−)** La migración a `Decimal` queda pendiente del OK del dueño (Gate 2) — hasta entonces, exactitud
  garantizada por el redondeo único, no por el tipo de columna.

## Implementación (seguimiento)
- **Reversible (próximo paso):** unificar `round2` a la variante EPSILON-safe en `src/lib/round.ts`, apuntar
  `fiscal.ts` a esa util, **redondear la suma de IVA** en `src/lib/invoice-core.ts` (`iva.reduce(...)`), y
  sumar property-tests de no-deriva. Un frente acotado con su Gate (toca dinero del POS → QA + revisión).
- **§C (dueño):** migración `Invoice.{neto,iva,total} → Decimal(14,2)` + conversión en el repo de `Invoice`,
  aplicada con `prisma migrate deploy` (Gate 2) al encender ARCA real.

— Elaborado por GSG (Arquitecto de Solución + PMO).
