# 🚦 Gate de Excelencia — Fase D/E de ADR-060 — VEREDICTO S5/Opus: ⛔ **NO PASA**

> **Gatea:** CxP (D2 + cheque diferido) + CxC (D3 fiado). Commits S1 `4fa8038` · S4 `315b785`.
> **Rúbrica:** `gate-fase-DE-adr060-rubrica-S5.md`. **Revisor:** S5 (Gate, Opus) · 2026-07-09.
> **Resultado:** **NO PASA** por **1 bloqueante duro (§1 atomicidad)** + **1 hallazgo de coherencia (§5)**.
> El resto del incremento es **excelente** — se devuelve para 2 fixes acotados y **re-gate inmediato**.

---

## ⛔ Bloqueante #1 (§1 — atomicidad / sobre-cobro) — el que frena el merge

**Era el hallazgo que pre-marqué en la rúbrica y levanté a S1; NO se cerró.**

`settlePayable`/`settleReceivable` → `recordCollection` → `tenantTransaction` **sin `isolationLevel`** =
**READ COMMITTED**. Estar en la misma transacción **no** evita el race read-then-write:

```
Tx A: SELECT collections (saldo=1000) → validate(1000) OK → INSERT 1000
Tx B (concurrente): SELECT collections (aún ve saldo=1000) → validate(1000) OK → INSERT 1000
Ambas commit → 2000 cobrados sobre una deuda de 1000 → OVERPAID. Sobre-cobro.
```

- La guarda `EXCEEDS_BALANCE` (`validateNewCollection`) es correcta **secuencialmente**, pero **la derrota la
  concurrencia** (dos requests, o un doble-click en "registrar pago"). No hay lock de fila, ni unique, ni
  Serializable.
- **No existe test de doble cobro concurrente** (los tests de sobre-cobro son puros/secuenciales).
- **Riesgo hoy = 0** (flags OFF, migraciones sin aplicar, gateado por perfil → nada en prod). Pero es un
  defecto de **corrección de dinero** que el dueño pidió gatear con dureza, y no se puede consolidar así.

**Fix (trivial, el infra ya lo soporta):**
1. `recordCollection` (`collection-repo.ts`) y el path de acreditación de cheque (`payable-service.ts`,
   el `tx.collection.create` directo): correr la tx a **`{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }`**
   (`tenantTransaction` ya reintenta ante conflicto de serialización). Alternativa: `SELECT … FOR UPDATE`
   sobre la fila del origen (AccountPayable/AccountReceivable/Order).
2. Agregar **test de concurrencia:** dos settlements del saldo total en paralelo → el 2º rechazado /
   sin OVERPAID.

---

## ⚠️ Hallazgo #2 (§5 — coherencia con ADR-060) — a corregir en el mismo ciclo

**CxC (fiado) está gateado a `enterprise`**, pero ADR-060 D3 lo define **`perfilMin: lite` + rubro-gated**
(fiado = comercio de barrio, el driver es el Comercio, no la Empresa):

```ts
// src/app/admin/(dashboard)/cuentas-a-cobrar/page.tsx
if (profile !== "enterprise") { return <EmptyState "Disponible en la edición Empresa" /> }
```

Como está, un **Comercio (lite) de rubro fiado NO puede usar fiado** — se le anuncia como Empresa. Contradice
D3 ("Comercio = fiado light sin vencimiento; Empresa = + vencimiento/recordatorio, aditivo sobre la misma
tabla"). **Fix:** gatear CxC por **lite + rubro** (module-gating del ítem, como ya está en la nav), no por
enterprise; el plus de vencimiento/recordatorio (J60) es lo aditivo de Empresa, no la pantalla entera.
*(CxP sí es correctamente enterprise-only.)*

---

## ✅ Lo que SÍ pasó (excelente — no tocar)

| Bloque | Estado | Evidencia |
|---|---|---|
| §2 Aditividad D2/D3 | ✅ | `ALTER TYPE ADD VALUE 'PAYABLE'` (PG12+ manejado, no usado en misma tx) + 2 enums + 3 tablas nuevas; nullable/Decimal(14,2); **Payment intacto**; cero destructivo; `rollback.sql` con notas finas (DebtStatus compartido, PAYABLE inocuo) |
| §3 Cheque diferido | ✅ | Máquina de estados válida (PENDING→DELIVERED→CLEARED/BOUNCED, terminales sin salida); **solo `CLEARED` paga** (baja saldo); PENDING/DELIVERED = compromiso (cash-flow); **BOUNCED/CANCELED no descuentan** |
| §4 Aging | ✅ | Puro, compartido AR+AP; `NO_DUE_DATE` para fiado light (sin vencimiento); buckets CURRENT/D1_30/D31_60/D61_90/D90_PLUS; SETTLED/OVERDUE/DUE_SOON. *(nota menor: confirmar tz AR en el borde de día — hay tests)* |
| §5 Gate de perfil | ✅ (CxP) / ⚠️ (CxC) | Las 4 páginas guardan por perfil; CxP correcto, CxC mal-gateado (hallazgo #2) |
| §6 RLS | ✅ | AccountPayable/AccountReceivable/PayableCheque con `tenantId` → **gate:rls 38/38 sin drift** |
| §7 Vallas | ✅ | **tsc limpio · 698 tests verdes** |
| §C no ejecutado | ✅ | 3 migraciones escritas, **sin aplicar** a Neon; cola con Decimal frenada; sin deploy |

---

## Veredicto y próximo paso
**NO PASA** — no se mergea a main. Devuelto a S1 (fix #1, bloqueante) y S4 (fix #2). Ambos fixes son
acotados (1 línea de isolation + 1 test; 1 cambio de gate). **Re-gate inmediato** cuando cierren: si con los
2 fixes queda verde, mergeo `--no-ff`. Nada aplicado a prod, §C sigue elevado.

— Gate por GSG (S5 · Gate de Excelencia, Opus).
