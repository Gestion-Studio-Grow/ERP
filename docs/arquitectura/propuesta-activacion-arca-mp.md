# Activación REAL de ARCA + Mercado Pago — lo que el dueño tiene que cargar (Gate 2)

**Estado:** 🟡 **ELEVADO al dueño. Nada de esto lo hace el agente.** Los módulos están construidos y corren en **modo sandbox por defecto** (sin credenciales). Esta es la lista **exacta y precisa** para pasarlos a real.
**Fecha:** 2026-07-07 · **Opus (T3)**
**Regla dura (ADR-041 §FASE 2):** los secretos los pega **SIEMPRE el dueño** en el entorno/secret store, **nunca** el agente, nunca en el repo, nunca por chat.
**Firma:** — Elaborado por GSG

---

## 0. Resumen (qué está listo y qué falta)

- **Construido y verde (sandbox):** módulos ARCA (facturación) y Mercado Pago (cobros/links de pago),
  con su UI de backoffice (`/admin/facturacion`). Funcionan **sin credenciales** (CAE simulado / link
  de prueba).
- **Para activar en real, el dueño hace 3 cosas:** (A) cargar credenciales en el entorno, (B) prender
  los modos, (C) aprobar las migraciones fiscales a Neon (si no están aplicadas). Detalle abajo.

---

## A. Credenciales que carga el dueño (variables de entorno / secret store)

> Van en el entorno del despliegue (Vercel/Netlify → Environment Variables, o el secret store).
> **NO** en el repo. El código ya tiene el punto de inyección para cada una.

### A.1 · ARCA (facturación electrónica — WSAA + WSFEv1)

| Variable de entorno | Qué es | Obligatoria | Notas |
|---|---|---|---|
| `ARCA_MODO` | Prende el cliente real. Valor: `real` | Sí (para real) | Sin setear o ≠ `real` → **stub** (sandbox). |
| `ARCA_CERT_PEM` | **Certificado X.509 del emisor** (PEM), emitido por ARCA para el CUIT | Sí | Secreto. Se obtiene en ARCA (clave fiscal → Administración de Certificados Digitales). |
| `ARCA_KEY_PEM` | **Clave privada** (PEM) asociada al certificado | Sí | Secreto. La genera el dueño junto con el CSR del certificado. |

**Metadata fiscal NO secreta del tenant** (va en la DB, la carga el operador desde la consola —
columnas ya existentes en `Tenant`; no son secretos):

| Campo (DB `Tenant`) | Qué es | Notas |
|---|---|---|
| `arcaCuit` | CUIT del emisor (11 dígitos, sin guiones) | Debe coincidir con el del certificado. |
| `arcaPuntoVenta` | Punto de venta habilitado en ARCA (WSFE) | El dueño lo habilita en ARCA. |
| `arcaHomologacion` | `true` = testing de ARCA, `false` = producción | Empezar en `true`, pasar a `false` al validar. |

### A.2 · Mercado Pago (cobros / links de pago — Checkout Pro)

| Variable de entorno | Qué es | Obligatoria | Notas |
|---|---|---|---|
| `MP_MODO` | Prende los cobros reales. Valor: `real` | Sí (para real) | Sin setear o ≠ `real` → **stub** (link de prueba). |
| `MP_ACCESS_TOKEN` | **Access token** de la cuenta MP del cobrador | Sí | Secreto. MP → Tus integraciones → Credenciales de **producción** (o de prueba para testear). |
| `MP_WEBHOOK_SECRET` | Secreto para validar la firma de los webhooks de pago | Sí (para que la auto-facturación entre) | Ya usado por el webhook (`/api/webhooks/mercadopago`, hardening previo). MP → Webhooks → firma secreta. |
| `MP_PUBLIC_KEY` | Public key de MP | **No** (opcional) | Sólo si más adelante se embebe el checkout dentro del sitio (Bricks). Para el link (init_point) **no hace falta**. |

> **Multi-tenant:** hoy el despliegue es **un sitio por tenant** (`FORCE_TENANT_SLUG`), así que estas
> variables son **por sitio** (las de ese tenant). Si en el futuro se sirve varios tenants desde un
> mismo despliegue, el token por tenant sale de un secret store keyeado por `tenantId` (o del
> `CredencialesPort` OAuth de MP) — el **seam ya está en el código** (`ProveedorAccessToken`); se
> cambia sólo la resolución del token.

---

## B. Prender los modos (después de cargar A)

1. Setear `ARCA_MODO=real` y `MP_MODO=real` en el entorno.
2. Redeploy (para que tome las variables).
3. Verificar en `/admin/facturacion`: el estado fiscal debe decir "REAL" y el módulo de cobros dejar
   de mostrar "modo prueba".
4. Recomendado: **empezar en homologación** (`arcaHomologacion=true` + credenciales de prueba de MP)
   y recién pasar a producción tras validar una factura y un cobro de punta a punta.

---

## C. Migraciones a aprobar (Gate 2 — irreversible, NO las corre el agente)

| Migración | Qué agrega | Estado | Necesaria para |
|---|---|---|---|
| `20260705150001_add_tenant_fiscal_config` | Columnas `arcaCuit`/`arcaPuntoVenta`/`arcaHomologacion` en `Tenant` | escrita; **verificar si aplicada a Neon** | Guardar la config fiscal del tenant |
| `20260705150002_fiscal_invoice_align` | Alinea el modelo `Invoice` (CAE, numero, estado, desglose IVA) | escrita; **verificar si aplicada a Neon** | Persistir facturas y su CAE |
| `TenantModule` (propuesta T1) | Config rica + **pin de versión** por tenant (`docs/arquitectura/propuesta-migracion-tenant-module.md`) | dry-run, **NO** aplicada | **Opcional** — sólo si se quiere versionar/parametrizar los módulos por tenant en DB. Los módulos funcionan sin esto. |

**Cómo aplicar (cuando el dueño dé el OK):** `prisma migrate deploy` contra Neon (nunca `migrate dev`
contra el pooler). Revisar antes que el SQL sea sólo aditivo. Sumar/verificar las policies RLS de las
tablas tocadas (`npm run gate:rls` verde).

> **Sin C, en modo real:** ARCA/MP intentarían escribir facturas en tablas que quizá no existan en
> Neon → error. Por eso, para real, C va antes que B. En **sandbox** (default) no se toca la DB fiscal
> más de lo que ya se usa hoy.

---

## D. Checklist del dueño (orden recomendado)

1. [ ] Confirmar que las migraciones fiscales (C, filas 1-2) estén aplicadas a Neon (o aprobarlas).
2. [ ] Cargar `ARCA_CERT_PEM`, `ARCA_KEY_PEM` + setear `arcaCuit`/`arcaPuntoVenta` del tenant.
3. [ ] Cargar `MP_ACCESS_TOKEN` (+ `MP_WEBHOOK_SECRET` si no estaba).
4. [ ] Setear `ARCA_MODO=real` y `MP_MODO=real`; redeploy.
5. [ ] Probar en homologación: generar un cobro real chico + autorizar una factura → ver el CAE.
6. [ ] Pasar a producción (`arcaHomologacion=false` + credenciales productivas de MP).

Nada de esto lo ejecuta el agente. Los secretos los pega el dueño (FASE 2, ADR-041).

---

## E. Banco de pruebas (homologación / test) — construido 2026-07-07

**Estado:** 🟢 construido y verde (tsc + 551 tests + build), detrás de flag, default = stub. Deja
**probar ARCA y Mercado Pago sin credenciales productivas ni dinero real**, con registro de cada
intento. Complementa A-D (activación a `real`): esto es el escalón intermedio para validar sin
arriesgar nada.

### E.1 · Qué se agregó

- **ARCA — modo `homologacion` (nuevo, además de `stub`/`real`):** `ARCA_MODO=homologacion` usa el
  adapter SOAP real, pero **fuerza siempre** los endpoints de testing oficiales de ARCA
  (`wsaahomo`/`wswhomo`), sin importar lo que diga `arcaHomologacion` del tenant — un certificado de
  PRUEBA nunca puede terminar facturando de verdad (`src/plugins/arca/afip/factory.ts`,
  `configParaModo`).
- **Acción `emitirFacturaDePruebaAction()`** (`src/lib/arca-pruebas-actions.ts`, botón "🧪 Banco de
  pruebas" en `/admin/facturacion`): arma una Factura C de prueba (monto chico, consumidor final),
  pide el CAE y devuelve el resultado. **Bloqueada en modo `real`** (guardrail propio, no depende del
  operador). No toca `Invoice`/`OutboxEvent` — no depende de que las migraciones fiscales estén
  aplicadas a Neon.
- **Mercado Pago — modo `test` (nuevo, además de `stub`/`real`):** `MP_MODO=test` usa el mismo
  adapter HTTP real que `real` — MP usa **la misma API** para pruebas y producción; lo que distingue
  es la credencial (`MP_API_BASE` es única). Se agregó una heurística (`pareceTokenDePrueba`) que
  avisa por log si el token no tiene el prefijo `TEST-` esperado en modo test (o si tiene ese
  prefijo en modo real) — nunca bloquea, nunca loguea el token completo.
- **Acción `generarCobroDePruebaAction()`** (`src/lib/mercadopago-pruebas-actions.ts`, botón "🧪 Banco
  de pruebas" en `/admin/facturacion`): genera un link de cobro de prueba (monto chico, concepto
  identificable). **Bloqueada en modo `real`.**
- **Registro de cada intento:** ambas acciones loguean con el logger estructurado existente
  (`src/lib/logger.ts`, scopes `arca.prueba` / `mercadopago.prueba`) — modo, montos, CAE/preferenceId
  o motivo de rechazo/error mapeado. Cero tabla nueva: no requiere ninguna migración.

### E.2 · Credenciales de PRUEBA que carga el dueño (exacto, nada más que esto)

| Dónde se genera | Variable de entorno | Notas |
|---|---|---|
| ARCA (clave fiscal → homologación / Administración de Certificados Digitales, servicio de testing) | `ARCA_CERT_PEM` | Certificado X.509 **de PRUEBA** (mismo formato que el de producción, fila A.1). Sin esto, `ARCA_MODO=homologacion` sigue en stub-error explícito, nunca falsea el CAE. |
| ARCA (idem, junto con el CSR del certificado de prueba) | `ARCA_KEY_PEM` | Clave privada **de PRUEBA**. |
| — (no es secreto; ya existe en `Tenant`) | `arcaCuit`/`arcaPuntoVenta` del tenant | Si no están cargados, el banco de pruebas cae solo a un CUIT/punto de venta de placeholder (`20111111112` / `1`) — no bloquea la prueba. |
| Mercado Pago → Tus integraciones → **Credenciales de prueba** (no las de producción) | `MP_ACCESS_TOKEN` | El de PRUEBA empieza con `TEST-`. Es el MISMO nombre de variable que ya usa el modo `real` (fila A.2) — la diferencia la da `MP_MODO=test` vs `MP_MODO=real`, no una variable nueva. |

**Prender el banco de pruebas:** `ARCA_MODO=homologacion` + `ARCA_CERT_PEM`/`ARCA_KEY_PEM` de prueba
(para ARCA), y/o `MP_MODO=test` + `MP_ACCESS_TOKEN` de prueba (para MP) — cualquiera de los dos es
independiente del otro. Sin ninguna credencial cargada, ambos módulos siguen en `stub` (sandbox en
memoria, cero red) y los botones "🧪 Banco de pruebas" igual funcionan (CAE/link simulados). Ninguna
de estas dos variables (`ARCA_MODO=homologacion`, `MP_MODO=test`) factura o cobra de verdad — para
eso hace falta `=real` + credenciales productivas (bloque A-D arriba).

— Elaborado por GSG
