# 🛂 Gate de Excelencia — Fase C/C.5 de ADR-060 (rúbrica S5/Opus)

> **Qué gatea:** la ola de construcción fundacional de ADR-060 — **S1** entidades (Supplier D1 + Collection
> D9 + Invoice→origen D10, aditivas, **preparadas NO aplicadas**) · **S4** pantalla **Libros** (D7, sin
> schema) · **S2** helpers de presentación sobre **DataTable**.
> **Estándar:** equipo experto. **Reglas duras:** no-mutación de `Payment` · aditividad real · reversibilidad ·
> naming honesto Libros · flags OFF · §C elevado no ejecutado · coherencia con el checklist de QA
> (`qa-preview-empresa-2026-07-08.md`). **Revisor:** S5 (Gate, Opus). Cada ⛔ bloquea el merge.
> **Base:** `estructura-consolidada-producto.md` (ADR-060) D9/D10/D7.

---

## 🔴 §1 — NO-MUTACIÓN de `Payment` (regla dura, el punto más delicado)

`Collection` (D9) es entidad **NUEVA a propósito** para no romper la aditividad. Si esta ola tocó `Payment`,
**NO PASA**.

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| P1 | `Payment` **intacto** en el schema (sobre todo `appointmentId @unique`). | `git diff <base>..HEAD -- prisma/schema.prisma` → el bloque `model Payment` **sin cambios**. | sí |
| P2 | Ninguna migración de esta ola hace `ALTER TABLE "Payment"`. | `grep -ri "Payment" prisma/migrations/<nuevas>/*.sql` = vacío. | sí |
| P3 | `Collection` referencia el origen de forma **polimórfica/aditiva** (Order\|Appointment\|AccountReceivable) **sin** FK que altere Payment/Order. | leer el modelo `Collection`. | sí |

---

## §2 — Aditividad REAL de las 3 migraciones (D1 · D9 · D10)

"Crecé sin migrar" = ningún tenant existente pierde un dato ni necesita backfill. Verificar **cada `.sql`**:

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| A1 | **Supplier (D1)** = `CREATE TABLE "Supplier"` nuevo. La FK en `StockPurchase.supplierId` es **NULLABLE** (se conserva `supplier` texto como snapshot). | SQL: `CREATE TABLE` + `ADD COLUMN "supplierId" ... NULL`. | sí |
| A2 | **Collection (D9)** = `CREATE TABLE "Collection"` nuevo. Cero cambio a tablas existentes. | SQL solo `CREATE TABLE`/índices. | sí |
| A3 | **Invoice→origen (D10)** = `ADD COLUMN "orderId"/"appointmentId" ... NULL` en `Invoice`. **Nunca** NOT NULL sin default sobre datos existentes. | SQL: columnas nullable, sin default forzado. | sí |
| A4 | **Cero destructivo:** ningún `DROP`, `NOT NULL` sobre columna existente poblada, rename, ni cambio de constraint `@unique` existente. | `grep -riE "DROP|NOT NULL|RENAME|ALTER COLUMN|DROP CONSTRAINT" prisma/migrations/<nuevas>/*.sql` → revisar cada hit. | sí |
| A5 | Montos fiscales/deuda en `Decimal(14,2)` (ADR-057): `Collection.monto`, y las de D2/D3 cuando lleguen. | leer el modelo. | — |

---

## §3 — §C NO ejecutado + reversibilidad

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| C1 | Las 3 migraciones están **ESCRITAS y SIN aplicar** a Neon. Ningún `migrate deploy` corrido. | no hay evidencia de conexión a prod; §C tabulado en el ADR. | sí |
| C2 | La cola riesgosa pre-existente (Decimal de facturas + fiscales) **sigue frenada** (no se coló en esta ola). | `ls prisma/migrations/` — sin aplicaciones nuevas. | sí |
| C3 | Todo lo nuevo detrás de **flags OFF** / **`ready:false`** — con flag OFF y migración sin aplicar, el panel es idéntico al de hoy y **no rompe** (código que lea Collection/Supplier/Invoice-origen tolera columnas/tablas ausentes con fallback, patrón `getActiveProfile`). | revisar los loaders nuevos: try/catch o gated por flag/ready. | sí |
| C4 | Sin deploy, sin Neon pago, sin ARCA, sin secretos. | diff limpio. | sí |

---

## §4 — Naming honesto "Libros" (D7, ajuste 4) + export vendible

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| L1 | La ruta es **`/admin/libros`** (renombre de `/admin/contabilidad`). No queda `/admin/contabilidad` viva. | `ls src/app/admin/(dashboard)/` → `libros/`, no `contabilidad/`. | sí |
| L2 | El label al cliente es **"Libros / Exportar al contador"** — **nunca "Contabilidad"** (promete asientos que no hay). | `grep -rniE ">[^<]*Contabilidad" src/app/admin` = vacío. | sí |
| L3 | El export es **Libro IVA ESTRUCTURADO** (Ventas + Compras) con campos fiscales reales (CUIT, tipo de comprobante, neto/IVA/**alícuota**/total), **no un CSV plano**. | leer el generador del export. | — |
| L4 | El export **abarca ambos caminos de venta** (Invoice + Order + Appointment/Payment) — no ciego a la mitad (ajuste 5). | revisar las fuentes del export. | — |
| L5 | D7 **sin schema** (deriva de datos existentes). | `git diff` prisma no incluye entidades de D7. | — |

---

## §5 — DataTable + helpers de presentación (S2) — presupuesto de a11y (ADR-059 D6 fix #5)

`DataTable` salió como subsistema con Gate propio; los helpers de S2 se apoyan en él.

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| T1 | **Accesibilidad:** orden por columna con `aria-sort`, navegación por teclado, roles de tabla correctos, foco visible. | leer + (en QA) probar teclado. | — |
| T2 | **Dos densidades** (Comercio espacioso / Empresa denso) sin romper; **táctil 44px + contraste AA** no bajan. | inspección. | — |
| T3 | **Token-driven:** cero hex suelto; tier en canal neutro (no señala perfil con acento). | `grep -riE "#[0-9a-f]{3,6}"` en los archivos nuevos. | — |
| T4 | Los helpers **no duplican** patrones (reusan Card/Button/DataTable); consistencia (Gate bloque 1). | revisión. | — |

---

## §6 — RLS de las entidades nuevas (multi-tenant, regla dura)

Toda tabla de-tenant nueva **debe** tener `tenantId` para ser protegible por RLS (ADR-018).

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| R1 | `Supplier` y `Collection` tienen **`tenantId`** (+ relación a Tenant). | leer modelos. | sí |
| R2 | `npm run gate:rls` sigue **verde** con el conteo AUMENTADO (33 → 35, Supplier+Collection sumados, **sin drift**). | correr `gate:rls`. | sí |
| R3 | Los loaders nuevos filtran por tenant (predicado `tenantId`/`tenantTransaction`) — no leen cross-tenant. | revisión. | sí |

---

## §7 — Vallas técnicas + QA

| # | Valla | Umbral | ⛔ |
|---|---|---|---|
| V1 | `tsc --noEmit` | 0 errores | sí |
| V2 | `npm test` | ≥ baseline verde; **tests nuevos** de Collection (cobro parcial contra saldo), Supplier, enlace Invoice, y export Libro IVA | sí |
| V3 | `npm run gate:rls` | 35/35 sin drift (§6) | sí |
| V4 | build | Vercel/CI (junction bloquea en worktree — env, no código; tsc cubre compilación) | — |
| V5 | **QA coherente** (`qa-preview-empresa-2026-07-08.md`): las 5 pantallas 🔨 renderizan como **"En preparación"** / `ready:false` en Comercio; no acceden a entidades inexistentes; EmptyState; roles; Comercio vs Empresa; el export de Libros produce un archivo real y estructurado. | correr en preview cuando el dueño lo dispare | — |

---

## Veredicto
- [ ] §1 Payment intacto · [ ] §2 aditividad real · [ ] §3 §C no ejecutado + reversible · [ ] §4 Libros honesto ·
      [ ] §5 DataTable a11y · [ ] §6 RLS entidades nuevas · [ ] §7 vallas

**Un solo ⛔ en §1 (Payment), §2 (aditividad), §3 (§C/reversibilidad), §4 L1/L2 (naming), §6 (RLS) = NO PASA.**
Resultado: **PASA** (merge autorizado tras OK del dueño) · **PASA CON OBSERVACIONES** · **NO PASA** (devuelto con hallazgos).

— Rúbrica del Gate por GSG (S5 · Gate de Excelencia, Opus). Se corre cuando S1+S4+S2 cierren.
