# Investigación «fantasma» · 04/11/2026 · gsg-investigador
Límite de método: WebFetch bloqueado (developers.facebook.com, cronista.com, cliengo.com no resuelven en esta sesión).
Todo sale de fragmentos del buscador, no de páginas leídas completas. Hay que habilitar esos dominios para confirmar.

## 1. Agente de IA de Meta ("Business AI" / Meta Business Agent) en WhatsApp
| Hecho | Fuente | Fecha |
|---|---|---|
| Meta lanzó Business AI, agentes de IA nativos en WhatsApp Business; llegó primero a Argentina junto con otros 16 países de LatAm | cronista.com/infotechnology/it-business/asi-funciona-la-novedad-... | sin fecha en el fragmento [A VALIDAR] |
| Disponible en 17 mercados de LatAm incluida Argentina; se configura sin código; también en Messenger e Instagram | guiawabusiness.cliengo.com/meta-conversations-2026 | 2026 |
| Fecha de lanzamiento contradictoria: «desde febrero» (Cronista) vs «plataforma habilitada el 01/07/2026» (Ceredi) | cronista / diegoceredi.com/blog/ia-vende-sola-whatsapp-business-argentina | [A VALIDAR] |
| Precio: «hoy gratis», con niveles futuros vía WhatsApp Business Premium | dapta.ai/?p=7684 | [A VALIDAR] |
| Precio: desde 01/08/2026 se cobra por tokens, ~USD 2 por millón de tokens; aparte se cobran los mensajes de WhatsApp | diegoceredi.com (blog comercial) | [A VALIDAR] |
| Acceso según tipo de cuenta y volumen de mensajes | coderhouse.com/ar/coderlibrary/meta-agente-ia-whatsapp-business-latam | s/f |
| Funciones: preguntas sobre productos, recomendaciones, «reservar turnos», calificar leads, derivar a humano; cubre casos básicos, no reemplaza un chatbot ni un CRM | cliengo / ceredi / coderhouse | 2026 |
| Pagos y reclamos se derivan a una persona (según un blog) | diegoceredi.com | [A VALIDAR] |
| Requisito: sólo funciona en WhatsApp Cloud API (hosteado por Meta); números en otros BSP como Gupshup no pueden usarlo; hay que aceptar los Términos de IA de Meta | docs.jelou.ai/en/guides/meta-business-agent/requisitos-y-activacion.md | s/f |
| Integración: la charla del agente viaja por el webhook «standby»; acciones vía conector REST + tools; MCP todavía no; el estado sólo se consulta por polling; CORS obliga a llamar desde un backend; producto en early access | docs.360dialog.com/docs/mba/meta-business-agent/known-limitations | s/f |
| Reserva en agenda externa / cobro de seña / link de pago nativo: no apareció ninguna fuente de Meta que lo confirme | — | [A VALIDAR] |

## 2. Precios de WhatsApp Cloud API en Argentina (USD por mensaje entregado)
| Hecho | Fuente | Fecha |
|---|---|---|
| Desde 01/07/2025 se cobra por mensaje (antes, por conversación) | blog.omnichat.ai/whatsapp-pricing-2025 | 2025 |
| Argentina: bajan las tarifas de utility y authentication, vigente desde 01/04/2026 | developers.facebook.com/docs/whatsapp/pricing (fragmento) | 2026 |
| Meta publica tarifarios vigentes desde 01/07/2026 y 01/10/2026 (la fila de Argentina no figuraba en el fragmento) | developers.facebook.com/documentation/business-messaging/whatsapp/pricing | 2026 |
| AR marketing 0,0710 · utility 0,0299 | help.manychat.com/hc/en-us/articles/14281380243740 | ene-2026 |
| AR marketing 0,0649 · utility 0,0273 | ideas.gohighlevel.com/changelog/updated-whatsapp-per-message-pricing-effective-july-2026 | jul-2026 |
| AR marketing 0,0742 · utility 0,0312 · auth 0,0312; «cargo de servicio desde 01/10/2026» | docs.sent.dm/docs/guides/whatsapp-pricing | [A VALIDAR] |
| AR marketing ~0,0265 · utility ~0,0072 | diegoceredi.com | [A VALIDAR] |
| Utility a alto volumen (más de 100K por mes): USD 0,005; utility y auth bajan por volumen, marketing no | go4whatsup.com/argentina/whatsapp-business-api-pricing | abr-2026 |
| Respuestas libres (service) dentro de la ventana de 24 h abierta por el usuario: gratis | unipile.com/is-the-whatsapp-api-free ; wati.io | 2026 |
| Plantilla utility dentro de la ventana abierta: gratis; marketing y auth se cobran siempre | unipile / respond.io/help/whatsapp/whatsapp-pricing | 2025-26 |
| 1.000 conversaciones de servicio gratis por mes: ninguna fuente post-07/2025 lo menciona | — | [A VALIDAR] (probablemente reemplazado) |
| Posible «cargo de servicio» desde 10/2026: lo dice sólo sent.dm | docs.sent.dm | [A VALIDAR] |

## 3. Competidores (precio · bot de IA en WhatsApp · reserva en agenda · seña con MP)
| Producto | Precio | Bot IA WA | Agenda | Seña MP | Fuente / fecha |
|---|---|---|---|---|---|
| AgendaPro AR | desde ARS 7.900/mes con IVA, 50 msj WA | IA «Julia»/«Sofía» (landings); bot WA en el plan Professional de BR | sí | MP en BR; AR [A VALIDAR] | agendapro.com/ar/planes ; getapp.com/all-software/a/agendpro (s/f) |
| Booksy | USD 29,99/mes + USD 20 por usuario (EE.UU.); EUR 34,99 + IVA (ES) | [A VALIDAR] | sí | [A VALIDAR] | glossgenius.com/blog/booksy-price ; pabau.com/es/blog/booksy-precio |
| Fresha | plan superior bajó de USD 60 a 19,95/mes (feb-2026); otra fuente: 8,95–12,95 | [A VALIDAR] | sí | [A VALIDAR] | costbench.com/changelog/fresha-price-decrease-2026-02 |
| Kommo | Básico USD 20 / Avanzado USD 30 por usuario/mes desde 01/09/2026; IA incluida en todos los planes | sí | no (CRM) | [A VALIDAR] | kommo.com/es/blog/actualizacion-precios-kommo |
| Whaticket | USD 49 (Basic) / 109 (Pro) por mes | [A VALIDAR] | no | [A VALIDAR] | trustradius.com/compare-products/whaticket |
| Treble | sin precio público; plan gratis de 5 conversaciones; tarifas de Meta aparte | sí (marketing conversacional) | no | [A VALIDAR] | hackceleration.com/labs/treble-pricing |
| Cliengo | Starter 45 / Premium 119 / Business 259 USD/mes (otras fuentes: desde 18–24) | sí | [A VALIDAR] | [A VALIDAR] | xpay.sh/saas-pricing/cliengo (06/05/2026) |
| XIAgenda | desde USD 15 por profesional/mes; WA y seña con MP en planes superiores | [A VALIDAR] | sí | sí | comparasoftware.com/xiagenda |
| Turnito | funciones básicas gratis (nota de 2023); recordatorio por WA; seña con MP/PayPal/AstroPay | no | sí | sí | diegoceredi.com/beneficios/turnito |
| Gendu | abono mensual fijo sin comisiones (monto no publicado) | [A VALIDAR] | sí | sí (seña o total) | iproup.com/startups/70463-gendu-... |
| Pedí Tu Turno | precio no hallado; seña por transferencia directa; confirmación por WA desde el plan Estándar | no | sí | no (transferencia) | capterra.es/software/1113334/Pedi-Tu-Turno |
| Zapia | precio desconocido; asistente de IA para consumidores (recordatorios); WhatsApp prohíbe los chatbots de propósito general desde 15/01/2026 | sí (B2C) | no | no | elobservador.com.uy (20/10/2025) ; rankmyai.com |
| Reservo, Calendly, Chatfuel, Turnos.ar/Agendate, TuTurno | no hallados con el tope de búsquedas | — | — | — | [A VALIDAR] |

## 4. Costo de una charla con Claude (USD por millón de tokens)
| Modelo | Input | Output | Escritura de caché (5 min) | Lectura de caché | Fuente |
|---|---|---|---|---|---|
| Haiku 4.5 | 1,00 | 5,00 | 1,25 | 0,10 | tokenmark.pages.dev/cost/anthropic (cita anthropic.com/pricing); claudelog.com |
| Sonnet 4.5 | 3,00 | 15,00 | 3,75 | 0,30 | cloudprice.net/models/azure_ai/claude-sonnet-4-5 ; futureagi.com |
Hay agregadores con cifras distintas para Haiku (0,25/1,25 y 0,80/4,00): parecen datos viejos. Precio oficial [A VALIDAR] en anthropic.com/pricing (no se pudo abrir).

Cálculo (aritmética propia sobre esas tarifas). Supuestos: 12 turnos; 1 escritura de caché de 3.000 tokens y 11 lecturas;
400 tokens de salida por turno; 400 tokens de usuario por turno.
- A) sin reenviar el historial: Haiku 0,00375 + 0,0033 + 0,0048 + 0,024 = **USD 0,036**; Sonnet (3×) = **USD 0,108**.
- B) con el historial reenviado sin caché (57.600 tokens de input en total): Haiku = **USD 0,089**; Sonnet = **USD 0,266**.
- Si pasan más de 5 min entre turnos, la caché vence y se vuelve a escribir (+0,00375 en Haiku / +0,01125 en Sonnet cada vez).
