# ADR-019: Plugin ARCA — contrato de emisión, ejecución en serverless y build-vs-buy del conector

**Estado:** Aceptado — pendiente de implementación (2026-07-04)
**Depende de:** ADR-002 (Core/Blueprint/Plugin — outbox y comando público), ADR-003 (Factura interna en Fase 1, CAE real en Fase 2), ADR-005 (stack), ADR-006 (Tax Engine en el Core, el plugin solo autoriza), ADR-010 (Camino A — se evoluciona el Next.js), ADR-001 (todo nace con `tenantId`).
**No reemplaza:** el diferimiento de RLS (ADR-001/010) sigue en pie. El cálculo de impuestos vive en el Core (ADR-006), no en el plugin.
**Insumos de negocio:** `docs/facturador-electronico-arca-mercado-y-vision.md`, `docs/facturador-estudios-contables-mercado-y-vision.md`, `docs/diseno-producto-middleware-fiscal.md`.

---

## 1. Problema

ADR-002/003 fijaron la *forma* del Plugin ARCA en abstracto: el Core publica `InvoiceCreated` en una outbox, un plugin lo consume, llama a ARCA y devuelve el CAE con un comando `RegisterFiscalDocument`. Falta bajar eso a un contrato concreto que una `/sesion-feature` pueda implementar sin re-discutir: **qué entidad de dominio se factura, cómo se ejecuta el plugin en la infraestructura que realmente tenemos, y con qué conector se habla con ARCA.** Además, dos productos nuevos (facturador embebido y facturador para estudios contables) dependen de este mismo plugin, y el segundo lo necesita **multi-CUIT**.

Cerrar esto también cierra la Fase 2 del piloto de estética (CAE real), hoy la mitad faltante de la Factura.

## 2. Estado real verificado (código, no INDEX)

- **No existe modelo `Factura`/`Invoice`.** La venta del piloto es `Appointment` + `Payment` (1:1, `Payment.appointmentId @unique`). `Payment` tiene un campo `comprobanteNro String?` **sin uso** y los `mpPaymentId/mpPreferenceId` de Mercado Pago también sin uso.
- **No existe outbox** ni worker de eventos. El piloto es **Next.js sobre Netlify (serverless)**, con Server Actions y Prisma/Neon — **no** el NestJS + pg-boss + Redis de ADR-005 (eso es escala-plataforma, todavía no construido).
- **El `Tenant` no tiene datos fiscales**: ni CUIT, ni condición IVA, ni punto de venta, ni credenciales. Facturar exige introducirlos.
- Restricción viva: toda tabla nueva nace con `tenantId` (ADR-001); RLS sigue diferida.

Consecuencia: el Plugin ARCA parte casi de cero y **obliga a resolver una tensión que ADR-002 no vio** — su patrón asume un worker de background que Camino A (serverless) no tiene. Esta es la decisión central de infraestructura de este ADR.

## 3. Alternativas evaluadas

### Eje A — Conector con ARCA: ¿build o buy?
La parte fea es real: WSAA (firmar con certificado, tokens con vencimiento), WSFEv1 (emitir A/B/C/M, CAE/CAEA, numeración correlativa por punto de venta), homologación en el entorno de testing, y **mantenimiento ante cambios normativos frecuentes**.

- **A1. Build — WSAA/WSFE propios.** Control total, sin costo por comprobante. Pero cargamos con homologación, manejo de certificados por CUIT y actualización normativa perpetua. Es exactamente lo que el mercado API-first (TusFacturas 2015, AfipSDK 2017) vende como commodity ya resuelto. Alto costo fijo y recurrente para un piloto que aún no factura un peso.
- **A2. Buy — conector de tercero (AfipSDK / TusFacturas API) detrás de una interfaz.** Llegamos a producción en semanas; el tercero mantiene WSAA/WSFE y los cambios normativos. Costo por comprobante, y dependencia — mitigada si el tercero queda **detrás de una interfaz reemplazable**, nunca acoplado al Core.
- **Elegida: A2**, con la regla de que el conector es un detalle de implementación detrás del contrato del plugin (ver §4-D4). Build (A1) se reevalúa **a escala**, cuando el costo-por-comprobante del tercero supere el costo de sostener la integración propia — y ese cambio no debe tocar el Core.

### Eje B — Ejecución del plugin en serverless (la adaptación de ADR-002 a Camino A)
ADR-002 manda outbox + worker. En Netlify no hay worker persistente.

- **B1. Solo síncrono.** Tras crear el comprobante, la Server Action llama al conector y espera el CAE en la misma request. Simple y con CAE inmediato, pero **viola el mandato de durabilidad de ADR-002**: si el proceso muere entre "guardar" y "autorizar", el comprobante queda sin CAE y nadie se entera. Inaceptable para un dato fiscal.
- **B2. Solo outbox + Scheduled Function.** El comprobante se crea PENDIENTE + fila en outbox; una Netlify Scheduled Function (cron ~1 min) procesa la outbox y autoriza. Durable y fiel a ADR-002, pero **el CAE tarda hasta un minuto** — mala UX en el mostrador (el ticket se imprime sin CAE todavía).
- **B3. Híbrido: intento síncrono best-effort + outbox como red.** Se crea el comprobante PENDIENTE **y** su fila de outbox en la misma transacción; inmediatamente después del commit se intenta autorizar sincrónicamente (CAE al toque en el happy path); si el intento síncrono falla o no corre, la Scheduled Function levanta la outbox y lo autoriza con reintentos. **Elegida.** Da CAE inmediato cuando todo anda y **garantiza que ningún comprobante quede sin autorizar** cuando no — cumpliendo ADR-002 sin exigir Redis/pg-boss que Camino A no tiene. La outbox es la fuente de verdad de "qué falta autorizar"; el intento síncrono es solo una optimización de latencia.

### Eje C — Modelo de dominio: ¿extender `Payment` o entidad fiscal nueva?
- **C1. Extender `Payment`** con campos de CAE. Barato, pero confunde dos conceptos distintos: **cobro** (plata que entra, puede ser parcial, en cuotas, sin factura) y **comprobante fiscal** (documento con numeración legal, puede agrupar varios cobros o emitirse sin cobro). Acoplarlos hipoteca los dos productos nuevos (donde se factura sin que el cobro pase por nosotros).
- **C2. Entidad `FiscalDocument` nueva en el Core** *(elegida)*, con `tenantId`, referencia al origen (appointment/payment) y su propio ciclo de vida. Separa cobro de comprobante, que es lo correcto de dominio y lo que habilita facturar en contextos donde no somos el medio de pago.

## 4. Decisión

Se adopta el conjunto **A2 + B3 + C2**, materializado en cinco piezas. El plugin **solo autoriza** (consigue el CAE); el cálculo de importes/IVA es del Core (ADR-006).

### D1 — Entidad de dominio: `FiscalDocument` (Core)
Nace con `tenantId` (ADR-001). Campos mínimos: tipo de comprobante (`FACTURA_B`/`FACTURA_C`/… , `NOTA_CREDITO`…), `puntoVenta`, `nroComprobante` (lo asigna el resultado de ARCA, no nosotros), `fechaEmision`, condición IVA e identificación del receptor (CUIT/DNI/CF), importes (`neto`, `iva`, `total`), `estado` (`PENDIENTE`→`AUTORIZADO`/`RECHAZADO`/`ERROR`), `cae`, `caeVencimiento`, `origenTipo`+`origenId` (ej. el `Payment`/`Appointment` que lo disparó) y `idempotencyKey`.

### D2 — Contrato Core ↔ Plugin (materializa ADR-002)
1. **Core → outbox (misma transacción):** al confirmar una venta facturable, el Core crea el `FiscalDocument` en `PENDIENTE` y, en la **misma** `$transaction`, inserta un evento `FiscalDocumentRequested { fiscalDocumentId }` en la tabla `outbox`. Nunca uno sin el otro (la garantía de ADR-002).
2. **Plugin → conector → Core:** el plugin toma el evento, llama al conector ARCA y devuelve el resultado por **un comando público del Core** — única puerta de escritura del plugin (ADR-002):
   - `RegisterFiscalAuthorization(fiscalDocumentId, cae, caeVencimiento, nroComprobante)` → estado `AUTORIZADO`.
   - `RegisterFiscalRejection(fiscalDocumentId, motivo)` → estado `RECHAZADO`/`ERROR`.
3. **Idempotencia:** el comando es idempotente por `fiscalDocumentId` — si el documento ya está `AUTORIZADO`, no re-emite (blinda el doble disparo síncrono+outbox de B3). Corolario de AMD (versionado+idempotencia de eventos).

### D3 — Ejecución (B3, serverless)
- Outbox en Postgres como fuente de verdad de "pendiente de autorizar".
- Intento síncrono best-effort tras el commit de la Server Action (CAE inmediato en el happy path).
- **Netlify Scheduled Function** procesa la outbox con reintentos (backoff) para todo lo que el intento síncrono no dejó `AUTORIZADO`. Registra fallos persistentes para observabilidad (un comprobante en `ERROR` es un incidente fiscal, no un log más).

### D4 — Conector: BUY (AfipSDK inicial) detrás de `FiscalConnector`
Interfaz mínima del Core hacia afuera: `FiscalConnector.emitir(fiscalDocument, tenantFiscalConfig) → { cae, caeVencimiento, nroComprobante } | FiscalError`. Implementación inicial: **AfipSDK** (maneja WSAA+WSFEv1, homologación, A/B/C/E/MiPyME). TusFacturas API es alternativa equivalente (respaldo contable). El Core **no conoce** cuál se usa. **Alcance mínimo: `FACTURA_B` y `FACTURA_C`** (monotributo/servicios — lo que estética y la mayoría de los clientes de contador necesitan); A/M/NC/ND en iteración posterior. La numeración correlativa por punto de venta la resuelve ARCA vía el conector (consultar último autorizado), no la generamos.

### D5 — Identidad fiscal por Tenant (esto es lo que hace el diseño multi-CUIT)
Config fiscal **por tenant** (campos en `Tenant` o tabla `TenantFiscalConfig` con `tenantId`): CUIT, condición IVA, punto(s) de venta, y **referencia** a la credencial del conector. El secreto (certificado/API key) **fuera del repo y fuera de la DB en claro** — en el proveedor o cifrado (regla viva: secretos en `.env`/gestor, nunca en el repo). Como la identidad fiscal cuelga del tenant, el mismo mecanismo sirve para la estética (un CUIT) y para el producto de contadores (N tenants-cliente, cada uno su CUIT) **sin cambiar el contrato** — el multi-CUIT es "muchos tenants con su config", no un caso especial.

**Regla de diseño (el porqué que se lee en 6 meses):** *un resultado fiscal externo (el CAE) impacta el dominio por un solo comando idempotente, y el proveedor que habla con ARCA vive detrás de una interfaz reemplazable.* Así, cambiar de AfipSDK a WSFE propio —o soportar 500 CUITs de un estudio— es cambiar implementación detrás del contrato, nunca tocar el Core. Y *la durabilidad de un dato fiscal no se negocia por latencia*: por eso outbox es la verdad y el síncrono es solo optimización (B3), no al revés.

## 5. Impacto

- **ADRs que toca:** materializa ADR-002 (le da nombres y tablas concretas) y cierra la Fase 2 de Factura de ADR-003. **Enmienda explícita a ADR-002:** su "worker de background lee la outbox" se adapta a Camino A como **Scheduled Function + intento síncrono** (B3) — ADR-002 asumía la infra de ADR-005, que el piloto no tiene. No toca RLS (ADR-001/010) ni mueve el Tax Engine fuera del Core (ADR-006).
- **Código (implementación en `/sesion-feature` posterior, no acá):**
  - `schema.prisma`: nuevos modelos `FiscalDocument` y `TenantFiscalConfig` (o campos fiscales en `Tenant`) + tabla `Outbox`, todos con `tenantId`. Migración en Neon.
  - `src/lib/`: creación del `FiscalDocument`+outbox dentro de la transacción de venta; interfaz `FiscalConnector` + adaptador AfipSDK; comandos `RegisterFiscalAuthorization`/`RegisterFiscalRejection` idempotentes.
  - Netlify Scheduled Function que drena la outbox con reintentos.
  - Retirar/reutilizar el `comprobanteNro` placeholder de `Payment`.
  - Config fiscal por tenant + credencial del conector fuera del repo.
- **Migración:** sí (tablas nuevas). Ensayo del flujo de emisión contra el **entorno de homologación de ARCA** antes de tocar CUIT productivo.
- **BACKLOG:** no invalida ítems; concreta el "Plugin ARCA" que estaba como candidato.
- **Sirve a los dos productos nuevos:** el mismo contrato de emisión + config por tenant es la base multi-CUIT del facturador para contadores. La **ingesta** (bajar "Mis Comprobantes" de ARCA para el panel del contador) reusa el mismo conector (AfipSDK también lo hace) pero es un flujo aparte, a diseñar cuando el gate de validación con contadores dé verde — no se adelanta en este ADR.

## 6. Decisión final

Se acepta **A2 + B3 + C2**: entidad `FiscalDocument` propia, contrato de outbox + comando idempotente adaptado a serverless (síncrono best-effort con outbox durable como red), conector **comprado** (AfipSDK) detrás de una interfaz reemplazable, e identidad fiscal por tenant que hace el multi-CUIT natural. Alcance mínimo B/C. La implementación es una `/sesion-feature` que leerá este ADR y ensayará contra homologación de ARCA antes de producción.
