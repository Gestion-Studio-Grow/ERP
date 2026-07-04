# ADR-022: Plugin ARCA — facturación electrónica como primer Plugin del Core

**Estado:** Aceptado — fija placement y contrato del Plugin ARCA; no construye el lado Core que toca DB (2026-07-04)
**Concretiza:** la línea que el INDEX listaba como candidata — *"Diseño detallado del Plugin ARCA (contrato de eventos/comandos concreto)"*. Instancia el borde que [ADR-020](./ADR-020-contrato-api-publica-core.md) §11 dejó reservado para "el día del primer Plugin".
**Depende de:** ADR-002 (Plugins hablan por eventos/comandos, nunca acceso directo al Core), ADR-006 (Integration Engine: cada Plugin declara un manifiesto; el Plugin ARCA se ocupa *solo* de la autorización fiscal, no del cálculo de impuestos), ADR-020 (las tres superficies de la API pública; `RegisterFiscalDocument` + `InvoiceCreated` + outbox nacen con el 1er Plugin), ADR-001/018 (multi-tenant + RLS diferida), ADR-005 (monolito Next.js).

---

## 1. Contexto

`arca` empezó como producto separado (repo propio). **Se corrige la dirección:** arca **no** es un producto suelto — es el **Plugin de facturación electrónica del ERP**, la integración con ARCA (ex-AFIP) que ADR-002 y ADR-020 vienen nombrando como *el* caso testigo de "Plugin". Se vende como parte del ERP (standalone del ERP + este plugin), no como app aparte.

El repo separado que se llegó a pushear queda **huérfano** (no se borra sin OK); el trabajo se reorganiza **dentro de este repo**.

Este ADR baja a concreto lo que los ADR previos dejaron abstracto: **dónde vive el plugin, qué eventos consume, qué comando llama, qué NO hace, y qué parte del Core hay que construir (después) para que funcione de punta a punta.**

## 2. Decisión de placement

El Plugin ARCA vive en **`src/plugins/arca/`** dentro de este repo (monolito Next.js, ADR-005). Es el primer ocupante de `src/plugins/`, así que **fija la convención** para los que sigan (Mercado Pago, WhatsApp):

```
src/plugins/
  README.md            ← convención de plugins (qué es, límites, cómo se registra)
  arca/
    manifest.ts        ← manifiesto ADR-006: eventos que consume, comando que llama, schema de config
    index.ts
    core-contract.ts   ← la vista del plugin sobre la API pública del Core (evento + comando). NO importa el Core.
    handler.ts         ← orquesta: evento → arma comprobante → valida → pide CAE → llama comando del Core
    afip/
      port.ts          ← interface AfipClient (contrato del WS de ARCA)
      stub.ts          ← adapter en memoria para dev/test (sin certificado ni red)
      (soap.ts)        ← adapter real WSAA+WSFEv1 (pendiente, ver §7)
    domain/
      catalogos.ts     ← códigos ARCA (tipo comprobante, doc, IVA, concepto)
      comprobante.ts   ← forma del comprobante para el WS + mapeo a payload WSFEv1
      validacion.ts    ← validación previa (fallar local, no contra ARCA)
```

**Por qué módulo interno y no package/workspace aparte:** ADR-005/020 mandan monolito con módulos lógicos, no servicios ni multi-package. El plugin es un módulo lógico con un límite *disciplinado por convención* (solo habla con el Core por el contrato de §4), no por frontera de proceso. Cuando la escala lo justifique, `src/plugins/arca/` es extraíble sin reescribir su interior — el límite ya está trazado.

## 3. Qué hace y qué NO hace (límite fiscal, ADR-006)

**Hace:** autorización fiscal. Escucha que nació una factura en el Core, le pide a ARCA el **CAE** (Código de Autorización Electrónico) vía WSAA (auth) + WSFEv1 (`FECAESolicitar`), resuelve la numeración correlativa (`FECompUltimoAutorizado`), y devuelve el resultado al Core.

**NO hace (queda en el Core):**
- **Cálculo de IVA/impuestos.** ADR-006 es explícito: el cálculo es lógica de negocio, vive en el Core (futuro Tax Engine, Fase 2). El plugin **recibe** los montos ya calculados (neto, IVA por alícuota) en el evento y solo los **mapea** al payload de WSFEv1. Por eso este plugin no tiene `calcularTotales` — validar consistencia sí, calcular no.
- **Persistencia del comprobante.** El plugin no escribe la DB (ADR-002). El CAE vuelve al Core por un comando público; el Core lo guarda.
- **Decidir qué se factura.** Eso es del Core (capability Factura/Pago).

## 4. Contrato con el Core (instancia las superficies II y III de ADR-020)

Dos puntas, exactamente como ADR-002/020 las describieron:

- **Core → Plugin (superficie III, evento):** el Core emite **`InvoiceCreated`** (vía outbox, dentro de la transacción de negocio). Payload: id de factura, `tenantId`, datos del emisor/receptor, y los **montos ya calculados** (neto + desglose de IVA). El plugin lo consume desde un worker.
- **Plugin → Core (superficie II, comando):** con el CAE en mano, el plugin llama al comando público **`RegisterFiscalDocument({ invoiceId, tenantId, cae, caeVencimiento, numero, puntoVenta })`**. Es la única puerta por la que el resultado externo impacta el dominio. El plugin **nunca** escribe `Invoice` directo.

El plugin declara ambas en su **manifiesto** (`manifest.ts`, formato ADR-006). El Core, cuando exista el registro de manifiestos, lo lee de ahí.

**Multi-tenant (ADR-001/018):** todo evento y todo comando llevan `tenantId` explícito. El plugin es tenant-agnóstico: no resuelve el tenant, lo recibe y lo propaga. Las credenciales de ARCA (certificado + clave) son **por tenant** (cada negocio factura con su propio CUIT) y entran por config, nunca al repo.

## 5. Qué se construye ahora y qué se difiere

**Ahora (este trabajo, cero DB):**
- Scaffold de `src/plugins/arca/` con manifiesto, cliente ARCA (port + stub), dominio (catálogos + comprobante + validación) y handler.
- `core-contract.ts`: las interfaces `InvoiceCreatedEvent` y `RegisterFiscalDocumentInput` como **contrato tipado local** del plugin. El plugin compila y se testea contra el stub sin que el Core tenga todavía nada.

**Diferido (lado Core, toca DB y schema → es una `/sesion-feature` aparte, con su migración y su gate):**
- Modelo `Invoice` (ADR-020 §6.a lo dejó "descrito pero vacío, nace con el Plugin ARCA"). Aquí es donde nace.
- Tabla `outbox` + worker (pg-boss/graphile-worker, ADR-002) para despachar `InvoiceCreated`.
- El comando `RegisterFiscalDocument` como Server Action de la capability Factura (ADR-020 §6).
- Provisioning de credenciales ARCA por tenant.

**Por qué diferir el lado Core:** toca `prisma/schema.prisma` y migraciones sobre la DB real — trabajo de `/sesion-feature` con su propio gate, no de esta reorganización. El plugin se entrega **funcional contra el stub** y con el contrato hacia el Core ya escrito, de modo que la sesión que construya el lado Core enchufa contra un contrato existente en vez de improvisarlo.

## 6. Riesgos

- **Firma CMS del WSAA** (armar el login firmado con el certificado X.509 en TS) es el riesgo técnico #1 — se aísla en el adapter real (`afip/soap.ts`) y se valida contra **homologación** de ARCA antes que producción. El resto del plugin no depende de que esto esté resuelto (corre contra el stub).
- **Numeración correlativa:** la verdad la tiene ARCA (`FECompUltimoAutorizado`), no un contador local (ADR/ glosario). El plugin no inventa números.
- **Consistencia Core↔ARCA:** el outbox (diferido) es lo que garantiza que una factura creada siempre termine mandada a ARCA aunque el proceso muera en el medio (ADR-002). Hasta que exista, el disparo es directo y no resiliente — aceptable en dev/stub, **no** en producción. Por eso el go-live productivo depende del lado Core diferido, no solo del plugin.

## 7. Impacto

- **ADRs que toca:** concretiza ADR-002 (nombra el evento y el comando reales del primer Plugin), ADR-006 (aporta el primer manifiesto concreto y respeta el límite fiscal≠cálculo), ADR-020 (instancia sus superficies II/III y da nacimiento a `RegisterFiscalDocument`/`InvoiceCreated`/outbox como estaba reservado). No contradice ninguno.
- **Código:** scaffold del plugin en `src/plugins/arca/` (no toca Core existente, no toca DB). El lado Core queda en la cola de handoff.
- **Cuándo se vuelve a tocar:** `/sesion-feature Plugin ARCA — lado Core` (modelo Invoice + outbox + worker + `RegisterFiscalDocument` + provisioning de credenciales), atada a la disponibilidad de un certificado de homologación de ARCA.

## 8. Decisión final

El Plugin ARCA es el **primer Plugin** del ERP, vive en `src/plugins/arca/`, hace **solo autorización fiscal** (CAE) y habla con el Core **únicamente** por el evento `InvoiceCreated` (entra) y el comando `RegisterFiscalDocument` (sale), ambos con `tenantId` explícito y declarados en su manifiesto. El cálculo de IVA y la persistencia quedan en el Core. Se entrega el plugin funcional contra un stub en memoria y con el contrato hacia el Core escrito; el lado Core (Invoice, outbox, worker, comando, credenciales por tenant) —que toca DB— se difiere a una `/sesion-feature` con su propia migración y gate. Cero riesgo sobre producción y sobre la DB hoy; lo que se gana es que arca queda encarrilado como plugin dentro de la arquitectura en vez de forkeado como producto aparte.
