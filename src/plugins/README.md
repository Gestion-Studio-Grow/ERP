# Plugins

Integraciones externas del ERP. Definidas por **ADR-002** (Core/Blueprint/Plugin), **ADR-006** (Integration Engine: cada plugin declara un manifiesto) y **ADR-020** (las tres superficies de la API pública del Core).

## Reglas (no negociables)

1. **Un plugin nunca toca la DB ni el código interno del Core.** Se comunica solo por dos puntas:
   - **Core → Plugin:** eventos de dominio (`InvoiceCreated`, `PaymentReceived`) despachados vía **outbox** + worker.
   - **Plugin → Core:** llama un **comando público** del Core (ej. `RegisterFiscalDocument`). Nunca escribe una tabla del Core directo.
2. **Cada plugin declara un manifiesto** (`manifest.ts`): eventos que consume, comandos que llama, schema de config. Es lo que ADR-006 llama Integration Engine.
3. **Multi-tenant:** todo evento y comando lleva `tenantId` explícito. El plugin es tenant-agnóstico: lo recibe y lo propaga, no lo resuelve. Las credenciales del servicio externo son **por tenant** y entran por config — **nunca al repo**.
4. **Límite de responsabilidad:** el plugin hace *integración*, no lógica de negocio. Ej.: ARCA autoriza el comprobante (CAE); el **cálculo de impuestos vive en el Core** (ADR-006).
5. **Módulo lógico, no servicio.** Vive dentro del monolito (ADR-005) con su límite disciplinado por convención. Extraíble a proceso propio cuando la escala lo justifique, sin reescribir su interior.

## Plugins

| Plugin | Qué integra | Estado | ADR |
|--------|-------------|--------|-----|
| [`arca/`](./arca) | Facturación electrónica ARCA (ex-AFIP) — autorización fiscal (CAE) | Scaffold contra stub; lado Core diferido | ADR-022 |

## Convención de estructura (fijada por `arca/`, el primero)

```
<plugin>/
  manifest.ts       ← eventos que consume, comandos que llama, config schema (ADR-006)
  core-contract.ts  ← la vista del plugin sobre la API pública del Core (tipos). NO importa el Core.
  handler.ts        ← orquesta el flujo: evento → trabajo → comando del Core
  index.ts          ← superficie pública del plugin
  <adaptadores>/    ← clientes del servicio externo (port + stub + adapter real)
  domain/           ← tipos y reglas propias del plugin (mapeos al servicio externo)
```
