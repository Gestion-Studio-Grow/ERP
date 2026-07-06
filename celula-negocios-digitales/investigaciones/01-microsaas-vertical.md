# C1 — Micro-SaaS Vertical con IA

**Célula de I+D de Negocios Digitales — Gestión Studio Grow**
**Consultor:** C1 (Micro-SaaS vertical con IA)
**Fecha:** 2026-07-06
**Estado:** Investigación de mercado con research web real. Todas las cifras citan fuente (ver §Fuentes).

---

## 1. Panorama: por qué el micro-SaaS vertical con IA es la jugada 2026

El consenso 2025-2026 es claro: **el dinero está en lo vertical y angosto, no en lo horizontal**. Los datos que encontré:

- El mercado de **vertical SaaS alcanzó ~US$130.000M en 2025 y crece 18-22% anual**, casi el doble que las plataformas horizontales ([SaaS Mag](https://www.saasmag.com/vertical-saas-outperforming-horizontal-2026/)). Los verticales SaaS reportan **35-60% más retención** que sus pares horizontales ([ISHIR](https://www.ishir.com/blog/224961/vertical-saas-micro-saas-why-niche-focused-products-win-in-2025.htm)).
- Un **micro-SaaS** lo corren 1 a 5 personas, factura US$50K-3M+/año y **se construye y lanza en 4-12 semanas** en vez de 6-24 meses ([Lovable](https://lovable.dev/guides/micro-saas-ideas-for-solopreneurs-2026), [Pallavi Pant/Medium](https://pantpallavi13.medium.com/best-ai-micro-saas-ideas-for-2026-that-arent-just-chatgpt-wrappers-2aa3b8b4f67e)). Esto encaja exacto con la capacidad del estudio: fabricar rápido con Claude Code.
- **El "thin wrapper" murió.** Los productos que solo ponen una UI sobre la API de un modelo no tienen valor: el proveedor del modelo lanza esa feature nativa y te borra. Lo que financia y retiene es **vertical AI con workflow propio y datos propietarios** ([AI Magicx](https://www.aimagicx.com/blog/vertical-ai-micro-saas-business-model-2026), [Groovyweb](https://www.groovyweb.co/blog/best-ai-saas-product-ideas-2026)). "La gente no quiere chatear, quiere *hacer*": agentes que resuelven el workflow desprolijo de una industria concreta.
- Señal de dinero real: **PE cerró 73 operaciones de vertical SaaS por US$15,3B en Q1 2025**; los verticales bootstrapeados se venden a 7-10x ARR ([ISHIR](https://www.ishir.com/blog/224961/vertical-saas-micro-saas-why-niche-focused-products-win-in-2025.htm)).

**Ángulo del estudio (tesis C1):** el research en inglés (US) muestra nichos ya saturados —vet scribe, field service US—, pero el **incumbente casi siempre está en inglés y cobra en USD**. En **Argentina/LATAM el mercado SaaS crece 28% anual hasta 2026** ([Revista Factor de Éxito](https://guatemala.revistafactordeexito.com/a/39181/mercado-de-saas-crecera-28-anual-en-latam-hasta-2026)) y **está mal servido en español, con cobro local (Mercado Pago) y normativa local**. Ese hueco —vertical caliente en US + localización profunda a LATAM en español— es precisamente donde un estudio chico que fabrica con IA gana rápido. Las tres propuestas se apoyan en esa tesis.

---

## 2. Propuestas

### VetVoz — El copiloto de historia clínica por voz, en español, para la veterinaria de barrio

- **Qué es / problema que resuelve.** El veterinario habla; VetVoz transcribe la consulta y devuelve la **historia clínica (SOAP) redactada**, más recordatorios de vacunación/desparasitación por WhatsApp e instrucciones de alta para el dueño de la mascota. El dolor: el vet pierde 2-3 horas/día tipeando fichas y las clínicas LATAM usan gestores que registran datos pero **no tienen scribe con IA**.
- **Cómo se construye con Claude Code.** Stack: Next.js/TS + Postgres + transcripción (Whisper/modelo de voz) + LLM para estructurar el SOAP en español rioplatense/neutro + integración WhatsApp Business API + Mercado Pago. Es un pipeline audio→transcripción→prompt estructurado→ficha editable: **MVP en 4-6 semanas**. El moat no es el LLM, es el workflow vet + plantillas clínicas + datos de la clínica (vademécum, protocolos, historial del paciente).
- **Diseño & branding.** Marca cálida y "de confianza clínica" (no tech fría): mascota-mascota. Onboarding en 10 minutos, foco en "grabá y listo". App móvil-first porque el vet trabaja de pie / a domicilio.
- **Marketing / canal.** Grupos de Facebook/WhatsApp de veterinarios, colegios de veterinarios provinciales, congresos vet, y **demo en vivo grabando una consulta real**. Referidos entre clínicas (mercado muy boca-a-boca). Contenido: "cuánto tiempo recuperás por semana".
- **Cómo se cobra.** Suscripción por DVM/mes vía **Mercado Pago (AR/LATAM)** y Lemon Squeezy/Stripe para global. Referencia de precio: los scribes vet en inglés van de **US$40 a US$450/mes** (ScribbleVet Essential US$40, VetGeni US$50, VetRec US$99-150, HappyDoc flat US$149 clínica) ([VetSoftwareHub](https://www.vetsoftwarehub.com/article/veterinary-ai-scribe-pricing-comparison-2026), [VetGeni](https://www.vetgeni.com/blog/veterinary-ai-scribe-pricing-comparison-2026)). Precio LATAM sugerido: **US$25-35/vet/mes** (arriba de gestores locales como VetLink ~US$32 pero con IA), pagable en pesos.
- **Mercado / demanda.** La búsqueda de "veterinary AI" creció **+1.680% interanual 2024-2025**; ya no es *si* adoptar scribe sino *cuál* ([VetSoftwareHub](https://www.vetsoftwarehub.com/article/veterinary-ai-scribe-pricing-comparison-2026)). Mercado global de software vet **US$2,1B creciendo 9%/año**, 30.000+ clínicas solo en US ([ISHIR](https://www.ishir.com/blog/224961/vertical-saas-micro-saas-why-niche-focused-products-win-in-2025.htm)). En LATAM ya hay gestores consolidados (ACVet +600 clínicas en 🇨🇱🇲🇽🇦🇷🇨🇴, GVET, Wirevet, Volki, Recorvet) pero **son gestión/ficha, no scribe con IA** ([ComparaSoftware AR](https://www.comparasoftware.com.ar/veterinario)). Ese es el hueco: llegás con la ola caliente (IA por voz) al mercado hispano antes que los incumbentes en inglés (VetRec, HappyDoc) lo localicen.
- **Apalancamiento del estudio.** Español nativo + Mercado Pago + fabricación rápida con Claude Code + branding/marketing propio. Los líderes US no cobran en pesos ni redactan en español clínico local.
- **Esfuerzo a primer peso + riesgos.** Primer peso: ~6-8 semanas (MVP + 5 clínicas piloto). Riesgos: (a) **consolidación** —Instinct Science compró ScribbleVet en enero 2026, el segmento se está agrupando; (b) que un incumbente en inglés localice rápido; (c) precisión clínica en español (mitigable con plantillas y edición humana). Riesgo de infra bajo (pipeline conocido).
- **Veredicto: 8/10.** Ola de demanda validada y explosiva, hueco de idioma/cobro real, MVP corto, moat por workflow+datos. Baja el punto por competencia global fuerte que podría bajar a LATAM.

---

### PrevenIA — Compliance de Seguridad e Higiene Laboral para pymes argentinas, con IA

- **Qué es / problema que resuelve.** SaaS que le automatiza a la pyme (o al estudio de S&H que atiende varias pymes) el **cumplimiento normativo ART/SRT**: genera RAR/RGRL, matriz de riesgos (IPER), checklists de inspección, registro de entrega de EPP, capacitaciones y —lo más valioso— **alertas de vencimientos y armado de packs para auditoría/ART**. La IA redacta borradores de informes y programas de prevención a partir de pocos datos.
- **Cómo se construye con Claude Code.** Next.js/TS + Postgres + generador de documentos (PDF con formato normativo) + LLM para redactar informes/relevamientos + agenda de vencimientos + carga de evidencia (fotos con timestamp). El grueso es **plantillas normativas + trazabilidad "qué se informó y cuándo"**. **MVP en 6-8 semanas.**
- **Diseño & branding.** Marca sobria, "tranquilidad ante la inspección". Dashboard tipo semáforo (verde/amarillo/rojo por vencimiento). Pensado para el **licenciado/técnico en S&H que gestiona una cartera de pymes** (multi-cliente), no solo para la pyme suelta.
- **Marketing / canal.** Consejos/colegios profesionales de Seguridad e Higiene, contadores y estudios que derivan, LinkedIn B2B, y contenido sobre Res. SRT 20/2018 (Programa de Prevención para pymes). Venta consultiva + prueba gratis armando un relevamiento real.
- **Cómo se cobra.** Suscripción mensual por empresa gestionada, vía **Mercado Pago**. Anclaje de precio por *dolor sustituido*: el **servicio manual de S&H cuesta ~ARS $125.000/mes para 1-15 trabajadores y $200.000-600.000/mes para 16-50** ([Ley5920](https://ley5920autoproteccion.com.ar/higiene-y-seguridad-servicio/)). Un SaaS a US$15-40/empresa/mes es una fracción y multiplica la capacidad del técnico.
- **Mercado / demanda.** Compliance normativo es señalado como **gran desafío de las pymes argentinas** ([Thomson Reuters AR](https://www.thomsonreuters.com.ar/es/soluciones-fiscales-contables-gestion/blog-empresas/cumplimiento-normativo-pymes.html)). El marco existe y obliga (Ley 19587, Res. SRT 20/2018 y 48/2019). Ya hay competencia local puntual (**Previnnova** hace RAR/RGRL, evidencias y auditorías, [Previnnova](https://www.previnnova.com.ar/software-cumplimiento-seguridad-higiene-argentina)) — o sea **mercado validado con demanda pero sin gigante dominante**. El diferencial es la **capa de IA que redacta** y el modelo multi-cartera para el profesional.
- **Apalancamiento del estudio.** Conocimiento local de normativa + IA generativa + cobro en pesos. Barrera de entrada real (nadie construye esto desde afuera de Argentina).
- **Esfuerzo a primer peso + riesgos.** Primer peso: ~8-10 semanas (hay que modelar bien la normativa). Riesgos: (a) **dependencia regulatoria** —si cambia la norma hay que mantener plantillas; (b) venta más lenta/consultiva que B2C; (c) Previnnova ya está posicionado. Mitigación: apuntar al segmento pyme chico desatendido y al profesional multi-cartera.
- **Veredicto: 7/10.** Dolor concreto, obligatorio y pagable; moat regulatorio; pero venta más lenta y build más pesado que VetVoz. Muy sólido para Argentina.

---

### GremioPro — Presupuestá, agendá y cobrá en un mensaje: gestión para oficios (plomeros, electricistas, refrigeración) en español + Mercado Pago

- **Qué es / problema que resuelve.** App móvil para el oficio independiente/pyme de servicios: la IA **arma el presupuesto** a partir de una descripción o foto del trabajo, agenda la visita, emite factura y **cobra por link de Mercado Pago**. Resuelve el caos de WhatsApp + cuaderno + presupuestos que se demoran y se pierden.
- **Cómo se construye con Claude Code.** Next.js/TS (PWA móvil-first) + Postgres + LLM para generar presupuesto estructurado desde texto/foto + Mercado Pago (links y suscripción) + WhatsApp para enviar presupuesto/recordatorio. **MVP en 4-6 semanas** (el core presupuesto→agenda→cobro es acotado).
- **Diseño & branding.** Marca directa, "de laburante", cero jerga. Todo se hace desde el celular en obra. UX de 3 toques: describir → presupuesto → enviar por WhatsApp.
- **Marketing / canal.** Grupos de oficios en Facebook/WhatsApp, TikTok/Reels mostrando "hacé el presupuesto en 20 segundos", alianzas con corralones/proveedores, referidos. Freemium para entrar.
- **Cómo se cobra.** Suscripción baja por usuario/mes vía **Mercado Pago**, con posible fee sobre cobros procesados. Referencia global: los FSM para pequeños contratistas van de **US$29,99/mes (QuoteIQ) a US$59-79 (Housecall Pro Basic)**, con Jobber sirviendo 300.000+ usuarios ([Workyard](https://www.workyard.com/compare/field-service-management-software-for-small-business), [MyQuoteIQ](https://myquoteiq.com/most-affordable-field-service-management-softwares-in-2026/)). Precio LATAM sugerido: **US$8-15/mes** pagable en pesos, muy por debajo de los USD del incumbente.
- **Mercado / demanda.** Categoría enorme y con dinero: **ServiceTitan salió a bolsa en dic-2024 a US$9B** con >95% de retención bruta sirviendo a plomeros/HVAC ([SaaS Mag](https://www.saasmag.com/vertical-saas-outperforming-horizontal-2026/)). Home services/trades es de los verticales top 2026 por workflows en papel + pagos embebidos ([Qubit Capital](https://qubit.capital/blog/rise-vertical-saas-sector-specific-opportunities)). **En US está saturado; en LATAM en español está mayormente vacío** salvo horizontales de agenda (AgendaPro). "AI front-office" (presupuesto/agenda automáticos) es el nuevo estándar 2026 ([Workyard](https://www.workyard.com/compare/field-service-management-software-for-small-business)).
- **Apalancamiento del estudio.** Español + Mercado Pago (cobro embebido es *la* palanca de retención en este vertical) + fabricación rápida + marketing viral de bajo costo (Reels).
- **Esfuerzo a primer peso + riesgos.** Primer peso: ~6 semanas. Riesgos: (a) **mercado más commodity y competido globalmente** —el diferenciador es idioma+cobro, no tecnología; (b) B2C de laburantes = churn alto y baja disposición a pagar; (c) hay horizontales locales de agenda que podrían sumar la feature. Mitigación: nicho por oficio (empezar por uno, ej. refrigeración/HVAC) y hacer del cobro Mercado Pago el gancho.
- **Veredicto: 7/10.** Demanda gigante y validada, cobro embebido = retención, MVP corto; pero es el más commodity de los tres y el moat es más débil (idioma/cobro, no datos). Gana si se ataca oficio por oficio.

---

## 3. Descartados con criterio

- **Vet AI scribe en inglés para el mercado US.** Es el nicho más caliente (+1.680% YoY) pero **ya saturado y consolidándose**: VetRec, ScribbleVet, HappyDoc, CoVet, Scribenote, VetGeni compitiendo, e **Instinct Science compró ScribbleVet en enero 2026** ([VetSoftwareHub](https://www.vetsoftwarehub.com/article/veterinary-ai-scribe-pricing-comparison-2026)). Un estudio chico llega tarde y sin ventaja. *Por eso VetVoz ataca LATAM/español, no US.*
- **"AI wrapper" horizontal (chatbot/generador de contenido genérico).** Sin workflow ni datos propios: **el proveedor del modelo lanza la feature nativa y te borra**; es exactamente lo que el research 2026 marca como modelo muerto ([AI Magicx](https://www.aimagicx.com/blog/vertical-ai-micro-saas-business-model-2026)). Cero moat, cero defensa.
- **Software de nutricionistas/dietistas (global, en inglés).** Mercado atractivo (US$1,2B, CAGR 10,3%) pero con **incumbentes fuertes que ya integraron IA scribe**: Healthie (US$29 + scribe desde US$35), Kalix (US$47), Practice Better, That Clean Life ([VerifiedMarketReports](https://www.verifiedmarketreports.com/product/nutritionist-software-market/), [Twofold](https://www.trytwofold.com/blog/reddit-nutrition-ai-notes-review)). Entrar de frente es pelear contra plataformas maduras; el ángulo LATAM-español existe pero es más débil que en vet (menos volumen de dolor por profesional).

---

## 4. Fuentes

- ISHIR — Vertical & Micro-SaaS 2026: https://www.ishir.com/blog/224961/vertical-saas-micro-saas-why-niche-focused-products-win-in-2025.htm
- SaaS Mag — Vertical SaaS outperforming horizontal 2026: https://www.saasmag.com/vertical-saas-outperforming-horizontal-2026/
- SaaS Mag — Niche beats horizontal 2026: https://www.saasmag.com/vertical-saas-niche-beats-horizontal-2026/
- AI Magicx — Vertical AI Micro-SaaS 2026: https://www.aimagicx.com/blog/vertical-ai-micro-saas-business-model-2026
- Groovyweb — 20 AI SaaS ideas 2026: https://www.groovyweb.co/blog/best-ai-saas-product-ideas-2026
- Lovable — Micro SaaS ideas solopreneurs 2026: https://lovable.dev/guides/micro-saas-ideas-for-solopreneurs-2026
- Pallavi Pant / Medium — AI Micro-SaaS ideas (no wrappers): https://pantpallavi13.medium.com/best-ai-micro-saas-ideas-for-2026-that-arent-just-chatgpt-wrappers-2aa3b8b4f67e
- Qubit Capital — Vertical SaaS 2026 niches: https://qubit.capital/blog/rise-vertical-saas-sector-specific-opportunities
- Workyard — Best FSM software for small business 2026: https://www.workyard.com/compare/field-service-management-software-for-small-business
- MyQuoteIQ — Most affordable FSM 2026: https://myquoteiq.com/most-affordable-field-service-management-softwares-in-2026/
- VetSoftwareHub — Veterinary AI scribe pricing 2026: https://www.vetsoftwarehub.com/article/veterinary-ai-scribe-pricing-comparison-2026
- VetGeni — Veterinary AI scribe pricing comparison 2026: https://www.vetgeni.com/blog/veterinary-ai-scribe-pricing-comparison-2026
- ComparaSoftware AR — Software veterinario Argentina: https://www.comparasoftware.com.ar/veterinario
- Previnnova — Software compliance S&H Argentina: https://www.previnnova.com.ar/software-cumplimiento-seguridad-higiene-argentina
- Ley5920 — Servicio de Seguridad e Higiene (precios 2025): https://ley5920autoproteccion.com.ar/higiene-y-seguridad-servicio/
- Thomson Reuters AR — Cumplimiento normativo pymes: https://www.thomsonreuters.com.ar/es/soluciones-fiscales-contables-gestion/blog-empresas/cumplimiento-normativo-pymes.html
- Revista Factor de Éxito — SaaS LATAM +28% anual hasta 2026: https://guatemala.revistafactordeexito.com/a/39181/mercado-de-saas-crecera-28-anual-en-latam-hasta-2026
- Cristian Tala — Pasarelas de pago LATAM 2026: https://cristiantala.com/pasarelas-de-pago-en-latam-2026-la-guia-que-necesitas-antes-de-cobrar-tu-primer-dolar/
- Lemon Squeezy — Pricing / Merchant of Record: https://www.lemonsqueezy.com/pricing
- VerifiedMarketReports — Nutritionist software market: https://www.verifiedmarketreports.com/product/nutritionist-software-market/
- Twofold — AI note taker for nutritionists (pricing): https://www.trytwofold.com/blog/reddit-nutrition-ai-notes-review

---

*Investigación local de la célula C1. No se tocó producción, git ni deploy. Próximo paso sugerido: validar VetVoz con 3-5 entrevistas a veterinarios locales antes de escribir código.*
