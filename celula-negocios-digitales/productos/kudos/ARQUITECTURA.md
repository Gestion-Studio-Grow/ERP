# Kudos — Arquitectura

> Stack liviano, done-for-you. El objetivo es MVP en 2–3 semanas con COGS de IA despreciable.
> Todo lo pesado (responder reseñas) es **texto con Claude Sonnet + prompt de marca cacheado**.

---

## 1. Diagrama de alto nivel

```
   CAPTACIÓN                     INGESTA                    NÚCLEO IA                 SALIDA
 ┌──────────────┐         ┌───────────────────┐      ┌──────────────────┐    ┌─────────────────┐
 │ QR en ticket │──┐      │ Google Business    │      │  reviewResponder │    │ Publicar en GBP │
 │  → landing   │  │      │ Profile (reviews   │──┐   │  ───────────────│───▶│  / MercadoLibre │
 │  neutral     │  ├─────▶│  webhook/polling)  │  │   │  1. clasificar   │    └─────────────────┘
 └──────────────┘  │      └───────────────────┘  ├──▶│  2. detectar     │           │
 ┌──────────────┐  │      ┌───────────────────┐  │   │     sensible     │    ┌─────────────────┐
 │ WhatsApp     │──┘      │ MercadoLibre       │──┘   │  3. Claude Sonnet│    │ Cola moderación │
 │ post-venta   │         │ (preguntas/reviews)│      │     (voz marca)  │───▶│ (1-2★ / sensible)│
 │ (utility)    │         └───────────────────┘      │  4. guardarraíles│    └─────────────────┘
 └──────────────┘                                     └──────────────────┘           │
        │                                                      │                       ▼
        ▼                                              ┌────────────────┐     ┌─────────────────┐
 ┌──────────────┐                                      │ Perfil de marca│     │ TABLERO + reporte│
 │ policy lint  │                                      │ (BrandVoice,   │     │ mensual (estrella│
 │ (anti-gating)│                                      │  cacheado)     │     │  ranking, ROI)   │
 └──────────────┘                                      └────────────────┘     └─────────────────┘
```

---

## 2. Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| **Runtime** | Node.js + TypeScript | Rápido de fabricar con Claude Code; tipado para los guardarraíles. |
| **IA (respuestas)** | **Claude Sonnet (`claude-sonnet-5`)** vía Anthropic SDK | Calidad de escritura en español nativo a costo bajo. Adaptive thinking. |
| **Prompt de marca** | System prompt con **prompt caching** (`cache_control: ephemeral`) | El kit de voz es estable → se cachea a 0,1× el costo de lectura. COGS ↓. |
| **Fuente de reseñas** | Google Business Profile API + MercadoLibre API | GBP primero; ML segundo (donde está la plata en AR). Detrás de interfaz `ReviewSource`. |
| **Captación** | Landing estática (QR) + WhatsApp Business Platform (utility templates) | Utility dentro de ventana 24 h = gratis. QR = costo cero. |
| **Datos** | Postgres (perfiles, reseñas, respuestas, versiones de voz) | Simple, transaccional. Dedupe por `reviewId`. |
| **Tablero** | Next.js (app liviana) | Reúsa know-how del estudio. |
| **Jobs** | Cron / cola liviana (polling GBP + envío reportes) | GBP no siempre da webhook confiable → polling cada N horas. |
| **Billing** | Mercado Pago (AR) + Stripe/Lemon (USD) | Cobro flat mensual por local. |

**Nota de aislamiento del prototipo:** el scaffold en `src/` es autocontenido y **no depende de
paquetes instalados** — usa un `MockLLM` determinista para correr offline (`npx tsx src/examples.ts`).
`src/anthropicClient.ts` es la implementación de referencia real con el SDK oficial
(`@anthropic-ai/sdk`), que en producción reemplaza al mock. Se documenta así para no tocar el ERP ni
correr `npm install` en este entorno.

---

## 3. El núcleo: `reviewResponder`

Contrato: `(reseña, perfilDeMarca) → ResultadoRespuesta`. Pipeline puro y testeable:

1. **Clasificar** por estrellas → bucket `negativa | neutra | positiva`.
2. **Detectar tema sensible** (regex/keywords ES+EN sobre categorías: legal, salud/seguridad,
   discriminación, fraude, datos personales, menores, fallecimiento).
3. **Rutear**:
   - sensible → `escalar` (no publica, alerta).
   - negativa (1–2★) → genera borrador, estado `revisar_humano`.
   - neutra/positiva → genera, estado `auto` (publicable).
4. **Generar** con Claude (o mock): system prompt = kit de voz cacheado; user prompt = la reseña +
   instrucciones del bucket.
5. **Validar salida** (guardarraíles): longitud, firma, sin promesas de compensación no autorizadas,
   sin admisión de responsabilidad. Si falla → degradar a `revisar_humano`.

Ver `src/reviewResponder.ts`. El detalle de por qué Sonnet y no Opus: el volumen es alto y la tarea
(responder reseñas) es de las que Sonnet resuelve muy bien a menor costo — coherente con COGS objetivo.

---

## 4. Modelo de datos (esquema lógico)

```
Local (tenant)
  id, nombre, rubro, plan, estado_billing
  gbp_location_id, ml_seller_id
  brand_voice_id  ──────────────┐
                                 ▼
BrandVoice (versionado)
  id, local_id, version, tono, tuteoOVoseo, firma, frasesMarca[],
  prohibiciones[], permiteCompensacion, emojis, longitudMax, datosContacto, idiomaBase
  created_at   (una fila nueva por cambio de voz → trazabilidad + rollback)

Review
  id, local_id, source (google|mercadolibre), source_review_id (UNIQUE → dedupe),
  autor, rating (1-5), texto, idioma_detectado, fecha, permalink

Response
  id, review_id, brand_voice_version, estado (auto|revisar_humano|escalar|publicada),
  texto_generado, categoria_sensible?, motivo_escalado?, generado_por (modelo/mock),
  publicada_at, editada_por_humano?

CapturaEvento
  id, local_id, canal (qr|whatsapp), enviado_at, copy_usado, paso_lint_policy (bool)

MetricaMensual
  id, local_id, mes, estrella_promedio, reviews_nuevas, reviews_respondidas,
  cobertura_pct, ranking_rubro
```

---

## 5. Costos (unit economics, del análisis de la célula)

**COGS por local/mes:**

| Ítem | Cálculo | Costo |
|---|---|---|
| Respuestas Claude | ~30 reseñas × ~US$0,005 (menos con caching de marca) | ~US$0,15 |
| Captación WhatsApp | utility dentro de ventana 24 h = **gratis**; si outbound marketing ~300 msg × US$0,03 | US$0–9 |
| Infra prorrateada (hosting + DB + API base) | fijo repartido | ~US$2–3 |
| **Total** | | **US$3–10 / local / mes** |

**Precio:** US$99–149/mes/local + setup opcional US$100–200. → **Margen bruto 90–95%.**
**Benchmark:** Birdeye US$299–449/local/mes → techo de precio de ~3×.
**Break-even a US$5.000/mes:** ~34–50 locales.

**Costo de build:** 2–3 semanas de equipo + US$100–500 de infra/tokens de desarrollo.

---

## 6. Detalles de integración con Claude (referencia)

- Modelo: `claude-sonnet-5` (Sonnet actual). `thinking: { type: "adaptive" }`.
- **Prompt caching:** el kit de voz de marca va como bloque `system` con
  `cache_control: { type: "ephemeral" }`. La reseña concreta va después, en `messages` (parte
  volátil). Así el prefijo estable (voz de marca) se sirve cacheado a 0,1×.
- `output_config: { format: {...} }` (structured outputs) para que la respuesta venga con
  `{ respuesta, requiereHumano, motivo }` y no texto suelto → más fácil de validar.
- Sin prefill de assistant (removido en modelos 4.6+/Sonnet 5). Sin `temperature`/`top_p`.
- Manejo de `stop_reason: "refusal"` antes de leer contenido.
