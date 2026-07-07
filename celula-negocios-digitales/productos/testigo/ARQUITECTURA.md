# Testigo — Arquitectura

> Pipeline: **WhatsApp (foto+audio) → STT + Visión → Claude Sonnet estructura el parte → PDF → despacho.**
> Prioridad de este kickoff: el **núcleo** (estructuración) funcionando; el resto son adaptadores.

---

## 1. Diagrama de componentes

```
┌─────────────┐   webhook    ┌──────────────────────────────────────────────┐
│  WhatsApp    │ ───────────▶ │  INGESTA (webhook handler)                   │
│  Business    │              │  - descarga media (foto/audio)               │
│  Platform    │ ◀─────────── │  - agrupa mensajes por "sesión de parte"     │
└─────────────┘  respuestas   │  - whitelist de operarios del contratista    │
                              └───────────────┬──────────────────────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                          ▼
         ┌────────────────────┐   ┌────────────────────┐    ┌────────────────────┐
         │ STT (audio→texto)  │   │ VISIÓN (foto→text) │    │  CONFIG contratista │
         │ Whisper / Deepgram │   │ Claude Sonnet vis. │    │  (plantilla rubro)  │
         └─────────┬──────────┘   └─────────┬──────────┘    └─────────┬──────────┘
                   │  transcripción         │  captions + antes/después │
                   └────────────┬───────────┴──────────────────────────┘
                                ▼
              ╔═══════════════════════════════════════════════════╗
              ║  NÚCLEO — estructurarParte()   (src/estructurar.ts)║
              ║  Claude Sonnet + output_config.format (JSON schema)║
              ║  entrada: transcripción + captions + config        ║
              ║  salida:  ParteEstructurado (validado con Zod)     ║
              ╚═══════════════════════════════════════════════════╝
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌────────────────────┐   ┌────────────────────────┐
        │ VALIDACIÓN campos  │   │  ¿faltan datos críticos?│
        │ críticos (registro,│──▶│  → repregunta WhatsApp  │
        │ dosis, producto)   │   │    y espera respuesta   │
        └─────────┬──────────┘   └────────────────────────┘
                  ▼
        ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
        │ RENDER a HTML      │──▶│ HTML → PDF          │──▶│ DESPACHO           │
        │ (plantilla plagas) │   │ (Playwright/wkhtml) │   │ WhatsApp + e-mail  │
        └────────────────────┘   └────────────────────┘   │ + archivo (link)   │
                                                          └────────────────────┘
```

---

## 2. Stack propuesto

| Capa | Elección MVP | Alternativa | Notas |
|---|---|---|---|
| **Runtime** | Node.js + TypeScript | — | Coherente con el resto de la célula. |
| **Ingesta WhatsApp** | WhatsApp Business Platform (Cloud API de Meta) vía webhook | 360dialog / Twilio como BSP | Post 1-jul-2025: los *service messages* dentro de la ventana de 24 h que abre el cliente son **gratis** → el operario inicia, COGS de WhatsApp ≈ 0. |
| **STT (audio → texto)** | Whisper API (o Deepgram nova) | faster-whisper self-host | ~US$0.006/min. Notas de voz de 20-40 s → fracción de centavo. |
| **Visión (foto → caption + antes/después)** | Claude Sonnet (vision) | GPT-4o-mini vision | Misma familia que el núcleo; una sola dependencia de proveedor. |
| **NÚCLEO estructuración** | **Claude Sonnet** (`claude-sonnet-5`) con `output_config.format` (structured outputs) | — | El corazón. JSON garantizado contra el esquema. |
| **Generación PDF** | HTML plantilla → PDF con Playwright (Chromium headless) | wkhtmltopdf / `@react-pdf` | HTML da control total de diseño (fortaleza del estudio) y es fácil de versionar. |
| **Despacho** | WhatsApp (documento) + e-mail (Resend/SES) | — | Doble entrega: contratista y cliente final. |
| **Persistencia** | Postgres (partes, contratistas, operarios) + object storage (fotos/PDF) | SQLite en piloto | El JSON del parte es la fuente de verdad; el PDF se regenera. |
| **Billing** | Mercado Pago AR (suscripción por operario) | Lemon Squeezy (USD) | US$15-30/operario/mes. |

**Modelo:** se usa **Claude Sonnet** por decisión de producto (COGS objetivo ~US$2/operario/mes se calcula
con precio Sonnet). No se usa un modelo más caro salvo que una plantilla regulada lo justifique.

---

## 3. Modelo de datos (resumen)

```
Contratista
  id, nombre, matricula_empresa, logo_url, colores, texto_legal_pie
  plan (operarios contratados), rubro ("control_plagas")

Operario
  id, contratista_id, nombre, telefono (whitelist WhatsApp), activo

Cliente            (del contratista)
  id, contratista_id, nombre, direccion, tipo_establecimiento

Parte
  id, numero, contratista_id, operario_id, cliente_id
  fecha_servicio, estado (borrador | pendiente_revision | emitido)
  datos_json  ← ParteEstructurado (fuente de verdad; ver src/esquema-parte.ts)
  pdf_url, transcripcion, media[] (fotos con caption y antes/después)
  created_at

MediaItem
  id, parte_id, tipo (foto|audio), url, caption, momento (antes|durante|despues)
```

El **`datos_json`** es lo que produce el núcleo y consume el render. El PDF es **derivado** — se puede
regenerar cambiando sólo la plantilla, sin re-llamar al modelo.

---

## 4. Costos por parte (unit economics)

Supuestos del analítico (§Testigo): ~110 partes/operario/mes.

| Ítem | Costo por parte | Fuente |
|---|---|---|
| STT (nota de voz ~30 s) | ~US$0.003 | Whisper ~US$0.006/min |
| Visión (2-4 fotos → captions) | ~US$0.004 | Sonnet vision, imágenes chicas |
| **Núcleo — estructurar el parte** | ~US$0.008 | ~1.5k tok in (transcripción+captions+prompt cacheado) + ~1k tok out, Sonnet $3/$15 MTok |
| WhatsApp (operario inicia, ventana 24 h) | ~US$0.000 | *service messages* gratis desde 1-jul-2025 |
| Render + storage PDF | ~US$0.000 | marginal |
| **Total por parte** | **~US$0.015** | |
| **× 110 partes/mes** | **~US$1.65 / operario / mes** | ≈ los US$2 del analítico |

**Palanca de margen — prompt caching:** el bloque de instrucciones + esquema + config del rubro es fijo por
contratista. Con `cache_control` (lecturas a 0.1×) el costo del núcleo baja aún más. El COGS **no tiene
trampa conversacional**: es un único llamado por parte, no una charla de N turnos (a diferencia de Fantasma).

**Precio vs costo:** US$15-30/operario/mes de cobro contra ~US$2 de COGS → **margen ~90%**. Un contratista
de 5 operarios: US$75-150/mes.

---

## 5. Decisiones abiertas (supuestos anotados)

- **BSP de WhatsApp:** arranca con Cloud API directa de Meta; si el onboarding de números pesa, evaluar
  360dialog. *Supuesto:* Cloud API alcanza para el piloto.
- **PDF engine:** Playwright por fidelidad de diseño; si el peso del Chromium en serverless molesta, pasar a
  un servicio de PDF. *Supuesto:* Playwright en un worker dedicado.
- **Firma:** MVP con conformidad por texto/imagen; firma con validez legal es fase futura.
- **Repregunta automática:** el MVP repregunta por campos regulatorios faltantes; el árbol de repreguntas se
  mantiene mínimo (producto, registro, dosis, plazo de reingreso).
