# Agencia Digital — Avance: capas del WhatsApp conversacional (2026-07-06)

**Unidad:** Agencia Digital (satélite del ERP) · **Base:** `wa-intent.ts` (cerebro, sesión anterior) +
handoff `2026-07-05-devs-avance-wa-intent-y-trends.md` · **No toca prod, Neon ni deploy.** Lógica pura
+ tests, commiteado a `main`.

---

## Qué construí — las dos capas que faltaban del comercio conversacional

El pipeline es: **webhook → capa 1 (adaptador) → capa 2 (intención, ya estaba) → capa 3 (dispatcher) →
Server Actions del ERP**. La sesión anterior dejó la capa 2 (`wa-intent.ts`). Ahora las capas 1 y 3:

### Capa 1 — `src/lib/wa-provider.ts` (adaptador de proveedor)
Normaliza el payload crudo del webhook a un **mensaje canónico** independiente del proveedor.
- Soporta **Meta WhatsApp Cloud API** y **Twilio**. `parseInbound(provider, payload, opts)`.
- Devuelve `null` en eventos no accionables (recibos de entrega, estados, mensajes no-texto) — el
  handler HTTP no debe rutear eso.
- Normaliza teléfono a solo dígitos; expone `messageId` como clave de idempotencia; timestamp en ms.
- Puro: sin red, sin verificación de firma (eso es del handler HTTP que lo envuelve).

### Capa 3 — `src/lib/wa-dispatch.ts` (dispatcher conversacional al ERP)
Orquesta la conversación contra el ERP con **puertos inyectados** (`WaPorts`) → orquestación **pura y
determinista**, testeable con puertos falsos; el adaptador delgado que implementa `WaPorts` con las
Server Actions reales (createAppointment / getAvailableSlots / plugin Mercado Pago / plugin ARCA) se
cablea en el handler HTTP.
- **Reserva completa con slot-filling**: servicio → fecha → hora → confirmación → creación, acumulando
  slots entre mensajes (estado de conversación `WaSessionState` que el adaptador persiste por teléfono).
- **PRICE** (lista precios), **HOURS** (dirección/horarios), **PAY** (link Mercado Pago), **INVOICE**
  (marca factura pedida), **GREETING** (menú), **HUMAN/UNKNOWN** → handoff (nunca deja al cliente
  colgado).
- **CANCEL/RESCHEDULE**: se reconocen y derivan a humano — requieren identificar el turno existente por
  teléfono (puerto de lookup aún inexistente); el slot-filling ya queda listo para el reagendado.
- Maneja la carrera del slot ocupado entre la oferta y la confirmación (ofrece otro horario).

## Verificación (vallas cumplidas)
- **26 tests nuevos en verde** (wa-provider 8 + wa-dispatch 18), `tsc` limpio, `npm run build` verde.
  Sin deps nuevas, sin DB, no toca prod/Neon.
- Un test destapó y arreglé un bug real: en medio del slot-filling, una respuesta suelta ("corte",
  "el viernes", "a las 16") llega como intención `UNKNOWN` pero con la entidad — el dispatcher ahora
  avanza la reserva en vez de derivar a humano.

## Handoff — qué queda para poner en producción
1. **Handler HTTP del webhook** (`/api/webhooks/whatsapp`): valida firma del proveedor, idempotencia
   por `messageId`, llama `parseInbound` → `dispatch`, envía la respuesta y persiste `WaSessionState`.
2. **Adaptador de `WaPorts`**: implementa los puertos con las Server Actions reales del ERP + un store
   de sesión por teléfono (¿Redis/DB? — decisión de infra).
3. **ADR de elección de proveedor** (Meta Cloud API vs. Twilio vs. 360dialog) — lo dispara el PMO.
4. **Puerto de lookup de turno por teléfono** para habilitar CANCEL/RESCHEDULE reales.
