# PORTFOLIO Y RECOMENDACIÓN — Célula de Negocios Digitales

> **PMO → Dueño · 2026-07-06.** Consolidado de los 5 informes de la célula (4 consultores + 1 experto
> de monetización). 12 negocios investigados con research web real y fuentes. **Todo local, sin
> publicar.** Este documento existe para tomar UNA decisión: **qué construimos primero.**

Detalle por informe en `investigaciones/01…05-*.md`.

---

## 1. La tesis (lo que se repitió en los 4 consultores, por separado)

Cuatro equipos investigando ángulos distintos convergieron en **el mismo diferencial**:

> **Producto/agente VERTICAL y ANGOSTO, en ESPAÑOL, con cobro LOCAL (Mercado Pago) y canal WhatsApp.**
> No competir de generalista contra las plataformas grandes ni contra productos en inglés/USD. El hueco
> ganable para un estudio que fabrica rápido con Claude Code es de **idioma + cobro + foco**, no de
> tecnología.

Respaldo (con fuente en los informes):
- **95% de los pilotos de IA en empresas dan ROI cero** (MIT) — ganan los que meten el agente en **un
  flujo angosto** de alto valor.
- **Los AI Overviews mataron el tráfico informativo** (CTR orgánico −61% cuando aparecen) → lo único
  defensible es transaccional / local / con datos propios.
- **Comoditización arriba:** Canva, Meta y OpenAI se comen lo genérico → sólo sobrevive el
  **done-for-you vertical con gusto de diseño** (ahí está la ventaja del estudio).

## 2. Matriz de portfolio (12 ideas, ordenadas por score)

| # | Negocio | Consultor | Modelo de cobro | Esfuerzo a 1er peso | Apalanca diseño/mkt del estudio | Score |
|---|---|---|---|---|---|---|
| 1 | **Postora** — CM con IA para comercios de barrio | C3 | Suscripción MP US$29–59/mes (self-serve) | 4–6 sem | 🟢🟢 alto | **9** |
| 2 | **Recepcionista IA vertical** — voz+WhatsApp+agenda | C4 | Setup US$300–1k + US$150–500/mes | Semanas (venta consultiva) | 🟢 medio | **9** |
| 3 | **Directorio B2B + lead-gen** — datos propios | C2 | Listings + leads US$30–50 + suscripción | 2–4 sem | 🟢🟢 alto (SEO) | **8.5** |
| 4 | **VetVoz** — historia clínica por voz (veterinarias) | C1 | Suscripción | 4–6 sem | 🟢 medio | **8** |
| 5 | **Vitrina** — fotos+ficha de producto para vender online | C3 | Freemium + créditos MP | 3–4 sem | 🟢🟢 alto | **8** |
| 6 | **Back-office documental (AFIP)** — conciliación | C4 | Retainer US$500–2k/mes | Semanas | 🟡 bajo | **8** |
| 7 | **Comparador con afiliados** — transaccional de nicho | C2 | Comisión recurrente | 2–3 sem | 🟢 medio | **8** |
| 8 | **Calificación de leads WhatsApp** — ticket alto | C4 | Retainer + fee por resultado | Semanas | 🟢 alto | **8** |
| 9 | **Calculadoras fiscales/financieras AR** | C2 | Ads + lead-gen + tier pro | 2–3 sem | 🟢 medio | **7.5** |
| 10 | **MediaKit.ar** — media kit para micro-creadores | C3 | Freemium / one-time | 2 sem | 🟢🟢 alto | **7** |
| 11 | **PrevenIA** — compliance S&H (ART/SRT) pymes | C1 | Suscripción | 5–7 sem | 🟡 bajo | **7** |
| 12 | **GremioPro** — presupuesto+agenda+cobro para oficios | C1 | Suscripción + MP | 5–7 sem | 🟡 medio | **7** |

## 3. Cómo se cobra (capa transversal del experto E5) — esto define el margen

- **Cliente en Argentina (pesos):** **Mercado Pago suscripciones** + Factura A/B. Comisión 1,49%–6,29%
  según método. Simple, listo, sin fricción. → ideal para los productos self-serve de esta lista.
- **Cliente global (USD):** usar un **Merchant of Record** (arrancar con **Lemon Squeezy** 5%+US$0,50;
  migrar a Paddle al escalar). El estudio **nunca** debe ser MoR: la complejidad fiscal la absorbe el MoR.
  Bajar la plata a AR con Wallbit/Payoneer, facturar como **exportación de servicios (Factura E, exenta
  IVA)**. En 2025 cayó el cepo y el tope de US$36k/año → hoy se puede percibir 100% en USD.
- **Modelos por defecto:** self-serve → free trial con tarjeta + tiers (US$29/79/149); automatización
  B2B → setup fee + retainer; wrapper de IA → híbrido base + créditos por uso.
- **⚠️ Trampa #1 (crítica):** **precio flat mensual sobre IA agéntica**. El costo de tokens es
  usage-linked y un loop de agente quema 10–100× más que un chat → margen negativo en heavy users.
  Antídoto: límites por tier, model routing, prompt caching, y presupuestar **margen AI real 50–60%**
  (no el 80% del SaaS clásico). *Esto aplica sí o sí al negocio que elijamos.*

## 4. Recomendación del PMO — qué construimos primero

### 🥇 Punta de lanza: **Postora** (CM con IA para comercios de barrio)
**Por qué esta y no otra:**
1. **Es la que mejor apalanca el diferencial real del estudio** — diseño y marketing. En Postora el
   *gusto de diseño* ES el producto y ES el moat frente a lo genérico de Canva/Meta.
2. **Cobro limpio y recurrente sin fricción** — suscripción Mercado Pago en pesos (US$29–59/mes),
   self-serve, sin la complejidad USD/MoR. Volumen, no venta uno-a-uno.
3. **Camino corto y realista** — MVP en 4–6 semanas con Claude Code; categoría ya validada por
   competidores (Velari, Presly) → el mercado existe, entramos con foco LATAM + marca.
4. **El estudio se puede vender a sí mismo como caso** — usamos Postora para nuestro propio marketing y
   lo mostramos como demo viva.

### 🥈 Segunda línea (ticket más alto): **Recepcionista IA vertical**
Mismo score (9), pero es **venta consultiva** (más sales por cliente) y ACV mayor. Lo ideal es
**arrancar Postora para caja temprana y volumen**, y abrir Recepcionista como línea premium en paralelo
una vez que el motor de fabricación esté aceitado. Comparten stack (WhatsApp + IA + MP) → reúso.

### Roadmap sugerido (para tu OK, no ejecutado)
- **Fase 1 (0–6 sem):** MVP de Postora + branding + landing que convierte + cobro MP suscripción. 1 vertical
  de arranque (gastronomía o estética de barrio). Objetivo: **primeros 5–10 pagos recurrentes**.
- **Fase 2 (6–12 sem):** abrir Recepcionista IA vertical como línea premium (setup+retainer) al mismo nicho.
- **Fase 3:** el **Directorio B2B** como activo de adquisición/SEO que alimenta a las dos anteriores.

## 5. Riesgos que asumo como PMO (dichos de frente)
- **Comoditización** (Canva/Meta) sobre Postora → se mitiga con verticalización + localización + marca;
  no competir en "generador genérico".
- **Unit economics de IA** → aplicar el antídoto de §3 desde el día 1 (no flat sobre agente).
- **Pricing sin validar** → los precios son de referencia; el primer mes es para calibrar con clientes reales.
- **Supuesto fiscal** (E5): facturar como exportación de servicios y validar marco cambiario con contador
  antes de operar en USD a volumen.

## 6. La decisión que te pido
**Una sola:** ¿arrancamos la **Fase 1 (Postora)**? Si es sí, la próxima sesión de la célula baja Postora a
**alcance de MVP + pricing + primer vertical + plan de marketing de lanzamiento** — todo local, sin
publicar, hasta tu OK de deploy.

> Alternativa: si preferís la línea de **ticket más alto y recurrencia B2B**, cambiamos la punta de lanza a
> **Recepcionista IA vertical**. Decís vos.
