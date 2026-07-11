---
id: ADR-084
nivel: evolutiva
dominio: [Seguridad, Producto]
depends_on: [ADR-066, ADR-041, ADR-062, ADR-025]
---
# ADR-084: Credenciales fiscales por tenant — IMPLEMENTACIÓN (cifrado en sobre + guard CUIT↔cert fail-closed)

**Estado:** Aceptado — **implementa ADR-066** (el principio "la credencial fiscal es por tenant, no por
ámbito"). Trabajo en la rama **`seguridad/cert-por-tenant`**; **no mergeado** aún. La migración de la tabla
**no está aplicada** (Gate 2, pendiente OK del dueño).
**Fecha:** 2026-07-11
**Depende de:** ADR-066 (decisión de principio que este ADR baja a código), ADR-041 (el secreto real lo pega
el dueño, nunca el agente — FASE 2), ADR-062 (RLS/aislamiento por tenant), ADR-025 (producto multi-cliente del
contador: cada cliente factura con SU CUIT)
**Relacionado:** ADR-088 (esto cierra el Riesgo #1 de la auditoría fiscal: cert por env único), ADR-077
(cert modelo delegación para la cartera del contador), ADR-067 (custodia de material sensible = Gate del
dueño) · `src/lib/fiscal/cert-crypto.ts` · `src/lib/fiscal/tenant-cert.ts` · `src/plugins/arca/afip/`

---

## Contexto

ADR-066 decidió que la credencial fiscal (CUIT + certificado/clave ARCA) es **por tenant**. La realidad del
código en `main` la **violaba**: el certificado salía de un **env único compartido** (`ARCA_CERT_PEM` /
`ARCA_KEY_PEM`, `src/plugins/arca/afip/factory.ts` + `signer.ts`) → **todos los tenants firmarían con la misma
clave**. Con ARCA real y >1 tenant, eso es **contaminación fiscal cruzada**: facturar con el CUIT ajeno, un
error fiscal grave (es el Riesgo #1 de ADR-088). El producto del contador (ADR-025/077) es **multi-cliente por
naturaleza**, así que este hueco bloquea al 2º cliente real que emita.

## Decisión

Se implementa el almacenamiento **cifrado por tenant** del certificado y un **guard fail-closed** que impide
firmar con el CUIT equivocado.

1. **Cifrado en sobre (envelope encryption, AES-256-GCM):** cada credencial se cifra con una **DEK propia**, y
   la DEK se **envuelve** con una **master key** (`FISCAL_MASTER_KEY`, 32 bytes base64) que vive **solo en el
   entorno, nunca en la DB**. Módulo `src/lib/fiscal/cert-crypto.ts`. Comprometer la DB **no** revela los
   certificados sin la master key.
2. **Tabla `TenantFiscalCredential`** (1:1 con `Tenant`), scopeada por `tenantId`, cifrada en reposo (respeta
   RLS/plano, ADR-062). La clave privada **nunca** sale del borde que firma.
3. **`credencialParaTenant(tenantId)`** (`src/lib/fiscal/tenant-cert.ts`) **reemplaza** al `credencialDesdeEnv()`
   compartido en el camino de emisión (`crearClientePara`, arca-dispatch). `credencialDesdeEnv` queda **solo**
   para el banco de pruebas (cert de test por env, homologación sandbox aislada).
4. **Firma de fábrica endurecida:** `crearAfipClient(config, opts)` — el 2º arg pasa de `env` a
   `{env?, credencial?}`. En modo **`real`/homologación la credencial es OBLIGATORIA** (sin fallback a env).
5. **Guard fail-closed en DOS capas:** (a) `credencialParaTenant` compara el **CUIT del subject del cert
   descifrado** vs `Tenant.arcaCuit`; (b) la fábrica, en modo `real`, **vuelve a comparar** cert ↔ `config.cuit`.
   Si no coinciden, **aborta** (no firma). El guard estricto aplica solo en `real` (homologación fuerza endpoint
   de test, sin registros reales). Extracción del CUIT: del `serialNumber` del subject (OID 2.5.4.5, "CUIT
   <11 dígitos>"), fallback al CN; vive en el plugin (`afip/cert-inspect.ts`) por dirección de dependencias.

> **En una línea:** *cada tenant firma con SU certificado, cifrado en reposo; y si el CUIT del cert no es el
> del tenant, no se firma — el error se aborta, no se factura mal.*

## Consecuencias

- **(+)** Cierra la contaminación fiscal cruzada (ADR-088 Riesgo #1) y **habilita el producto multi-cliente**
  del contador (ADR-025/077) sin cruces de CUIT.
- **(+)** **Blast radius mínimo:** una credencial comprometida afecta a un tenant; sin la master key, la DB
  sola no revela nada.
- **(+)** El guard es **fail-closed**: ante duda, aborta — nunca factura con el CUIT equivocado.
- **(−)** **Gestión de secretos por tenant** (alta, rotación, custodia del par cert+clave) es más costosa que
  una global; la absorbe la saga de alta (ADR-065/086).
- **(−)** Introduce una **dependencia dura de operación**: sin `FISCAL_MASTER_KEY` seteada, el camino real no
  arranca (correcto: es fail-closed, pero es un blocker de encendido).
- **(−)** La migración `TenantFiscalCredential` **toca el schema** → **Gate 2** (no aplicar sola). Hasta
  aplicarla, la ficha del tenant y el camino stub **toleran que la tabla no exista** (try/catch), coherente con
  la disciplina anti-schema-ahead (ADR-083/086).

## Estado y qué falta para encender ARCA real con >1 cliente

- **Hecho (rama `seguridad/cert-por-tenant`, con tests):** `cert-crypto.ts`, `tenant-cert.ts`, guard en dos
  capas, nueva firma de la fábrica, migración `prisma/migrations/20260711140000_add_tenant_fiscal_credential/`.
- **Falta (Gate del dueño):** (1) **aplicar la migración** (Gate 2); (2) **setear `FISCAL_MASTER_KEY`** en el
  entorno (FASE 2, la pega el dueño — ADR-041); (3) **re-correr RLS** (`0001`) para cubrir la tabla nueva;
  (4) **cargar el cert por tenant** vía acción de operador auditada (form en `/operador/tenants/[id]`).

## Alternativas descartadas

- **Un cert de plataforma para todos** (el estado actual en `main`). Facturaría con CUIT ajeno — inaceptable
  (es lo que este ADR corrige, ADR-066).
- **Cifrado simétrico con una sola clave para todas las credenciales** (sin DEK por credencial). Rechazada: el
  envelope da rotación y blast radius por credencial; una sola clave hace que su fuga exponga todo.
- **Guardar el cert en el env/deploy por tenant.** No escala a N tenants y mezcla secreto de cliente con config
  de plataforma (ADR-066). Rechazada: almacén por tenant, cifrado, scopeado.
- **Guard solo en la fábrica (una capa).** Rechazada: la comparación también en `credencialParaTenant` atrapa
  el error más cerca del origen; dos capas = defensa en profundidad.

— Elaborado por GSG (Seguridad / Fiscal — implementación; aplicar migración + master key = Gate del dueño)
