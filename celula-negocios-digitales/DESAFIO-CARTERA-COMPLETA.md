# 🥊 DESAFÍO A LA CARTERA COMPLETA — Red-team de producción (21 negocios)

> **Fecha: 2026-07-06.** Quien escribe esto no es un marketinero: es un operador que puso plata propia,
> montó y escaló negocios reales, y conoce el mercado pyme argentino (informalidad, estacionalidad,
> inflación, capacidad real de pago, cómo se vende puerta a puerta y por WhatsApp, ARCA/monotributo) y
> el global (SaaS, cómo se cobra en USD, benchmarks, competidores del exterior). Sin humo. La pregunta
> única es: **¿esto factura o muere?** Y sobre todo: **¿el fundador lo puede vender sin equipo comercial?**
>
> Método: para cada uno de los 21 negocios, **3 desafíos nombrados** (no genéricos), **el más letal**,
> **un experimento barato que lo desactiva**, y **veredicto de producción**: 🟢 A PRODUCCIÓN ·
> 🟡 CON CONDICIÓN · 🔴 NO. Los 11 de Ronda 1 nunca habían pasado por el red-team: los ataqué con
> research web real y les nombré los competidores locales que el analista no había mirado.
>
> **Los 4 filtros que de verdad separan el que factura del que muere** (mi lente en todo el documento):
> (1) **distribución real** — sin canal, el mejor producto no vende una unidad; (2) **capacidad y ganas
> de pago del cliente AR** — la pyme de barrio paga poco, tarde y corta al primer apretón; (3)
> **dependencia de plataforma** — si el negocio vive de una API o de un canal que no controlás, no es
> tuyo; (4) **venta sin equipo comercial** — si necesita un vendedor full-time, un estudio chico no lo
> ejecuta. Todo local, no se tocó prod, git ni deploy.

---

# A. LOS 4 EN DESARROLLO — ¿siguen firmes bajo presión?

## 1) Kudos — reseñas en piloto automático
**Desafíos nombrados:**
1. **Comoditización de la feature.** Responder reseñas con IA ya es gratis o casi: Google Business Profile
   sugiere respuestas nativas, gmbapi cobra desde US$7/mes, Localo lo regala, wiReply/Cacao lo hacen en
   español. El día que vendés "una app que responde reseñas" perdiste: te ganan por precio. Tenés que
   vender **servicio hecho, no herramienta** — el comercio de barrio que "no quiere aprender otra app".
2. **Venta atomizada.** Se suma de a un local por vez a US$99-149. Sin referidos entre comercios y sin
   un canal físico (visitador, QR en el mostrador), el CAC en horas del fundador se come el margen del
   primer trimestre. Es negocio de ritmo comercial sostenido, no de un lanzamiento.
3. **Política anti-gating de Google.** No podés filtrar para pedir reseña solo a los contentos: Google
   penaliza. El guion de captación tiene que ser limpio o le arruinás el ranking al cliente (y perdés
   al cliente). Restricción de operación real, no cosmética.

**El más letal:** la **comoditización nativa de Google** — si el diferencial es "IA que contesta", el piso
del mercado ya está en gratis. Se desactiva solo si el producto es un **servicio gestionado con moat de
relación local**, no un SaaS self-serve.

**Experimento barato:** vendé 3 locales de barrio como "gestión de reputación hecha para vos" a US$99/mes,
**sin mostrarles la herramienta**, solo el resultado (más estrellas + reporte). Si cierran y a los 60 días
no piden ver "el sistema", el pitch de servicio funciona y el churn baja. Costo: cero, unas semanas.

**Veredicto: 🟢 A PRODUCCIÓN.** El único donde no encontré agujero de plata: COGS de texto despreciable,
margen 90-95% **real**, moat que crece con el tiempo (cuanto más gestionás su ranking, más caro le sale
irse → baja el churn al revés que el SaaS commodity), techo de precio 3× vs Birdeye. La condición no es
dura, es de posicionamiento: **véndelo como servicio, nunca como tool.** Es el ancla.

## 2) Fantasma — el "turno noche" de WhatsApp
**Desafíos nombrados:**
1. **El wedge "solo la noche" es débil frente a competencia local que da 24/7 más barato.** Aoki (300+
   empresas AR), ConnectIA, Artics ya venden atención WhatsApp+IA **completa** a US$50-400/mes. ¿Por qué
   te compran medio servicio si el de al lado da el día entero al mismo precio? El "turno noche" sirve
   como **framing de entrada**, no como producto final.
2. **La trampa del flat.** El COGS es conversacional y lineal (US$0,15-0,30 por conversación cerrada).
   Una pizzería o un e-comm que factura de noche hace 200-400 conversaciones/mes → COGS US$60-120, y a
   US$200 flat el margen se desploma a 40% justo en el cliente que más usa y menos querés perder. Hay que
   **blindar tope + excedente por uso desde el día 1**, o el primer heavy user te enseña la lección.
3. **Dependencia de Meta/WhatsApp.** Baneos, política de plantillas, cambios de precio. El canal no es
   tuyo. Riesgo de plataforma real.

**El más letal:** que salgas a vender **genérico** contra Aoki & co. y pierdas por precio siendo igual. El
antídoto es elegir **un vertical** donde ganes por foco (ej. gastronomía nocturna, turnos de estética,
inmobiliaria) y donde el "solo la franja que se te escapa" sea un dolor obvio.

**Experimento barato:** agarrá 2 barberías/pizzerías y corré el turno noche 2 semanas con pricing por uso;
medí las conversaciones reales y la "plata que se hubiera escapado". Si el reporte del lunes muestra leads
rescatados > lo que cobrás, cerrás por ROI sin discutir precio. Costo: tokens de 2 clientes.

**Veredicto: 🟡 CON CONDICIÓN.** Condición dura: **pricing por uso obligatorio + un vertical elegido donde
no compitas de generalista.** Con eso, es la mejor caja temprana del lote (reúsa stack, primer peso 2-3
semanas). Vendido flat y genérico, es un commodity más.

## 3) Testigo — parte de trabajo desde foto+audio
**Desafíos nombrados:**
1. **Evangelización rubro por rubro.** No escala horizontal: cada vertical (fumigación ≠ jardinería ≠
   plomería) es un mini-lanzamiento con plantilla propia y onboarding alto-touch. Consume el recurso más
   escaso: horas del equipo. Hay que arrancar con **UN rubro faro**, no abrir cinco.
2. **Adopción del operario.** El plomero/fumigador promedio no quiere aprender nada. El wedge es que el
   input (mandar foto+audio por el WhatsApp que ya usa) es igual de fácil que ahora — pero eso hay que
   **demostrarlo en obra**, no en un pitch.
3. **Competencia de apps de formulario.** Ubiqo, Reporte Móvil/Properly, MoreApp, Kizeo existen. Todas
   exigen instalar app y tipear campos. El diferencial "cero app / voz→parte" es real y poco servido,
   pero hay que sostenerlo: si mañana meten voz, el foso se achica.

**El más letal:** el **ramp lento por rubro** — no te mata el margen ni el competidor, te mata la
dispersión si abrís muchos verticales a la vez y ninguno queda pulido.

**Experimento barato:** una sola empresa de **control de plagas/fumigación** (rubro donde bromatología
**exige** el parte → menos evangelización), pipeline foto+audio→PDF real por 3 semanas. Si el dueño dice
"esto es mi forma de entregar de ahora en más", tenés stickiness y arrancás por ahí. Costo: ~US$2/operario.

**Veredicto: 🟢 A PRODUCCIÓN.** El más defendible del lote entero: el wedge zero-app/voz sobrevivió a los
dos red-teams (mercado y plata), COGS ~0, margen ~90%, stickiness altísima (una vez que el parte es el
estándar de entrega, cambiar duele → churn bajo). No hay "Google del parte de obra" que lo comoditice de
un plumazo. Es el motor recurrente de mejor calidad, aunque no el de caja más rápida.

## 4) Plantillería — plantillas normativa AR
**Desafíos nombrados:**
1. **Distribución = el asesino silencioso.** ~50% de los vendedores de plantillas no supera 50€/mes el
   primer año por ignorar el reparto. Gumroad/Lemon **no te dan tráfico**. El caso feliz de "US$1.800 en
   un mes" venía con ~4.000 seguidores previos que el estudio no tiene. Sin canal orgánico propio, el
   catálogo es una vitrina que nadie visita.
2. **Techo por SKU bajo.** Una plantilla a US$27-75 one-time no hace un negocio sola; el negocio es
   **apilar** 8-10 SKUs AR + audiencia. Hasta que no haya catálogo + canal, la caja es de propina.
3. **Piratería / copia.** Se filtran. Secundario frente a la distribución, pero real: el moat no es el
   archivo, es la marca + la actualización normativa continua.

**El más letal:** la **distribución**. El producto no es el problema (COGS cero, margen 95%, hueco de
localización AR genuino — no hay competidor directo de plantillas para monotributo/ARCA); el problema es
que **nadie te encuentra**. Es un trabajo de marketing muy no-pasivo antes del primer peso pasivo.

**Experimento barato:** construí SOLO la plantilla de Monotributo contra un caso real, publicá 10 piezas
orgánicas de nicho (IG/TikTok "control de monotributo") y medí si 3-5 semanas de contenido traen las
primeras 10 ventas. Si el orgánico no mueve nada, el negocio no es el producto, es el canal — y eso hay
que resolverlo primero. Costo: una plantilla + tiempo de contenido.

**Veredicto: 🟡 CON CONDICIÓN.** Condición dura: **la distribución es la prioridad #1, no la #6.** Si el
estudio no tiene o no construye en 3-6 meses un canal orgánico AR propio, no lo largues — apila SKUs sobre
una vitrina vacía. Con canal, es COGS cero y cobro global sin fricción (Lemon Squeezy MoR, el cambio
fiscal 2025 liberó traer los USD). Buen segundo pie **de caja lenta**, no motor principal.

---

# B. LOS 2 HERIDOS

## 5) El Data Semanal — newsletter de finanzas AR
**Desafíos nombrados:**
1. **Time-to-cash letal.** 12-18 meses hasta US$1k/mes serio y 20-25k subs. Un estudio chico se
   descapitaliza esperando. No es ingreso, es una apuesta de mediano plazo con sueldo diferido.
2. **CAC de lista real.** Orgánico a esa escala es lotería; con paid, el sub cuesta US$0,65-3,50 por Meta
   (finanzas, nicho competido → banda alta). 20k subs ≈ **US$40.000 de pauta** para recién facturar
   ~US$600/envío. Eso es capital de riesgo, no pasivo.
3. **No hay hueco vacío + es semi-pasivo.** Cenital, Invierte y decenas en beehiiv ya pelean la audiencia
   financiera AR; el formato "1 dato + gráfico" lo copia cualquiera. Y hay producción semanal con humano
   en el loop.

**El más letal:** el **combo tiempo + capital** — el más lento y más caro de arrancar de toda la cartera.

**Experimento barato:** no lo lances como negocio; **enchufalo como capa de monetización de un activo de
tráfico que ya exista** (si Kudos/Testigo capturan emails, la newsletter los retiene y el sponsor paga).
Medí si con 500 subs reales aparece un primer sponsor chico. Si a los 3-5k subs nadie pauta, muerto.

**Veredicto: 🔴 NO (todavía).** Como negocio standalone no cierra a tiempo para un estudio chico. Solo
tiene sentido como **pieza** de otro producto que ya tenga tráfico. Hoy, no.

## 6) Mapa del Barrio — micro-directorios UGC
**Desafíos nombrados:**
1. **"Pasivo" disfrazado de venta B2B recurrente.** La plata sale de vender listings destacados a 100-150
   comercios uno por uno. Con churn SMB 3-7%/mes, mantener 150 significa reponer 5-10 bajas **todos los
   meses, para siempre**: es un vendedor full-time, no un ingreso dormido.
2. **Google Maps ya comoditizó el descubrimiento local, gratis.** El que busca "veterinaria 24h cerca"
   abre Maps, no tu directorio nuevo sin autoridad. Y ya hay directorios AR (arempresas, mibarrio.chat,
   guiacomercialargentina).
3. **Cold-start del UGC.** Sin reseñas no hay tráfico; sin tráfico no hay reseñas. Arranque frío duro.

**El más letal:** el **CAC en tiempo humano de venta** — el activo más escaso del estudio, gastado en la
tarea que menos escala, compitiendo por las mismas horas que los negocios activos que sí dan caja rápida.

**Experimento barato:** antes de construir nada, andá a vender **10 listings destacados por adelantado** en
un vertical/zona a US$20/mes. Si no cerrás 10 comercios con una demo en papel, no hay negocio — no lo
construyas. Costo: cero, solo pie de calle.

**Veredicto: 🔴 NO.** Economía unitaria decente en teoría, pero mal etiquetado: es negocio local con
vendedor dedicado, no pasivo. Sin equipo comercial, no arranca.

---

# C. LOS 4 DESCARTADOS — ¿el red-team acertó?

## 7) Calculadoras fiscales/financieras AR
**Desafíos nombrados:** (1) la "competencia fea" es **falsa**: 8+ sitios gratis, buenos y actualizados a
2026 ya rankean (calcularsueldoar, servidos.ar, aarg.ar, BBVA); (2) el AIO se come el tráfico informativo
de alrededor de la tool; (3) RPM AR de migajas (US$5-15) → necesitás ~143k pageviews/mes para US$1k solo
de ads.
**El más letal:** entrar **último** a un SERP saturado por incumbentes instalados hace años, a un negocio
de ads de centavos.
**Experimento barato:** ninguno como negocio aislado; solo tiene valor como **lead-magnet** de una
newsletter. Medir captura de emails, no pageviews.
**Veredicto: 🔴 NO.** Muere como isla; sobrevive solo como feature de captación de otro producto.

## 8) Cambió el Precio — historial de precios AR
**Desafíos nombrados:** (1) **MeliPrice y MercadoTrack ya existen** (+ 17 comparadores AR listados) →
llegás tarde y detrás en data; (2) monetización probadamente floja (lección CamelCamelCamel: el afiliado
no sostiene un price-tracker; Keepa sobrevivió virando a suscripción); (3) build alto + antifraude +
cold-start del moat 9-18 meses = el menos pasivo y el más caro.
**El más letal:** el **combo build alto + monetización débil + cold-start largo** — tres formas de quemar
plata antes del primer peso. Es apuesta de fondo VC, no de estudio chico.
**Experimento barato:** ninguno que valga; el capex y el tiempo lo descartan de entrada.
**Veredicto: 🔴 NO.** El peor perfil de riesgo de la cartera. Confirmado.

## 9) Mercader — gestor de MercadoLibre DFY
**Desafíos nombrados:** (1) **MercadoLibre lo comoditizó nativo** ("respuesta sugerida" con IA, gratis) +
8 bots locales (Renata, GoBots, Yobot, MercadoBot); (2) el margen "95%" es mentira: la supervisión de
pricing y la posventa **no se automatizan** → margen real 60-70% con labor humana (es consultoría
disfrazada de SaaS); (3) **riesgo de plataforma existencial**: todo cuelga de la API de ML, que puede
cambiar términos o borrarte de un día para el otro.
**El más letal:** la **dependencia de canal único** sobre una plataforma que además ya te compite gratis.
**Experimento barato:** ninguno; el corazón del producto ya lo regala ML.
**Veredicto: 🔴 NO.** Confirmado. Concentración de riesgo + comoditización nativa.

## 10) Confesionario — voz-del-cliente aaS
**Desafíos nombrados:** (1) **Vokalis y Burbuxa ya son el negocio idéntico en español** (encuestas
conversadas voz+WhatsApp, NPS, alerta de feedback negativo, para pyme); (2) la voz real cuesta
US$0,13-0,31/min → 200 clientes = US$88/mes solo de voz, funde el margen a <55%; (3) la lectura humana del
insight no escala → techo duro de clientes.
**El más letal:** el **hueco no existe** (competidor local idéntico) **y** la voz + labor rompen el margen.
Doble maldición.
**Experimento barato:** solo cerraría en **modo texto por default + voz como add-on por minuto**; probar si
alguien paga el texto solo. Pero entrás último contra Vokalis/Burbuxa.
**Veredicto: 🔴 NO.** Confirmado. Premium de nicho dentro de un bundle, no negocio.

---

# D. LOS 11 DE RONDA 1 — nunca desafiados, ahora sí

## 11) Postora — CM con IA para comercios de barrio (PMO la puso de punta de lanza)
**Desafíos nombrados:**
1. **El contenido con IA se está comoditizando a cero.** Cualquier CM freelance ya usa ChatGPT + Canva;
   Meta y Canva regalan generación de posteos. Tu producto compite contra un freelance junior AR a
   $150.000-250.000 ARS/mes (~US$120-200) que hace 12-15 posteos, y contra "gratis con esfuerzo". El
   diferencial tiene que ser **diseño y curaduría visiblemente mejores** — y eso hay que probar que el
   cliente de barrio lo percibe y lo paga.
2. **Capacidad y ganas de pago bajas + churn brutal.** El comercio de barrio que contrata contenido y no
   ve ventas es el **primero que corta** a los 60 días. US$29-59/mes recurrente por posteos que "no sabe
   si sirven" es una venta frágil. El LTV real es corto.
3. **No hay ROI medible.** A diferencia de Kudos (estrellas = ventas) o Fantasma (leads rescatados),
   "más lindos los posteos" no se ata a plata → discusión de valor eterna y churn.

**El más letal:** la **comoditización del contenido IA** cruzada con la **baja disposición de pago** del
comercio de barrio. Es el negocio de esta lista con el diferencial más erosionable y el cliente más flojo.

**Experimento barato:** vendé el mes 1 a 5 comercios a US$39/mes y medí **retención al mes 3**, no el
alta. Si 3 de 5 renuevan sin que tengas que rogar, hay algo. Si churnea, confirmás que sin ROI medible el
recurrente no aguanta. Costo: tokens + tu diseño.

**Veredicto: 🟡 CON CONDICIÓN — y más flojo de lo que el PMO cree.** Condición dura: que el diseño del
estudio sea **demostrablemente superior** al freelance barato **y** que se ate a alguna métrica de negocio
(no "posteos lindos"). Yo NO la pondría de punta de lanza sobre Kudos/Testigo: margen ~75%, diferencial
erosionable, cliente que corta rápido. Es más "línea de servicio del estudio" que producto escalable.

## 12) Recepcionista IA vertical — voz+WhatsApp+agenda (clínicas/estéticas)
**Desafíos nombrados:**
1. **Mercado ya poblado, incluso con jugador AR barato.** TitanIA (LATAM, US$99/mes), Telqi (79€),
   Klinikare, y en Argentina **Mi Agenda Profesional** (turnos + bot WhatsApp IA, cobra señas con Mercado
   Pago, **plan gratuito**). Competís contra un local que ya integra MP y regala el tier de entrada.
2. **La voz recorta el margen a 40-60%** (US$0,13-0,31/min todo incluido) y hay que cobrarla por uso, no
   flat. La versión que justifica el precio (voz) es la que rompe la economía.
3. **Venta consultiva sin equipo comercial.** El ACV alto (setup US$300-1k + retainer) exige vender de a
   uno con reuniones. Un estudio chico no sostiene ese ciclo en volumen.

**El más letal:** la **voz que recorta el margen** en un mercado que ya tiene un competidor AR con
MercadoPago y plan gratis en la puerta de entrada.

**Experimento barato:** arrancá **texto+WhatsApp+agenda sin voz** (margen 90%) en UN vertical (estética),
setup + retainer; sumá voz solo si el cliente la paga por uso. Medí si 3 clínicas pagan setup por adelantado.
**Veredicto: 🟡 CON CONDICIÓN.** Condición dura: **voz solo como add-on por minuto, vertical estrecho, y
ACV alto que justifique la venta consultiva.** El viento regulatorio (Meta mató los bots genéricos) ayuda.
Solapa parcialmente con Fantasma (mismo stack) — es su versión premium; no hacer las dos genéricas a la vez.

## 13) Directorio B2B + lead-gen — datos propios
**Desafíos nombrados:**
1. **Mismo huevo/gallina que hirió a Mapa del Barrio**, sin la excusa de "pasivo": sin listings no hay
   compradores de leads, sin compradores no hay ingresos que financien conseguir listings.
2. **El dato ya está comoditizado.** LeadCanvas extrae de Google Maps (nombre, teléfono, email, IG) y
   exporta a Excel; Leadzy vende leads B2B AR verificados por sector; Páginas Amarillas. El "dato
   propietario" lo replica cualquiera con un scraper de Python.
3. **Venta de leads = venta activa recurrente** con atribución disputada (¿el lead cerró por vos?).

**El más letal:** el **huevo/gallina + comoditización del dato**. No hay activo defensible: el que quiere
leads AR ya los compra a Leadzy o los scrapea.
**Experimento barato:** pre-vendé 5 leads de un nicho a US$30 antes de armar el directorio. Si no hay
comprador adelantado, no hay negocio.
**Veredicto: 🔴 NO.** El red-team ya había avisado que Mapa del Barrio era la advertencia directa sobre
este; confirmado, y encima el dato está comoditizado.

## 14) VetVoz — historia clínica por voz (veterinarias)
**Desafíos nombrados:**
1. **El producto idéntico YA existe y en español/LATAM.** QVET **ESCRIBA** (IA que redacta la historia
   clínica sin teclear), **SmartVet** (dicta y estructura, 3 meses gratis, Colombia/LATAM), **VetPraxis**
   (dictado por voz, miles de profesionales en 11 países de LATAM), **Veta-i**, Vetgo.ai. Llegás
   **tardísimo** a una categoría ya servida.
2. **Consolidación global** (Instinct compró ScribbleVet) → los grandes integran scribe de voz como
   feature de su ERP; vender el scribe suelto pierde contra el suite completo.
3. **Build 4-6 semanas + venta a un rubro conservador** que ya tiene software de gestión instalado y no lo
   cambia por una feature.

**El más letal:** **llegás último a un mercado ya ocupado por productos idénticos**, algunos gratis en el
tier de entrada. No hay hueco.
**Experimento barato:** ninguno que dé vuelta el hecho de que QVET/VetPraxis ya lo venden integrado.
**Veredicto: 🔴 NO.** El "hueco en español" no existe: es de los más ocupados de la cartera.

## 15) Vitrina — fotos+ficha de producto para vender online
**Desafíos nombrados:**
1. **Comoditizado por horizontales baratos/gratis.** Photoroom, Pixelcut, Mokker, Pebblely, CreatorKit,
   ButterflAI, MyEdit, y **Canva lanzó su propio modelo de diseño**. La parte visual es un mar rojo.
2. **Margen 50-70%** (API de imagen de terceros como COGS) — no es el 90% del SaaS de texto.
3. **Self-serve compite contra freemium global** con más features y marca; sin un ángulo AR fuerte, no hay
   razón para elegirte.
**El más letal:** **no hay moat** — cualquier mejora de Photoroom/Canva te iguala gratis mañana.
**Experimento barato:** buscar UN vertical AR donde la ficha (no la foto) sea el dolor y el genérico no
sirva. Si no aparece, no hay negocio.
**Veredicto: 🔴 NO.** Comoditización + margen flojo + sin diferencial defendible.

## 16) Back-office documental (AFIP/ARCA) — conciliación para pymes/contadores
**Desafíos nombrados:**
1. **Mercado AR ya ocupado por locales con IA.** **Genio Contable** (IA que recorta 83% del trabajo
   impositivo, concilia contra ARCA/AGIP/ARBA), **ConciliaBot**, **Colppy**, **Aconpy** (importación
   automática de comprobantes), TuOrden. Entrás a competir con quien ya entiende la normativa.
2. **Build pesado + margen erosionado por labor humana** (60-75% real): la conciliación fina no se
   automatiza del todo, hay revisión humana → consultoría disfrazada.
3. **Venta lentísima a contadores**, un cliente desconfiado y conservador que ya tiene su stack. Ciclo
   6-10 semanas, sin equipo comercial es inviable a volumen.
**El más letal:** la **venta consultiva lenta a contadores** contra incumbentes locales instalados.
**Experimento barato:** conseguí **UN contador aliado** que te dé 3 clientes suyos para conciliar un mes;
si te paga un retainer por sacarle el trabajo de encima, el canal es "a través del contador", no directo.
**Veredicto: 🟡 CON CONDICIÓN.** Condición dura: **canal a través de un contador aliado (no venta directa)
y foco en el servicio DFY, no en competir con el software.** ACV alto (retainer US$500-2k) y stickiness
salvan la unidad si resolvés el canal. Borderline; sin el contador aliado, es 🔴.

## 17) Comparador con afiliados — transaccional de nicho
**Desafíos nombrados:**
1. **Depende 100% de tráfico** que no tenés: 12-18 meses de SEO antes del primer peso, y el AIO se come el
   tráfico informativo de arriba del funnel.
2. **Afiliados AR delgados.** La comisión de e-commerce/ML local es fina; el modelo de comisión
   recurrente jugoso (tipo TradingView 30%) es de nichos globales, no del consumo AR.
3. **Sin moat:** un comparador lo clona cualquiera; la barrera es el tráfico, que es lento y caro.
**El más letal:** el **tiempo a la caja** — negocio de tráfico sin tráfico, con AIO comiéndose el orgánico.
**Experimento barato:** una landing de comparación de UN producto de comisión alta y medir si el orgánico
trae 100 clics/mes en 60 días. Si no, el canal no existe.
**Veredicto: 🔴 NO.** Buen relato transaccional, pero es una apuesta de tráfico a 12-18 meses sin caja.

## 18) Calificación de leads WhatsApp — ticket alto
**Desafíos nombrados:**
1. **Se está comoditizando rápido.** Chatsell, Leadsales, Trichter, Doppler ya venden calificación de
   leads por WhatsApp con IA en AR, y **WhatsApp Business AI nativo llega a LATAM en 2026** → el agente que
   "vende por vos" viene de fábrica. La feature pura pierde valor.
2. **Solapa con Fantasma** (mismo stack WhatsApp+IA+MP). Vender las dos por separado dispersa; es más una
   **variante de ticket alto** de Fantasma que un negocio aparte.
3. **Fee por resultado con atribución disputada** (¿lo calificó tu bot o cerró igual?) → fricción de cobro.
**El más letal:** la **comoditización nativa** (WhatsApp AI de fábrica) sobre una feature que el mercado ya
está regalando.
**Experimento barato:** venderlo a UN rubro de ticket alto (inmobiliaria/autos/salud premium) con **fee por
reunión agendada**, no retainer plano; medir si el cliente paga por lead calificado real.
**Veredicto: 🟡 CON CONDICIÓN.** Condición dura: **solo en rubros de ticket alto, con fee por resultado, y
mejor fusionado con Fantasma como su tier premium** — no como producto independiente. Sinergia con el
marketing del estudio. Como isla genérica, lo come el WhatsApp AI nativo.

## 19) MediaKit.ar — media kit para micro-creadores
**Desafíos nombrados:**
1. **Compite contra gratis, y bueno.** CreatorsJet (gratis, se auto-actualiza con tus stats), Canva,
   Kitlify, InfluenceFlow (media-kit builder + rate calculator gratis), **Level Up** (LATAM, incluye
   Argentina, desde 1K seguidores). El techo de precio es el suelo: cero.
2. **Producto de un solo uso** (el creador arma el kit una vez) → sin recurrencia, LTV mínimo.
3. **Público sin plata:** el micro-creador de 1-10k seguidores es justo el que menos paga por una
   herramienta.
**El más letal:** **hay competidores gratis y buenos** → no hay disposición a pagar. Techo bajísimo.
**Experimento barato:** ninguno que justifique cobrar por lo que CreatorsJet regala; su único valor es como
**lead-magnet/imán** del estudio, no como caballo de batalla.
**Veredicto: 🔴 NO.** Confirmado como propuesta débil: sirve de imán para captar creadores, no de negocio.

## 20) PrevenIA — compliance de Seguridad e Higiene (ART/SRT)
**Desafíos nombrados:**
1. **Competidor local directo ya operando.** **Previnnova** es exactamente esto en Argentina: software de
   S&H con ART, evidencias, auditorías, IPER, RAR/RGRL, EPP, exportables para inspección. No estás
   inventando la categoría, estás llegando a competirle.
2. **Venta consultiva lentísima** a un comprador (responsable de S&H / dueño de pyme) que decide despacio y
   compra por relación/miedo a la multa, no por demo. Sin equipo comercial es un ciclo imposible de sostener.
3. **Build 6-8 semanas** para un producto de nicho regulatorio donde el error de compliance es caro
   (responsabilidad).
**El más letal:** **Previnnova ya ocupa el hueco** + venta consultiva que un estudio chico no puede sostener
en volumen.
**Experimento barato:** aliarte con UN consultor de S&H que ya tenga cartera y venderle el software como su
herramienta. Si no hay consultor aliado, no hay canal.
**Veredicto: 🔴 NO.** Moat regulatorio real, pero ya lo tiene un local; sin canal consultivo propio, no
arranca. (🟡 solo si aparece el consultor aliado que aporte la cartera.)

## 21) GremioPro — presupuesto+agenda+cobro para oficios
**Desafíos nombrados:**
1. **El mercado AR de oficios es de marketplaces, no de gestión.** Tutti, Clickie, Timbrit, TEGU, Pimer
   conectan cliente↔profesional (que es lo que el oficio quiere: **más laburo**, no una app de
   presupuestos). Le vendés una herramienta de back-office a quien busca demanda.
2. **B2C de laburantes = churn alto + ticket bajo.** El plomero/electricista AR paga poco y mal por
   software mensual; usa el celular para WhatsApp y cobra en efectivo/transferencia. Capacidad y cultura
   de pago por SaaS: bajas.
3. **Sin ROI percibido:** "te ordeno los presupuestos" no le trae un cliente más → no lo paga.
**El más letal:** **el oficio AR no paga software de gestión** — quiere más trabajo (marketplace), no
administración; y el que sí querría gestión churnea por ticket bajo.
**Experimento barato:** cobrá US$10/mes a 10 oficios reales por 2 meses y medí retención. Apuesto a que
churnean; si no, hay una veta.
**Veredicto: 🔴 NO.** Demanda de fondo existe pero mal monetizable en el cliente AR; el mercado ya resolvió
la parte que el oficio valora (marketplaces) y dejó sin comprar la que no valora (gestión).

---

# 📋 TABLA DE VEREDICTOS DE PRODUCCIÓN

| # | Negocio | Grupo | Desafío más letal | Veredicto |
|---|---------|-------|-------------------|:---------:|
| 1 | **Kudos** | DEV | Comoditización nativa de Google (feature gratis) | 🟢 A PRODUCCIÓN |
| 2 | **Testigo** | DEV | Ramp lento por rubro (dispersión) | 🟢 A PRODUCCIÓN |
| 3 | **Fantasma** | DEV | Vender genérico contra Aoki & co. más baratos | 🟡 CON CONDICIÓN |
| 4 | **Plantillería** | DEV | Distribución (sin canal no vende) | 🟡 CON CONDICIÓN |
| 5 | Recepcionista IA vertical | R1 | Voz rompe margen + competidor AR gratis (MP) | 🟡 CON CONDICIÓN |
| 6 | Back-office AFIP | R1 | Venta consultiva lenta vs locales con IA | 🟡 CON CONDICIÓN |
| 7 | Calificación de leads WhatsApp | R1 | WhatsApp AI nativo comoditiza la feature | 🟡 CON CONDICIÓN |
| 8 | Postora | R1 | Contenido IA comoditizado + cliente que corta | 🟡 CON CONDICIÓN |
| 9 | El Data Semanal | HERIDO | Time-to-cash 12-18m + US$40k pauta | 🔴 NO |
| 10 | Mapa del Barrio | HERIDO | CAC en tiempo humano de venta (no pasivo) | 🔴 NO |
| 11 | Calculadoras fiscales | DESC | SERP saturado de gratis + RPM AR migajas | 🔴 NO |
| 12 | Cambió el Precio | DESC | Build alto + monetización floja + cold-start | 🔴 NO |
| 13 | Mercader | DESC | ML lo comoditizó nativo + canal único | 🔴 NO |
| 14 | Confesionario | DESC | Vokalis/Burbuxa idénticos + voz mata margen | 🔴 NO |
| 15 | Directorio B2B | R1 | Huevo/gallina + dato comoditizado (Leadzy) | 🔴 NO |
| 16 | VetVoz | R1 | Producto idéntico ya existe (QVET/VetPraxis) | 🔴 NO |
| 17 | Vitrina | R1 | Sin moat (Photoroom/Canva gratis) + margen 50-70% | 🔴 NO |
| 18 | Comparador afiliados | R1 | Negocio de tráfico sin tráfico (12-18m) | 🔴 NO |
| 19 | MediaKit.ar | R1 | Competidores gratis + sin recurrencia | 🔴 NO |
| 20 | PrevenIA | R1 | Previnnova ya ocupa + venta consultiva | 🔴 NO |
| 21 | GremioPro | R1 | El oficio AR no paga software de gestión | 🔴 NO |

**Conteo: 🟢 2 · 🟡 6 · 🔴 13.**

---

# 🏆 RANKING FINAL DE APTITUD PARA PRODUCCIÓN

Ordenado por lo único que importa: **¿factura pronto, con esfuerzo comercial que un estudio chico puede
ejecutar, sin depender de una plataforma ajena?**

| Puesto | Negocio | Por qué (lente de operador) |
|:------:|---------|------------------------------|
| **1** | **Kudos** 🟢 | El que menos riesgo tiene: margen 90-95% **real**, COGS texto, ROI medible (estrellas=ventas), moat que baja el churn con el tiempo, ciclo de venta corto. Único sin agujero de plata. **El ancla.** |
| **2** | **Testigo** 🟢 | El más **defendible** a largo plazo: wedge zero-app/voz que ninguna plataforma copia en 6 meses, stickiness altísima, margen ~90%. Lo baja solo el ramp por rubro → arrancar por fumigación. |
| **3** | **Fantasma** 🟡 | Mejor **caja temprana** (2-3 sem, reúsa stack). Pero solo con pricing por uso + un vertical elegido. Sin eso, es un chatbot commodity más. |
| **4** | **Plantillería** 🟡 | COGS cero y cobro global sin fricción, hueco AR real. Caja lenta y 100% dependiente de resolver distribución. Buen segundo pie, no motor. |
| **5** | **Recepcionista IA** 🟡 | ACV alto y viento regulatorio, pero voz recorta margen y ya hay competidor AR con MP gratis. Como línea premium de Fantasma, no suelta. |
| **6** | **Calificación de leads** 🟡 | Ticket alto y sinergia con el marketing del estudio, pero se comoditiza (WhatsApp AI nativo). **Fusionar como tier premium de Fantasma.** |
| **7** | **Back-office AFIP** 🟡 | ACV alto y stickiness, pero build pesado y venta lenta; solo vive con un contador aliado como canal. Borderline. |
| **8** | **Postora** 🟡 | La punta de lanza del PMO, que yo **bajo**: diferencial erosionable (contenido IA), cliente de baja paga y churn alto, sin ROI medible. Línea de servicio, no producto escalable. |
| 9-21 | (los 13 🔴) | Muertos o no-todavía: hueco inexistente (VetVoz, Confesionario, Mercader, Directorio, PrevenIA), sin moat (Vitrina, Calculadoras, MediaKit), o time-to-cash/perfil de riesgo inviable para estudio chico (Data Semanal, Cambió el Precio, Comparador, Mapa del Barrio, GremioPro). |

## Recomendación — por cuáles empezar y en qué orden

**Arrancar por 2, sumar un 3º a los 60-90 días. Todos comparten stack WhatsApp+IA+MP, texto (no voz) y
cobro en pesos por Mercado Pago — ese es el bolsillo de defensa del estudio.**

1. **KUDOS (1º, el ancla).** Es donde ningún red-team encontró agujero: margen real, ROI que el cliente ve
   en la góndola, moat que crece. Vendelo como **servicio gestionado**, nunca como app (contra la feature
   gratis de Google perdés; contra el servicio-relación local, ganás). Es la caja confiable.

2. **FANTASMA (2º, en paralelo — caja rápida).** Reúsa el mismo stack, primer peso en 2-3 semanas. **Dos
   condiciones no negociables:** pricing por uso (tope + excedente) desde el día 1, y elegir **un vertical**
   (gastronomía nocturna o turnos) donde no compitas de generalista contra Aoki. Financia la operación
   mientras Kudos escala.

3. **TESTIGO (3º, a 60-90 días — el motor defendible).** El de mejor calidad estratégica: arrancar por
   **control de plagas/fumigación** (el parte lo exige bromatología → menos evangelización), un rubro
   pulido, un contratista faro. Es el que sostiene el negocio cuando Kudos y Fantasma maduren.

**Qué NO hacer:** no largar Postora de punta de lanza (el PMO la sobrevalora: diferencial erosionable y
cliente flojo), no abrir Recepcionista/Calificación como productos sueltos (son tiers premium de Fantasma,
mismo stack), y no tocar los 13 🔴 salvo como imanes de captación (MediaKit, Calculadoras → feeders).

> Documento local. No se tocó producción, git ni deploy. Research web 2026 con fuentes en los informes de
> la célula y en las búsquedas de competidores locales citadas arriba.
