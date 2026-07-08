# 🧾 Runbook — Encender ARCA real (paquete §C, "1 clic" del dueño)

**Objetivo:** pasar la facturación electrónica de **sandbox/stub** a **real**, aplicando las migraciones
fiscales pendientes y cargando las credenciales de ARCA. Es el **§C** del sprint 2026-07-08: todo lo
reversible ya está hecho y verde en la rama; acá quedan **solo los pasos irreversibles que ejecuta el dueño**.

- **Autor:** PMO/Arquitecto · **Fecha:** 2026-07-08 · **Rama con el trabajo:** `claude/sprint-startup-generic-rf6x0m`
- **Regla de secretos (ADR-041):** los valores (certificado, clave, flags) van al panel de **Environment
  Variables de Vercel** (o `.env` local), **NUNCA en un campo de la app ni commiteados al repo**. Los pega
  **siempre el dueño**.
- **Regla de oro del orden:** **primero migraciones, después deploy.** La rama trae el schema con
  `Invoice.{neto,iva,total}` en `Decimal(14,2)` (ADR-057) — si se deploya **antes** de aplicar la migración,
  Prisma espera columnas Decimal que en la DB todavía son Float → rompe. Ver §2.

---

## 0. Pre-cheque (estado de partida)
- Prod vivo en Vercel + Neon; auto-publish **apagado** (push a `main` no publica).
- Facturación hoy en **modo stub**: la pantalla `/admin/facturacion` funciona sin credenciales (CAE simulado).
- **10 migraciones sin aplicar** en `prisma/migrations/` (incluida la de Decimal de hoy). El schema de la
  rama está **adelante** de la DB de prod — es el estado normal de Gate 2.

---

## 1. C2 — Aplicar las migraciones fiscales (Gate 2, Neon)

> Esto crea/ajusta las tablas fiscales (`Invoice`, `OutboxEvent`, config fiscal) y convierte el dinero a
> `Decimal(14,2)`. Es **irreversible** sobre la DB → por eso es acción del dueño.

1. **Backup / punto seguro de Neon** (branch de Neon o snapshot) antes de tocar nada.
2. Con la `DATABASE_URL` de **producción** en el entorno, correr:
   ```bash
   npx prisma migrate deploy
   ```
   Aplica **en orden** todas las pendientes, terminando en `20260708120000_invoice_money_decimal`
   (Float → `Decimal(14,2)`; el cast es seguro, los importes ya venían redondeados a 2 decimales, ADR-057).
3. Verificar que `prisma migrate status` quede **sin pendientes**.

**Migraciones que se aplican (orden):** `add_invoice_outbox` · `add_pos_orders` · `control_plane_tenant` ·
`add_cash_register` · `add_product_track_stock` · `add_stock_purchases` · `add_stock_ledger` ·
`add_tenant_fiscal_config` · `fiscal_invoice_align` · **`invoice_money_decimal`**.
*(Si alguna ya estaba aplicada, `migrate deploy` la saltea sin problema.)*

---

## 2. Deploy de la rama (después de las migraciones)

Recién **con las migraciones aplicadas**, mergear a `main` y deployar en Vercel (Gate 1, tu *"deployá"*).
El orden importa: **migración → deploy**, nunca al revés (ver regla de oro).

---

## 3. C1 — Cargar las credenciales de ARCA (Environment Variables de Vercel)

> Dos fases seguras: primero **homologación** (testing oficial de ARCA, sin emitir nada real), después **real**.

### 3.a Datos fiscales del emisor por tenant (una vez, en la DB o alta)
- `Tenant.arcaCuit` = CUIT del emisor (11 dígitos, sin guiones).
- `Tenant.arcaPuntoVenta` = punto de venta habilitado en ARCA.
- `Tenant.arcaHomologacion` = `true` para testing, `false` para producción.

### 3.b Ambiente de HOMOLOGACIÓN (probar sin riesgo)
En Vercel (Environment Variables):
```
ARCA_MODO=homologacion
ARCA_CERT_PEM=<certificado de PRUEBA del emisor, PEM>
ARCA_KEY_PEM=<clave privada de PRUEBA, PEM>
```
Probar desde `/admin/facturacion` → botón **"Banco de pruebas: emitir factura de prueba"**. El CAE que
devuelve es válido **solo** en homologación (no es una factura real).

### 3.c Ambiente REAL (facturar de verdad)
Cuando homologación esté OK:
```
ARCA_MODO=real
ARCA_CERT_PEM=<certificado PRODUCTIVO del emisor, PEM>
ARCA_KEY_PEM=<clave privada PRODUCTIVA, PEM>
ARCA_INVOICING_ENABLED=true
```
- `ARCA_INVOICING_ENABLED=true` habilita que el Core cree facturas al cobrar (turnos/pedidos).
- El **worker** (`/api/cron/arca-outbox`, ya en `vercel.json`, diario) empieza a drenar el outbox y a
  obtener el CAE **solo** con este flag en `true`. Requiere `CRON_SECRET` seteado (protección del cron).

---

## 4. Verificación post-encendido
- `/admin/facturacion`: emitir una operación real chica → la factura pasa de **Pendiente** a **Autorizada**
  con su **CAE** y número (lo hace el worker o el botón "Procesar pendientes").
- Revisar que los montos se muestren correctos (2 decimales) — ya persistidos en `Decimal(14,2)`.

---

## 5. Rollback / si algo sale mal
- **Antes de facturar real:** dejar `ARCA_MODO=homologacion` (o `stub`) y `ARCA_INVOICING_ENABLED` sin
  setear → no se emite nada real.
- **La migración de Decimal** no se revierte a Float en caliente (perdería precisión); por eso el **backup
  del paso 1** es la red. El cast Float→Decimal no pierde datos (importes ya a 2 decimales).

---

## Anexo — Flags de este sprint (referencia rápida)
| Flag (env) | Qué hace | Default |
|---|---|---|
| `ARCA_INVOICING_ENABLED` | El Core crea facturas al cobrar | off |
| `ARCA_MODO` | `stub` \| `homologacion` \| `real` | stub |
| `ARCA_CERT_PEM` / `ARCA_KEY_PEM` | Certificado + clave del emisor (por ambiente) | — |
| `CRON_SECRET` | Protege los crons (`/api/cron/*`), fail-closed | — |
| `MODULE_REGISTRY_ENABLED` | Enciende el gating por módulo del backoffice (reversible, no fiscal) | off |

— Elaborado por GSG (PMO/Arquitecto). Reversible/doc-only; ningún paso se ejecutó — los corre el dueño.
