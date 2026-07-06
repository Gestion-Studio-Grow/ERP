# 02 — Activos de contenido, SEO programático y directorios de nicho

**Consultor:** C2 — Activos de contenido y bajo mantenimiento
**Fecha:** 2026-07-06
**Célula:** I+D de Negocios Digitales — Gestión Studio Grow
**Mandato:** activos que generan tráfico y lo monetizan con ads, afiliados, leads o suscripción, con bajo esfuerzo operativo continuo. Construibles con Claude Code en semanas.

---

## 1. Panorama 2025-2026: el activo de contenido en la era de AI Overviews

El modelo clásico "genero páginas a escala → rankeo long-tail → monetizo con ads/afiliados" está bajo la mayor disrupción de su historia. Los datos duros:

- **AI Overviews (AIO) aparecen en el 48% de las búsquedas de Google** a marzo 2026, contra 34,5% en diciembre 2025 y 31% en febrero 2025 — crecimiento acelerado ([thestacc](https://thestacc.com/blog/google-ai-overview-statistics/)).
- Cuando aparece un AIO, **el CTR orgánico cae 61%** (de 1,76% a 0,61%) según Seer Interactive, sept. 2025 ([seerinteractive](https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update); [dataslayer](https://www.dataslayer.ai/blog/google-ai-overviews-the-end-of-traditional-ctr-and-how-to-adapt-in-2025)).
- Un estudio de campo independiente midió **-38% de clics orgánicos salientes** en queries con AIO, y el zero-click subió de 54% a 72% ([Search Engine Journal](https://www.searchenginejournal.com/ai-overviews-cut-organic-clicks-38-field-study-finds/573145/)).
- **60% de las búsquedas terminan sin clic**; con AIO presente sube a 80-83%; en Google AI Mode llega al **93%** ([omnibound](https://www.omnibound.ai/blog/zero-click-search-statistics); [pasqualepillitteri](https://pasqualepillitteri.it/en/news/811/google-ai-mode-zero-click-seo-2026-en)).
- El solapamiento entre el top-10 orgánico y las citas del AIO **colapsó de 75% (mediados 2025) a 17-38% (principios 2026)**: rankear alto ya no garantiza visibilidad en la IA ([omnibound](https://www.omnibound.ai/blog/ai-seo-statistics)).

**El corte de bisturí — qué intención sobrevive:** la IA se come la intención *informacional*. Las queries "qué es / cómo / definición" se resuelven en la SERP el **74% de las veces**. En cambio:

- **Queries transaccionales** ("comprar", "precio", "contratar", "mejor X para Y") **siguen generando clic el 69% de las veces**.
- **Queries locales** (mapas, horarios, prestadores cerca) siguen siendo click-heavy porque la IA no satisface esa intención on-page.
- **Queries de marca con AIO suben +18,68% de CTR**. E-commerce transaccional casi no se afecta (Amazon -1,73%, Booking -0,46%) ([omnibound](https://www.omnibound.ai/blog/zero-click-search-statistics)).

**GEO como capa nueva y obligatoria:** el mercado ya le puso precio a Generative Engine Optimization — **Adobe compró Semrush por ~US$1,9B (anuncio 19-nov-2025)**, y ChatGPT reportó **900M de usuarios activos semanales (feb. 2026)**. Google dice que optimizar para sus features generativos "sigue siendo SEO": front-load de la respuesta, estructura Q&A + schema, señales de autoridad y **citas de terceros creíbles** ([techtimes](https://www.techtimes.com/articles/318359/20260614/generative-engine-optimization-geo-2026-how-get-your-content-cited-chatgpt-ai-overviews.htm); [frase](https://www.frase.io/blog/what-is-generative-engine-optimization-geo)).

**Conclusión estratégica para C2:** hoy NO se construye un activo de contenido apostando a tráfico informacional puro. Se construye sobre **intención transaccional, local, interactiva (herramientas) o con datos propietarios** — categorías donde la IA no puede resolver la tarea en la SERP y el clic sigue vivo. Y todo activo nace con capa GEO para captar el tráfico de referral de ChatGPT/Perplexity/AIO que sí clickea a la fuente citada. Sobre esa tesis se filtran las 3 propuestas y los descartes.

---

## 2. Propuestas

### Directorio vertical B2B con datos propietarios + lead-gen — "El activo defensible por excelencia"

- **Qué es / problema que resuelve:** directorio de nicho vertical (ej.: prestadores de salud mental, estudios contables para monotributistas, proveedores de energía solar, veterinarias especializadas) con fichas ricas, filtros, reseñas y **datos propietarios que la IA no tiene** (precios, disponibilidad, verificación). Resuelve intención **transaccional + local**: "psicólogo online que atienda ansiedad", "contador para monotributo en Córdoba". La IA no puede reemplazar el matching + contacto.
- **Cómo se construye con Claude Code:** Next.js (App Router) + TypeScript + Postgres/Neon, páginas de ficha generadas a escala desde la base (SEO programático **sobre datos, no sobre definiciones**), filtros con ISR, schema.org `LocalBusiness`/`Service` para GEO, formularios de lead capturados a la base. **MVP en 3-4 semanas**: scraping/seed inicial de listings + 2-3 plantillas de página + panel de altas. Bajo mantenimiento: el contenido lo aportan los propios listados y las reseñas de usuarios (UGC).
- **Diseño & branding:** marca de "guía de confianza del nicho" — badge de verificación, diseño limpio tipo producto (no blog), sello "verificado" como activo de conversión.
- **Marketing / adquisición:** SEO programático long-tail transaccional + local, backlinks desde el nicho, capa GEO para que ChatGPT/Perplexity lo citen como fuente, y **outbound directo a los primeros 20-50 prestadores** para sembrar oferta (arranque manual, luego autoservicio).
- **Cómo se cobra:** triple stack — (1) **listings destacados / premium** (recurrente), (2) **lead-gen: US$30-50 por lead cualificado** vendido al prestador, (3) **suscripción** de exposición continua. Pasarela: **MercadoPago (AR/LATAM)** + Stripe global. Referencia: directorio de salud mental que llegó a **£8.000 MRR con solo 200 prestadores a £150/mes** ([edirectory](https://www.edirectory.com/updates/how-directory-websites-make-money/); [connorfinlayson](https://connorfinlayson.com/blog/how-to-monetize-directory-no-traffic-audience)).
- **Mercado / demanda:** directorios de nicho facturan **entre US$1k y US$40k/mes**; el caso emblema **Cursor Directory pasó de un build de 3 horas a 250k usuarios/mes** y se reporta ~US$35k/mes con márgenes casi totales ([HN Show HN](https://news.ycombinator.com/item?id=43412295); [directorist](https://directorist.com/blog/business-directory-ideas/)). Competencia: alta en nichos genéricos, **baja en verticales locales AR/LATAM mal atendidos**.
- **Apalancamiento del estudio:** fabricación rápida (Claude Code), branding de confianza, SEO fuerte, y billing recurrente con MercadoPago — encaja con todas las capacidades del estudio.
- **Esfuerzo a primer peso + riesgos:** primer peso al vender el primer listing destacado (semanas 4-6). Riesgo: **problema del huevo/gallina** (necesitás oferta y demanda). Se mitiga sembrando oferta manualmente y eligiendo nicho con demanda ya existente. Riesgo bajo de AIO por intención transaccional/local.
- **Veredicto: 8.5/10.** Es el modelo más defensible ante AIO, con ingreso recurrente + lead-gen, bajo mantenimiento (UGC) y aplicabilidad AR/LATAM directa vía MercadoPago. Techo de facturación probado.

---

### Comparador transaccional con afiliados — "Intención de compra, comisión recurrente"

- **Qué es / problema que resuelve:** sitio comparador de una categoría con **intención de compra clara** (ej.: hosting, herramientas SaaS, plataformas de trading/inversión, software contable, seguros). Tablas comparativas, filtros por caso de uso, "mejor X para Y". Captura queries transaccionales que **siguen clickeando el 69% de las veces** pese a AIO.
- **Cómo se construye con Claude Code:** Next.js + TS, base de productos con specs/precios, páginas comparativas generadas a escala (X vs Y, "mejores X para [caso]"), tablas interactivas, schema `Product`/`Review`, capa GEO. **MVP en 2-3 semanas** — es más liviano que el directorio (no requiere sembrar oferta, los "productos" ya existen). Mantenimiento: actualizar specs/precios periódicamente (semi-automatizable).
- **Diseño & branding:** autoridad editorial + tablas claras, badges "elección del editor", diseño que transmite objetividad.
- **Marketing / adquisición:** SEO transaccional + comparativas "vs", GEO para ser citado por LLMs (los comparadores son fuente ideal para respuestas de IA → **tráfico de referral que sí clickea**), y contenido de reseña profunda.
- **Cómo se cobra:** **afiliación**, priorizando **comisión recurrente de por vida**. Referencias con fuente: **TradingView 30% recurrente vitalicio** mientras el referido siga suscripto; **Kinsta 10% recurrente + bono US$50-500**; hosting **US$150-200 por venta** (WP Engine, Liquid Web 150%); finanzas con **CPA alto** (PU Prime US$455/trader cualificado) ([ecomobi](https://ecomobi.com/high-commission-affiliate-programs/); [getlasso](https://getlasso.co/niche/financial/); [seahawkmedia](https://seahawkmedia.com/hosting/best-hosting-affiliate-programs/)).
- **Mercado / demanda:** afiliación en tech/finanzas/hosting es enorme y madura; el ángulo diferencial es elegir **una vertical con AOV alto y comisión recurrente**. Competencia alta en inglés genérico → **oportunidad en español/LATAM** donde los comparadores de calidad escasean.
- **Apalancamiento del estudio:** SEO fuerte + fabricación rápida + diseño editorial. No requiere billing propio (cobra el partner de afiliados), lo que baja la fricción operativa.
- **Esfuerzo a primer peso + riesgos:** primer peso cuando el tráfico convierte la primera venta afiliada (típicamente 2-4 meses de indexación). Riesgos: **dependencia del programa de afiliados** (cambian términos), **necesita tráfico** para monetizar (ads-like), y AIO puede resumir la comparación — mitigable con datos propietarios (tests reales, tablas interactivas) que la IA no reproduce.
- **Veredicto: 8/10.** Intención transaccional defensible, comisión recurrente = ingreso semi-pasivo, MVP muy rápido y cero fricción de billing. Pierde medio punto vs. el directorio por dependencia de terceros y por necesitar volumen de tráfico antes de monetizar.

---

### Suite de calculadoras interactivas monetizadas (fiscal/financiera AR-LATAM) — "Herramientas que la IA no resuelve en la SERP"

- **Qué es / problema que resuelve:** conjunto de calculadoras interactivas de alto volumen con foco **AR/LATAM**: sueldo neto, categoría/cuota de monotributo, aguinaldo/SAC, indemnización, plazo fijo, cuotas de crédito, conversión inflación/dólar. Son **herramientas** — el usuario necesita ingresar datos y obtener un resultado, algo que el AIO no resuelve inline de forma completa, y que genera tráfico masivo y recurrente.
- **Cómo se construye con Claude Code:** Next.js + TS, lógica de cálculo en cliente, una plantilla de calculadora reutilizable escalada a decenas de herramientas, contenido de apoyo + FAQ (para GEO), embebibles (`iframe`) para conseguir backlinks. **MVP en 2-3 semanas** para 8-12 calculadoras. Mantenimiento: actualizar parámetros fiscales/tasas (pocas veces al año).
- **Diseño & branding:** utilitario, rápido, mobile-first; marca "las calculadoras confiables de [tema] en Argentina". Los embebibles llevan la marca a otros sitios.
- **Marketing / adquisición:** SEO de cola de herramienta (volúmenes enormes), embebibles que generan backlinks orgánicos, GEO. Referencia de escala: una **calculadora de porcentajes recibe 1,6M de visitas orgánicas**; la **calculadora de calorías de Mayo Clinic ~456k orgánicas, valor de tráfico estimado US$106k** ([ahrefs](https://ahrefs.com/blog/website-calculators/)).
- **Cómo se cobra:** mix — (1) **ads display** (Ezoic al arranque; Mediavine US$20-40 RPM o Raptive US$25-50 RPM al superar el umbral de tráfico; un blogger real reportó **RPM US$47-57, promedio US$54 en Q4 2025** con Raptive), (2) **lead-gen** hacia productos financieros (préstamos, seguros, contadores — US$30-50/lead), (3) versión pro/sin-ads con **MercadoPago**. Nota: RPM en AR/LATAM es menor que en tráfico US; el lead-gen local suele rendir más que los ads ([thisweekinblogging](https://thisweekinblogging.com/mediavine-vs-raptive/); [affiliatemarketingclues](https://affiliatemarketingclues.com/raptive-review/)).
- **Mercado / demanda:** las calculadoras están entre los activos de mayor tráfico orgánico por unidad de esfuerzo. En AR hay picos estacionales fuertes (aguinaldo jun/dic, monotributo recategorización, cierre fiscal). Competencia: existe, pero fragmentada y de baja calidad UX en español.
- **Apalancamiento del estudio:** fabricación ultrarrápida (plantilla + N calculadoras), SEO fuerte, diseño, y billing MercadoPago para el tier pro.
- **Esfuerzo a primer peso + riesgos:** ads necesitan volumen (100k+ pageviews para que rinda) → primer peso más lento por vía ads; el lead-gen puede monetizar antes. Riesgos: **RPM bajo en LATAM**, dependencia de umbrales de redes de ads, y que AIO empiece a incrustar cálculos simples (los cálculos complejos/locales quedan más protegidos).
- **Veredicto: 7.5/10.** Excelente relación esfuerzo/tráfico y muy defensible en cálculos locales/complejos, pero la monetización por ads exige volumen y el RPM LATAM es flojo; brilla cuando se le suma lead-gen financiero. Bajo mantenimiento real.

---

## 3. Descartados con criterio

1. **SEO programático puramente informacional** (páginas "qué es X", "cómo hacer Y", glosarios y definiciones a escala). **Descartado:** es exactamente lo que AIO devora — las queries informacionales se resuelven en la SERP el **74% de las veces** y el CTR cae 61% con AIO presente. Construir el activo sobre esta base es edificar sobre arena movediza ([omnibound](https://www.omnibound.ai/blog/zero-click-search-statistics)).

2. **Blog de nicho monetizado solo con ads display.** **Descartado como negocio principal:** requiere **100k+ pageviews** para que los ads muevan la aguja, con CTR orgánico en caída estructural y RPM volátil/estacional dependiente de terceros (umbrales de Mediavine/Raptive). Alto riesgo, monetización tardía y sin foso defensivo. Solo vale como **capa secundaria** encima de un activo con intención transaccional ([ahrefs/monetización](https://www.publisher-collective.com/blog/adsense-revenue-calculator)).

3. **Newsletter con paywall.** **Descartado para el mandato C2:** contradice el requisito de "bajo mantenimiento continuo" — exige producción editorial recurrente (semanal) de por vida y venta activa de suscripciones. Es un negocio de contenido *operativo*, no un activo semi-pasivo. Mejor encaje en otro mandato de la célula, no en éste.

---

## 4. Fuentes

**AI Overviews / zero-click / GEO**
- https://thestacc.com/blog/google-ai-overview-statistics/ — prevalencia AIO 48% (mar-2026)
- https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update — CTR orgánico -61% con AIO
- https://www.dataslayer.ai/blog/google-ai-overviews-the-end-of-traditional-ctr-and-how-to-adapt-in-2025 — CTR y estrategias
- https://www.searchenginejournal.com/ai-overviews-cut-organic-clicks-38-field-study-finds/573145/ — estudio de campo -38% clics
- https://www.omnibound.ai/blog/zero-click-search-statistics — queries transaccionales/locales resistentes, datos zero-click
- https://www.omnibound.ai/blog/ai-seo-statistics — colapso solapamiento top-10 vs citas AIO
- https://pasqualepillitteri.it/en/news/811/google-ai-mode-zero-click-seo-2026-en — AI Mode 93% zero-click
- https://www.techtimes.com/articles/318359/20260614/generative-engine-optimization-geo-2026-how-get-your-content-cited-chatgpt-ai-overviews.htm — GEO, Adobe/Semrush US$1,9B, ChatGPT 900M WAU
- https://www.frase.io/blog/what-is-generative-engine-optimization-geo — GEO como capa sobre SEO

**Directorios**
- https://www.edirectory.com/updates/how-directory-websites-make-money/ — modelos; caso salud mental £8k MRR
- https://connorfinlayson.com/blog/how-to-monetize-directory-no-traffic-audience — lead-gen US$30-50/lead
- https://directorist.com/blog/business-directory-ideas/ — rangos de facturación US$1k-40k/mes
- https://news.ycombinator.com/item?id=43412295 — Cursor Directory: build de 3h → 250k usuarios/mes

**Comparadores / afiliados**
- https://ecomobi.com/high-commission-affiliate-programs/ — TradingView 30% recurrente vitalicio
- https://getlasso.co/niche/financial/ — programas financieros, CPA alto
- https://seahawkmedia.com/hosting/best-hosting-affiliate-programs/ — hosting US$150-200/venta, Kinsta recurrente

**Calculadoras / ads / RPM**
- https://ahrefs.com/blog/website-calculators/ — calc. porcentajes 1,6M orgánicas; Mayo calorías 456k / US$106k
- https://thisweekinblogging.com/mediavine-vs-raptive/ — RPM Mediavine US$20-40, Raptive US$25-50
- https://affiliatemarketingclues.com/raptive-review/ — RPM real Q4 2025 US$47-57 (prom. US$54)
- https://www.publisher-collective.com/blog/adsense-revenue-calculator — umbral 100k+ pageviews para ads

**AR / LATAM**
- https://tiendli.com/blog/vender-productos-digitales-argentina/ — MercadoPago como pasarela óptima AR
- https://www.godaddy.com/resources/latam/stories/ideas-negocios-online — suscripciones = ingreso recurrente más rentable
