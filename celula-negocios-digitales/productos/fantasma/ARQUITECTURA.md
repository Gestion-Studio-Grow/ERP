# Fantasma — Arquitectura

> MVP re-empaquetado sobre el stack de Ronda 1 (**WhatsApp + agente IA + Mercado Pago**). Objetivo:
> caja en 2–3 semanas. Foco arquitectónico: **medir el COGS por conversación** (es la base del pricing
> por uso) y **blindar el margen** con topes.

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| **Canal** | WhatsApp Business Platform (Cloud API de Meta) | Donde compra la pyme AR. Inbound dentro de ventana 24h = mensajes **gratis**. |
| **Agente** | **Claude Sonnet** (`claude-sonnet-5`) con guion por cliente | Calidad conversacional en español rioplatense; salida estructurada (JSON) para controlar el flujo. Prompt caching del guion (0,1×) baja COGS. |
| **Orquestación** | Node.js + TypeScript (este scaffold) | Reúsa el stack; máquina de estados + control de límites en código, no en el prompt. |
| **Agenda** | Google Calendar / Sheet simple del cliente | Sin integraciones pesadas en el MVP; slots en formato simple. |
| **Pagos** | **Mercado Pago** (Checkout Pro / link de pago) | Seña para reservar turno. Nativo AR. |
| **Persistencia** | Postgres (o SQLite en piloto) | Conversaciones, tickets, contador de uso, eventos de COGS. |
| **Scheduler** | cron | Reporte del lunes + corte de franja horaria. |

**Por qué Claude Sonnet y no Opus/Haiku:** el prompt pide "agente Claude Sonnet". Sonnet 5 da la
relación calidad/costo correcta para conversación de atención; el COGS conversacional manda, y Sonnet
es el punto justo. (Opus subiría el COGS ~1,6×; Haiku bajaría calidad de cotización/agenda.)

---

## 2. Diagrama de componentes

```
   Cliente final (WhatsApp)
          │  mensaje entrante (webhook Meta)
          ▼
   ┌──────────────────────────────────────────────┐
   │  Webhook / Ingesta                            │
   │  - valida franja horaria (¿off-hours?)        │
   │  - si horario comercial → no responde         │
   └───────────────┬──────────────────────────────┘
                   ▼
   ┌──────────────────────────────────────────────┐
   │  Orquestador de conversación (agente.ts)      │
   │  - carga guion + catálogo + agenda del cliente│
   │  - LÍMITES: tope conv/plan + tope turnos/conv │  ◀── blindaje de margen
   │  - máquina de estados (saludo→cotiza→agenda…) │
   │  - llama al LLM (Claude Sonnet) por turno     │
   │  - registra USO de tokens → motor de COGS     │  ◀── base del pricing por uso
   └──────┬───────────────┬───────────────┬────────┘
          ▼               ▼               ▼
     ┌─────────┐    ┌───────────┐   ┌──────────────┐
     │ Agenda  │    │Mercado Pago│   │  Tickets     │
     │ (slots) │    │(seña/link) │   │ (calientes)  │
     └─────────┘    └───────────┘   └──────────────┘
          │               │               │
          └───────────────┴───────┬───────┘
                                  ▼
                     ┌────────────────────────┐
                     │  Reporte del lunes      │  (cron)
                     │  "plata rescatada"      │
                     └────────────────────────┘
```

---

## 3. Modelo de datos (esencial)

```
Cliente (el negocio que contrata)
  id, nombre, telefono_wa, zona_horaria
  plan  (BASICA | PRO | FULL)
  franja_horaria  (reglas noche/finde)
  guion  (texto voz de marca + FAQs)
  catalogo  [ { sku, nombre, precio, variantes, envio } ]
  reglas_cotizacion  (mínimos, recargos, política envío)
  agenda_config  (slots, duración, requiere_seña, monto_seña)
  tope_turnos_por_conversacion  (default 25 — kill-switch de margen)

Conversacion
  id, cliente_id, contacto_final (telefono, nombre?)
  inicio, fin, es_off_hours (bool — solo estas cuentan al tope)
  estado  (ABIERTA | RESUELTA | TICKET)
  intencion  (CONSULTA | COTIZACION | AGENDA | RECLAMO | OTRO)
  turnos [ Turno ]
  cogs_usd  (costo real acumulado de la conversación)   ◀── clave

Turno (cada intercambio user→assistant)
  id, conversacion_id, rol, texto
  uso_llm  { input_uncached, input_cached, output }     ◀── medición COGS
  costo_usd

Ticket  (caliente, para la mañana)
  id, conversacion_id, contacto, resumen, intencion, urgencia,
  promesa (qué se le dijo), creado_at, resuelto (bool)

Cotizacion
  id, conversacion_id, items, monto_total, enviada_at

Turno_agendado
  id, conversacion_id, slot, seña_requerida, seña_monto,
  mp_link, mp_estado (PENDIENTE | PAGADA), confirmado_at

UsoMensual  (billing por uso)
  cliente_id, periodo (YYYY-MM)
  conversaciones_off_hours (contador)
  incluidas (del plan), excedente_cant, excedente_usd
  cogs_total_usd, margen_estimado
```

---

## 4. Máquina de estados (resumen; ver `src/agente.ts`)

Estados: `SALUDO → (CONSULTA | COTIZACION | AGENDA) → CIERRE` con desvío a `ESCALAR` en cualquier punto.
El LLM devuelve por turno un objeto estructurado:

```jsonc
{
  "mensaje": "texto para el cliente (voz de marca)",
  "intencion": "CONSULTA | COTIZACION | AGENDA | RECLAMO | OTRO",
  "cotizacion": { "items": [...], "monto_total": 12000 } | null,
  "agenda":     { "slot": "2026-07-08T10:00", "requiere_seña": true } | null,
  "escalar":    true | false,     // fuera de alcance / sensible / pide humano
  "fin":        true | false      // conversación resuelta
}
```

El **código** (no el prompt) decide: si `escalar` o se superó el tope de turnos → crea `Ticket` y cierra;
si `agenda.requiere_seña` → genera link MP; cada llamada al LLM registra `uso_llm` → motor de COGS.

---

## 5. Medición de COGS por conversación (el núcleo del pricing por uso)

**Sin esta medición no hay pricing defendible.** Cada llamada al LLM reporta tokens; el motor los
convierte a US$ con las tarifas de Claude Sonnet y **prompt caching**.

Tarifas Claude Sonnet (`claude-sonnet-5`), estándar:
- Input: **US$3 / MTok** · Output: **US$15 / MTok** · **Lectura cacheada: US$0,30 / MTok** (0,1×).

Costo por llamada:
```
costo = input_uncached/1e6 * 3
      + input_cached/1e6   * 0.30      // guion de marca cacheado
      + output/1e6         * 15
```

El COGS de la conversación = suma de costos de sus turnos. Ejemplo (ver `src/demo.ts`): una conversación
de ~12 turnos con el guion cacheado da **~US$0,18–0,22**, dentro del rango del análisis (0,15–0,30).

**Palancas de COGS (todas implementadas o previstas):**
1. **Prompt caching del guion + catálogo** → el bloque grande y estable se paga a 0,1× en cada turno.
2. **Tope de turnos por conversación** (kill-switch) → cota superior dura al COGS por charla.
3. **Contexto acotado**: no reenviar toda la historia cruda; resumir turnos viejos si la charla es larga.
4. **Sonnet, no Opus** para la operación (Opus solo si un cliente premium lo justifica).

El `UsoMensual` agrega el COGS de todas las conversaciones → alimenta el billing (tope + excedente) y el
reporte de margen. **Este dato es el que evita la "trampa del agente".**

---

## 6. Integraciones externas (contratos, no implementadas en el scaffold)

- **WhatsApp Cloud API:** webhook de entrada + `POST /messages` de salida. Ventana 24h (inbound gratis).
- **Mercado Pago:** crear preferencia / link de pago para la seña; webhook de confirmación de pago.
- **Agenda:** lectura de slots libres + creación de evento (Google Calendar API o Sheet).

En el MVP scaffold estas viven detrás de interfaces (`CanalWhatsApp`, `PasarelaPago`, `Agenda`) con
implementaciones mock, para desarrollar y demostrar el corazón sin depender de las cuentas reales.
