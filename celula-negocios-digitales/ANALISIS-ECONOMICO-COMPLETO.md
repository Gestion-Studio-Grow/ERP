# Análisis económico COMPLETO — todos los negocios de la célula (rondas 1 y 2)

> **Analista económico · Célula de I+D de Negocios Digitales — Gestión Studio Grow · 2026-07-06.**
> El dueño pidió "los números de todos", no solo los sobrevivientes. Acá está el costeo de **los ~21
> negocios únicos** que generó la célula en las dos rondas: los 12 de la Ronda 1 (portfolio de los 5
> consultores) y los 10 de la Ronda 2 (5 pasivos + 5 activos), deduplicando el que se repite.
> Todo en **USD** (el cobro USD desde Argentina se liberó en 2025). Los números duros salen de los
> informes analíticos y del red-team, con fuente; donde falta un dato lo estimé con criterio y lo marqué
> **(est.)**. Todo local, no se tocó prod ni git.

---

## Cómo leer esto (para el dueño, sin vueltas técnicas)

- **"Build MVP"** = cuántas semanas de trabajo del equipo lleva tenerlo funcionando. Con Claude Code el
  costo NO es plata, es **tiempo**. El cash directo de un MVP es bajo (**US$100–500** de infra + tokens).
- **"COGS"** = lo que cuesta **atender a cada cliente** (o entregar cada venta) una vez que está vivo.
  En productos con IA esto **no es fijo**: sube con el uso. La voz cuesta 15–30× más que el texto.
- **"Margen bruto"** = de cada peso que entra, cuánto queda después de pagar el COGS. SaaS clásico 80–90%;
  **producto con IA real 50–60%** (regla de Bessemer/ICONIQ); voz o labor humana lo bajan más.
- **"Clientes para US$5.000/mes"** = cuántos clientes (o ventas) hacen falta para ese objetivo de caja.
- **Estado** — resultado del red-team de la Ronda 2:
  - 🟢 **VIVO** — pasó los dos ataques (mercado + plata).
  - ⚠️ **HERIDO** — sirve, pero con una condición dura (lento, CAC alto, o mal etiquetado).
  - ☠️ **MUERTO** — el mercado ya lo ocupa un competidor local / la plataforma grande lo regala, o la
    plata no cierra. No se costea a fondo (abajo, una línea de por qué).
  - 🟢\* **PROPUESTA (sin red-team)** — negocio de la Ronda 1 que **no pasó** por el red-team adversarial;
    los números son de investigación de mercado, no de un ataque de plata. Tomar con esa cautela.

### Supuestos comunes (para que los números sean honestos)
- **Build = tiempo, no cash.** Cash directo del MVP: **US$100–500**. Plataforma fija (hosting+DB+API): **US$50–150/mes** por producto.
- **COGS de IA (Claude Sonnet US$3/US$15 por millón de tokens):** respuesta de texto ≈ **US$0,005**; conversación de WhatsApp ≈ **US$0,15–0,30**; **voz ≈ US$0,13–0,31/min** (todo incluido, el número real del red-team, más caro que el US$0,07–0,15 de lista).
- **Cobro:** cliente AR → **Mercado Pago** (comisión 1,49–6,29% + retención IIBB sobre el bruto). Cliente global USD → **Merchant of Record** (Lemon Squeezy ~5%+US$0,50), bajando la plata con Wallbit/Payoneer y facturando como exportación de servicios (Factura E, exenta de IVA).
- **Churn pyme:** 3–7%/mes (43% de las bajas en los primeros 90 días) → los LTV largos están inflados.
- **La trampa #1:** precio **flat** sobre un agente de IA → el heavy user te deja en rojo. Todo lo conversacional/voz se cobra **por uso** (tope + excedente).

---

## 1. TABLA MAESTRA — los 21 negocios

Ordenada por estado (primero lo vivo/validado, después lo herido, después lo muerto). "R1" = Ronda 1
(consultor entre paréntesis); "R2" = Ronda 2 (activo/pasivo).

| # | Negocio | Origen | Build MVP | Cash build | COGS x cliente/venta | Precio referencia | Margen bruto | Clientes p/ US$5.000/mes | 1er peso | Estado |
|---|---------|--------|-----------|-----------|----------------------|-------------------|--------------|--------------------------|----------|--------|
| 1 | **Kudos** — reseñas en piloto automático | R2 activo | 2–3 sem | US$100–500 | US$3–10/mes (texto) | US$99–149/mes + setup US$100–200 | **90–95%** | **~34–50 locales** | 3–5 sem | 🟢 VIVO |
| 2 | **Fantasma** — "turno noche" de WhatsApp | R2 activo | 1–2 sem | US$100–300 | US$15–30/mes (¡US$60–120 en alto vol.!) | US$120–300/mes + fee/lead | 80–85% | **~25 clientes** | **2–3 sem** | 🟢 VIVO\*\* |
| 3 | **Testigo** — parte de obra desde foto+audio | R2 activo | 3–4 sem | US$100–500 | ~US$2/operario/mes | US$15–30/operario (5 op = US$75–150) | **~90%** | **~35–50 cuadrillas** | 4–6 sem | 🟢 VIVO |
| 4 | **Plantillería** — plantillas normativa AR | R2 pasivo | 1–2 sem | US$100–300 | ~US$0 (solo fee pasarela) | US$25–75 one-time | **90–95%** | ~185 ventas/mes (meseta real ~US$1k = 37) | semanas | 🟢 VIVO\*\* |
| 5 | **Postora** — CM con IA para comercios | R1 (C3) | 4–6 sem | US$100–500 | US$5–15/mes (copy + gen. imagen) (est.) | US$29–59/mes | ~75–85% (est.) | ~110–170 comercios (est.) | 4–6 sem | 🟢\* propuesta |
| 6 | **Recepcionista IA vertical** — voz+WhatsApp+agenda | R1 (C4) | 3–5 sem | US$100–500 | US$30–80/mes (voz, por uso) (est.) | Setup US$300–1.000 + US$150–500/mes | ~40–60% (voz) (est.) | ~15–25 clientes (est.) | semanas | 🟢\* propuesta |
| 7 | **Calificación de leads WhatsApp** — ticket alto | R1 (C4) | 3–5 sem | US$100–500 | US$10–30/mes (conversacional) (est.) | Retainer US$200–800/mes + fee resultado + setup US$300–1.500 | ~75–85% (est.) | ~10–20 clientes (est.) | semanas | 🟢\* propuesta |
| 8 | **Back-office documental (AFIP)** — conciliación | R1 (C4) | 4–6 sem | US$100–500 | US$5–20/mes (visión + labor) (est.) | Setup US$1.500–5.000 + US$500–2.000/mes | 60–75% real (labor) (est.) | ~5–8 clientes (est.) | 6–10 sem | 🟢\* propuesta |
| 9 | **Directorio B2B + lead-gen** — datos propios | R1 (C2) | 3–4 sem | US$100–500 | ~US$0/lead (activo SEO) | Listing recurrente + lead US$30–50 + sub | ~90% (est.) | ~150 listings (est.) | 4–6 sem | 🟢\* propuesta |
| 10 | **VetVoz** — historia clínica por voz (vet) | R1 (C1) | 4–6 sem | US$100–500 | US$2–5/vet/mes (audio in) (est.) | US$25–35/vet/mes | ~90% (est.) | ~145–200 vets (est.) | 6–8 sem | 🟢\* propuesta |
| 11 | **PrevenIA** — compliance S&H (ART/SRT) | R1 (C1) | 6–8 sem | US$100–500 | US$1–5/empresa/mes (est.) | US$15–40/empresa/mes | ~85–90% (est.) | ~125–330 empresas (est.) | 8–10 sem | 🟢\* propuesta |
| 12 | **Comparador con afiliados** — transaccional | R1 (C2) | 2–3 sem | US$100–300 | ~US$0 (activo de contenido) | Comisión afiliados 10–30% recurrente / CPA US$150–455 | ~95% (est.) | ~33 ventas/mes recurrentes (necesita tráfico) | 2–4 meses | 🟢\* propuesta |
| 13 | **Vitrina** — fotos+ficha para vender online | R1 (C3) | 3–5 sem | US$100–500 | US$0,10–2,00/imagen (API terceros) | Freemium + créditos; ~US$8–13/mes | ~50–70% (est.) | ~400–600 usuarios/packs (est.) | semanas | 🟢\* propuesta |
| 14 | **GremioPro** — presupuesto+agenda+cobro oficios | R1 (C1) | 4–6 sem | US$100–500 | US$1–3/user/mes (est.) | US$8–15/mes + fee sobre cobros | ~85% (est.) | ~400+ usuarios (churn alto) (est.) | ~6 sem | 🟢\* propuesta |
| 15 | **MediaKit.ar** — media kit micro-creadores | R1 (C3) | 2–4 sem | US$100–300 | ~US$0,01–0,05/kit (est.) | Freemium / one-time US$9–19 | ~90% (est.) | ~330 ventas/mes (competencia gratis) | 2 sem | 🟢\* propuesta débil |
| 16 | **El Data Semanal** — newsletter finanzas AR | R2 pasivo | 1 sem | US$100–300 (+ ~US$40k pauta p/ 20k subs) | ~US$0/sub | Sponsor US$300–600/envío (CPM AR US$20–45) | ~85% s/revenue (CAC lista brutal) | ~40k+ subs + 3–4 sponsors (est.) | sponsors 4–8 meses; serio 12–18 m | ⚠️ HERIDO |
| 17 | **Mapa del Barrio** — micro-directorios UGC | R2 pasivo | 2–3 sem | US$100–300 | ~US$0 + labor moderación/venta | Listing US$15–25/mes + banners | ~85–90% (venta B2B) | ~200–330 comercios | 2–4 meses | ⚠️ HERIDO |
| 18 | **Calculadoras fiscales/financieras AR** | R1(C2)+R2 pasivo | 2–4 sem | US$100–300 | ~US$0 (tools estáticas) | Ads (RPM AR US$5–15) + lead-gen US$30–50 + pro | ~90% (revenue mínimo) | ~715k pageviews/mes (solo ads) | ads 9–15 meses | ☠️ MUERTO (aislado) |
| 19 | **Mercader** — gestor de MercadoLibre DFY | R2 activo | 4–6 sem | US$100–500 | ~US$4,4 IA + **labor humana** | US$150–350/mes + % lift | **60–70% real** (no 95%) | ~20 clientes | 6–8 sem | ☠️ MUERTO |
| 20 | **Confesionario** — voz-del-cliente aaS | R2 activo | 3–4 sem (+2–3 voz) | US$100–500 | texto ~US$0,01; **voz US$40–88/mes** + labor | US$120–280/mes | texto ~90% / **voz 55–70% o negativo** | ~25 clientes | 4–6 sem | ☠️ MUERTO |
| 21 | **Cambió el Precio** — historial de precios AR | R2 pasivo | 4–8 sem | US$100–500 + infra scraping | infra scraping/storage (no trivial) | Tier pro US$3/mes + API | débil/incierto | ~1.665 pagos (a US$3) | 9–18 meses | ☠️ MUERTO |

\*\* **Fantasma** solo cierra con **pricing por uso** (tope + excedente); flat ilimitado funde el margen en el heavy user.
**Plantillería** a US$5.000/mes exige catálogo grande + audiencia; su meseta realista de arranque es **US$1.000/mes ≈ 37 ventas** (caso real citado: US$1.800 en un mes con 3 plantillas y ~4.000 seguidores previos).

---

## 2. Ranking por RETORNO ESPERADO / ESFUERZO

El "esfuerzo" acá no es solo el build (con Claude Code todo es barato de construir): es **distribución +
venta + operación + tiempo hasta la caja**. El costo oculto real de casi todos NO es fabricar, es
**vender y distribuir**. Con ese lente:

| Puesto | Negocio | Por qué está acá (retorno / esfuerzo) |
|:------:|---------|----------------------------------------|
| **1** | **Fantasma** 🟢 | **Mejor caja temprana de todo el lote.** Reúsa el stack (build 1–2 sem), primer peso en 2–3 sem, margen 80–85% con pricing por uso. Mínimo esfuerzo, retorno rápido. |
| **2** | **Kudos** 🟢 | **Mejor margen real (90–95%) sin trampa de voz.** Build 2–3 sem, caja en 3–5 sem, y un **moat que baja el churn con el tiempo** (cuanto más gestionás el ranking, más caro le sale irse). El más "aburrido-rentable". |
| **3** | **Plantillería** 🟢 | **COGS cero y cobro global sin fricción.** Build 1–2 sem, primeras ventas en semanas. El único costo real es la **distribución** (audiencia) — si el estudio la resuelve, apila SKUs sin límite de margen. |
| **4** | **Testigo** 🟢 | Margen ~90% y **stickiness altísima** (una vez que el parte es el estándar de entrega del contratista, cambiar duele). Lo baja el ramp por rubro (evangelizar), no la plata. Segundo motor recurrente. |
| **5** | **Recepcionista IA vertical** 🟢\* | **ACV más alto** (setup + retainer), caja en semanas, viento regulatorio a favor (Meta mató los bots genéricos). Baja el puesto porque la **voz recorta el margen** a 40–60% y no pasó red-team. |
| **6** | **Postora** 🟢\* | **Punta de lanza de la Ronda 1**: apalanca al máximo el diseño del estudio (que es el producto y el moat frente a Canva/Meta), cobro recurrente de volumen, caja en semanas. No pasó red-team; ojo comoditización. |

**Del 7 al 15 (segunda tanda, todas 🟢\* propuesta sin red-team):** Calificación de leads WhatsApp
(ticket alto, sinergia con el marketing del estudio) · Directorio B2B (activo defensible, pero mismo
problema huevo/gallina que hirió a Mapa del Barrio) · Back-office AFIP (mayor ACV y stickiness, pero
build más pesado, labor humana y venta lenta con contadores) · VetVoz (ola de demanda validada, pero
consolidación global — Instinct compró ScribbleVet — y build 6–8 sem) · Comparador con afiliados (cero
fricción de billing, pero **depende de tráfico**, monetiza a los 2–4 meses) · PrevenIA (moat regulatorio,
pero venta consultiva lenta) · Vitrina (self-serve, pero la parte visual está comoditizada por
Photoroom/Canva → margen 50–70%) · GremioPro (demanda gigante, pero es B2C de laburantes = churn alto,
ticket bajo) · MediaKit.ar (baratísimo y con loop viral, pero **hay competidores gratis** → techo bajo;
mejor como imán/lead-magnet que como caballo de batalla).

**Heridos (16–17):** El Data Semanal y Mapa del Barrio — buenos activos, pero el primero tarda 12–18
meses y necesita ~US$40k de pauta para la lista; el segundo es **venta B2B disfrazada de pasivo**
(reponer bajas todos los meses) aplastada entre directorios existentes y Google Maps.

**Muertos (18–21):** no se costean a fondo — abajo el porqué.

---

## 3. Los muertos — por qué no se costea a fondo (una línea cada uno)

| Negocio | Por qué murió (no amerita costeo fino) |
|---------|-----------------------------------------|
| **Calculadoras fiscales/financieras** | El "competidor feo" es **falso**: 8+ sitios gratis, buenos y actualizados a 2026 ya rankean (calcularsueldoar, servidos.ar, aarg.ar, BBVA…). RPM AR de migajas (US$5–15). **Muere como negocio aislado; sobrevive solo como feeder de la newsletter.** |
| **Mercader (gestor de ML)** | **MercadoLibre lo comoditizó de forma nativa** ("respuesta sugerida" con IA, gratis) + 8 bots locales (Renata, GoBots, Yobot…). Encima el margen "95%" es mentira: la labor humana lo baja a 60–70%, y todo el negocio cuelga de una API que puede borrarte de un día para el otro. |
| **Confesionario (voz-del-cliente)** | El hueco **ya lo ocupan competidores locales idénticos** (Vokalis, Burbuxa, en español y para pyme). Y la voz real (US$0,13–0,31/min) + la lectura humana del insight **funden el margen**. Solo cerraría en modo texto con voz como add-on por uso. |
| **Cambió el Precio (price-tracker)** | Llega **último** a un mercado ya ocupado (MeliPrice, MercadoTrack) con monetización **probadamente floja** (lección CamelCamelCamel: el afiliado no sostiene un price-tracker) + build alto + cold-start del moat de datos de 9–18 meses. Tres formas de quemar plata antes del primer peso. |

---

## 4. Notas de deduplicación y merges

- **Calculadoras fiscales/financieras AR** apareció **dos veces**: como propuesta C2 en la Ronda 1
  (score 7,5) y otra vez en la Ronda 2 pasivo (A2, score 6), donde sí pasó por el red-team y quedó
  ☠️/⚠️. Se fusionó en **una fila (#18)** con el veredicto de la Ronda 2, que es el más duro y reciente.
- **Directorio B2B + lead-gen (R1, #9)** y **Mapa del Barrio (R2, #17)** son **primos, no idénticos**: el
  primero es un directorio **vertical B2B** con datos propietarios y lead-gen (US$30–50/lead); el segundo
  es una fábrica de **micro-directorios hiper-locales UGC** que cobra listings baratos. Se mantienen
  separados, pero comparten el mismo talón de Aquiles (problema huevo/gallina + Google Maps se queda con
  el descubrimiento local). El veredicto ⚠️ del red-team sobre Mapa del Barrio es una **advertencia
  directa** sobre el Directorio B2B, que no fue red-teameado.
- **Recepcionista IA vertical (R1, #6)** y **Fantasma (R2, #2)** se **pisan parcialmente**: ambos son
  atención automática de la pyme. Fantasma es el recorte barato ("solo el turno noche", texto/WhatsApp,
  sin voz) que **sobrevivió** al red-team; Recepcionista es la versión premium con **voz** (mayor ACV,
  menor margen) que no fue atacada. Comparten stack → reúso.
- Los **4 sobrevivientes** (Kudos, Fantasma, Testigo, Plantillería) ya tenían costeo fino en
  `ronda-2/ANALISIS-ECONOMICO-EJECUTIVO.md`; acá se reproducen y se los ubica dentro del universo completo.

---

## 5. Lectura del analista (plata pura)

- **El barbell que recomienda la plata:** **Plantillería** (COGS cero, aceita el motor de distribución
  barato) + **Kudos o Testigo** (margen recurrente 90%) + **Fantasma** para caja en 2–3 semanas.
- **Lo que sobrevive en 2026** es lo mismo en las dos rondas: **producto digital (costo marginal cero),
  texto (no voz), y cobro en pesos por Mercado Pago** evitando la fricción USD. Todo lo que mete **voz**
  (Recepcionista, Confesionario), **plataforma de terceros como canal único** (Mercader, Mapa/Directorio)
  o **espera de tráfico/lista** (Data Semanal, Calculadoras, Comparador) tiene comprometido el margen o el
  time-to-cash.
- **El costo oculto de TODOS no es el build (es barato con Claude Code): es la DISTRIBUCIÓN y la venta.**
  Por eso el ranking premia lo que factura rápido con esfuerzo comercial bajo.
- **Blindaje de margen obligatorio:** todo lo conversacional/voz se cobra **por uso** (tope + excedente),
  nunca flat. Presupuestar margen de IA real (50–60%), no el 80% del SaaS clásico.

---

## 6. Fuentes

Reusadas de los informes de la célula (todas verificadas con research web 2025-2026 en su momento).

**Unit economics de IA / COGS / pricing**
- Claude Platform — Pricing (Sonnet US$3/US$15 MTok, caching 0.1×): https://platform.claude.com/docs/en/about-claude/pricing
- Retell AI — AI Voice Agent Pricing 2026 (todo incluido US$0,13–0,31/min): https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis
- Drivetrain — Unit economics of AI SaaS (márgenes 50–60%, model routing, caching): https://www.drivetrain.ai/post/unit-economics-of-ai-saas-companies-cfo-guide-for-managing-token-based-costs-and-margins
- Meta for Developers — WhatsApp Business Platform Pricing (inbound gratis ventana 24h): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Optifai — B2B SaaS Churn Benchmarks (SMB 3–7%/mes, 43% de bajas en 90 días): https://optif.ai/learn/questions/b2b-saas-churn-rate-benchmark/

**Cobro USD desde Argentina / MoR / Mercado Pago**
- Perfil (Canal E) — Freelancers pueden cobrar en dólares sin límites ni comisiones (2025): https://www.perfil.com/noticias/canal-e/alivio-fiscal-para-freelancers-ahora-pueden-cobrar-en-dolares-sin-limites-ni-comisiones.phtml
- globalsolo — Stripe vs Paddle vs Lemon Squeezy 2026: https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026
- Lemon Squeezy — Fees: https://docs.lemonsqueezy.com/help/getting-started/fees
- Mercado Pago — Retenciones/percepciones: https://www.mercadopago.com.ar/ayuda/19244
- Wallbit — Comparativa de fees de payout: https://www.wallbit.io/es/blog/comparison-of-fees

**Reseñas / recepcionistas / field service / ML (activos R2)**
- Birdeye — Pricing (US$299–449/local/mes): https://birdeye.com/pricing/
- Mordor Intelligence — Online Reputation Management Market (US$6,88B 2025, 12,59% CAGR): https://www.mordorintelligence.com/industry-reports/online-reputation-management-market
- gmbapi — Review Management desde US$7/mes · Localo — respuestas IA gratis: https://gmbapi.com/product/review-management/ · https://localo.com/local-seo-tool/free/ai-review-response-generator
- Artics — Chatbot IA para empresas AR (US$50–400/mes) · Aoki: https://www.artics.com.ar/cuanto-cuesta-chatbot-ia-para-empresas-argentina/ · https://www.aokitech.com.ar/
- Housecall Pro vs Jobber vs ServiceTitan (US$39–249/técnico): https://fieldservicesoftware.io/housecall-pro-vs-jobber-vs-servicetitan/
- MercadoLibre — respuesta sugerida IA nativa: https://vendedores.mercadolibre.com.ar/nota/herramientas-para-responder-preguntas-mas-rapido
- Vokalis (encuestas IA voz+chat español) · Burbuxa (post-compra WhatsApp): https://vokalis.ai/soluciones/encuestas-y-feedback · https://burbuxa.com/es/blog/automatizacion-encuestas-whatsapp

**Micro-SaaS vertical / recepcionista voz (R1)**
- VetSoftwareHub — Veterinary AI scribe pricing 2026 (US$40–450/mes): https://www.vetsoftwarehub.com/article/veterinary-ai-scribe-pricing-comparison-2026
- Retell AI — best AI virtual receptionists / pricing (US$0,07/min): https://www.retellai.com/pricing
- Buildberg — costo recepcionista dental IA (US$700–1.400/mes): https://www.buildberg.co/blog/dental-ai-receptionist-cost
- Previnnova — software compliance S&H Argentina: https://www.previnnova.com.ar/software-cumplimiento-seguridad-higiene-argentina
- Workyard — Best FSM software for small business 2026: https://www.workyard.com/compare/field-service-management-software-for-small-business

**Contenido / SEO / directorios / calculadoras / afiliados (R1-C2 + R2 pasivo)**
- Seer Interactive — AIO impact on Google CTR (−61%): https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update
- eDirectory — How directory websites make money (caso salud mental £8k MRR): https://www.edirectory.com/updates/how-directory-websites-make-money/
- ahrefs — Website calculators (tráfico): https://ahrefs.com/blog/website-calculators/
- CalculadoraSueldo.ar / servidos.ar / aarg.ar — competidores gratis AR: https://calcularsueldoar.com/ · https://servidos.ar/calculadora-aguinaldo · https://aarg.ar/calculadoras/aguinaldo-argentina/
- ecomobi — high-commission affiliate programs (TradingView 30% recurrente): https://ecomobi.com/high-commission-affiliate-programs/
- DigitalApplied — Programmatic SEO after March 2026 (qué sobrevive): https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban

**Prosumer / creator / plantillas (R1-C3 + R2 pasivo)**
- TechCrunch — Canva lanza su propio modelo de diseño (comoditización): https://techcrunch.com/2025/10/30/canva-launches-its-own-design-model-adds-new-ai-features-to-the-platform/
- Apaya — AI Social Media Management Cost 2026 (US$27–199/mes): https://apaya.com/blog/ai-social-media-management-costs
- Photoroom — AI product photography + pricing (US$0,10–2,00/imagen): https://www.photoroom.com/ai-product-photography
- Coachli — Sell Notion Templates 2026 (earnings US$500–3.000/mes): https://www.coachli.co/blog/sell-notion-templates-your-2026-side-hustle-blueprint
- Poonam Sharma — 1 año vendiendo plantillas en Gumroad (realidad de distribución): https://poonamsharmawriter.medium.com/1-year-on-gumroad-selling-notion-templates-what-ive-learned-20b59270e36d

**Automatización B2B / agentes (R1-C4)**
- MIT "GenAI Divide 2025" — 95% de pilotos sin ROI: https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/
- Latenode — top agencias de automatización IA 2025 (project fees, retainers): https://latenode.com/blog/industry-use-cases-solutions/enterprise-automation/17-top-ai-automation-agencies-in-2025-complete-service-comparison-pricing-guide
- Peakflo — ROI de AP automation (costo por factura US$12–30 → US$1–5): https://peakflo.co/blog/accounts-payable-automation-roi-analysis
- CRMWhata — proveedores WhatsApp Business API LatAm + regla Meta ene-2026: https://crmwhata.com/mejores-proveedores-whatsapp-business-api-latinoamerica/

**Newsletter / CAC de lista (R2 pasivo)**
- beehiiv — Newsletter sponsorship cost (CPM por nicho): https://www.beehiiv.com/blog/newsletter-sponsorship-cost
- Adbloom — Grow newsletter with Meta ads (CAC US$0,65–3,50/sub): https://adbloom.ai/guides/grow-newsletter-with-meta-ads

*Nota: fees y marco cambiario/fiscal argentino cambian seguido — validar con contador antes de operar a volumen. Documento local, no se tocó producción, git ni deploy.*
