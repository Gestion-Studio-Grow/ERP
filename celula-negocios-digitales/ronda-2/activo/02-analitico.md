# 🔬 B2 — Analítico ACTIVO · Ronda 2

> **2026-07-06.** Filtro riguroso sobre las 12 ideas de B1. Objetivo: separar las que tienen mercado
> real y unit economics defendibles de las que no cierran para un estudio chico (fabricación rápida con
> Claude Code, billing MP AR + Stripe/Lemon, ciclo B2B corto). Todo con research web 2025-2026 y fuentes
> citadas. Dos lentes duros aplicados a cada idea: **(a) ¿el ciclo de venta B2B es corto para un estudio
> sin fuerza comercial?** y **(b) ¿el costo de tokens/IA como COGS variable rompe el margen de un precio
> flat?** (la "trampa del agente").

**Seleccionadas (5):** Kudos, Fantasma, Testigo, Mercader, Confesionario.
**Descartadas (7):** Locución, Autopsia, Cazatalentos, Efímero, Sucursal, Boletín, Doble.

---

## Supuestos de COGS de IA (base de todo el análisis)

Todo lo demás se apoya en estos números reales, así que los fijo una vez:

- **Claude Sonnet (API):** US$3 / millón tokens input, US$15 / millón output (precio estándar; hay
  introductorio $2/$10 hasta 2026-08-31, y **prompt caching a 0.1×** = $0.30/MTok en lecturas cacheadas). [1]
- **Respuesta de texto típica** (responder una reseña, contestar una pregunta): ~500 tok in + ~250 tok
  out ≈ **US$0.005**. Con caching del prompt de marca, menos.
- **Conversación agéntica de WhatsApp** (10-15 turnos, contexto que crece): ~US$0.15-0.30 por conversación
  cerrada. **Este es el número que hay que vigilar** — es lineal al volumen, no flat.
- **WhatsApp Business Platform (post 1-jul-2025, por mensaje):** los *service messages* dentro de la
  ventana de 24 h que abre el cliente son **gratis**; las plantillas *utility* dentro de esa ventana
  también son gratis desde abril 2025; *marketing* cuesta ~US$0.01-0.14 según país. [2] → El COGS de
  WhatsApp casi desaparece si el cliente inicia (inbound), y pesa solo en campañas outbound de marketing.
- **Voz (STT + TTS + LLM en tiempo real, tipo Retell/Vapi):** ~US$0.07-0.15 por minuto de llamada. **~15-30×
  más caro que texto** → la voz sube el COGS un orden de magnitud y hay que precificar por minuto/uso.

**Contexto de demanda AR/LatAm:** 41,6-42% de las pymes argentinas ya usan al menos una herramienta de IA,
y el 85% de esas empezó en 2024-2025 (adopción muy fresca, mercado "calentándose"). A nivel región, >50% de
las pymes ya incorporó IA y 70% planea seguir invirtiendo. [8] Traducción: hay apetito, pero el grueso está
en "herramientas básicas" → espacio para servicios done-for-you que les saquen el trabajo de encima.

---

## 1. Kudos — reseñas en piloto automático (captar reseña + responder todas con voz de marca)

- **Qué es / operación viva:** capturar al cliente en el pico de satisfacción (QR en ticket / WhatsApp
  post-venta), guiarlo a dejar reseña en Google/ML, y **responder el 100% de las reseñas** con la voz de la
  marca. Lo que hay que mantener: moderar respuestas sensibles (1★), playbook de crisis, reporte mensual de
  estrellas/ranking. Casi todo lo demás corre solo.
- **Cómo se construye con Claude Code:** stack liviano — webhook de Google Business Profile + WhatsApp API +
  generador de respuestas con Sonnet (prompt de marca cacheado) + tablero simple. **MVP en 2-3 semanas.** Es
  de los alcances más chicos de la lista.
- **Cómo se cobra + números reales:** B1 propone US$79-199/mes por local. El benchmark es contundente:
  **Birdeye cobra US$299 (Starter) / 399 (Growth) / 449 (Dominate) por local/mes**, prepago anual; Podium es
  pricing cerrado y aún más caro. [3] → hay lugar clarísimo para entrar a **US$99-149/mes por local**
  undercutteando a los gringos y hablando español nativo. Setup opcional US$100-200 (kit de voz de marca + QR).
- **Mercado / demanda / competencia:** el mercado global de online reputation management se valuó en
  **US$6,88-8,9 mil millones en 2025**, creciendo a **~12,8-13,8% CAGR** hacia 2030-2034. [4] Los players
  fuertes (Birdeye, Podium) son caros, en inglés y orientados a US multi-location; el segmento pyme
  hispanohablante que quiere "que alguien me maneje las reseñas por poca plata" está **muy poco servido**.
- **Unit economics:** COGS por cliente/mes: responder ~30 reseñas × US$0.005 = US$0.15 + campaña de pedido
  de reseña (utility dentro de ventana 24h = gratis; si outbound marketing, ~300 msg × US$0.03 = US$9) →
  **US$3-10/cliente/mes**. A US$99-149 → **margen bruto ~90-95%**. Para **US$5.000/mes** hacen falta
  **~34-50 locales** (a $149 / $99). Ciclo de venta **corto**: ticket bajo, demo visual, se puede vender por
  QR/canal físico → decisión en días, no meses.
- **Tiempo al primer peso:** 3-5 semanas (MVP + primeros 2-3 locales de barrio como beta paga).
- **Riesgos:** dependencia de la API de Google Business Profile (mitigable, es estable); Google penaliza
  reseñas incentivadas → hay que pedir reseña sin sobornar (guion "gating" prohibido por política de Google,
  ojo con eso); comoditización baja porque el **moat es acumulativo** (cuanto más tiempo gestionás, mejor el
  ranking del cliente y más caro le sale irse). COGS de IA **irrelevante** (texto, no voz).
- **Veredicto: 8/10.** Margen altísimo, COGS de IA despreciable, MVP corto, ciclo de venta corto, ROI
  medible (estrellas = ventas), moat que crece con el tiempo y un benchmark de precio que deja techo de 3×.
  Es el más "aburrido-rentable" de la lista. La única contra es que hay que sumar locales de a uno (venta
  atomizada), pero el CAC es bajo.

---

## 2. Fantasma — el "turno noche" de WhatsApp como servicio (atiende 20-8h y fines de semana)

- **Qué es / operación viva:** cubrir el WhatsApp del negocio fuera de horario: responde, cotiza, agenda y
  deja tickets calientes para la mañana. Mantener: curar el guion por cliente, revisar escalaciones raras,
  reporte del lunes con "la plata que se hubiera escapado".
- **Cómo se construye con Claude Code:** reúsa **directamente** el stack de Ronda 1 (WhatsApp + agente IA +
  MP). **MVP en 1-2 semanas** porque es re-empaquetado, no obra nueva. La chispa está en el framing
  ("contratá un turno", no "un chatbot") y el reporte de leads rescatados.
- **Cómo se cobra + números reales:** B1 propone US$120-300/mes + fee por lead fuera de hora. Benchmark de AI
  receptionists 2025-2026: **Rosie US$49 (250 min), Goodcall US$79 (ilimitado/agente), Smith.ai desde
  US$95 + por llamada, planes team ~US$199**; rango general US$25-300/mes. [5] Un answering service humano
  cuesta **US$200-7.000/mes**. [5] → US$120-300 por "solo el turno noche" es coherente y defendible como
  fracción de un humano.
- **Mercado / demanda / competencia:** enorme y validado (el mercado de AI receptionist ya tiene decenas de
  players en inglés). El **wedge** del estudio es: (a) español rioplatense nativo, (b) **solo la franja
  noche/finde** (más barato de vender que "reemplazá tu recepción entera"), (c) canal WhatsApp (no teléfono),
  que es donde realmente compra la pyme AR. Poca competencia local seria en ese recorte.
- **Unit economics — ACÁ ESTÁ LA TRAMPA:** el COGS **es conversacional y lineal**. ~100 conversaciones
  off-hours/mes × US$0.15-0.30 = **US$15-30/cliente/mes** en tokens; WhatsApp casi gratis si el cliente
  inicia (ventana 24h). [2] A US$200/mes → **margen ~80-85%**. PERO si el negocio es de alto volumen (200-400
  conversaciones), el COGS trepa a US$60-120 y un precio flat se come el margen. **Regla de diseño:
  precio flat con tope de conversaciones + excedente por uso.** Para **US$5.000/mes**: **~25 clientes** a $200.
  Ciclo de venta **corto** (dolor obvio, demo inmediata, ticket medio).
- **Tiempo al primer peso:** **2-3 semanas** — es el de caja más temprana por reúso de stack.
- **Riesgos:** (1) trampa de margen por COGS variable (mitigable con pricing por uso desde el día 1);
  (2) dependencia de WhatsApp/Meta (política de plantillas, baneos) — riesgo de plataforma real;
  (3) comoditización media: el AI receptionist se está volviendo commodity global, el moat es el nicho
  local + la relación.
- **Veredicto: 7,5/10.** Mejor time-to-cash de la lista y demanda ultra-validada, pero el margen NO es
  gratis: hay que modelar por uso o el token se lo come. Dependencia de Meta le baja medio punto.

---

## 3. Testigo — parte de trabajo pro desde foto+audio del operario (obra/servicio de campo)

- **Qué es / operación viva:** el operario en obra manda fotos + nota de voz; el agente arma el **parte con
  foto antes/después, checklist y firma** y lo despacha al cliente final y al contratista. Mantener:
  plantillas por rubro (construcción, jardinería, fumigación, service, plomería) + soporte de onboarding.
- **Cómo se construye con Claude Code:** ingesta WhatsApp (foto + voz) → STT + Sonnet arma el parte
  estructurado → PDF/entregable. **MVP en 3-4 semanas** (la parte fina es la plantilla por rubro, no la tech).
- **Cómo se cobra + números reales:** B1 propone sub por operario US$15-30. Benchmark de field service
  management: **Jobber desde US$39/mes, Housecall Pro Basic US$49 / Essentials US$129 / MAX ~US$249**, con
  **usuario extra US$29-35/mes**; rango real **US$30-150 por técnico/mes**. [6] → US$15-30/operario **está
  por debajo** del mercado FSM, lo cual es bueno para entrar, pero ojo: no competimos con el FSM completo,
  vendemos **solo el "convierte el caos de WhatsApp en un parte cobrable"** — un recorte más barato y más
  fácil de adoptar que un FSM entero.
- **Mercado / demanda / competencia:** los FSM grandes (Jobber, Housecall, ServiceTitan) existen y facturan,
  pero son **plataformas completas que el contratista chico no adopta** (fricción, precio, curva). El hueco es
  el pyme de cuadrilla que hoy usa el grupo de WhatsApp "mal": no quiere un ERP, quiere que su parte se vea
  profesional para **cobrar más caro**. Poca competencia en ese recorte "voz→parte".
- **Unit economics:** COGS por operario: ~110 partes/mes × (STT US$0.006 + Sonnet US$0.01) ≈ **US$2/operario/mes**.
  Margen **~90%**. Un contratista con 5 operarios = US$75-150/mes. Para **US$5.000/mes**: **~35-50 cuadrillas
  chicas** (o menos si son medianas). **Muy sticky**: una vez que el parte es su estándar de entrega al
  cliente, cambiar duele. Ciclo de venta **medio** (hay que evangelizar y onboardear por rubro).
- **Tiempo al primer peso:** 4-6 semanas (necesita 1 rubro pulido + 1 contratista faro).
- **Riesgos:** onboarding alto-touch al inicio (mitiga: arrancar con UN rubro); adopción del operario
  (resistencia a cambiar el "mando la foto y listo" — pero justamente el input es igual de simple); COGS de
  IA bajo, sin trampa.
- **Veredicto: 7/10.** Vertical desatendido, COGS despreciable, altísima retención una vez adentro. Le baja
  puntos el ciclo de venta más largo (evangelización) y que escala por rubro, no horizontal. Buen segundo
  motor recurrente, no el de caja más rápida.

---

## 4. Mercader — gestor de MercadoLibre done-for-you (títulos, preguntas, precio, stock)

- **Qué es / operación viva:** tomar la cuenta de ML del vendedor; el agente optimiza títulos, **responde las
  ~40 preguntas diarias**, ajusta precio frente a competencia y avisa quiebres de stock. Mantener: supervisión
  de pricing (humano) + posventa delicada.
- **Cómo se construye con Claude Code:** integración con la **API de MercadoLibre** (preguntas, ítems,
  pricing) + agente Sonnet + reglas de pricing. **MVP en 4-6 semanas** — la fricción es la API de ML y su
  aprobación, no la IA.
- **Cómo se cobra + números reales:** B1 propone US$150-350/mes + % sobre incremento vs baseline. Contexto
  del valor en juego: ML cobra al vendedor **11,8-17,14% de comisión por venta** + cargo fijo por unidad
  (subió hasta 9,5% en ago-2025), con **tarifas diferenciadas por provincia** desde jul-2025. [7] → el
  vendedor ya vive optimizando centavos; un servicio que le suba conversión/ranking tiene ROI directo y el
  **cobro por lift comparte riesgo** (cierre más fácil).
- **Mercado / demanda / competencia:** ML es **donde está la plata y la fricción** en AR/LatAm. Existen
  agencias "full commerce" y consultores certificados (ej. Algoritmo Digital [7]), o sea el mercado está
  probado — pero el ángulo "**community manager de ML operado por IA**" (responder 40 preguntas/día sin
  humano) está poco explotado. Nativo para billing Mercado Pago.
- **Unit economics:** COGS IA bajo: 40 preguntas/día × 22 = 880 respuestas/mes × US$0.005 = **~US$4,4/cliente/mes**.
  PERO el **COGS real es humano**: la supervisión de pricing y la posventa delicada **no se automatizan del
  todo** → hay costo de tiempo del estudio que hay que tapar con el precio. Margen "IA" ~95%, margen "real"
  con labor ~60-70% hasta que se estandarice. Para **US$5.000/mes**: **~20 clientes** a $250 (+ upside del %).
  Ciclo de venta **medio** (el vendedor de ML es desconfiado con dar acceso a su cuenta).
- **Tiempo al primer peso:** 6-8 semanas (API + confianza para ceder la cuenta).
- **Riesgos:** **dependencia de plataforma = el riesgo dominante.** ML puede cambiar términos de API, limitar
  automatización de respuestas o competir con su propia IA → riesgo existencial de canal único. La atribución
  del "lift vs baseline" es discutible y puede generar fricción de cobro. COGS de IA no es problema; el
  problema es labor + plataforma.
- **Veredicto: 6,5/10.** Mercado con plata real y billing nativo AR, cierre facilitado por cobro por
  resultado, pero **atado a una sola plataforma que puede moverte el piso** y con un componente humano que
  achica el margen. Alto potencial de facturación por cliente, riesgo de concentración alto.

---

## 5. Confesionario — voz-del-cliente as-a-service (2 preguntas conversadas post-compra → insight)

- **Qué es / operación viva:** después de cada compra, el agente **llama o escribe** y hace 2 preguntas
  conversadas; agrega todo en un tablero "qué aman / qué odian / qué piden" con citas textuales y alerta al
  dueño de problemas recurrentes. Mantener: diseño de preguntas por rubro + **lectura mensual del insight por
  un humano del estudio** (parte del valor alto-touch).
- **Cómo se construye con Claude Code:** por WhatsApp es liviano (texto). Por **voz** es más pesado (infra STT
  + TTS + LLM en tiempo real). **MVP en 3-4 semanas** en versión texto; +2-3 semanas si se agrega voz.
- **Cómo se cobra + números reales:** B1 propone US$120-280/mes (incluye lectura humana del insight). Es un
  servicio de research productizado; el ancla de valor es que hoy **solo las grandes tienen equipos de VoC**.
- **Mercado / demanda / competencia:** la evidencia 2025-2026 es fuerte: las encuestas conversadas por IA
  logran **3-5× más respuesta** (completion 40-70% en charlas cortas vs 6-15% de encuestas por email), y la
  gente dice **~5× más** hablando que tipeando. [9] Las tradicionales caen 1-2 puntos/año desde 2019. [9] Hay
  players emergentes (Perspective AI, TheySaid, Retell) pero **en inglés y enterprise** → hueco pyme hispano.
- **Unit economics — OJO CON LA VOZ:** en **texto** el COGS es despreciable (~US$0.01/encuesta). En **voz**,
  una llamada de 2 preguntas ≈ 2 min × US$0.07-0.15 = **US$0.20-0.40/llamada**; 200 clientes/mes = **US$40-80/cliente/mes**
  solo de voz, **+ labor** de la lectura mensual del insight. Margen en modo voz **~55-70%**; en modo texto
  ~90%. Para **US$5.000/mes**: **~25 clientes** a $200, pero **más alto-touch** que Kudos/Fantasma (el insight
  humano no escala infinito). Ciclo de venta **medio** (hay que educar sobre por qué vale medir la voz del
  cliente).
- **Tiempo al primer peso:** 4-6 semanas (arrancar en texto para validar, sumar voz solo si el cliente lo paga).
- **Riesgos:** la voz **rompe el margen** si se vende flat → ofrecer voz como add-on por uso, default texto;
  el componente humano (lectura del insight) limita la escala; hay que demostrar accionabilidad o se percibe
  como "otra encuesta". Comoditización media (los VoC tools llegarán al español).
- **Veredicto: 6/10.** La idea más "novedosa con evidencia dura a favor" (los números de response rate son
  reales y jugosos), pero la voz encarece el COGS un orden de magnitud y el insight humano limita escala.
  Fuerte como **producto diferenciador/premium** dentro de un bundle, flojo como motor de volumen barato.

---

## Descartadas de la lista de B1 (y por qué)

- **Locución (voz clonada de marca):** branding sonoro es novedoso pero es **novelty de baja recurrencia** —
  el cliente paga el setup una vez y percibe poco valor en un retainer mensual de "más audios". Willingness-to-pay
  recurrente débil, TAM chico, y el clonado de voz se está comoditizando (ElevenLabs et al. lo dan casi gratis).
  Lindo add-on, mal negocio principal.
- **Autopsia (auditoría "por qué perdiste la venta"):** se **solapa** con Kudos + Mercader + Fantasma (mismos
  datos, mismos clientes) sin ser mejor en nada; el cobro por "venta recuperada" tiene **atribución
  disputadísima** (¿la recuperó tu WhatsApp o la hubiera cerrado igual?) → fricción de cobro crónica.
  Mejor absorber sus features dentro de otro producto que venderla suelta.
- **Cazatalentos (reclutamiento por IA):** **ciclo de venta largo**, resultado no garantizado, y
  **riesgo legal/reputacional** alto (sesgo en filtrado de CVs, entrevista automatizada = terreno regulatorio
  espinoso). Alto-touch, difícil de estandarizar por puesto. No encaja para un estudio chico sin equipo de RRHH.
- **Efímero (campañas relámpago con pauta):** requiere **integración pesada con APIs de ads** (Meta/Google) y,
  peor, **manejar el ad-spend del cliente** = responsabilidad fiduciaria + reconciliación + riesgo de quemar
  presupuesto ajeno. El COGS de ads no es tuyo pero la culpa sí. Demasiada superficie operativa para el margen.
- **Sucursal (presencia digital llave en mano):** **ticket bajo (US$60-120)** con **alto churn** (el negocio
  que "no tiene nada online" es el que menos entiende el valor y el primero que corta) y **fuerte
  comoditización** (Canva/Meta/Google Business dan gran parte gratis). El bundle suena lindo pero el LTV no
  paga el CAC ni la operación viva de curar todo.
- **Boletín (newsletter white-label B2B):** willingness-to-pay real pero **carga de QA factual alta**
  (si publicás un dato mal con la marca del cliente, es su reputación) y **venta B2B lenta** (convencer a una
  empresa de que sponsoree un boletín). Margen editorial bueno, pero cierre lento y riesgo de error caro.
  Posible línea secundaria, no punta de lanza.
- **Doble (gemelo digital del experto):** ticket alto atractivo (setup US$500-1.500), PERO **se está
  comoditizando rápido**: Delphi, Coachvox, Personify y Chatbase ya ofrecen "cloná tu conocimiento" desde
  **US$19-29/mes** (con builds done-for-you premium hasta US$25k para los que pueden pagarlo). [10] Un estudio
  chico revendiendo esto compite contra plataformas horizontales baratas + suma **riesgo de responsabilidad
  profesional** (un gemelo de nutricionista/abogado/contador que aconseja mal = pasivo serio). El moat de
  confianza existe pero la comoditización del stack subyacente le come el margen y el ticket recurrente.
  Reevaluable si se enfoca en UN vertical de altísima responsabilidad con guardarraíles como diferencial.

---

## Ranking final

| # | Idea | Score | COGS IA | Ciclo venta | Time-to-cash | Margen |
|---|------|-------|---------|-------------|--------------|--------|
| 1 | **Kudos** | **8** | Despreciable (texto) | Corto | 3-5 sem | ~90-95% |
| 2 | **Fantasma** | 7,5 | Medio (conversacional, ¡modelar por uso!) | Corto | 2-3 sem | ~80-85% |
| 3 | **Testigo** | 7 | Despreciable | Medio | 4-6 sem | ~90% |
| 4 | **Mercader** | 6,5 | Bajo (pero labor humana + riesgo plataforma) | Medio | 6-8 sem | 60-70% real |
| 5 | **Confesionario** | 6 | Alto si voz / bajo si texto | Medio | 4-6 sem | 55-90% |

**Recomendación de cartera:** **Kudos** como motor de margen y moat acumulativo (núcleo), **Fantasma** como
caja temprana (reúsa stack, cierra rápido) — arrancar por estos dos en paralelo comparte el stack
WhatsApp+IA+MP. **Testigo** como tercer motor vertical sticky a 60-90 días. **Mercader** y **Confesionario**
solo con pricing por uso/lift bien blindado desde el diseño.

---

## Fuentes

1. Claude Platform Docs — Pricing (Sonnet $3/$15 MTok, caching 0.1×, batch 50%): https://platform.claude.com/docs/en/about-claude/pricing · Finout, Anthropic API Pricing 2026: https://www.finout.io/blog/anthropic-api-pricing
2. Meta for Developers — Pricing on the WhatsApp Business Platform (per-message desde 1-jul-2025; utility gratis en ventana 24h): https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing · Gallabox, WhatsApp Business Pricing Changes 1 July 2025: https://gallabox.com/whatsapp-business-pricing-July-2025-update · Uptail, WhatsApp Business API Pricing 2026: https://www.uptail.ai/blog/whatsapp-business-api-pricing-2026-what-it-costs-and-how-billing-works
3. Birdeye — Pricing & Plans (Starter $299 / Growth $399 / Dominate $449 por local/mes): https://birdeye.com/pricing/ · SocialPilot, Birdeye Pricing Breakdown: https://www.socialpilot.co/reviews/blogs/birdeye-pricing · Podium vs Birdeye 2026: https://www.socialpilot.co/reviews/comparison/birdeye-vs-podium
4. Mordor Intelligence — Online Reputation Management Market ($6,88B 2025 → $14,01B 2031, 12,59% CAGR): https://www.mordorintelligence.com/industry-reports/online-reputation-management-market · MarkNtel Advisors ($12,57B 2030, 12,8% CAGR): https://www.marknteladvisors.com/research-library/online-reputation-management-market.html
5. Upfirst — Average Cost of an AI Receptionist for Small Businesses: https://upfirst.ai/blog/average-cost-of-implementing-an-ai-receptionist-service-for-a-small-business · AgentZap — AI Receptionist Pricing 2026 ($25-899/mo): https://agentzap.ai/blog/ai-receptionist-pricing-complete-cost-guide-2025 · Smith.ai Pricing: https://smith.ai/pricing/receptionists · Ringly, AI virtual receptionist cost 2025: https://www.ringly.io/blog/how-much-does-an-ai-virtual-receptionist-cost-in-2025
6. Housecall Pro vs Jobber vs ServiceTitan (Basic $49 / Essentials $129 / MAX ~$249; Jobber desde $39; usuario extra $29-35): https://fieldservicesoftware.io/housecall-pro-vs-jobber-vs-servicetitan/ · Fieldproxy, Field Service Software Pricing Comparison 2026: https://www.fieldproxy.ai/resources/blog/field-service-software-pricing-comparison-2026-what-6-platforms-actual
7. Wivo Analytics — Comisiones MercadoLibre 2026 (13-20%): https://www.wivoanalytics.com/blog/cuanto-cobra-mercado-libre-por-venta-en-2025-guia-completa-de-comisiones-envios-y-mas/ · Algoritmo Digital — Comisión ML AR: https://algoritmodigital.com.ar/cuanto-es-la-comision-de-mercado-libre-por-vender/ · Nubimetrics — Cambios de costos ML AR 2025: https://academia.nubimetrics.com/cambios-mercado-libre-argentina
8. NADIA — Encuesta nacional adopción IA en pymes argentinas (41,6%): https://nadia.ar/investigacion/encuesta-pymes.html · Perfil — 4 de cada 10 pymes AR ya usan IA: https://www.perfil.com/noticias/economia/cuatro-de-cada-diez-pymes-argentinas-ya-usan-ia-pero-pocas-miden-su-impacto-a40.phtml · Ámbito — adopción IA pymes: https://www.ambito.com/negocios/se-acelera-la-adopcion-ia-las-pymes-aunque-el-grueso-se-concentra-herramientas-basicas-n6277298
9. Perspective AI — 2026 Customer Interview Benchmark (completion 40-70% vs 6-15% email): https://getperspective.ai/blog/2026-customer-interview-benchmark-report-response-rates-depth-time-to-insight · TheySaid — AI Voice Surveys (3× response, 5× más contenido): https://www.theysaid.io/blog/ai-voice-surveys · Retell AI — AI Voice Agents for Real-Time Survey Feedback: https://www.retellai.com/blog/utilizing-ai-voice-agents-for-real-time-survey-feedback
10. David Riha — Best AI Coaching Platforms 2026 (Delphi/Coachvox/Personify, $19-29/mo, DFY hasta $25k): https://davidriha.com/blog/best-ai-coaching-platform-tools-comparison/ · Personify — AI Coaching Clone: https://personify.fyi/best-ai-coaching-platforms-for-business-training/
