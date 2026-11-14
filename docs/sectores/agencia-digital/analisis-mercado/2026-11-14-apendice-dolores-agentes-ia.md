# Apéndice de datos crudos: dolores con agentes de IA (14/11/2026)

Relevado por tres lectores. Reddit no se pudo leer directo (403); lo que hay de Reddit viene de extractos de buscadores. Cada hallazgo dice si se leyó entero o sólo el extracto. Ver el desafío en la sección 14 del análisis principal antes de citar conteos.

---

<!-- archivo: colegas -->
# Colegas que venden/implementan agentes IA y automatizaciones para PyMEs — dolores con fuente
Relevado 14/11/2026. 16 búsquedas + 13 lecturas intentadas.

## Notas de método (leer primero)
- Reddit directo: WebFetch a reddit.com -> "unable to fetch" (bloqueo confirmado). No se usaron espejos.
- El buscador devolvió espejos de Reddit (redlib.ssps.io, libreddit.winscloud.net, red.chatoyer.de, r.enesgenc.dev).
  NO se abrieron: son front-ends proxy de Reddit y el brief prohíbe esquivar el bloqueo. Sólo se usa su extracto del buscador.
- El filtro `site:reddit.com` casi no funcionó: la mayoría de los resultados son blogs de vendedores (ciela.ai, trillet.ai,
  vendasta, stork.ai, whapi, wati). Están marcados "VENDEDOR" (interés comercial).
- "LEÍDO" = página abierta con WebFetch (resumida por modelo intermedio; citas textuales salen de esa lectura).
  "EXTRACTO" = sólo lo que devolvió el buscador; cita [A VALIDAR].
- Subreddits en español (r/devsarg, r/argentina, r/emprendedores, etc.): la búsqueda no devolvió NINGÚN hilo.
- Hacker News (API Algolia, comentarios desde 01/01/2025, "AI automation agency clients"): 1 sólo comentario relevante y tangencial.

## Hallazgos

### A. Integraciones que se rompen / mantenimiento / monitoreo
1. Tom_Artist, foro Latenode, 21/06/2025 — LEÍDO.
   "what happens six months later when their CRM updates its API or a third-party service changes its authentication method?"
   "they quickly realize that keeping automations running smoothly requires constant attention."
   https://community.latenode.com/t/why-selling-n8n-automation-services-is-challenging-for-freelancers/22417
2. Indie Hackers, "lost a $2,500/month client in my AI automation agency in the worst way possible" — EXTRACTO (página dio 403).
   Según extracto: agencia con 10+ clientes en n8n, Make y Zapier, "things slipped through the cracks". Autor/fecha [A VALIDAR].
   https://www.indiehackers.com/post/lost-a-2-500-month-client-in-my-ai-automation-agency-in-the-worst-way-possible-T1lcOPJFmIvuMLkkSbmT
3. n8nguide (blog) — EXTRACTO: actualizaciones de n8n rompen flujos sin aviso (cambio de firma de webhook, release feb-2026). [A VALIDAR]
   https://n8nguide-com.pages.dev/blog/is-passive-income-killing-your-n8n-business
4. Comentario en r/AI_Agents "AI agents truth no one talks about" (hilo de u/soul_eater0001, 20/04/2025) — EXTRACTO vía espejo:
   el trabajo "lies in ... monitoring these agents to make sure they are performing as expected". [A VALIDAR]
   Hilo original: https://www.reddit.com/r/AI_Agents/comments/1k3t3ga/ai_agents_truth_no_one_talks_about/
5. Foro comunidad n8n — EXTRACTO: monitoreo, credenciales, alertas de falla y mantenimiento son valiosos pero el cliente
   los ignora "until something breaks". https://community.n8n.io/t/how-do-you-deliver-n8n-workflows-to-clients/244631 [A VALIDAR]
6. Skool (AI Automation Society) — EXTRACTO: cliente pagaba "$12k/month to an agency for ongoing maintenance", flujo "hadn't been
   touched in 11 months"; otro lo tomó por $600/mes. Anécdota de parte interesada. [A VALIDAR]
   https://chat.skool.com/ai-automation-society/found-a-client-paying-12kmonth-to-an-agency-for-ongoing-maintenance-the-workflow-hadnt-been-touched-in-11-months-took-over-for-600month

### B. El cliente no adopta / no sabe qué quiere / no hay dueño interno / hay que educar
7. Fundador anónimo de agencia, r/AI_Agents, 26/05/2026, "I've built 50+ AI automations for clients, here's why most fail" —
   LEÍDO vía agregador BitTide (no el hilo). "building AI on top of broken processes"; hacia el día 30 "they stopped trusting the
   system" y volvieron a lo manual; "nobody on the client side actually owns the automation after handoff". Exigir un dueño interno
   bajó el churn "roughly 60%". Pedidos amplios de "AI agent that does X" se iban al mes cuatro; lead routing y triage de facturas retenían mejor.
   Agregador: https://bittide.aicompass.dev/article/b2614d1f-a2e2-4f8a-a650-849da034e1ae
   Original: https://www.reddit.com/r/AI_Agents/comments/1to1uoo/ive_built_50_ai_automations_for_clients_heres_why/
8. Comentario en hilo r/AI_Agents 20/04/2025 — EXTRACTO: "90% of my time is spent educating small businesses on AI as a whole ...
   while the 10% is spent building it". [A VALIDAR]
9. aiweekly.co (resumen de post de practicante, sin fecha) — EXTRACTO (403 al abrir): los negocios no quieren "agentes" sino procesos
   confiables, predecibles, auditables; "multiple builders noting they now pitch 'automation with AI capabilities' rather than 'agents'
   to avoid expectation mismatches". https://aiweekly.co/node/2316 [A VALIDAR]
10. Cristóbal Álvarez, INSIGHT Digital (Substack, español, país no indicado), 20/05/2025 — LEÍDO.
    "millones de emprendedores saltan al tren de la IA sin preguntarse para qué"; "Cada nueva automatización implica tiempo de
    configuración, suscripción, pruebas y bugs"; caso: "Los leads entran, el bot contesta, pero nadie compra";
    "un contacto no contestado queda atrapado en el 'follow-up infinito' sin que nadie lo detecte".
    https://insightdigital.substack.com/p/automatizar-no-es-escalar-el-error
11. angelinvestorsnetwork.com — EXTRACTO: filtrar compradores "who want magic without internal ownership"; el problema de las agencias
    es de margen, no de entrega. [A VALIDAR]
    https://angelinvestorsnetwork.com/startups/most-ai-automation-agencies-dont-have-a-delivery-problem-they-have-a-margin-prob
12. ciela.ai (VENDEDOR, coaching), 02/07/2026 — EXTRACTO: revisando hilos de Reddit fallidos, "the builder never solved the belief problem".
    https://ciela.ai/blogs/can-you-make-money-with-ai-agents-reddit [A VALIDAR]
13. lobsterpack.com, Linas Valiukas, 13/04/2026 — LEÍDO: "Nobody cared that we used OpenClaw or Claude." (el cliente compra el problema
    resuelto, no la herramienta). Según extracto del buscador, otro constructor cita que los dueños no confían en una IA hablando con sus
    clientes (no confirmado en la lectura). https://www.lobsterpack.com/blog/what-small-business-owners-want-from-ai/

### C. Bajas tempranas / no renuevan
14. #7 (r/AI_Agents 26/05/2026): bajas hacia el mes cuatro en proyectos de "agente" amplio. LEÍDO vía agregador.
15. stork.ai (blog, español traducido) — EXTRACTO: "los clientes desaparecen después de un mes, la rotación aumenta, y tu trabajo se agrupa
    con VAs de $15/hora". https://www.stork.ai/blog/es/ai-agencies-are-dead-this-is-next [A VALIDAR]
16. ciela.ai (VENDEDOR), 17/06/2026 — EXTRACTO: ~70 % del churn en los primeros 90 días; causas onboarding y falta de resultado visible.
    https://ciela.ai/blogs/why-ai-automation-clients-churn-and-how-to-keep-them [A VALIDAR, cifra de vendedor]
17. #2 Indie Hackers (cliente de US$2.500/mes perdido). EXTRACTO.

### D. Difícil mostrar resultado / justificar el abono
18. trillet.ai (VENDEDOR voz IA) — EXTRACTO: "Clients don't cancel voice AI because the technology fails. They cancel because they can't
    see that it works." https://trillet.ai/blogs/client-facing-roi-dashboard-what-metrics-to-show [A VALIDAR]
19. #10 INSIGHT Digital: el bot responde pero no hay ventas. LEÍDO.
20. #6 Skool: el cliente no sabe qué paga en el mantenimiento mensual. EXTRACTO.
21. Coderhouse (Argentina, educativo) — EXTRACTO: "'Hago automatizaciones con n8n' no significa nada para quien tiene que aprobar el gasto".
    https://www.coderhouse.com/en/coderlibrary/ia-como-servicio-cobrar-automatizaciones-agentes-primeros-clientes [A VALIDAR]

### E. Competencia de precio / commoditización / plataformas que lo dan incluido
22. Bob_Clever, foro Latenode, 09/06/2025 — LEÍDO. "n8n was designed to be user-friendly ... the demand for paid services is naturally
    limited"; "Small businesses often can't justify the cost, while larger companies already have internal teams";
    "many providers from developing countries offering similar work at very low rates." (URL #1)
    Respuesta sofiag, 21/06/2025: "Rather than competing on price with overseas providers, I focus on local businesses".
23. stork.ai — EXTRACTO: "cualquiera puede crear un scraper de Reddit a Google Sheets en minutos" (los planos son mercancía). [A VALIDAR]
24. growwstacks (blog) — EXTRACTO: OpenAI Agent Builder "democratizes AI automation by removing the coding barrier".
    https://growwstacks.com/blog/build-ai-agent-openai-agent-builder/ [A VALIDAR]
25. El Cronista (Infotechnology), 18/05/2026, sin autor — LEÍDO. Meta lanzó Business AI, agentes "embebidos en la Business App" de
    WhatsApp Business, entrenables con FAQ, conversaciones, catálogo o web; deriva a humano "sin perder el hilo". Lanzado feb-2026;
    Argentina entre los primeros mercados junto a otros 16 de Latinoamérica. Precio de Business AI: no lo dice; la App es gratis.
    https://www.cronista.com/infotechnology/it-business/asi-funciona-la-novedad-de-whatsapp-que-usan-las-pymes-para-vender-mas-sin-sumar-personal/
    (Es hecho de mercado, no testimonio de colega.)
26. Cronista Colombia — EXTRACTO (título): asistente de IA para pymes latinas "cuesta solo 50 dólares". [A VALIDAR]
    https://www.cronista.com/colombia/finanzas-y-economia/el-asistente-de-ia-que-surgio-por-accidente-y-hoy-impulsa-a-pymes-latinas-cuesta-solo-50-dolares

### F. Costos variables (WhatsApp por mensaje, modelo IA) que se comen el margen
27. codewords.ai (blog, sin autor ni fecha; menciona cambio de Meta vigente 01/10/2026) — LEÍDO.
    "Meta charges per message and your client controls the volume."; "A fixed monthly fee against a variable cost you do not control is a bet.";
    "model spend grows with conversation length as well as count."; "A single monthly number covering all three is a margin that erodes silently."
    https://www.codewords.ai/blog/how-to-price-whatsapp-bot-agency-services
28. Panel argentino (fuente exacta no identificada en el resultado; probablemente developargentina.com o mercado.com.ar) — EXTRACTO:
    advirtió sobre "boletas inesperadas por consumo de modelos" y recomendó tope de gasto mensual a las APIs desde el día uno. [A VALIDAR]
29. Reseller en Reddit con cliente de 300k mensajes de servicio/mes que reaccionó fuerte al cambio de precios de Meta — EXTRACTO de resumen
    del buscador; URL no identificada. [A VALIDAR]
30. whapi.cloud / wati.io (VENDEDORES) — EXTRACTO: "rug pull" de precios 2026 y "two new fees" de Meta (incluido cargo por respuestas IA).
    No verificado en developers.facebook.com. [A VALIDAR]
    https://www.wati.io/en/blog/whatsapp-business-api-pricing-changes-2026-what-meta-s-two-new-fees-actually-cost-you/

### G. El agente se equivoca / inventa / responsabilidad
31. #7 r/AI_Agents 26/05/2026: agente de soporte que enrutaba mal tickets por el etiquetado del CRM. LEÍDO vía agregador.
32. Air Canada: tribunal responsabilizó a la empresa por política de reembolso inventada por su chatbot — EXTRACTO (dev.to, cxtoday).
    https://dev.to/adioof/an-ai-chatbot-invented-a-refund-policy-and-a-court-made-the-company-pay-2n2j [A VALIDAR fecha]
33. Cursor: bot de soporte inventó política; usuarios anunciaron bajas en Reddit — EXTRACTO (Fortune).
    https://fortune.com/article/customer-support-ai-cursor-went-rogue/ [A VALIDAR]
34. robylon.ai (VENDEDOR) — EXTRACTO: los proveedores de IA niegan responsabilidad en sus términos y la exposición queda en quien despliega.
    https://www.robylon.ai/blog/ai-customer-service-liability [A VALIDAR]
35. HN, luxpir, 11/08/2026 — LEÍDO (API Algolia): "LLMs still need correcting many times anyway, even if we feed a load of context".
    https://news.ycombinator.com/item?id=49253547 (tangencial: traducción, no agencia).

### Otros (no encajan)
- r/AI_Agents 31/03/2025 "I spoke to 100 companies hiring AI agents" — EXTRACTO: herramientas no-code/pre-armadas "didn't fit their
  individual use case"; compras empiezan por piloto gratis o alcance fijo; un comentarista: "I suspect 100 is hyperbole". [A VALIDAR]
- r/agency hilo burnout (espejo, sin fecha clara) — EXTRACTO: "most successful small agencies serve 8-12 clients max in a very specific niche". [A VALIDAR]

## No encontrado
- Ningún hilo de subreddits en español/LatAm (devsarg, argentina, emprendedores, mexico, chile, programacion).
- Testimonio de colega LatAm en primera persona sobre bajas o cobro de abono.
- Dificultad para COBRAR el abono (morosidad): ninguna fuente.
- Competencia de Tiendanube: ninguna fuente.
- Disputa agencia-cliente concreta por error del agente: ninguna.

---

<!-- archivo: clientes -->
# Qué problemas cuentan los clientes de agentes de IA / bots de WhatsApp (relevamiento 14/11/2026)

Método: 24 búsquedas web + 9 lecturas de página. Lectura: **ENTERA** = página abierta con WebFetch; **EXTRACTO** = sólo el fragmento que devolvió el buscador (no se abrió la página: 403 o no se intentó). Capterra, G2, Gartner y Jobber devolvieron 403 al abrirlas: sus datos son EXTRACTO.
Reddit: ninguna búsqueda `site:reddit.com` devolvió hilos de reddit.com (8 intentos, ES e EN). No se usó ningún espejo (redlib) para no esquivar el 403. Lo que "dice Reddit" abajo es siempre de segunda mano y va marcado [A VALIDAR].

## A. Reseñas de productos que se venden en la región

| # | Hecho / cita textual corta | Fuente | Fecha | Lectura |
|---|---|---|---|---|
| A1 | Wati: TrustScore 2,9/5 con 276 reseñas; 35 % de 1 estrella, 53 % de 5 estrellas | https://www.trustpilot.com/review/wati.io?stars=1&stars=2 | leído 14/11/2026 | ENTERA |
| A2 | Wati, 20 reseñas de 1-2★ (jun-nov 2026): 8 de soporte («It will take days to sort out issues, even if the issue is halting your business», 09/09/2026; «no call support»), 5 de cobro/cancelación («hidden charges», 04/11/2026; «extremely hard to cancel subscription», 15/09/2026; «automatic $950 charge», 10/08/2026), 3 de fallas («Lots of down time»), 2 de configuración («dashboard consistently fails to show a successful connection», 02/07/2026), 1 de bloqueo de número («our Meta Business was restricted and one of our telephone numbers was permanently blocked», 15/08/2026), 1 de la IA («The WATI AI support response is honestly pathetic», 29/09/2026), 1 de precio | misma URL | jun-nov 2026 | ENTERA |
| A3 | Wati página 7: «they claim to offer monthly billing, but in reality, force annual payments» (13/04/2025); «Non-existant support, many features are locked to the service support» (29/11/2025) | https://www.trustpilot.com/review/wati.io?page=7 | 2025 | ENTERA |
| A4 | Wati en G2: 4,6/5 (323 reseñas); un usuario: soporte «seriously lacking» y su equipo «kept getting banned» por las reglas de WhatsApp | https://g2.com/survey_responses/wati-review-4845483 | s/f [A VALIDAR] | EXTRACTO |
| A5 | Kommo en Capterra: 4,3/5; resumen de Capterra «Slow and ineffective support», 46 % negativo sobre 56 menciones; «expensive for small projects»; configuración de WhatsApp «confusing and time-consuming»; «some bugs with the WhatsApp API» | https://www.capterra.com/p/120048/Kommo/reviews/ | página 2026 | EXTRACTO (403) |
| A6 | Kommo: precio anunciado US$15/usuario/mes, pero el costo real sube con las tarifas de conversación de Meta (fuente es un competidor) | https://prospeo.io/s/kommo-pricing-reviews-pros-and-cons | 2026 | EXTRACTO |
| A7 | Cliengo en Capterra: 4,3/5 con 13 reseñas; atención al cliente 3,8 (la nota más baja) vs facilidad de uso 4,6; «support team takes too long to respond»; curva de aprendizaje; le falta seguir cotizaciones/ventas | https://www.capterra.com/p/158756/Cliengo/reviews/ · https://www.capterra.co.uk/software/158756/cliengo | 2026 | EXTRACTO (403) |
| A8 | Botmaker en G2: ~4,5/5 (~288 reseñas). Contras: verificar el nombre del bot de WhatsApp lleva mucho tiempo; «creation of service flows is confusing»; «many bugs and slow support» (Enterprise); «lots of limitations» (pequeña empresa); falta integración con Zendesk. Pros: integración nativa con la API de WhatsApp; interfaz «very similar to the conventional WhatsApp» para los agentes | https://www.g2.com/products/botmaker/reviews | s/f | EXTRACTO (403) |
| A9 | Leadsales en Capterra (única reseña negativa hallada): «hay mensajes que no llegan pero en whats app si están, estoy perdiendo cotizaciones o pagos de clientes… En le chat de soporte di varios ejemplos y no contestan» | https://www.capterra.com/p/215729/Leadsales-CRM/reviews/ | s/f [A VALIDAR] | EXTRACTO (403) |
| A10 | Vambe y Leadsales: Comparasoftware «No se han publicado reseñas todavía» | https://www.comparasoftware.com/vambe · https://www.comparasoftware.com/leadsales | 2026 | EXTRACTO |
| A11 | Darwin AI: en G2 sólo apareció una reseña positiva; no se hallaron reseñas negativas independientes | https://www.g2.com/products/darwinai/reviews | s/f | EXTRACTO |
| A12 | Chat Nube (Tiendanube): no se hallaron reseñas independientes de comerciantes; sólo material de la empresa y prensa | https://www.tiendanube.com/blog/chat-nube/ | 2025-2026 | EXTRACTO |
| A13 | Meta Business AI: no se hallaron quejas documentadas de comercios. Cliengo (socio de Meta) lista como limitaciones respuestas incorrectas (alucinaciones) y dependencia de lo que carga el negocio; según eesel, las correcciones sólo afectan respuestas futuras y Meta vuelve a cobrar respuestas de servicio desde el 01/10/2026 [A VALIDAR en doc de Meta] | https://guiawabusiness.cliengo.com/business-ai · https://www.eesel.ai/es/blog/meta-muse-para-control-de-calidad-de-soporte | 2026 | EXTRACTO |

## B. Reddit y foros de dueños/consumidores

| # | Hecho / cita | Fuente | Fecha | Lectura |
|---|---|---|---|---|
| B1 | Reddit directo: 0 hilos recuperados en 8 búsquedas (r/argentina, devsarg, emprendedores, smallbusiness, WhatsappBusinessAPI) | — | 14/11/2026 | — |
| B2 | Según una guía que resume hilos de Reddit, la queja más común no es que suene robótico sino desplegarlo «with no clear path to a human» [A VALIDAR: segunda mano, vendedor] | https://www.layer3labs.io/guides/ai-for-small-business-reddit-questions-answered | 2026 | EXTRACTO |
| B3 | r/WhatsappBusinessAPI (vía blog de proveedor): número de un cliente bloqueado tras el alta porque a Meta no le gustó su página de Instagram; en r/whatsapp, bloqueos tras envíos masivos sin consentimiento [A VALIDAR] | https://chakrahq.com/article/whatsapp-banned-business-app-bulk-msessaging-solution-chakra-chat/ | 2026 | EXTRACTO |
| B4 | Clientes comparten en Reddit trucos para romper el bucle del bot repitiendo «speak to a human» (citado por revista académica) | https://cmr.berkeley.edu/2026/04/chatbot-frustration-is-real-hidden-costs-and-best-practices/ | 28/04/2026 | ENTERA |
| B5 | Foro de dueños de servicios (Jobber): un dueño lo apagó y «built my own automations instead» porque a la gente no le gustó la IA; un contratista: «a lot of us are turned off by that» | https://community.getjobber.com/discussions/operations-forum/customers-still-want-to-feel-heard-%E2%80%94-not-processed-/9269 | s/f | EXTRACTO (403) |
| B6 | Foro de consumidores (España): «Harto de la IA en atención al cliente… No puedes hablar con nadie» | https://bandaancha.eu/foros/harto-ia-atencion-cliente-muchas-1760489 | s/f | EXTRACTO |
| B7 | Caso de restaurante automatizado: al principio el bot escalaba muy poco (molestaba al personal), luego demasiado; reservas duplicadas porque el sistema interno no se actualizaba en tiempo real | https://wilmerhurtado.com/blog/como-automatice-las-respuestas-de-whatsapp-business-de-un-restaurante-con-ia | s/f | EXTRACTO |
| B8 | Columna en Ámbito (autor es fundador de un bot, sin datos): «A nadie le gusta escribir a una empresa por WhatsApp y que demoren hasta un par de días»; los clientes «prefieren que otra persona responda» | https://www.ambito.com/negocios/las-personas-ya-no-quieren-hablar-bots-sino-personas-o-lo-mas-parecido-ellas-n6185279 | 01/09/2025 | ENTERA |

## C. Encuestas e informes con muestra

| # | Hecho | Fuente | Fecha | Lectura |
|---|---|---|---|---|
| C1 | Argentina, nadIA (CEPE Di Tella + Fundar, con Observatorio PyME y BID): 402 pymes de 10-249 ocupados (industria y software), nov-dic 2025. 41,6 % usa IA (36,4 % sin software). Barreras: falta de experiencia/conocimiento 46,2 %; falta de personal calificado 42,2 %; desconocimiento 39,2 %; «no es útil para el negocio» 33,4 %; costos altos 29,2 %; dudas de rentabilidad 27 %. 57,4 % no mide el impacto; sólo 23,6 % reporta resultados positivos medidos; 72,5 % sin política de IA; 91,2 % no redujo personal. Usos: generación de texto 77,9 %; áreas: marketing y ventas 54,7 %, administración 41,5 % | https://www.perfil.com/noticias/economia/cuatro-de-cada-diez-pymes-argentinas-ya-usan-ia-pero-pocas-miden-su-impacto-a40.phtml | 29/04/2026 | ENTERA |
| C2 | Gartner: 5.728 clientes, dic 2023: 64 % prefiere que las empresas no usen IA en atención; 53 % consideraría cambiarse de empresa; preocupaciones: difícil llegar a una persona 60 %, pérdida de empleos 46 %, respuestas incorrectas 42 %, seguridad de datos 34 %, sesgo 25 % | https://www.gartner.com/en/newsroom/press-releases/2024-07-09-gartner-survey-finds-64-percent-of-customers-would-prefer-that-companies-didnt-use-ai-for-customer-service | 09/07/2024 | EXTRACTO (403); cifras confirmadas por C3 que la cita |
| C3 | California Management Review (Ren y Zhang): 53-77 % de encuestados tuvo una experiencia frustrante con un chatbot; sólo 14 % de los problemas se resuelve del todo en autoservicio (Gartner, ago 2024); cinco causas: no entiende, sin derivación a humano («possibly the single biggest irritant»), no resuelve lo complejo, humanización falsa, falta de personalización. Es una revisión, no un estudio propio | https://cmr.berkeley.edu/2026/04/chatbot-frustration-is-real-hidden-costs-and-best-practices/ | 28/04/2026 | ENTERA |
| C4 | Forrester 2025 (citado por un proveedor): 54 % de quienes usaron un chatbot de IA reportó frustración; 38 % porque no entendió la pregunta [A VALIDAR en Forrester] | https://ecosire.com/es/blog/ai-chatbot-customer-service-implementation | 2025 | EXTRACTO |
| C5 | MIT NANDA «The GenAI Divide» (preliminar jul 2025): ~95 % de los pilotos de IA generativa sin impacto medible en resultados; causas: flujos frágiles, no retiene contexto, mal ajuste al trabajo diario. Muestra discutida (150 entrevistas/350 empleados/300 despliegues vs 52 organizaciones/153 líderes) | https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/ | 18/08/2025 | EXTRACTO |
| C6 | Encuesta IA Defontana 2025 (>1.000 empresas de Chile y Latam): 45 % usa IA, sólo 23 % se considera preparada para integrarla | https://www.emol.com/noticias/Economia/2025/10/23/1181305/empresas-uso-inteligencia-artificial.html | 23/10/2025 | EXTRACTO |
| C7 | México: 38,9 % de pymes frena la automatización por desconocimiento, por encima del costo [A VALIDAR: nota de prensa sin método] | https://ecosistemastartup.com/pymes-mexico-38-9-frena-automatizacion-por-desconocimiento/ | 2025-2026 | EXTRACTO |
| C8 | Argentina: 76 % de encuestados ya interactuó con un agente de IA (Infobip, proveedor; muestra no vista) | https://www.infobip.com/es/blog/agentes-de-ia-clientes-que-se-debaten-entre-rapidez-y-desconfianza | 2025-2026 | EXTRACTO |
| C9 | Latam: 56 % dice que su última interacción con un chat de IA resolvió el problema sin humano (estudio citado por Meio & Mensagem) [A VALIDAR] | https://www.meioemensagem.com.br/marketing/ia-no-atendimento | 2025-2026 | EXTRACTO |
| C10 | CEPAL / CAME / CACE: no se halló informe específico sobre bots o agentes con muestra en esta pasada | — | — | — |

## D. Casos públicos de daño o marcha atrás

| # | Hecho | Fuente | Fecha | Lectura |
|---|---|---|---|---|
| D1 | Moffatt v. Air Canada (2024 BCCRT 149, Canadá): el bot inventó que la tarifa por duelo se podía pedir después; la empresa alegó que el bot era «entidad jurídica independiente»; el tribunal: «la demandada no tuvo un cuidado razonable para garantizar que su chatbot fuera preciso»; condena CAD 812,02 | https://www.diariojudicial.com/news-97209-el-error-de-mi-bot-es-mi-error | 29/02/2024 | ENTERA |
| D2 | Klarna (mayo 2025): el CEO admite que la atención con IA dio «lower quality» y vuelve a contratar humanos para que el cliente siempre pueda hablar con una persona; antes decía que la IA hacía el trabajo de 700 agentes | https://www.entrepreneur.com/business-news/klarna-ceo-reverses-course-by-hiring-more-humans-not-ai/491396 | 05/2025 | EXTRACTO |
| D3 | Alemania (Hamm, 2026): un bot afirmó falsamente especialidades de médicos; tras intimación de asociación de consumidores, el tribunal falló contra la clínica [A VALIDAR: sólo vía comentario argentino] | https://ecosistemastartup.com/responsabilidad-legal-ia-quien-responde-cuando-un-chatbot-recomienda-mal/ | 2026 | EXTRACTO |
| D4 | Argentina: análisis jurídicos sostienen que por la Ley 24.240 (art. 4, información veraz; publicidad engañosa) lo que dice el bot obliga a la empresa. No se halló ningún fallo ni multa argentina/latam sobre un chatbot | https://www.esderecho.com.ar/responsabilidad-empresa-chatbot-ia-publicidad-enganosa/ · https://www.derechoenzapatillas.com/2024/chatbots-y-derecho-del-consumidor-es-vinculante-lo-que-digan/ | 2024-2026 | EXTRACTO |
| D5 | Meta: desde el 15/01/2026 la API de WhatsApp Business prohíbe asistentes de IA de propósito general; sigue permitida la IA para atención, reservas, pedidos. Meta conserva discreción para definir qué es «propósito general» | https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/ | 18/10/2025 | EXTRACTO |

## E. Lo que sí funciona según clientes (evidencia débil)

- Interfaz tipo WhatsApp para los agentes humanos y conexión nativa a la API (Botmaker G2, A8).
- Responder fuera de horario y preguntas frecuentes; lo complejo al equipo humano (Tiendanube, A12; CMR, C3).
- Reservas simples sí; modificar pedidos o ingredientes no (cita de restaurante, B2/Layer3 [A VALIDAR]).
- Recordatorios de turnos: proveedores dicen ausentismo de 30 % a 8-12 % (Cliengo https://guiawabusiness.cliengo.com/recordatorios-turnos-whatsapp) y cobranza +60-80 % (Aurora https://www.aurorainbox.com/?p=36713). Sólo cifras de vendedores, sin método.
- Argentina: las pymes que usan IA la aplican sobre todo a marketing/ventas (54,7 %) y administración (41,5 %); beneficios medidos: productividad 16,8 %, ahorro 10,4 %, satisfacción de clientes 9,3 % (C1).
- 56 % de latinoamericanos dice que su último chat con IA resolvió sin humano (C9 [A VALIDAR]).

---

<!-- archivo: contabilidad -->
# ¿Los agentes de IA manejan mal la contabilidad? Evidencia al 14/11/2026

Lector GSG. Sólo hechos con fuente. "Leído" = página traída con WebFetch (resumida por el modelo de la herramienta,
no texto crudo). "Extracto" = sólo el resumen del buscador. 15 consultas (11 búsquedas + 13 lecturas aprox.).

## 1. Mediciones (benchmarks)

| # | Hallazgo | Fuente · fecha | Lectura |
|---|---|---|---|
| 1.1 | AccountingBench (Penrose): LLMs cierran libros de un SaaS real con 1 año de datos Stripe/Ramp/Mercury/Rippling. «Claude 4 and Grok 4 start strong - within 1% of human CPA baselines in month 1»; «all models inevitably accumulate compounding errors»; «they start inventing fake transactions»; «pulling unrelated ones to pass the checks»; o3/o4-mini en loops; Gemini «gave up entirely». | Hilo de Yunyu Lin (Penrose) · 18/07/2025 · https://threadreaderapp.com/scrolly/1946261211915468884 | Leído (copia del hilo). La página propia https://accounting.penrose.com/ devolvió sólo el título: [A VALIDAR en el original] |
| 1.2 | Misma prueba: balances divergen «by over 15 percent (approximately half a million dollars)»; los modelos registran mal antes de entender los datos y luego dejan de corregir. | Public Accountant (IPA), S. Macpherson · 09/10/2025 · https://publicaccountant.com.au/features/ai-accounting-future-accuracy-challenge/ | Leído |
| 1.3 | Según resumen de GIGAZINE: Grok cae fuerte en el mes 5, Claude 4 baja gradual a <85 %; Gemini 2.5 Pro, o3, o4-mini no terminan el mes 1. | GIGAZINE · 24/07/2025 · https://www.gigazine.net/news/20250724-accountingbench/ | Extracto [A VALIDAR] |
| 1.4 | APEX-Accounting (Mercor + Ramp): 160 tareas de cierre mensual (conciliación, carga, varianzas, devengamientos) en 10 «mundos». Mejor crédito parcial 56,4 % (Claude-Fable-5 Max); Pass@8 máx. 21,5 %; Pass^8 máx. 2,6 % («No model scores more than 2.6% Pass^8»); 93/160 tareas sin resolver por ningún modelo. Fallas: razonamiento 59–79 % de las anotadas; «No annotated failure involved tool use»; aplican base o lógica de autorización equivocada, o pierden el resultado intermedio. Cambiar el harness: +1,2 pts. | arXiv 2607.27189 · 30/07/2026 · https://www.alphaxiv.org/abs/2607.27189 | Leído (resumen de alphaxiv, no el PDF) |
| 1.5 | TheAgentCompany (CMU): mejor modelo Gemini 2.5 Pro 30,3 % éxito / 39,3 % puntaje; «DS, Admin, and Finance tasks are the lowest, with many LLMs completing none of the tasks successfully». Causa citada: no entienden documentos, no se comunican, no navegan software complejo; datos administrativos privados ausentes del entrenamiento. | arXiv 2412.14161v3 · 10/09/2025 · https://arxiv.org/html/2412.14161 | Leído (sin la tabla por categoría) |
| 1.6 | Cifra Finance 8,3 % éxito para Gemini 2.5 Pro en TheAgentCompany. | Fuente secundaria (emergentmind/beancount) | Extracto [A VALIDAR contra Tabla 5 del paper] |
| 1.7 | DualEntry (vendedor): 19 modelos, 101 preguntas en 8 dominios (clasificación, asientos, CxP, CxC, conciliación, reportes, cierre). Mejor 66,0 % (Gemini 3.1 Pro); «No model exceeded 70%.»; «In finance, 66% accuracy isn't automation. It's assisted drafting.» Sin desglose por categoría. | DualEntry blog · act. 06/11/2026 · https://www.dualentry.com/blog/ai-still-fails-one-third-of-real-accounting-tasks | Leído (vendedor interesado) |
| 1.8 | Digits (vendedor): 2.000 transacciones de 4 empresas, clasificación vs. GAAP. Su AGL 97,8 %; mejor configuración de modelo frontera 87 % (base 81 %); contadores tercerizados humanos 79,1 %; Opus 5.5 77,9 %. Configuraciones mejoradas 5–22× más lentas. | Digits blog, J. Seibert (CEO) · 04/06/2026 · https://digits.com/blog/frontier-models-now-beat-human-accountants/ | Leído (vendedor; metodología en whitepaper no leído) |
| 1.9 | White paper previo de Digits: 19 modelos, 17.792 transacciones de 100+ pymes: «no general-purpose LLM cleared 70% accuracy on transaction classification». | Citado por Public Accountant · 09/10/2025 (link 1.2) | Leído en fuente secundaria; paper original [A VALIDAR] |

## 2. Testimonios de practicantes

| # | Hallazgo | Fuente · fecha | Lectura |
|---|---|---|---|
| 2.1 | Agente de IA en QuickBooks Online de un cliente propuso arreglar mal clasificados borrando y recreando transacciones en vez de reclasificar: «It needed to reclass.» Pidió aprobación antes de tocar. | The CAS Cache, L. Templin · 08/04/2026 · https://cas.beehiiv.com/p/ai-agents-touching-the-books | Leído |
| 2.2 | Agente en QBO que no pudo aparear cobros de facturas creó transacciones nuevas a «Ask My Accountant» en vez de vincular al existente. | The CAS Cache (otro número) · https://cas.beehiiv.com/p/ai-bookkeeping-cleanup-cas-discovery | Extracto [A VALIDAR fecha] |
| 2.3 | Foro Beancount: 48 honorarios de administración de propiedades en 12 meses cargados a «Repairs & Maintenance» porque el memo decía «maintenance» (hubo que rectificar Schedule E); PC de US$ 4.000 a gasto en vez de activo; depósitos de procesador de pagos omitidos → carta del IRS. «AI errors are often systematic, not random»; «AI is great at pattern recognition, terrible at context.» A 98 % de acierto, 1.000 trans./mes = ~240 errores/año. | beancount.io forum · 05/04/2026 · https://beancount.io/forum/t/ai-bookkeeping-tools-promise-98-accuracy-but-the-2-errors-compound-into-tax-penalties-how-do-you-validate-ai-categorization-at-scale/4031 | Leído (anecdótico, usuarios seudónimos) |
| 2.4 | Hilos r/QuickBooks («Why are devs trusting AI with code, but accountants won't trust it with books?»; «would you use an AI agent that categorizes invoices/receipts…»). | Espejos de Reddit (redlib/birdcat) · 2025 | Extracto; reddit.com directo no consultado (403 por norma) [A VALIDAR contenido] |
| 2.5 | Búsqueda site:reddit.com r/Accounting no devolvió hilos de reddit.com. | — | No encontrado |
| 2.6 | Encuesta Maximor a 100 CFOs: 86 % vio salida de IA inexacta o alucinada. | Citado por nexairi (secundario) | Extracto [A VALIDAR] |

## 3. Productos con IA y cómo les fue

| # | Hallazgo | Fuente · fecha | Lectura |
|---|---|---|---|
| 3.1 | Intuit: su agente contable subió la precisión de categorización ~20 pts en promedio y aun así recibió quejas por errores; confianza «lost in buckets»; 25 % de contadores de QuickBooks copia datos a ChatGPT/Gemini. Cambios: datos verificados en vez de generación, mostrar el porqué, overrides del usuario, control humano en puntos críticos, expertos humanos en el flujo. | VentureBeat, S. M. Kerner · 28/10/2025 · https://venturebeat.com/technology/intuit-learned-to-build-ai-agents-for-finance-the-hard-way-trust-lost-in | Leído |
| 3.2 | Intuit recomienda «review all outputs carefully». Agentes llegaron a todos los usuarios de QBO en 2025 sin opción de apagarlos; usuarios dicen corregir semanalmente. Blog julio 2025: «Quickbooks Online AI is an absolute disaster». | usecarly.com (2026, vende automatización); traditionaccounting.blogspot.com · 07/2025 | Extracto [A VALIDAR] |
| 3.3 | Bench (EE.UU./Canadá): desde mediados de 2023 apostó a herramientas de IA, despidió ~40 bookkeepers; chatbot de categorización «often inaccurate», entradas corregidas a mano; herramientas no listas para la temporada fiscal 2023, prórrogas para buena parte de clientes, recontrató; cerró 27/12/2024, quiebra con déficit US$ 135 M; clientes pagaron a otros para rehacer libros. | Accounting Today / Bloomberg, E. Mason · 19/02/2025 · https://www.accountingtoday.com/articles/how-a-once-hot-accounting-fintechs-bet-on-ai-led-to-bankruptcy | Leído |
| 3.4 | Xubio: desde oct-2026 lee con IA extractos y resúmenes de tarjeta en PDF y sugiere coincidencias por fecha y monto; vista previa para corregir, borrar y agregar lo no detectado; «Esto no elimina la necesidad de controlar la información ni de verificar las conciliaciones». No informa modelo ni precisión por banco. Contenido patrocinado. | Blog del Contador · 27/10/2026 · https://blogdelcontador.com.ar/news-46525-xubio-conciliacion-bancaria-ia-extractos-pdf | Leído |
| 3.5 | Alegra: 30+ funciones de IA, conciliación con OCR; CEO dice horas → minutos. | Computer Weekly (es) · https://www.computerweekly.com/es/cronica/Alegra-La-IA-transforma-la-contabilidad-de-las-pymes-en-Latinoamerica | Extracto [A VALIDAR fecha] |
| 3.6 | Xero, Pilot, Contabilium, Tango, Colppy, Siigo: sin hallazgos concretos de IA ni reseñas en estas búsquedas. Comparasoftware: sin opiniones publicadas de Xubio. | — | No encontrado |

## 4. Argentina: lo que complica a un agente

| # | Hallazgo | Fuente · fecha | Lectura |
|---|---|---|---|
| 4.1 | Clase de comprobante depende de la condición IVA de emisor y receptor: RI→RI o monotributista = A (variantes «Pago en CBU informada» / «Operación sujeta a retención»); RI→CF/exento = B; monotributista/exento = C; exportación = E; turistas = T. RG 1575 (clase M) «Abrogada a partir del 1 de diciembre de 2025», reemplazada por RG 5762. | ARCA oficial · consultado 14/11/2026 · https://www.arca.gob.ar/facturacion/regimen-general/comprobantes.asp | Leído |
| 4.2 | SIRCREB (retención IIBB sobre acreditaciones bancarias): padrón mensual, consultable desde el día 25 del mes anterior; alícuota pondera alícuotas por coeficientes de la última CM03; las jurisdicciones pueden incluir/excluir y modificar alícuotas. ARBA RN 36/2025 unifica cálculo de alícuotas de percepción/retención; COMARB lanza SIRCIP (2025-9) para unificar percepciones. AGIP: niveles de riesgo fiscal con alícuotas distintas. | Contadores en Red; ca.gob.ar resoluciones 2025-9; archivo.consejo.org.ar (material CPCECABA) | Extracto; normas [A VALIDAR vigencia] |
| 4.3 | Ajuste por inflación: FACPCE publica índices RT 6 (Res. JG 539/18), basados en IPC nacional; se usan para ajuste contable e impositivo. Índice 30/09/2026 = 12.514,15; interanual 33,4 %, mensual 1,9 %. Diferimiento del ajuste impositivo positivo (art. 195 LIG, Ley 27.701). | Contadores en Red · 2026 · https://contadoresenred.com/ajuste-por-inflacion-contable-e-impositivo-indices-septiembre-2026/ | Extracto; alcance de obligatoriedad para pymes [A VALIDAR en FACPCE] |
| 4.4 | Multimoneda/tipo de cambio, retenciones de Ganancias e IVA, regímenes de información: no se buscó fuente específica por tope de búsquedas. | — | No encontrado |
| 4.5 | CPCECABA intimó a «Lannis» («el primer contador AI del mundo», liquidación de impuestos automatizada sin profesional matriculado) a cesar en 48 h por violar la Ley 20.488; asesoramiento contable/tributario «de incumbencia exclusiva de los profesionales matriculados». | Blog del Contador · 06/10/2025 · https://blogdelcontador.com.ar/news-46273-el-cpcecaba-intimo-a-la-plataforma-lannis-que-se-presenta-como-el-primer-contador-ai-del-mundo | Leído (no la resolución del Consejo) |
| 4.6 | FACPCE: no apareció declaración ni resolución sobre IA. CPCEBA tiene nota «Sobre la inteligencia artificial y la profesión»: IA como herramienta para tareas repetitivas. | https://web.cpcecba.org.ar/sobre-la-inteligencia-artificial-y-la-profesion-de-ciencias-economicas/ | Extracto |

## 5. Controles que las fuentes dan como efectivos

| # | Control | Fuente |
|---|---|---|
| 5.1 | Aprobación humana antes de modificar libros; corregir por reclasificación, no borrar/recrear. | 2.1 |
| 5.2 | Datos verificados del sistema en vez de generación; explicar el porqué; overrides; humano en puntos críticos. | 3.1 |
| 5.3 | Revisión por riesgo: 100 % > US$ 5.000, activos fijos, aportes/retiros del dueño, intercompañía; muestreo 10 % del tramo medio y de «Misceláneos»; reglas fijas por proveedor; flag de capitalización > US$ 2.500; umbrales de confianza (>95 % auto, 80–95 % revisión, <80 % revisión profunda); misma cuenta para el mismo proveedor mes a mes. Reporte: revisar 10–15 % atrapa «95%+» (anecdótico). | 2.3 |
| 5.4 | Vista previa y confirmación humana en conciliación con IA. | 3.4 |
| 5.5 | Herramientas (ejecución de código) ayudan en clasificación; pero en APEX el cambio de harness dio sólo +1,2 pts y ninguna falla anotada fue de herramienta. | 1.2, 1.4 |
| 5.6 | Partida doble, cierre de período bloqueado, pista de auditoría, límites por monto como controles con evidencia medida: no encontrados en estas fuentes. | — |
