# 🤝 HANDOFF — de la sesión de PRODUCTOS/CONSOLIDACIÓN → a la sesión que rediseña el CORE

> **Para quién:** la sesión (Dispatch) que **rediseña el core del back con función de módulos**.
> Es el **espejo** del `handoff-core-diseño`: aquel te avisaba qué había en vuelo; éste te dice **qué
> ya aterrizó en `main`**, qué **tenés que reconciliar**, y qué invariantes **no podés romper**.
>
> **Fecha:** 2026-07-12 · **Autor:** GSG (sesión de productos/consolidación) · **Base:** `origin/main` = `018eeaa`.
> **Regla de oro:** si algo acá choca con el repo, gana el repo. Verificá los HEAD con `git log` antes de operar.

---

## 0. TL;DR

1. **La consolidación de las 7 ramas del handoff está 100% ejecutada.** Todo lo consolidable ya vive en
   `main` (`018eeaa`) y está **deployado** (8 superficies en 200: 4 apps + consola `gsg-erp` + 3 productos).
2. **Regla de gobierno fijada por el dueño (2026-07-12):** ante incongruencia entre sesiones, **gana la
   sesión de los PRODUCTOS NUEVOS** (tienda de módulos, identidad por producto, 3 productos, consola
   `gsg-erp`). Al consolidar lo viejo, **obsoletar lo duplicado que ya está mejorado** — sin mantener dos
   versiones. Cuando tu rediseño del core aterrice, **gana el core** sobre lo que toque; se re-verifica.
3. **Contexto de datos (guardarraíl duro):** son **clientes reales pero PRE-PROD**, ya configurando datos.
   El reset futuro será solo de **tablas transaccionales**; **NUNCA** de **servicios ni datos maestros duros**.
4. **⚠️ ACLARACIÓN DEL DUEÑO (2026-07-12): NO hay un "rediseño del core" pendiente ni una rama aparte.** La
   "reformulación del modelo" a la que se refería el dueño **ES lo que YA se construyó y está en `main`**: la
   consola nueva (`gsg-erp`) para abrir tenants, el **modelo núcleo + plugins instalables** (cómo se concibe un
   tenant nuevo, ADR-089) y la **suite de los 3 productos de facturación**. Todo eso está vivo y deployado.
   Por lo tanto **no queda reconciliación pendiente**: las guardas de concurrencia de sprint (§2) son del motor
   transaccional, que la reformulación NO tocó → están landeadas, coherentes y con su migración aplicada. La §2
   queda como **referencia técnica dormida** (por si algún día se reescribe el motor de venta/factura), no como
   tarea activa. Estado neto: **la suite está terminada; no hay ítem bloqueante abierto.**

---

## 1. Qué aterrizó en `main` esta sesión (018eeaa)

| Bloque | Commit | Estado |
|---|---|---|
| **Tienda de módulos** (ADR-089): núcleo + plugins instalables por producto | `aacd640` | vivo + UAT verde |
| **Ola 0** · consola-CUIT (CUIT emisor, ADR-066) | `309f532` | vivo |
| **Ola 1** · 3 fronts (CH premium v4 / Shine velas / Magra editorial) + fix acceso admin | `…e318734` | vivo |
| **Ola 2** · backoffice carnicería MAGRA (inventario/lotes/despiece) | `4b7cff1` | vivo |
| **Ola 3** · guardas de concurrencia (sprint-entregable) | `018eeaa` | vivo + **migración aplicada a Neon** |

**Migración aplicada a Neon (Gate 2, con OK explícito del dueño):**
`20260712120000_sprint_entregable_concurrency_guards` — `Invoice.mpPaymentId` + `Order.idempotencyKey`
(nullable) + 3 índices únicos. `migrate status` = **"up to date"**. No hay migraciones pendientes.

**Migración DESACOPLADA (no aplicada, la enciende el dueño cuando active carnicería):**
`prisma/pending-gate2/CarniceriaRubro.sql` — trae su propia policy RLS; el código degrada con
`hasCarniceriaSchema()` (pantallas "En preparación"). **NO** está en `schema.prisma` → main no queda schema-ahead.

---

## 2. LO QUE TENÉS QUE RECONCILIAR — 4 SUPERFICIES (no solo `order-core.ts`)

`fix/sprint-entregable` (ya en `main`, `018eeaa`) introdujo guardas de concurrencia. Tu rediseño del core
probablemente reformule esta zona. **Por la regla de gobierno, gana tu core** — pero **las 3 guardas deben
SOBREVIVIR** (cierran plata real del primer día). ⚠️ **CORRECCIÓN (Dispatch, verificado en código): las guardas
NO viven todas en `order-core.ts`.** Reconciliar solo ese archivo PIERDE A-6 en silencio → vuelve la doble
factura del webhook MP. Son **4 superficies de reconciliación, cada una con su checklist**:

| Guarda | Superficie a preservar | Qué NO romper |
|---|---|---|
| **A-1** doble-submit vidriera | `src/lib/order-core.ts` (+ `order-actions.ts`) | `Order.idempotencyKey` + `@@unique([tenantId,idempotencyKey])`. La clave se escribe **solo** en el camino vidriera; POS/API omiten el campo. |
| **A-5** doble-cobro / caja | `src/lib/caja/cash-sale.ts` | El enforcer es el índice DB `@@unique(CashMovement[tenantId,orderId,type])`, PERO en código lo que hay que preservar es que **el asiento de caja quede DENTRO de la misma transacción que la venta (I7 · atomicidad)**. Si el core saca la caja a una tx aparte, rompés I7 aunque el índice exista. |
| **A-6** webhook MP duplicado | **`src/lib/invoice-core.ts`** (NO order-core) | `Invoice.mpPaymentId` + `@@unique([tenantId,mpPaymentId])` — dedup por payment_id. **Superficie separada: es fácil perderla si solo mirás order-core.** |
| schema | `prisma/schema.prisma` | Los campos/índices ya están en la DB (migración `20260712120000` aplicada). Si tu core cambia el modelo, mantené las columnas e índices o su equivalente. |

> **Los índices YA existen en Neon.** Tests obligatorios antes de mergear, uno por superficie:
> `order-core-guards.test.ts` · `caja/cash-sale-atomic.test.ts` + `cash-sale-unique.test.ts` · `invoice-core.test.ts`
> · `invoice-idempotency.test.ts`. Y `npm run gates` (ojo: hoy lint rojo = deuda pre-existente, y visual/visual-aa
> rojos = falta Playwright en el worktree = entorno, no regresión; verificá que no sea código tuyo).

---

## 3. Invariantes y arquitectura que el core NO puede romper

- **Invariantes transaccionales I1–I7** (ADR-064): I2 (comprobante⇔venta 1:1) e I7 (venta+caja atómica) están
  **cerrados en prod** (`20260710120000_invoice_origin_idempotency_unique`). No los reintroduzcas rotos.
- **RLS enforced** (ADR-092): toda tabla nueva con `tenantId` necesita su policy en el **mismo release**
  (`prisma/rls/0001_enable_rls.sql` + `check-coverage.mjs`). Sprint no agregó tablas; carnicería trae su RLS.
- **Función de módulos = la nueva fundación** (ADR-054/055/089). Construí SOBRE esto, no en paralelo:
  - **`ALL_ITEMS` + `ShellItem` viven en `src/lib/admin-nav-items.ts`** (FUENTE ÚNICA). La nav del admin, el
    gating por-URL del producto y los ítems de rubro (retail/carnicería) salen de ahí. **No vuelvas a la
    lista inline en `AdminShell.tsx`** (era la duplicación vieja que esta consolidación obsoletó — §Ola 2).
  - La **nav/Inicio se componen de lo instalado** (`Tenant.modules`), nunca hardcodeado.
  - El motor **no** debe tener `if producto` (ADR-061): si aparece, falta un eje (módulo/flag/perfil/blueprint).
  - Núcleo por producto = campo `nucleoPara` en los descriptores (única fuente, `src/modules/nucleo.ts`).
- **`main` auto-deploya a prod** (ADR-091): migración aplicada **antes** del merge; nunca `main` schema-ahead
  del código en la dirección peligrosa. Gate visual + AA son bloqueantes (ADR-090).

---

## 4. Deuda / notas

- **Drift cosmético de migración:** Neon registró `20260705150000_add_tenant_fiscal_config`; el repo tiene
  `…150001` (rename +1s por colisión de timestamp vieja). **No bloquea** (`migrate status` = up to date). No
  renombrar en prod. Regla: prohibir dos migraciones al mismo timestamp; la próxima usa ts > `20260712120000`.
- **`producto/magra-backoffice`** ya está en `main`, pero su migración cárnica sigue en `pending-gate2/` — la
  aplica el dueño cuando quiera encender el rubro carnicería en Magra.
- **Worktree de sprint** `C:/fixsp` quedó como origen; su commit ya está en `main`.

— Elaborado por GSG
