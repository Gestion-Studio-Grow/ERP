# 🛂 Gate de Excelencia — Fase D/E de ADR-060 (rúbrica S5/Opus)

> **Qué gatea:** CxP y CxC sobre las fundaciones de Fase C. **S1** = `AccountPayable` (D2, + `PayableCheque`
> cheque diferido) + `AccountReceivable` (D3, fiado) + loaders · **S4** = pantallas `/admin/cuentas-a-pagar`
> y `/admin/cuentas-a-cobrar`.
> **Foco duro (lo que pidió el dueño):** aditividad real · **uso correcto de `Collection` para pagos/cobros
> parciales — sin sobre-cobrar, ATÓMICO** · cheque diferido bien modelado · **aging correcto** · flags OFF ·
> §C no ejecutado · RLS de las tablas nuevas · suite+tsc verde.
> **Revisor:** S5 (Gate, Opus). Cada ⛔ bloquea el merge. **Base:** `collection.ts`/`collection-repo.ts` (D9),
> ADR-060 D2/D3.

---

## 🔴🔴 §1 — ATOMICIDAD REAL del cobro/pago parcial (el punto #1, correctness de dinero)

> **Hallazgo pre-detectado (levantado a S1):** hoy `recordCollection` corre en `tenantTransaction` **sin
> `isolationLevel`** → **READ COMMITTED**. Estar en la misma tx **NO** evita el race read-then-write: dos
> cobros concurrentes contra el mismo origen leen el mismo saldo, ambos validan y ambos insertan →
> **SOBRE-COBRO**. El infra ya soporta **Serializable + retry** (`rls.ts`). Esta ola debe cerrarlo.

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| S1a | El settlement de CxP/CxC corre a **Serializable** (o con lock de fila `SELECT … FOR UPDATE` sobre el origen/saldo). Same-tx a READ COMMITTED **no** alcanza. | `recordCollection`/loaders D2/D3 pasan `{ isolationLevel: Serializable }` o lockean; grep de `isolationLevel`/`FOR UPDATE`. | sí |
| S1b | **No sobre-cobra:** validación `EXCEEDS_BALANCE` aplicada a CxP y CxC (salvo `allowOverpay` explícito y justificado). | leer los callers; test de "cobro > saldo → rechazado". | sí |
| S1c | **Test de concurrencia / doble cobro:** existe un test que prueba que dos cobros del saldo total no dejan OVERPAID (o que el 2º es rechazado). | test presente y verde. | sí |
| S1d | D2/D3 **REUSAN** `computeSettlement`/`recordCollection` — no reinventan la aritmética del saldo ni bypassean la guarda. | revisión de los loaders. | sí |

---

## §2 — Aditividad REAL de D2/D3 (+ PayableCheque)

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| A1 | `AccountPayable`, `AccountReceivable`, `PayableCheque` = **`CREATE TABLE` nuevas**; cualquier FK a tablas vivas (Supplier/Client) es **nullable** o a tabla nueva. | leer los `.sql`. | sí |
| A2 | **Cero destructivo:** sin `DROP`/`NOT NULL` sobre columna existente poblada/`RENAME`/cambio de constraint. **Payment sigue intacto.** | `grep -riE "DROP\|NOT NULL\|RENAME\|ALTER COLUMN\|Payment" prisma/migrations/<nuevas>/*.sql`. | sí |
| A3 | Montos/saldos en **`Decimal(14,2)`** (ADR-057); contrato Core en `number`, `round2`, conversión en el borde del repo. | leer modelos + repos. | sí |
| A4 | **`rollback.sql`** presente en las 3 migraciones (orden inverso, `DROP IF EXISTS`). | `ls prisma/migrations/<nuevas>/rollback.sql`. | sí |

---

## §3 — Cheque diferido bien modelado (D2)

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| K1 | `PayableCheque` con: número, banco, **fecha de emisión**, **fecha diferida (futura)**, endoso, **estado**. | leer el modelo. | sí |
| K2 | **Máquina de estados** sensata (ej. `EMITIDO → DEPOSITADO → ACREDITADO`/`RECHAZADO`) — transiciones válidas, sin saltos ilegales. | leer la lógica de estado. | — |
| K3 | Un cheque diferido **no** cuenta como pagado hasta acreditarse (no baja el saldo de CxP antes de tiempo). | revisar cómo el cheque impacta el settlement de la CxP. | sí |
| K4 | Monto del cheque en `Decimal(14,2)`. | modelo. | — |

---

## §4 — Aging correcto (CxC/CxP)

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| G1 | Buckets de aging (ej. `por vencer` · `0–30` · `31–60` · `61–90` · `90+`) computados desde **vencimiento** vs hoy. | leer la lógica (pura, testeable). | — |
| G2 | **Fechas correctas:** tz `America/Argentina/Buenos_Aires` (no UTC crudo); **límites exactos** sin off-by-one (30 vs 31 días). | test de bordes de bucket. | sí |
| G3 | Comercio (fiado light) **sin** vencimiento/aging; Empresa (J60) **con** vencimiento/recordatorio — el aging es aditivo del perfil Empresa. | revisión. | — |
| G4 | Aging **no** cobra ni muta saldo — solo clasifica. | revisión. | — |

---

## §5 — Reversibilidad · flags OFF · §C no ejecutado

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| C1 | Las 3 migraciones **escritas y SIN aplicar** a Neon. La cola con el Decimal **sigue frenada**. | no hay `migrate deploy`. | sí |
| C2 | Loaders de CxP/CxC **gateados por perfil** (CxP=enterprise, CxC=default-OFF rubro) — igual patrón que Libros: con perfil OFF (prod) el loader **no corre** → columnas sin aplicar **no rompen**. Pantalla Y export/route guardados. | leer las page.tsx + routes. | sí |
| C3 | Sin deploy, sin Neon pago, sin ARCA, sin secretos. | diff limpio. | sí |

---

## §6 — RLS de las 3 tablas nuevas

| # | Criterio | Verificación | ⛔ |
|---|---|---|---|
| R1 | `AccountPayable`, `AccountReceivable`, `PayableCheque` tienen **`tenantId`** + FK a Tenant. | leer modelos. | sí |
| R2 | `npm run gate:rls` verde con conteo **35 → 38** (3 nuevas), **sin drift**; nota de re-ejecutar `0001_enable_rls.sql` presente. | correr `gate:rls`. | sí |
| R3 | Loaders filtran por tenant (`tenantTransaction`/predicado `tenantId`) — nunca cross-tenant. | revisión. | sí |

---

## §7 — Vallas técnicas + tests de correctness

| # | Valla | Umbral | ⛔ |
|---|---|---|---|
| V1 | `tsc --noEmit` | 0 errores | sí |
| V2 | `npm test` | ≥ 674 verde, con **tests nuevos**: cobro parcial baja saldo · cobro > saldo rechazado · **doble cobro concurrente no sobre-cobra** · cheque diferido no paga antes de acreditar · **bordes de aging** · fiado light vs Empresa | sí |
| V3 | `npm run gate:rls` | 38/38 sin drift | sí |
| V4 | build | Vercel/CI (junction bloquea en worktree; tsc cubre compilación) | — |

---

## Veredicto
- [ ] §1 atomicidad real (Serializable/lock, no sobre-cobra) · [ ] §2 aditividad + Payment intacto ·
      [ ] §3 cheque diferido · [ ] §4 aging · [ ] §5 §C no ejecutado + gated · [ ] §6 RLS 38/38 · [ ] §7 vallas

**Un solo ⛔ en §1 (atomicidad/sobre-cobro), §2 (aditividad/Payment), §5 (§C), §6 (RLS) = NO PASA.**
Resultado: **PASA** (merge tras OK) · **PASA CON OBSERVACIONES** · **NO PASA** (devuelto con hallazgos).

— Rúbrica del Gate por GSG (S5 · Gate de Excelencia, Opus). Se corre cuando S1+S4 cierren.
