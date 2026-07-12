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
4. **Lo único que te queda reconciliar: `order-core.ts`** (ver §2). Sprint lo reescribió (+274) y su
   migración de concurrencia **ya está aplicada a Neon**. Tu core gana, pero **preservá las 3 guardas**.

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

## 2. LO QUE TENÉS QUE RECONCILIAR — `order-core.ts` (lo crítico para vos)

`fix/sprint-entregable` (ya en `main`, `018eeaa`) **reescribió `order-core.ts` (+274)** e introdujo guardas de
concurrencia a nivel DB. Tu rediseño del core probablemente reformule esta misma superficie. **Por la regla de
gobierno, gana tu core** — pero **estas 3 guardas deben SOBREVIVIR** (cierran plata/stock real del primer día):

- **A-1 · `Order.idempotencyKey` + `@@unique([tenantId, idempotencyKey])`** — doble-submit de vidriera → un
  solo pedido. El código escribe la clave **solo** en el camino vidriera; POS/API omiten el campo.
- **A-5 · `@@unique(CashMovement[tenantId, orderId, type])`** — doble-click en "cobrado" → un solo asiento de
  caja (antes duplicaba y el arqueo quedaba con plata de más). `orderId` NULL no colisiona.
- **A-6 · `Invoice.mpPaymentId` + `@@unique([tenantId, mpPaymentId])`** — webhook MP duplicado → una sola factura.

> **Los índices YA existen en Neon.** Si tu rediseño cambia el modelo de Order/Invoice/CashMovement,
> **mantené estas columnas e índices** (o su equivalente) o reintroducís las carreras. Corré
> `order-core-guards.test.ts` / `invoice-core.test.ts` / `cash-sale-unique.test.ts` antes de mergear.

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
