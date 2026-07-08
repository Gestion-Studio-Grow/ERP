# Postora — Arquitectura

> MVP re-empaquetado sobre el stack de la célula (**contenido IA + WhatsApp + Mercado Pago**). Foco
> arquitectónico: **blindar las unit economics de IA desde el día 1** (routing + caching + topes) y
> **medir el COGS** por plan (base del pricing por uso). El corazón corre **offline con un LLM mock**;
> Claude real vive detrás de una interfaz y se cablea en producción (§C).

— Elaborado por GSG.

---

## 1. Stack

| Capa | Elección | Por qué |
|---|---|---|
| **Ideación** | **Claude Haiku 4.5** (`claude-haiku-4-5`) | Barato y rápido para variantes/ángulos/hashtags (volumen). |
| **Copy final** | **Claude Sonnet 5** (`claude-sonnet-5`) | Calidad de voz de marca en español rioplatense, donde el cliente lo ve. |
| **Arte** | **Plantillas brandeadas** (design tokens del Kit) rellenadas con foto del comercio | **COGS de imagen ~0** en el MVP. Imagen IA = add-on medido por crédito. |
| **Orquestación** | Node.js + TypeScript (este scaffold) | Reúsa el stack; routing + topes + COGS en código, no en el prompt. |
| **Canal** | WhatsApp (link `wa.me` taggeado) + Instagram/FB (publica el dueño) | La CTA rastreable vive en el link de WhatsApp; el reporte se manda por WhatsApp+email. |
| **Pagos** | **Mercado Pago** (suscripción / preapproval) | Cobro recurrente en pesos, self-serve. Nativo AR. |
| **Persistencia** | Postgres (o SQLite en piloto) | Kits, planes, posteos, eventos de atribución, uso mensual/COGS. |

**Por qué este routing y no "todo Sonnet" ni "todo Haiku":** el copy final es lo único donde la calidad de
marca se percibe → Sonnet. Todo lo demás (idear, variar, hashtags) es volumen barato → Haiku. Opus subiría
el COGS ~5× sin ganancia percibida en un caption de barrio → **fuera del loop de producción** (reservado a
un eventual tier premium). Este split es *la* decisión de margen del producto.

---

## 2. Diagrama de componentes

```
   Kit de Marca (dato maestro del comercio)  ── autorización del cliente (ADR generador-preset)
          │  paleta · tipografía · tono · do/don't · WhatsApp · oferta
          ▼
   ┌──────────────────────────────────────────────────────────┐
   │  Generador de plan (generador.ts)                         │
   │  - IDEACIÓN → LLM.idear()   [Haiku, Kit cacheado]         │
   │  - por idea:                                              │
   │      · COPY → LLM.redactar() [Sonnet, Kit cacheado 0,1×]  │  ◀── prompt caching
   │      · PLANTILLA brandeada (marca.ts)  [imagen COGS ~0]   │
   │      · CTA rastreable (tag de campaña)                    │  ◀── ata contenido a plata
   │  - registra USO de tokens por modelo → motor de COGS      │  ◀── base del pricing por uso
   └──────┬───────────────────────┬───────────────────────────┘
          ▼                       ▼
    ┌───────────────┐      ┌──────────────────┐
    │ routing.ts    │      │ planes.ts        │
    │ TARIFAS +COGS │      │ tope + excedente │   ◀── blindaje de margen
    │ + kill-switch │      │ + créditos img   │
    └───────────────┘      └──────────────────┘
          │
          ▼   ...durante el mes: eventos por tag (WhatsApp / mostrador)...
   ┌──────────────────────────────────────────────┐
   │  metricas.ts — Reporte de Resultados          │
   │  alcance → clics → conversaciones → ventas    │   ◀── el gancho de retención
   └──────────────────────────────────────────────┘
```

---

## 3. Modelo de datos (esencial)

```
KitDeMarca (dato maestro del comercio — se crea UNA vez, ADR-055 principio de variante)
  negocio, rubro, zona
  paleta {primario, secundario, acento, fondo}, tipografia {titulo, cuerpo}
  tono, hacer[], evitar[], hashtagsBase[]
  whatsapp, ofertaVigente?

Plantilla (arte brandeado, se rellena con foto → COGS imagen ~0)
  id, nombre, objetivo, layout

BriefMensual (el pedido del mes)
  kit, cantidadPosts (acotado por el tier), temas[], incluirImagenIA (default 0)

PostGenerado
  fecha, objetivo, plantilla, copy, hashtags[]
  cta {canal, texto, destino, tag}        ◀── acción medible
  usaImagenIA
  usos: UsoLLM[]  {modelo, inputUncached, inputCached, output}   ◀── base del COGS

PlanMensual
  kit, periodo (YYYY-MM), posts[], cogsUsd

EventoAtribucion  (llega del webhook de WhatsApp / POS)
  tag, tipo (click | conversacion | venta), montoUsd?

UsoMensual (billing por uso)
  cliente, periodo
  posts, postsIncluidos, excedentePosts, excedenteUsd
  imagenesIA, imagenesIncluidas, imagenesExcedenteUsd
  cogsTotalUsd, margenBrutoPct
```

---

## 4. Blindaje de unit economics de IA (§ CLAVE — el antídoto a la "trampa del agente")

**Sin esto, Postora es un flat sobre un agente sin límite que un cliente pesado funde.** Cinco capas,
todas en código:

1. **Model routing por tarea** (`routing.ts::ROUTING`). Haiku ideación/hashtags; Sonnet copy; Opus nunca.
   Un caption cuesta ~1 llamada Haiku (prorrateada) + 1 Sonnet, con el Kit cacheado → **centavos**.
2. **Prompt caching del Kit de Marca** (`llm-claude.ts::systemConKit`). El Kit va en un bloque de `system`
   con `cache_control: ephemeral`; se paga **0,1×** en cada generación. Baja el COGS ~30–40%.
3. **Tope de posteos por tier + excedente** (`planes.ts`). Tope duro; el excedente por posteo
   (US$1,00–1,50) **supera por >150×** el COGS de texto/posteo → cada extra es rentable.
4. **Imagen IA medida por crédito** (`planes.ts` + `routing.ts::COSTO_IMAGEN_IA_USD`). Default = plantilla
   brandeada (COGS ~0). La imagen IA es add-on por crédito, vendido **por encima de su costo** (test:
   `creditoImagenRentable`). **Nunca** se bundlea imagen ilimitada — es el error que funde a la categoría.
5. **Kill-switch por generación** (`routing.ts::TOPE_OUTPUT_TOKENS_POR_LLAMADA`). Tope de tokens de salida
   por llamada: si una generación se dispara, se corta y se marca para revisión, en vez de quemar tokens.

**Tarifas usadas (US$/MTok, lectura cacheada 0,1×):**

| Modelo | Input | Output | Cache |
|---|---|---|---|
| Haiku 4.5 (`claude-haiku-4-5`) | 1,0 | 5,0 | 0,10 |
| Sonnet 5 (`claude-sonnet-5`) | 3,0 | 15,0 | 0,30 |
| Opus 4.8 (`claude-opus-4-8`) — *no usado en producción* | 5,0 | 25,0 | 0,50 |

**COGS medido (demo, plan Marca de 30 posteos):** ~US$0,07 el plan completo → **~US$0,0025/posteo**. Contra
un ticket de US$59, el margen bruto es prácticamente 100% aun con excedentes. **Ese dato es el que evita la
trampa del agente.**

---

## 5. Medición de COGS (base del pricing por uso)

Cada llamada al LLM reporta tokens por modelo (`UsoLLM`); `routing.ts::desglosarCogs` los convierte a US$
con las tarifas y el caching, y agrega **por modelo** y total. En producción, `LLMClaude` lee los tokens
reales de `response.usage` (`input_tokens`, `cache_read_input_tokens`, `output_tokens`) — así el COGS del
billing es el **real medido**, no un supuesto. `UsoMensual` agrega el COGS del plan → alimenta el billing
(tope + excedente + créditos) y el reporte de margen.

---

## 6. Integraciones externas (contratos, no implementadas en el scaffold)

- **Claude API:** `messages.create` con `system` cacheado + `output_config.format` (json_schema) para
  ideas y copy. Ver `src/llm-claude.ts` (excluido del build; se cablea en §C).
- **Mercado Pago:** suscripción/preapproval en pesos (cobro recurrente) + webhook de estado.
- **WhatsApp:** link `wa.me` taggeado (no requiere API de Meta en el MVP); el webhook de entrada (si el
  cliente también tiene Fantasma) alimenta la atribución por `tag`.
- **Atribución de ventas:** código de promo en mostrador / *"¿cómo nos conociste?"* → evento de venta.

En el MVP scaffold estas viven detrás de interfaces (`LLMCliente`, y contratos de MP/WhatsApp) con
implementaciones **mock**, para desarrollar y demostrar el corazón **sin cuentas reales, sin secretos y sin
gastar tokens de producción**.

---

## 7. Gobierno y encaje con la fábrica

- **ADR-055 (principio de variante):** el `KitDeMarca` es un **dato maestro** que se crea una vez y se
  asigna; los planes son variantes por período. No "todo a todos".
- **ADR-046 (de-sesgo por sector):** zona **humana/criolla** en copy y CTA (voz de barrio); zona
  **estándar** en routing, COGS y billing (precisión y convención).
- **Generador de Preset por IA:** el `KitDeMarca` se puede poblar desde la red/web del comercio **con
  autorización registrada del cliente** (mismo gate que Magra). Sin OK, no se genera ni se muestra.
- **Gate de Excelencia:** este entregable cruza SAP Fiori + Sello GSG + Arquitectura + Confiabilidad antes
  de integrarse (ver PLAN.md § Gate).
