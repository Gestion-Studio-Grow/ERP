# 🧪 Runbook — ARCA en HOMOLOGACIÓN (cert por tenant, ADR-066)

**Objetivo:** dejar la facturación electrónica lista para **probar en homologación** (el testing oficial de
ARCA, sin emitir NADA real), con el **certificado cargado por tenant desde la consola de operador** (cifrado
en reposo, ADR-066). Reemplaza el flujo de cert-por-env del runbook viejo (`encender-arca-real.md §3`), que
post-ADR-066 quedó **solo** para el "banco de pruebas" aislado.

- **Autor:** Sesión fiscal · **Fecha:** 2026-07-12
- **Regla de secretos (ADR-041 / ADR-066):** el certificado y la clave privada **los pega SIEMPRE el dueño**,
  desde la consola (o el env de Vercel para el banco de pruebas). El agente **nunca** maneja el material.
  `FISCAL_MASTER_KEY` (que cifra las credenciales) vive **solo en Vercel**, nunca en el repo ni en logs.

---

## 0. Estado ya dejado listo por esta sesión (2026-07-12)

- ✅ **Migración fiscal aplicada a Neon prod:** `20260711140000_add_tenant_fiscal_credential` →
  tabla `TenantFiscalCredential` creada. (`add_cartera_cliente` ya estaba aplicada de antes; `migrate deploy`
  aplicó **solo** la fiscal.)
- ✅ **RLS re-ejecutado:** `prisma/rls/0001_enable_rls.sql` → **43 tablas** con `tenantId` protegidas por la
  policy `tenant_isolation`, **0 sin cubrir**. `TenantFiscalCredential` incluida.
- ✅ **Las 4 apps sanas** post-migración (200): magra-erp, chestetica-erp, shinevelas-erp, adosmanos-erp.
- ✅ **Card "Credencial fiscal · ARCA"** de `/operador/tenants/[id]` **desbloqueada** (ya no muestra
  "migración pendiente"; ahora muestra "Sin credencial" y acepta la carga).

Falta **solo lo que hace el dueño**: setear el env de modo, el CUIT por tenant, y cargar el cert de prueba.

---

## 1. 🔒 Garantía fail-safe: en `ARCA_MODO=homologacion` es IMPOSIBLE emitir una factura real

Evidencia en el código (no depende de config del tenant):

1. `modoDesdeEnv(env)` — `src/plugins/arca/afip/factory.ts:42` → default **`stub`**; solo `homologacion`/`real`
   por env exacto. Un typo cae a `stub` (no emite nada).
2. `configParaModo(config, 'homologacion')` — `factory.ts:54` →
   `return { ...config, homologacion: true }` — **fuerza `homologacion: true` ignorando `tenant.arcaHomologacion`**.
3. `SoapAfipClient.endpoints()` — `soap.ts:532` → `endpointsPara(this.config)`.
4. `endpointsPara(config)` — `soap.ts:102` → `config.homologacion ? ENDPOINTS_HOMOLOGACION : ENDPOINTS_PRODUCCION`.
   Con (2) forzado a `true` ⇒ **siempre** `wsaahomo.afip.gov.ar` / `wswhomo.afip.gov.ar` (ambiente de test).

Aunque un tenant tenga `arcaHomologacion=false` (se cree "en producción"), `ARCA_MODO=homologacion` lo
**pisa** y apunta al ambiente de prueba. Tests que lo fijan: `factory.test.ts` (`configParaModo: homologacion
fuerza homologacion=true aunque el Tenant diga false`). Extra: en real/homologación la credencial por tenant
es **obligatoria** — sin ella `crearAfipClient` **lanza** (fail-closed), no cae al stub ni a un env compartido.

---

## 2. Los dos switches (env de Vercel) + los datos por tenant

| Env (Vercel) | Qué hace | Default | Para homologación |
|---|---|---|---|
| `ARCA_MODO` | `stub` \| `homologacion` \| `real` | `stub` | **`homologacion`** |
| `ARCA_INVOICING_ENABLED` | El Core crea facturas al cobrar + el cron drena el outbox | off | `true` si querés probar el pipeline automático (cron diario). Para prueba manual no hace falta |
| `CRON_SECRET` | Protege `/api/cron/*` (fail-closed) | — | requerido si usás el cron |
| `FISCAL_MASTER_KEY` | Cifra las credenciales por tenant (envelope) | — | **ya seteada por el dueño** |

Por tenant (dato maestro en `Tenant`):
- `arcaCuit` — **String, sin default, HOY sin campo en la consola** (ver §3.b). Para homologación con el CUIL
  del dueño: setearlo = el CUIL del dueño (11 dígitos, sin guiones) en los 4 tenants.
- `arcaHomologacion` — **default `true`** ⇒ ya está en testing; no hay que tocar nada.
- `arcaPuntoVenta` — opcional (default 1 si null).

---

## 3. Pasos del dueño (homologación)

### 3.a — Modo por env (Vercel, en los 4 proyectos)
Setear `ARCA_MODO=homologacion`. (Opcional, para el pipeline automático: `ARCA_INVOICING_ENABLED=true` +
`CRON_SECRET`.) Redeploy para tomar el env.

### 3.b — CUIT del tenant  ⚠️ gap conocido: no hay campo en la consola todavía
La página `/operador/tenants/[id]` **advierte** si falta `arcaCuit` pero **no lo setea** (no existe la server
action). Hasta que se agregue el campo (follow-up), setearlo por DB, una vez por tenant, con el CUIL del dueño:

```sql
-- Reemplazar <CUIL_DUENO> (11 dígitos, sin guiones) y el slug de cada tenant.
UPDATE "Tenant" SET "arcaCuit" = '<CUIL_DUENO>'
 WHERE slug IN ('magra-demo','ch-estetica','shinevelas','adosmanos');  -- ajustar a los slugs reales
```
`arcaHomologacion` ya es `true` por default → no tocar. (En homologación el guard CUIT↔cert **no** es estricto;
igual conviene el CUIL correcto para que ARCA acepte el comprobante de prueba.)

### 3.c — Cargar el certificado de PRUEBA por tenant (consola)
En `/operador/tenants/[id]` → card **"Credencial fiscal · ARCA"** → pegar en los dos textarea el
**certificado de homologación** (PEM) y su **clave privada** (PEM) → **"Cargar credencial"**. Queda cifrado en
reposo; el material nunca se muestra ni se loguea. Repetir en los 4 tenants (mismo cert de prueba del dueño).

### 3.d — Probar una emisión
- **Pipeline real (recomendado, usa el cert de la consola):** generar una operación que dispare factura y, en
  `/admin/facturacion`, **"Procesar pendientes"** (`procesarFacturacionPendiente` → `processArcaOutbox` →
  `clientePara` → `credencialParaTenant`). Con `ARCA_MODO=homologacion` pega contra el WS de test y trae un
  **CAE de homologación** (válido solo en test). Requiere `ARCA_INVOICING_ENABLED=true`.
- **Banco de pruebas (atajo aislado):** `/admin/facturacion` → "Banco de pruebas". OJO: usa
  `credencialDesdeEnv` (cert por env `ARCA_CERT_PEM`/`ARCA_KEY_PEM`), **no** el cert de la consola — es un
  camino distinto, para un chequeo rápido sin depender del outbox.

---

## 4. ✅ Qué cambiar ANTES de pasar a REAL (hoy va todo con el CUIL del dueño = SOLO test)

1. **Cada tenant, su propio CUIT** (`arcaCuit` real del titular de cada negocio), no el CUIL del dueño.
2. **Cada tenant, su propio certificado PRODUCTIVO** cargado por consola (rota el de prueba). En modo `real`
   se activa el **guard fail-closed**: el CUIT del subject del cert **debe** coincidir con `Tenant.arcaCuit`,
   o `crearAfipClient` **aborta** (nunca firma con el cert de otro contribuyente — ADR-066).
3. Recién ahí: `ARCA_MODO=real` (+ `ARCA_INVOICING_ENABLED=true`, `CRON_SECRET`). Ver `encender-arca-real.md`
   para el resto del encendido real (pero **ignorar su §3 de cert-por-env** para el flujo real: post-ADR-066
   el cert real va por tenant desde la consola, no por `ARCA_CERT_PEM`/`ARCA_KEY_PEM`).

---

## 5. Rollback / si algo sale mal
- **Para no emitir nada:** dejar `ARCA_MODO` en `homologacion` o `stub`, o `ARCA_INVOICING_ENABLED` sin setear.
  Con cualquiera de esos, no sale una factura real.
- La migración es **aditiva** (1 tabla nueva); rollback manual en
  `prisma/migrations/20260711140000_add_tenant_fiscal_credential/rollback.sql` (dropea la tabla → se pierden
  las credenciales cargadas, sin datos de negocio en riesgo).

---

— Elaborado por GSG
