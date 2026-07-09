---
id: ADR-024
nivel: evolutiva
dominio: [Producto]
depends_on: [ADR-002, ADR-006, ADR-014, ADR-020, ADR-022]
---
# ADR-024: Disparadores de facturación, toggle "facturar sí/no" y Plugin Mercado Pago

**Estado:** Aceptado — diseño; se implementa con stubs, sin certificado/credenciales reales (2026-07-04)
**Depende de:** ADR-022 (Plugin ARCA: evento `InvoiceCreated` → CAE → `RegisterFiscalDocument`), ADR-006 (Tax Engine y Feature Flags viven en el Core; el cálculo de impuestos no es del plugin), ADR-002 (Plugins hexagonales: port + adapter, nunca acceso directo), ADR-020 (comandos del Core), ADR-014 (seña + Mercado Pago, diferido).

---

## 1. Contexto

El dueño confirma la visión: en el tenant **ch estética**, **completar un servicio dispara la facturación** (ARCA), con dos matices de negocio:
1. Al cerrar, el operador **elige si factura o no** (sobre todo cuando el cobro fue por Mercado Pago).
2. Lo que entra por **Mercado Pago** se **auto-factura** (como corresponde fiscalmente), vía webhook de pago acreditado.

Se implementa **todo con simulador/stub** (sin certificado AFIP ni credenciales MP), listo para enchufar credenciales reales por tenant.

## 2. Decisiones

### 2.a — Disparador: completar servicio
El trigger es **`completeAppointment`** (`src/lib/actions.ts`): completar el turno es "cerrar el servicio". Al completar, si corresponde, se llama a `createInvoice` (ADR-022) → outbox → plugin → CAE (stub).

**Best-effort, nunca bloquea:** la facturación corre **después** de marcar el turno COMPLETED y envuelta en try/catch. Si falla, el turno igual queda cerrado — facturar no puede romper la operación de la recepción.

### 2.b — Guarda dura: Feature Flag `invoicingEnabled` (OFF por default)
La migración de `Invoice`/`OutboxEvent` está **escrita pero NO aplicada** (Gate 2). Sin guarda, llamar `createInvoice` en prod rompería `completeAppointment` (tablas inexistentes). Por eso **todo el path va detrás de un flag OFF por default** (`ARCA_INVOICING_ENABLED`): en prod hoy `completeAppointment` se comporta **igual que siempre**. El flag se prende recién cuando la migración esté aplicada. (Flag por env ahora; el flag por tenant de ADR-006 es el destino.)

### 2.c — Toggle "facturar sí/no"
`completeAppointment` acepta un campo `facturar` en el `FormData`. Regla: **`facturar` es true por default** y solo se saltea si viene explícitamente `"false"`. Contrato de UI (checkbox en el form de completar de `AppointmentRow.tsx`, pendiente por edición concurrente del archivo):
```html
<input type="checkbox" name="facturar" value="false" /> No facturar
```
El path por Mercado Pago (2.d) **ignora el toggle**: auto-factura siempre.

### 2.d — Plugin Mercado Pago (hexagonal, mismo patrón que ARCA)
MP es un **plugin de pagos** en `src/plugins/mercadopago/`, con el mismo patrón hexagonal:
- **Port** `MercadoPagoClient` (`getPayment` para verificar la notificación contra MP) + **stub** `StubMercadoPagoClient` (en memoria, sin red).
- **Webhook handler** `procesarNotificacionPago`: recibe la notificación de MP (`payment.updated`), verifica el pago contra el client; si está **aprobado**, resuelve el `appointmentId` (via `external_reference`) y dispara la facturación del Core (**auto-factura**, 2.a/2.c ignorando el toggle).
- **Manifiesto** (ADR-006): config por tenant (`accessToken` secreto, etc.); comando del Core que invoca (`facturarAppointment`).

MP no calcula impuestos ni escribe la DB del Core directo (ADR-002/006): llama al comando del Core, igual que ARCA.

### 2.e — El Core es dueño del impuesto (ADR-006)
El cálculo neto/IVA vive en el Core (`src/lib/fiscal.ts`, semilla del Tax Engine), no en los plugins. Perfil fiscal del emisor **provisional a confirmar** (ch estética = Monotributo → Factura C, IVA no discriminado; CUIT/punto de venta placeholder). Receptor = **Consumidor Final** (el modelo `Client` no captura CUIT/DNI todavía → capturarlo para Factura A/B es follow-up).

## 3. Alcance

**Ahora (stubs, cero DB aplicada, cero prod):** disparo en `completeAppointment` + toggle + flag; `facturarAppointment` (Core, reusado por ambos disparadores); plugin MP (port + stub + manifest + webhook handler); perfil fiscal + tax calc provisionales; `Invoice.appointmentId` para trazabilidad.

**Diferido (a `docs/PROXIMOS-PASOS.md`):** aplicar migración (Gate 2); checkbox de UI; adapters reales (SOAP de ARCA, API real de MP) + credenciales por tenant; flag por tenant (tabla ADR-006); captura de CUIT del cliente; worker periódico que drene el outbox (hoy tick inline en el simulador).

## 4. Decisión final

Completar un servicio en ch estética dispara la facturación ARCA (best-effort, detrás de un flag OFF por default hasta aplicar la migración), con un toggle *facturar sí/no* en el cierre; los cobros por Mercado Pago se auto-facturan vía un webhook, resuelto con un plugin hexagonal (port + stub) idéntico en forma al de ARCA. El Core es dueño del cálculo de impuestos; los plugins solo integran. Todo verificable sin red ni credenciales, listo para enchufar lo real por tenant.
