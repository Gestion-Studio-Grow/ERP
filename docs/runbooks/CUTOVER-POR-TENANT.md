# 🚀 Runbook — CUTOVER POR TENANT (salida a producción, uno por vez)

**Qué es:** la **checklist ejecutable de salida a vivo, por tenant**. Convierte "tenemos clientes en UAT" en
"sabemos exactamente cómo los sacamos a producción sin romper nada". Se corre **una vez por cliente**, **un
tenant a la vez**, el día que ese cliente pasa de UAT a operar de verdad.

- **Autor:** GSG (consolidación) · **Fecha:** 2026-07-12
- **Contexto de etapa:** hoy los 4 tenants (CH, MAGRA, Shine, A Dos Manos) están en **STAGING / UAT** — emails
  ficticios, cuentas compartidas y contraseñas informales son **intencionales y correctos en UAT** (no son
  deuda). Este runbook es el momento en que eso se regulariza. Ver `docs/ESTADO-ACTUAL.md §3`.
- **Regla de oro:** **un tenant por vez**, con **backup antes de cualquier borrado** y **confirmación explícita
  del dueño** en cada paso irreversible. Ante la duda → parar y preguntar.

## Leyenda de responsabilidad e irreversibilidad

| Marca | Significado |
|---|---|
| 👤 **DUEÑO** | Lo hace el dueño (secretos, cert, OK comercial, confirmación de borrado). Nunca el agente. |
| 🤖 **SISTEMA/PMO** | Lo prepara/ejecuta el sistema o el PMO (script, verificación, checklist) — reversible. |
| ⛔ **IRREVERSIBLE** | No se deshace: **emisión fiscal real** y **borrado de datos**. Requiere backup + OK explícito. |
| ✅ | Reversible / verificación. |

---

## 0. Pre-cutover — no arrancar sin esto

- [ ] 👤 **OK comercial del cliente** (la venta está concretada, ADR-030) — dispara la inversión. Sin esto, sigue en UAT.
- [ ] 👤 **Plan y precio definidos** para este tenant (ADR-078).
- [ ] 🤖 **Congelar el tenant** durante el cutover (avisar al cliente que no cargue datos mientras se corre).
- [ ] 👤 ⛔ **Backup / snapshot de la base ANTES de tocar nada** (habilitar PITR o snapshot manual, ADR-067). Es la red para el reset del paso 3. **Sin backup no se borra nada.**
- [ ] 🤖 Verificar que las migraciones estén aplicadas y `main` no esté schema-ahead (ADR-091) para este release.

---

## 1. Identidad y accesos (regularizar lo provisional de UAT)

- [ ] 👤 **Cambiar el email del OWNER al REAL del cliente** (hoy son de UAT: `macarenaarias21@gmail.com` en CH; `dueno@magra.com.ar` en MAGRA; provisionales en Shine/ADM) → y que el titular **inicie sesión** una vez para validar.
  - CH: confirmar de quién es la cuenta real (titular = **Carolina Haponiuk**).
- [ ] 👤 **Crear las cuentas del equipo con sus roles reales** — hoy hay **un solo OWNER por tenant**. Sumar `RECEPTION` / `PROFESSIONAL` según el organigrama del negocio (RBAC de 3 roles, ADR-017). Cada persona **su propia cuenta** (para que el `actor` del audit trail sirva).
- [ ] 👤 **Entregar credenciales por canal seguro** (gestor de contraseñas / llamada), **NUNCA por chat, mail ni este hilo**. Forzar cambio de contraseña en el primer login.
- [ ] 🤖 Verificar que ninguna cuenta de UAT (compartida/ficticia) quede activa con acceso productivo.

> Nota: las cuentas (`User`) son **datos maestros** — no se borran en el reset (paso 3); se **editan** (email real) y se **suman** (equipo).

---

## 2. Datos — reset de UAT (⛔ borrado, con backup del paso 0)

**Principio:** se **resetea lo transaccional y lo cargado como prueba**; **NO se toca lo maestro/config** que
el cliente ya dejó bien (catálogo, servicios, profesionales, configuración, branding). **Transaccional =
reseteable; maestro = sagrado.**

- [ ] 👤 ⛔ **Confirmar explícitamente el reset** (con backup del paso 0 hecho).
- [ ] 🤖 **Ejecutar el reset SCOPEADO por `tenantId`** (nunca global — ADR-036: borrado puntual por tenant, jamás un `TRUNCATE` de tabla que cruza tenants). Respetar el **orden de FKs** (borrar hijos antes que padres).
- [ ] 🤖 Verificar recuentos post-reset (transaccionales en 0; maestros intactos).
- [ ] 👤 **Recontar el STOCK real** e ingresarlo (el stock de UAT se descarta; el stock físico real se carga al abrir).

### Tablas que SÍ se limpian (transaccional / datos de UAT) — reseteable
`Appointment` · `Payment` · `Collection` · `Order` · `OrderItem` · `CashSession` · `CashMovement` ·
`StockMovement` · `StockPurchase` · `StockPurchaseItem` · `AccountReceivable` · `AccountPayable` ·
`PayableCheque` · `CommissionPayout` · `Review` · `WaitlistEntry` · `Invoice` · `OutboxEvent` ·
`ImportacionBancaria` · `MovimientoImportado` · `AuditLog` (log de la etapa UAT) · **`Client`** (clientes
cargados en la prueba) · bloqueos/novedades operativos (`ProfessionalBlock`, `BoxBlock`, `ProfessionalNews`).

> **Stock:** al limpiar `StockMovement` hay que **reponer el stock real** (`Product.stock`) con el conteo
> físico de apertura (paso arriba). No se deja el saldo de UAT.

### Tablas que NO se tocan (maestro / config) — **sagrado**
`Tenant` · `BusinessSettings` · `User` (se editan, no se borran — paso 1) · `Service` · `ServiceCategory` ·
`ServiceProduct` · `Product` (el catálogo; se ajusta el **stock**, no se borra el producto) · `Professional` ·
`WorkingHours` · `ProfessionalServiceCommission` · `Box` · `Resource` · `ServiceResource` · `MessageTemplate` ·
`Coupon` · `TenantFiscalCredential` (se **reemplaza** el cert en el paso 4, no se borra la tabla) · branding/tema.

### ⚠️ Confirmar por tenant ANTES de correr (borderline — no asumir)
- **`Supplier`** — proveedores cargados: normalmente **maestro** (el cliente los dejó bien) → **conservar**, salvo que sean de prueba.
- **`ReglaClasificacionBancoTenant`** — reglas de clasificación **aprendidas** en UAT: conservar si el aprendizaje es válido; resetear si se quiere empezar limpio.
- **`CarteraCliente`** — solo aplica al producto Contador (ADR-077); no aplica a estos 4 retail.
- **`Coupon`** — si hubo cupones de prueba, borrarlos; si son campañas reales, conservar.

> **Definir y firmar la lista exacta por tenant** antes de correr el reset (imprimir el recuento de filas por
> tabla, marcar limpia/conserva, y recién ahí ejecutar). Esta lista es el default; el cliente/dueño confirma los borderline.

---

## 3. Fiscal (ARCA) — de homologación a real (⛔ un tenant por vez)

> Base: `docs/runbooks/arca-homologacion.md` + ADR-093/066. Hoy todo corre con el **CUIL de testing del dueño**
> en homologación (fail-safe). El cutover lo pasa a **real**.

- [ ] 👤 **Cargar el CUIT REAL del tenant** (`Tenant.arcaCuit`) — el del titular del negocio, **no** el CUIL del dueño. (Hoy se setea por DB; la rama `fiscal/consola-cuit` agrega el campo en la consola.)
- [ ] 👤 **Cargar el certificado PRODUCTIVO del cliente** por consola (`/operador/tenants/[id]` → "Credencial fiscal · ARCA"), reemplazando el de homologación. Queda cifrado en reposo (ADR-093); el material lo pega el dueño, nunca el agente (ADR-041).
- [ ] 🤖 **Recordar el guard fail-closed (es la protección, no tocarla):** en modo `real`, si el **CUIT del subject del certificado ≠ `Tenant.arcaCuit`**, `crearAfipClient` **aborta** (nunca firma con el cert de otro contribuyente).
- [ ] 👤 ⛔ **Pasar el tenant a `ARCA_MODO=real`** (+ `ARCA_INVOICING_ENABLED=true` + `CRON_SECRET` si se usa el pipeline automático). **Un tenant a la vez**, con confirmación explícita — a partir de acá **puede emitir facturas reales**.
- [ ] 🤖 **Verificar punto de venta y numeración** correctos (`Tenant.arcaPuntoVenta`; la numeración la lleva ARCA).
- [ ] 👤 ⛔ **Emisión de prueba real controlada** (una factura, verificar CAE real + datos del comprobante). Es irreversible: emitir de verdad. Confirmar que el comprobante sale con el CUIT/PV/numeración correctos.

---

## 4. Estado y comercial

- [ ] 🤖 **Pasar el tenant de `TRIAL` a `ACTIVE`** (el campo de estado ahora sí refleja la realidad comercial).
- [ ] 👤 **Confirmar plan/precio** aplicado (ADR-078) y cualquier flag de módulos del producto (ADR-089).
- [ ] 🤖 Deploy del sitio del tenant si aún no estaba live (Gate 1, ADR-091 — recordar: `main` auto-deploya; migración antes).

---

## 5. Verificación final (nada se da por hecho)

- [ ] 🤖 **Gate visual + contraste AA verdes** en la **vidriera pública** y en el **backoffice** del tenant (ADR-090 — render real, no DOM).
- [ ] 👤 **Flujo completo probado por el cliente**, de punta a punta: reserva/turno (servicios) o compra/POS (retail) → cobro → comprobante. Que lo haga el cliente, no solo nosotros.
- [ ] 🤖 **Aislamiento:** confirmar que el tenant no ve datos de otro (RLS 43/43, ADR-092) — sanity check post-cutover.
- [ ] 🤖 **Las OTRAS apps siguen sanas (200)** tras el deploy/cambios (`magra-erp`, `chestetica-erp`, `shinevelas-erp`, `adosmanos-erp` + `gsg-erp` consola).
- [ ] 🤖 **Un movimiento real de humo:** una venta/turno real chico verificado en caja + (si aplica) su factura real.

---

## 6. Rollback / si algo sale mal

- **Datos:** restaurar el **snapshot/PITR del paso 0**. Por eso el backup es bloqueante.
- **Fiscal:** volver `ARCA_MODO` a `homologacion` o `stub` **corta la emisión real** al instante (ADR-093, fail-safe). Lo ya emitido en real **no se deshace** (se gestiona con nota de crédito por el circuito fiscal normal).
- **Accesos:** revocar/rotar credenciales entregadas si hubo filtración.
- **Estado:** volver `ACTIVE`→`TRIAL` es trivial (campo técnico), pero no revierte lo emitido ni lo borrado.

---

## Resumen de irreversibles del cutover (⛔)

1. **Borrado de datos de UAT** (paso 2) → mitigado por backup del paso 0.
2. **Emisión fiscal real** (paso 3) → solo tras cert real + guard verificado + OK del dueño, un tenant por vez.

Todo lo demás es reversible. **Un tenant por vez; backup antes de borrar; el dueño confirma cada ⛔.**

— Elaborado por GSG
