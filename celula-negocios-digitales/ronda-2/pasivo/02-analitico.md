# 🔬 A2 — Analítico PASIVO · Filtrado, dimensionado y scoring

> **Fecha: 2026-07-06.** Equipo PASIVO, ola 2 (convergente). Mi trabajo: masacrar las 11 ideas de A1
> con unit economics y research web real 2025-2026. Fuentes citadas al final. Nada de memoria.

## Marco de filtrado (los 3 tamices que apliqué)

1. **Tamiz AI Overviews (AIO):** en 2025-2026 los AIO destruyeron el CTR orgánico. Seer Interactive
   (sept-2025) midió caída de **61%** en CTR orgánico (de 1.76% a 0.61%) en queries con AIO; Ahrefs
   reportó -58% en posición 1. Google usa Gemini 3 en los AIO y responde con follow-ups dentro del
   resultado. **Traducción:** todo negocio cuyo único activo es "rankear contenido informativo y
   cobrar ads" está sangrando. Las queries de "¿qué se paga el [fecha]?", "¿cuánto sale X?",
   "¿qué es el aguinaldo?" son EXACTAMENTE las que el AIO contesta sin click. [1][2][3]
2. **Tamiz RPM Argentina (el que A1 no dimensionó):** los RPM de finanzas de US$30-60 que hacen soñar
   son de **tráfico Tier 1 (EEUU)**. Argentina es Tier 3: RPM display real **US$2-8** por 1000 pageviews
   (finanzas puede empujar a US$10-20 con esfuerzo, pero no US$40). Un negocio de ads con tráfico AR
   necesita **volumen masivo** para mover la aguja. [4][5]
3. **Tamiz "pasivo de verdad":** ¿el activo sigue rindiendo sin operación semanal? Costo marginal cero
   (productos digitales) > audiencia propia (email) > moat de datos (UGC) > arbitraje de ads puro
   (se comoditiza y depende de Google).

Con esos tres tamices, **descarté 6 ideas** (abajo, con motivo) y **seleccioné 5**.

---

## SELECCIONADAS (5)

### 1) Plantillería (#5 de A1) — catálogo de plantillas Notion/Sheets localizadas a la normativa AR
**one-liner:** producto digital puro, costo marginal cero, cobrable HOY, sin dependencia de Google.

- **Qué es / por qué es pasivo (real):** catálogo de plantillas (facturación monotributo, control de
  stock kiosco, costos gastronómico, kit posteos estética, presupuestos oficios). Se produce una vez,
  se vende infinitas. **Es el más pasivo de las 11**: sin scraping que se rompe, sin cron de refresh
  mensual, sin moderación, sin dependencia de ranking orgánico si se distribuye por redes/marketplace.
  El único "riego" es actualizar cuando cambia la normativa AR (1-2 veces al año) y sumar productos.
- **Cómo se construye con Claude Code:** el build técnico es mínimo (landing + checkout + entrega de
  archivo). El valor está en el **diseño** (fortaleza del estudio) y el **know-how normativo AR**.
  MVP con 3-5 plantillas + landing: **1-2 semanas**. Escala sumando SKUs.
- **Monetización + números reales:** venta one-time US$25-75 (o su equivalente ARS). Benchmarks 2025:
  creadores con 3-5 plantillas + audiencia chica facturan **US$500-3.000/mes**; caso real citado: un
  creador con ~4.000 seguidores hizo **US$1.800 en un mes** con 3 plantillas (US$25/$39/$75, ~25-30
  ventas). Top-performers (Easlo, Thomas Frank) cinco cifras/mes. [6] Fees: Lemon Squeezy (MoR global,
  cobra en USD) ~5% + tarjeta; Hotmart 9,9% + US$0,50; Mercado Pago AR para el mercado local (acredita
  en ARS). [7][12]
- **Mercado / competencia:** el mercado de plantillas está probado y creciendo, pero **saturado en
  inglés/genérico**. El hueco defendible es **localización AR** (monotributo, ARCA, IVA): las
  plantillas globales no sirven acá. Competencia local: baja y fea. Diseño premium del estudio = moat
  estético. [6][8]
- **Unit economics para US$1.000/mes:** ~**37 ventas/mes a US$27 neto**, o ~15 ventas a US$67. Con un
  catálogo de 5-8 plantillas y tráfico modesto (Instagram/TikTok orgánico del estudio + SEO de nicho),
  es alcanzable. Costo de IA para producir: **despreciable** (centavos por plantilla).
- **Tiempo al primer ingreso pasivo:** primeras ventas en **semanas** (no meses) si hay distribución
  mínima; la meseta de US$1k+/mes suele llegar a los **3-6 meses** con catálogo y reviews.
- **Riesgos:** (a) distribución — sin audiencia, un catálogo no se vende solo (es el cuello real);
  (b) copia — las plantillas se piratean; (c) NO hay riesgo AIO (no depende de tráfico orgánico
  informativo). Riesgo de plataforma bajo si se usa checkout propio + MoR.
- **Veredicto: 8/10.** El más limpio del lote: pasivo genuino, costo marginal cero, cobrable ya,
  demanda probada, diferencial de localización + diseño que el estudio ejecuta mejor que nadie. Techo
  de ingreso individual moderado, pero se apila con más SKUs y verticales.

---

### 2) El Data Semanal (#3 de A1) — newsletter faceless de finanzas cotidianas AR con sponsors
**one-liner:** audiencia propia (email), inmune al AIO; el activo es la lista, no el ranking.

- **Qué es / por qué es pasivo:** "1 dato + 1 gráfico por semana" sobre economía cotidiana AR. El
  activo es la **lista de suscriptores**: se construye una vez, se monetiza para siempre, y **no
  depende de Google** (el email llega a la bandeja, el AIO no lo toca). "Pasivo" con asterisco: hay
  producción semanal (un agente arma el borrador, un humano edita ~20 min) → es **semi-pasivo**, no
  100% dormido.
- **Cómo se construye con Claude Code:** agente de redacción sobre fuentes públicas (INDEC, BCRA) +
  plantilla de email + ESP (beehiiv/MailerLite) + archivo web indexable. MVP: **1 semana**. Lo caro no
  es el build, es el **crecimiento de la lista**.
- **Monetización + números reales:** el nicho finanzas es de los de **mayor CPM** en newsletters:
  benchmarks 2025 dan **US$70-180 CPM** en finanzas/fintech (aunque eso es sobre todo B2B EEUU;
  audiencia **consumer AR** realista más cerca de **US$20-45 CPM**). Con 20k subs a US$30 CPM = ~US$600
  por envío/sponsor. Modelos más allá del CPM crecen (CPA/CPL/rev-share ya son ~58% de la facturación
  del sector en Q1-2026). [9][10] Extra: afiliados (plazo fijo/cripto/broker) + tier pago con dataset.
- **Mercado / demanda:** demanda de "entender la guita en Argentina" es masiva y perenne (inflación,
  dólar, plazo fijo). Sponsors naturales: fintech, billeteras, brokers (compiten fuerte por audiencia
  financiera = pujan CPM alto). Competencia AR: existe (Cenital, algunos financieros) pero el formato
  "1 dato + dataviz de autor" ultra-consumible está poco ocupado.
- **Unit economics para US$1.000/mes:** con **~20-25k subs AR financieros** y 2-4 sponsors/mes a
  US$300-600 → US$600-2.400/mes. El problema no es el CPM, es **llegar a 20k subs**: eso toma
  típicamente **12-24 meses** de crecimiento orgánico salvo inversión en paid.
- **Tiempo al primer ingreso:** los primeros sponsors chicos aparecen con ~**3-5k subs** (~US$100-200/
  envío), a los **4-8 meses**. El ingreso serio (US$1k+/mes) recién con lista madura: **12-18 meses**.
- **Riesgos:** (a) crecimiento de lista lento = es el verdadero costo; (b) presupuestos de sponsors AR
  < benchmarks EEUU (ajusté los números arriba); (c) dependencia de deliverability del ESP; (d) es
  semi-pasivo (producción semanal). NO riesgo AIO.
- **Veredicto: 7/10.** Activo de mayor calidad estratégica (audiencia propia, defensible, CPM alto),
  pero **el más lento en madurar** y no del todo pasivo. Sinergia fuerte con la idea #3 (calculadoras
  como lead-magnet). Vale como apuesta de mediano plazo, no de ingreso rápido.

---

### 3) Calculadoras que se citan solas (#7 de A1) — enjambre de mini-tools financieras AR interactivas
**one-liner:** tools interactivas que el AIO NO puede reemplazar del todo (el usuario mete SUS datos).

- **Qué es / por qué (semi)pasivo:** sueldo en mano, indemnización, aguinaldo, plazo fijo, alquiler con
  ICL, USD/ARS histórico. Cada una es una landing que, una vez hecha, solo necesita **actualizar
  coeficientes** (agente). Ventaja clave vs. el resto del SEO informativo: **son interactivas** — el
  AIO puede explicar "qué es el aguinaldo" pero no calcular TU aguinaldo con tu sueldo, así que la
  herramienta retiene click mejor que una nota estática. Es el sub-nicho de SEO que **mejor sobrevive
  al AIO**. [1][11]
- **Cómo se construye con Claude Code:** tools chicas y repetibles; el estudio puede fabricar 10-20 en
  **2-4 semanas**. El valor está en la cantidad + interlinking (autoridad SEO compuesta) + resultado
  embebible/compartible (backlinks orgánicos).
- **Monetización + números reales:** ads (RPM AR finanzas realista **US$5-15**, no US$40) + lead-gen a
  contadores/seguros + son el **lead-magnet natural de la newsletter #2** (ésta es su mejor
  monetización, no los ads). [4][5]
- **Mercado / competencia:** volumen de búsqueda AR gigante y perenne ("cuánto me queda del sueldo" se
  busca todo el mes). Competencia existente (calculadoras de portales) pero fea y con mal UX móvil.
- **Unit economics para US$1.000/mes (solo ads):** a RPM US$7 necesitás **~143k pageviews/mes** — mucho,
  pero repartido en 15-20 calculadoras muy buscadas es plausible en 12-18 meses. **Por eso su mejor uso
  no es el ad-arbitrage sino alimentar la lista de la #2.**
- **Tiempo al primer ingreso:** ads pagan de entrada pero migajas hasta tener volumen (**9-15 meses**
  para US$1k solo-ads). Como lead-magnet, aporta valor desde el mes 1.
- **Riesgos:** (a) AIO igual come parte del tráfico "informativo" alrededor de la tool; (b) RPM AR bajo
  exige mucho volumen; (c) commoditización (cualquiera hace una calculadora). Mitigado si se juega
  **como red interconectada + feeder de la newsletter**, no como negocio de ads aislado.
- **Veredicto: 6/10.** No brilla sola (RPM AR bajo, techo de ads lejano), pero es la **mejor pieza de
  un combo** con la #2: tráfico interactivo resistente al AIO → captura de emails → monetización por
  sponsors. Evaluarla como sistema, no como isla.

---

### 4) Mapa del Barrio (#9 de A1) — fábrica de micro-directorios hiper-locales UGC
**one-liner:** los directorios de listings verificados **sobreviven al AIO** y cobran B2B directo, no ads.

- **Qué es / por qué pasivo:** micro-directorios ("veterinarias 24h en [ciudad]", "quién arregla
  notebooks en [barrio]"). Semilla generada por agente desde datos públicos; después el **UGC**
  (reseñas, altas, correcciones) lo mantiene. Una plantilla, N ciudades/rubros. Pasivo con asterisco:
  **la venta de listings destacados es trabajo activo** (hay que conseguir comercios que paguen).
- **Cómo se construye con Claude Code:** motor de directorio replicable + seed por agente + moderación
  UGC. MVP de un vertical/ciudad: **2-3 semanas**; después se clona.
- **Por qué pasa el tamiz AIO (dato clave):** la investigación 2026 es explícita: **los directorios de
  listings verificados siguen rankeando** post-crackdown de "scaled content abuse", porque cada página
  responde un query distinto con datos estructurados reales. Google penaliza template-swap vacío, NO
  directorios con datos verificados. [11]
- **Monetización + números reales:** **no depende de ads** → listing destacado pago (SaaS recurrente).
  Benchmarks 2025: directorios locales chicos **US$500-3.000/mes**; nicho establecido US$10k-50k/mes.
  Para US$2-3k/mes: **~100-150 comercios a US$15-25/mes** + US$500-800 de banners. Modelos por
  suscripción rinden **2,8x más por listing** que flat-fee. [13][14]
- **Mercado / competencia:** directorios locales AR son viejos y feos; el ángulo "sembrado con IA el
  día 1" rompe el problema huevo-gallina que a los tradicionales les toma años.
- **Unit economics:** el costo no es técnico (build barato), es **comercial**: conseguir y retener
  100+ comercios pagando. Ahí está el trabajo real y recurrente → **el menos pasivo de los 5 en el
  lado ventas**, aunque el activo SEO sí sea pasivo.
- **Tiempo al primer ingreso:** primeros listings pagos a los **2-4 meses** (requiere prospección);
  US$2k/mes recién con base de comercios instalada: **8-15 meses**.
- **Riesgos:** (a) venta B2B = fricción y churn (no pasivo); (b) moderación UGC (spam/fake); (c)
  arranque frío del UGC. Riesgo AIO **bajo** (ventaja diferencial del lote).
- **Veredicto: 6,5/10.** Resiliente al AIO y con monetización que no depende de tráfico masivo de ads
  (raro y valioso en 2026). Lo baja el componente de **venta activa recurrente**: es más "negocio
  local replicable" que "pasivo dormido".

---

### 5) Cambió el Precio (#8 de A1) — historial de precios AR con moat de datos UGC
**one-liner:** moat de datos real y ansiedad masiva por la inflación; pero build alto y monetización floja.

- **Qué es / por qué pasivo:** bot/extensión que registra precios de e-commerce AR y muestra historial
  ("¿la oferta es oferta o te subieron antes?"). Cada consulta **alimenta la base** → el activo crece
  con el uso (efecto CamelCamelCamel para la inflación argentina). Moat de datos = defendible.
- **Cómo se construye con Claude Code:** extensión + ingestión + antifraude de datos. **Medio-alto**:
  el más complejo de los 5. MVP: **4-8 semanas**.
- **Monetización + números reales (acá está el problema):** el modelo CamelCamelCamel = **ads + afiliados
  Amazon**, y Amazon **recortó fuerte las comisiones en 2020**, hiriendo a CCC; Keepa sobrevivió mejor
  virando a **suscripción + API paga** (US$19/mes). Lección directa: **el afiliado puro no sostiene un
  price-tracker**; el dinero real está en suscripción/API/venta de la data. [15] En AR el afiliado de
  e-commerce (Mercado Libre tiene programa) es delgado; la ruta seria es **tier pro de alertas + vender
  la data histórica de precios AR** (que es un activo en sí).
- **Mercado / demanda:** en un país con inflación crónica, "¿me están mintiendo con esta oferta?" es
  ansiedad **diaria y masiva** — demanda genuina y sin buen cubridor en español. Fuerte.
- **Unit economics:** para US$1.000/mes vía tier pro a US$3/mes necesitás **~330 suscriptores pagos**
  (factible si la base gratuita es grande), pero el **arranque frío del UGC** (pocos usuarios = poca
  data = poca utilidad = pocos usuarios) es el cuello. Costo de infra de scraping/almacenamiento no es
  trivial.
- **Tiempo al primer ingreso:** el más lento en monetizar por el cold-start del moat: **9-18 meses**.
- **Riesgos:** (a) monetización débil/incierta (lección Amazon); (b) build y mantenimiento
  antifraude altos = **no tan pasivo**; (c) e-commerce AR puede bloquear scraping; (d) cold-start UGC.
  Riesgo AIO bajo (no es negocio de SEO).
- **Veredicto: 5,5/10.** La idea con **mejor moat y mejor relato de demanda**, pero la que **peor cierra
  en plata y menos pasiva es en la práctica** (build alto, monetización probadamente floja, cold-start).
  Gran "algún día"; mal candidato para ingreso pasivo cercano.

---

## Descartadas de la lista de A1 (y por qué)

- **#1 Feriados & Vencimientos AR:** SEO informativo puro sobre "¿qué se paga el [fecha]?" = **blanco
  directo del AIO** (queries que Google contesta sin click, -61% CTR) + RPM AR bajo. El generador
  programático además roza el "scaled content abuse" penalizado en 2026 si no aporta dato único. [1][11]
- **#2 Nombralo (generador de nombres):** categoría **hipersaturada** globalmente (Namelix y decenas);
  el afiliado de dominios paga poco (Namecheap **20%** de un dominio de ~US$10 ≈ US$2). El único
  diferencial (marca AR/INPI) no alcanza para negocio pasivo; su valor real es **lead-gen al servicio
  de branding** del estudio → es funnel, no activo pasivo. [16]
- **#4 Cuánto Sale (comparador de precios de trámites):** mismo problema que #1 — contenido informativo
  que el AIO absorbe + scrapers frágiles por vertical (mantenimiento alto, no pasivo). El ángulo
  "costo real total" es bueno pero no basta contra el tamiz AIO. [1]
- **#6 Faceless Recetas (video corto IA):** **RPM LATAM/español bajísimo** (CPM general LATAM ~US$1,2-2,5;
  España/Hispano-US ayuda pero el core AR no) + el pipeline de video IA exige curaduría y publicación
  **constante** = poco pasivo + plataformas endurecen políticas de contenido IA masivo. [17]
- **#10 El Prompt del Día (packs de prompts):** producto digital, ok, pero **activo que se deprecia
  rápido** (cambian los modelos y los prompts caducan) y el mercado "IA para [oficio]" está
  **saturándose**. Requiere refresh continuo = menos pasivo que una plantilla normativa. Preferible
  meter esa energía en Plantillería (#5), que no caduca con cada release de modelo.
- **#11 Sonido de Marca (assets de audio IA):** el diferencial (voz/acento español) se **comoditiza
  con cada mejora de TTS/música IA**, y el stock de audio ya es un mar rojo. Curaduría con gusto ayuda
  pero el moat es débil y erosionable. Bajo, no lo priorizo.

---

## Cierre A2

**Ranking:** Plantillería **8** · El Data Semanal **7** · Mapa del Barrio **6,5** · Calculadoras
**6** · Cambió el Precio **5,5**. Observación transversal: las 3 ideas que A1 apoyó en **SEO
informativo + ads** (#1, #4, #7-como-isla) están heridas por el AIO y por el RPM AR bajo; lo que
sobrevive 2026 es **producto digital (costo marginal cero), audiencia propia (email), o datos
estructurados/verificados (directorios, UGC)**. Recomiendo además leer **#2 (newsletter) + #3
(calculadoras)** como **un solo sistema** (tool interactiva → captura email → sponsor), no como dos
negocios sueltos.

---

## Fuentes

- [1] Seer Interactive — AIO Impact on Google CTR, Sept 2025: https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update
- [2] Ahrefs — AI Overviews reduce clicks (update): https://ahrefs.com/blog/ai-overviews-reduce-clicks-update/
- [3] Search Engine Land — AI Overviews drive 61% drop in organic CTR: https://searchengineland.com/google-ai-overviews-drive-drop-organic-paid-ctr-464212
- [4] Bridging Points Media — AdSense CPM Rates by Country 2025: https://bridgingpointsmedia.com/google-adsense-cpm-rates-by-countries/
- [5] Techconda — AdSense RPM Benchmarks 2025 (por nicho y país): https://www.techconda.com/2026/02/adsense-rpm-benchmarks.html
- [6] Coachli — Sell Notion Templates 2026 Blueprint (earnings): https://www.coachli.co/blog/sell-notion-templates-your-2026-side-hustle-blueprint
- [7] Automateed — How to Sell Notion Templates 2025: https://www.automateed.com/how-to-sell-notion-templates
- [8] BuildWithNotion — Best Notion Template Marketplaces 2025: https://buildwithnotion.com/blog/best-notion-template-marketplaces-2025/
- [9] beehiiv — How Much Do Newsletter Ads Cost (CPM breakdown): https://www.beehiiv.com/blog/newsletter-sponsorship-cost
- [10] Newsletrix — Sponsorship rates by niche (finance CPM): https://newsletrix.com/blog/newsletter-sponsorship-rates-by-niche
- [11] DigitalApplied — Programmatic SEO after March 2026 / scaled content (qué sobrevive): https://www.digitalapplied.com/blog/programmatic-seo-after-march-2026-surviving-scaled-content-ban
- [12] Hotmart — tarifas 9,9% + US$0,50: https://help.hotmart.com/es/article/208298448/-cuales-son-las-tarifas-cobradas-por-hotmart-
- [13] Turnkey Directories — Monetize a directory ($10k/mo): https://turnkeydirectories.com/tips-monetize-business-directory-website/
- [14] eDirectory — How directory websites make money 2026: https://www.edirectory.com/updates/how-directory-websites-make-money/
- [15] EntreResource — Why sellers stopped using CamelCamelCamel (afiliado Amazon recortado): https://entreresource.com/heres-why-amazon-sellers-stopped-using-camelcamelcamel/
- [16] Namecheap — comisiones de afiliados (dominios 20%): https://www.namecheap.com/support/knowledgebase/article.aspx/9933/55/what-are-the-namecheap-commission-rates/
- [17] Fluxnote — YouTube CPM Latin America by country 2026: https://fluxnote.io/guides/youtube-cpm-latin-america-by-country
