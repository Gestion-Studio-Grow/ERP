# RONDA 14 — Arbitraje tecnológico GLOBAL→ARGENTINA (Wave 14)

> **Célula de negocios digitales · 2026-07-06.** Pipeline completo en una pasada: Inteligencia de
> Señales → Creativos → Analíticos + Ingeniería de Datos → Marketing → Desafiador senior.
> **Ángulo de la ronda:** modelos que **YA FACTURAN** en EE.UU./Europa (con cifra y fuente) y **no
> llegaron a Argentina** en español/pesos. Arbitraje geográfico y temporal: copiar lo probado,
> localizarlo con anclaje AR (WhatsApp, Mercado Pago, obras sociales, inflación) antes de que la
> ventana se cierre.
>
> **Dólar oficial usado:** $1.488,50 por USD. Todo local, sin publicar, sin tocar prod.

---

## DIVERSIFICACIÓN DELIBERADA (Ronda 14) y disciplina de descarte

**No repetimos** ninguno de los ~83 negocios de las rondas 1–12 (lista de exclusión completa en
`STATUS-NEGOCIOS.md` y carpetas `ronda-3` a `ronda-12`).

**El filtro de competencia local mató 5 candidatos ANTES de entrar al documento** (el error de
"hueco en español sin verificar" ya nos costó 6 negocios en rondas previas — esta vez el descarte
fue previo):

| Candidato descartado | Modelo global que factura | Qué encontré en AR (búsqueda del 2026-07-06) |
|---|---|---|
| Cobranzas pymes con IA | Upflow (USD 440/mes), Chaser (10.000+ usuarios) | **Moonflow** (landing es-AR activa) y **Colektia** (agente IA "Colly", publica ranking de software de cobranza AR) ya venden acá |
| Monitoreo GEO (visibilidad de marca en ChatGPT) | Profound: USD 6,8M revenue 2025, Serie C USD 96M a valuación USD 1.000M (Fortune, 24-feb-2026) | **GEO Metrics** (3.000 marcas, AR como mercado prioritario), **CreceRank** (prompts es-AR), **Mentio** (29€/mes) — el hueco en español ya se cerró |
| Paquete de demanda laboral con IA | EvenUp: Serie E USD 150M a valuación USD 2.000M+, 2.000+ estudios (Fortune, 7-oct-2025) | **Veredicta**, **RivoLegal**, **IA Laboral**, **Maite.ai** ya generan demandas/escritos laborales con IA para el foro argentino |
| IA para administración de consorcios | EliseAI: **USD 200M ARR**, 1 de cada 6 departamentos de EE.UU. (BusinessWire, 10-jun-2026) | **Simply/Simple Solutions** (chatbot WhatsApp de consorcios: expensas, reclamos, pagos) y **ConsorcioAbierto** con IA ya operan |
| Entrada de pedidos IA para distribuidoras | Choco OrderAgent: 21.000 distribuidores, 8,8M pedidos/año procesados (choco.com) | **Galo AI** (soygalo.com, específico para mayoristas de alimentos AR), **Duotach**, **Sellium** — tomado |

Los 6 que siguen **sobrevivieron** la misma verificación.

---

## 1. Disputa Ganada — recuperador automático de contracargos ⚖️

**Perfil:** ⚖️ mixto · **Realizable ahora: SÍ** · **Costo de arranque: BAJO** (el más barato de la ronda)

**Qué es (de cero):** cuando un cliente desconoce una compra con tarjeta, el comercio recibe un
"contracargo": le sacan la plata y tiene pocos días para presentar evidencia (entrega, chats,
factura) o la pierde. El 80% de los comercios chicos no contesta nunca — no sabe cómo ni tiene
tiempo. Disputa Ganada se conecta a Mercado Pago / TiendaNube, detecta el contracargo al instante,
junta la evidencia sola (tracking de envío, factura AFIP, mails/chats con el cliente) y presenta la
disputa armada. Cobra solo si recupera.

**1) Evidencia de que factura afuera:**
- **Chargeflow (EE.UU./Israel):** Serie A de USD 35M (nov-2025), **15.000+ comercios**, revenue 3×
  año contra año, **USD 100M+ recuperados**, fee del **25% solo sobre lo recuperado**, hasta 80% de
  éxito contra fraude amigo. Fuentes: PRNewswire 18-nov-2025; chargeflow.io/pricing.
- Mastercard proyecta **324M de contracargos anuales para 2028**; los comercios pierden USD 100.000M+/año.

**2) Verificación de competencia local (qué busqué):** "gestión contracargos Mercado Pago Argentina
servicio automatizado disputas ecommerce" (2026-07-06). Resultado: solo documentación de developers
de Mercado Pago (la API de contracargos existe y está documentada: campos `coverage_eligible`,
`documentation_required`), notas educativas de Real Trends y del Centro de Vendedores de MELI.
**Ningún servicio local que automatice la respuesta al contracargo.** Hueco real.

**3) SAM/SOM AR:** TiendaNube declara ~150.000 tiendas activas en AR (dato público de la empresa,
2025) + vendedores MELI/MP con checkout propio. Tasa de contracargo típica e-commerce: 0,3–0,6% de
transacciones (industria, estimado). SAM: comercios con 5+ contracargos/mes ≈ 15.000–25.000
(estimado). **SOM año 1: 50–80 comercios activos** vía app de TiendaNube y grupos de sellers.

**4) Lente MARKETING:** canal dominante = **marketplace de apps de TiendaNube** (distribución
gratis dentro de la plataforma, igual que Chargeflow arrancó como app de Shopify) + grupos de
Facebook/WhatsApp de vendedores MELI (masivos y activos). El success fee elimina la fricción de
venta ("si no recupero, no pagás"). **Paid innecesario al inicio** — no hay CAC que cerrar porque
el canal orgánico es la propia plataforma. Cierra.

**5) Lente DESAFIADOR (triple filtro):**
1. *"Mercado Pago puede mejorar su producto nativo o cerrarte la API"* — riesgo de plataforma real
   e ineludible; mitigación: multi-adquirente desde el día 1 (Payway/Prisma, Getnet, Ualá Bis) para
   no depender de MP. Aún así, es la espada de Damocles del negocio.
2. *"¿La tasa de éxito AR es como la de EE.UU.?"* — desconocida: acá deciden Prisma y los bancos
   emisores con reglas opacas. Respuesta: piloto de 10 comercios midiendo win-rate real ANTES de
   escalar; si recupera <30%, el fee no paga la operación y se mata.
3. *"Volumen por comercio bajo: 8 casos/mes × $24.000 no es negocio por cliente"* — cierto: es
   negocio de MASA vía integración, no de venta 1 a 1. Si la app de TiendaNube no se aprueba, el
   CAC manual lo mata.
- **Veredicto honesto: GO piloto.** El mejor ratio evidencia/costo de la ronda. Build 2–3 semanas
  porque la API está documentada. Éxito atado al win-rate real: medir antes de escalar.

**Cómo se cobra:** 25% de lo recuperado (ticket promedio contracargo estimado $95.000 → fee
~$24.000 ≈ USD 16 por caso ganado). Sin abono.
**Números:** build 2–3 semanas · COGS ~cero (API + LLM centavos) · margen ~90% · 50 comercios × 8
casos/mes × 55% éxito × $24.000 ≈ **$5,3M/mes** (~USD 3.500) escenario base año 1.
**Índice honesto: 48.**

---

## 2. Escriba — el escriba médico IA argentino 💥

**Perfil:** 💥 alto beneficio · **Realizable ahora: SÍ** · **Costo de arranque: BAJO**

**Qué es (de cero):** el médico atiende y la app escucha (con consentimiento del paciente). Al
terminar la consulta, la historia clínica ya está escrita: evolución, diagnóstico presuntivo,
indicaciones, receta lista para firmar. El médico revisa, toca "aprobar" y pasa al siguiente
paciente. Le devuelve 1–2 horas por día de tipeo.

**1) Evidencia de que factura afuera:** es LA categoría de IA vertical que más factura en el mundo:
- **Abridge:** USD 100M ARR (may-2025, est. Sacra), 60.000 médicos, 100+ sistemas de salud, ~USD
  2.500/médico/año; levantó USD 300M a valuación USD 5.300M (jul-2025).
- **Freed:** USD 19M ARR (mar-2025, est. Sacra, +134% i.a.) cobrando **USD 99/mes por médico** al
  consultorio independiente — exactamente el segmento que existe en AR.

**2) Verificación de competencia local (qué busqué):** "escriba médico IA Argentina consultorio
transcripción historia clínica" (2026-07-06). Resultado: **un proyecto individual** ("La Historia
Clínica Digital", médico cordobés con Gemini, nota de Perfil — sin empresa escalada detrás) y
globales con español genérico (Tandem Health, Dorascribe, Carepatron, Invox) **sin localización
AR**: ni español rioplatense clínico, ni receta/orden para obras sociales, ni precio en pesos, ni
cumplimiento Ley 26.529/25.326 local. Hueco real pero **parcial** (la categoría global corre rápido).

**3) SAM/SOM AR:** ~180.000 médicos matriculados AR (REFEPS/SISA); en consulta privada con poder de
decisión propio ~50.000–60.000 (estimado). SAM (pagarían USD 20–30/mes): ~15.000. **SOM año 1:
150–300 médicos**, entrando por estética, odontología y especialidades jóvenes (sinergia directa
con estetica-erp: clientes y canal ya existen en casa).

**4) Lente MARKETING:** canal = Instagram médico (los médicos jóvenes viven ahí y son segmentables
en Meta Ads), comunidades de especialidad y boca a boca clínico (el driver #1 de Freed). Prueba
gratis de 10 consultas = el "aha" es inmediato. Con LTV 12 meses ≈ USD 360 y CAC Meta estimado USD
40–70 por trial→pago, **el paid cierra** si la conversión trial→pago supera ~25%. Cierra con datos
a validar en el piloto.

**5) Lente DESAFIADOR (triple filtro):**
1. *"Heidi/Tandem/Nabla agregan español rioplatense mañana y te pisan"* — el moat NO es transcribir:
   es la plantilla por especialidad argentina, la receta con nomenclador y obra social, el precio
   en pesos con Mercado Pago y el soporte por WhatsApp. Aún así el moat es fino: hay 12–18 meses de
   ventana, correr.
2. *"El médico argentino de 55 no adopta"* — cierto; el target es el sub-40 y las verticales estética/
   odonto donde ya tenemos distribución. No venderle al hospital público (bloqueado por integración
   nacional, confirmado en la nota de Perfil).
3. *"Datos de pacientes = riesgo legal"* — consentimiento explícito, no persistir audio, datos en
   reposo cifrados, DPA firmable. Costo de compliance bajo pero NO opcional.
- **Veredicto honesto: GO.** Mejor evidencia global de toda la ronda y sinergia única con el ERP de
  estética. La ventana contra los globales es la única cuenta regresiva.

**Cómo se cobra:** $45.000/mes por médico (~USD 30; Freed cobra USD 99 — localización 3× más
barata). Plan clínica $180.000/mes hasta 6 profesionales.
**Números:** build 3–4 semanas · COGS ~USD 8–15/médico/mes (STT + LLM por ~200 consultas) · margen
~65% · 200 médicos = **$9M/mes** (~USD 6.000) escenario base año 1.
**Índice honesto: 46.**

---

## 3. Débito Devuelto — la refacturación de débitos de obras sociales, automática ⚖️

**Perfil:** ⚖️ mixto (ticket alto, venta consultiva) · **Realizable ahora: SÍ** · **Costo de arranque: BAJO-MEDIO**

**Qué es (de cero):** cuando una clínica factura a una obra social, la OS "debita" (rechaza) entre
un 5% y un 10% de la facturación por errores de forma: falta un código, una firma, una
autorización. La clínica tiene ~30 días para "refacturar" (apelar con papeles) o pierde la plata.
Hoy eso lo hace a mano una jefa de facturación tapada de trabajo — y mucho se pierde por no llegar.
Débito Devuelto lee los débitos de cada OS, detecta cuáles son recuperables, arma el expediente de
refacturación completo y lo deja listo para presentar dentro del plazo. Cobra un % de lo recuperado.

**1) Evidencia de que factura afuera:** en EE.UU. "denial management" con IA es una categoría que
explota: **Adonis** creció su revenue **4× en 2025** con net retention >130% y levantó USD 40M
(AlleyWatch, mar-2026); **SmarterDx** lanzó SmarterDenials (apelaciones clínicas generadas por IA).
Contexto: 15% de los claims se rechazan al primer intento y los hospitales gastan USD 20.000M/año
en pelearlos (PRNewswire/HFMA 2025). El mismo problema existe acá con otro nombre: débitos.

**2) Verificación de competencia local (qué busqué):** "débitos obras sociales refacturación
prestadores software Argentina facturación médica Traditum" (2026-07-06). Resultado: **Traditum**
es el rail transaccional (validación de afiliados, autorizaciones, pagos) — **no arma apelaciones**;
el resto son consultoras HUMANAS de facturación médica y manuales de procedimiento de cada OS
(APROSS, Medifé: "la refacturación no puede exceder 30 días del débito"). **Nadie lo hace con IA.**
Hueco real.

**3) SAM/SOM AR:** ~9.000 establecimientos de salud privados con internación/ambulatorio (ADECRA +
registros SSSalud, estimado). Clínica mediana factura $80–200M/mes a OS; débitos 5–10% = $4–20M/mes
en juego por clínica. SAM (clínicas y centros de diagnóstico medianos): ~3.000. **SOM año 1: 10–20
clínicas.**

**4) Lente MARKETING:** venta consultiva directa — el ticket lo banca: gerentes de administración y
jefas de facturación, cámaras (ADECRA/CEDIM), LinkedIn + referidos entre administradores. El pitch
es una auditoría gratis: "dame tus débitos del mes pasado y te digo cuánta plata dejaste en la
mesa". **Paid no aplica y no hace falta** — 20 clientes es un pipeline artesanal. Cierra.

**5) Lente DESAFIADOR (triple filtro):**
1. *"Cada obra social manda el débito en un formato distinto (PDF, Excel, papel)"* — verdad y ES la
   barrera de entrada una vez resuelta. Estrategia: empezar con 5 pagadores grandes (PAMI, IOMA,
   OSDE, Swiss, Galeno) que concentran la mayoría del débito, y sumar formatos con cada cliente.
2. *"La jefa de facturación te ve como amenaza y bloquea la venta"* — se vende como HERRAMIENTA de
   ella (ella firma, ella presenta, ella muestra el recupero a la dirección), nunca como reemplazo.
   Si el pitch va al dueño puenteándola, el churn es seguro.
3. *"El plazo de 30 días te convierte en responsable: si tu sistema se demora, la clínica pierde
   plata y te culpa"* — SLA operativo con alertas, y contrato que delimita: el sistema PREPARA, la
   clínica presenta. Riesgo reputacional gestionable pero real.
- **Veredicto honesto: GO consultivo.** El de mayor facturación por cliente de la ronda y el moat
  más defendible (biblioteca de formatos + reglas por OS). Más lento de vender: primer peso en mes 2–3.

**Cómo se cobra:** 20% de lo recuperado + abono $150.000/mes (~USD 100) que se descuenta del fee.
Clínica mediana: recupero $2–4M/mes → fee $400–800k/mes.
**Números:** build 4–6 semanas · margen ~85% · 10 clínicas × $500k = **$5M/mes** (~USD 3.400)
escenario base año 1.
**Índice honesto: 45.**

---

## 4. Costo al Plato — food-cost automático desde la foto de la factura 🌱

**Perfil:** 🌱 pasivo sustentable (SaaS bajo mantenimiento post-build) · **Realizable ahora: SÍ** · **Costo de arranque: BAJO**

**Qué es (de cero):** el gastronómico saca una foto a la factura del proveedor (o reenvía el PDF
por WhatsApp) y el sistema lee cada renglón, actualiza el costo de cada ingrediente, recalcula el
costo real de cada plato de la carta y avisa: "la milanesa te está dejando 12% menos margen que el
mes pasado; para mantener margen tiene que costar $X". En un país con inflación, la carta se
desactualiza todas las semanas — este es el anclaje local que un player global no tiene.

**1) Evidencia de que factura afuera:**
- **MarginEdge (EE.UU.):** **10.000+ restaurantes**, 10M+ facturas/año procesadas, **USD 350/mes
  por local** (marginedge.com/pricing); en 2025 amplió su suite de IA (BusinessWire, 7-ago-2025).
- La categoría "invoice → food cost" es estándar en EE.UU. (xtraChef/Toast, MarginEdge) y no existe
  automatizada en AR.

**2) Verificación de competencia local (qué busqué):** "software food cost gastronomía Argentina
escandallo recetas costos factura proveedor" (2026-07-06). Resultado: **bcnsoft/bcnresto** actualiza
costos cuando CARGÁS la factura A MANO; **Sistar** (panaderías) similar; planillas Excel de food
cost gratis; AI Chef Pro (herramienta española de recetas con IA, sin OCR de facturas AR ni
integración). **Nadie hace OCR automático de factura + recosteo + alerta de reprecio.** Hueco real
pero **parcial** (los POS locales podrían agregarlo).

**3) SAM/SOM AR:** ~50.000 establecimientos gastronómicos AR (FEHGRA, estimado); con gestión activa
de costos (2+ locales o chef-dueño profesionalizado): ~8.000 (estimado). **SOM año 1: 80–120
locales.**

**4) Lente MARKETING:** el "aha" se demuestra en la demo: "mandame 5 facturas tuyas por WhatsApp y
te muestro tu food cost real hoy". Canales: alianzas con distribuidores gastronómicos y contadores
del rubro (les da valor a ellos), grupos de gastronómicos, contenido IG "cuánto te cuesta de verdad
cada plato con esta inflación". Paid Meta a dueños gastronómicos: CAC estimado USD 50–90 — contra
LTV 12 meses USD 440, **cierra**, pero el canal socios es más barato y da confianza.

**5) Lente DESAFIADOR (triple filtro):**
1. *"Fudo o Maxirest lo agregan como feature y te comoditizan"* — riesgo real: son los POS
   dominantes. Mitigación: integrarse a ELLOS (leer ventas de su API) y ser la capa de costos que
   ninguno prioriza; y correr rápido en el nicho multi-local.
2. *"El gastronómico argentino no paga software"* — el unipersonal no; el de 2+ locales que ya
   siente la sangría sí (es el cliente de bcnsoft y Fudo hoy). Target acotado y consciente.
3. *"Proveedores informales sin factura: ¿qué leés?"* — remitos manuscritos y listas de precios por
   WhatsApp: el LLM de visión los lee igual — eso es exactamente lo que MarginEdge NO puede hacer
   acá y un moat técnico chico pero real.
- **Veredicto honesto: GO nicho.** No es cohete: es 🌱 — SaaS estable, bajo mantenimiento, churn
  bajo si el dato es bueno. Encolado detrás de Disputa Ganada y Escriba solo por tamaño de ticket.

**Cómo se cobra:** $55.000/mes por local (~USD 37; MarginEdge cobra USD 350 — 10× menos por
localización). Multi-local: $40.000/local adicional.
**Números:** build 4–5 semanas · COGS ~USD 3/local/mes (OCR+LLM ~150 facturas) · margen ~80% · 100
locales = **$5,5M/mes** (~USD 3.700) escenario base año 1.
**Índice honesto: 42.**

---

## 5. Cómputo Exprés — presupuesto de obra con IA en minutos, con precios argentinos vivos 💥

**Perfil:** 💥 alto beneficio · **Realizable ahora: SÍ** · **Costo de arranque: BAJO-MEDIO**

**Qué es (de cero):** el arquitecto o maestro mayor de obra sube el plano, fotos o un audio
describiendo la reforma ("baño completo de 2×2, cambio cañerías, porcelanato") y la IA devuelve el
cómputo y presupuesto completo: materiales con cantidades, precios actualizados de corralones,
mano de obra por rubro, y un PDF presentable al cliente. Lo que hoy lleva 2–4 días de Excel, en
minutos. Con la inflación, el presupuesto viejo de 30 días es papel mojado — el reprecio automático
es el gancho local.

**1) Evidencia de que factura afuera:**
- **Handoff (EE.UU., YC):** estimador IA para remodeladores — **40.000+ contratistas**, entrenado
  con 100.000+ presupuestos reales y 60M+ SKUs con precios por código postal; USD 25M+ levantados
  (1build/Handoff, handoff.ai + YC, 2025). Cobra suscripción mensual por contratista.
- Categoría "AI estimating" en construcción residencial: una de las de mayor tracción SMB 2025.

**2) Verificación de competencia local (qué busqué):** "software presupuesto obra cómputo Argentina
precios materiales construcción actualizado inflación" (2026-07-06). Resultado: **Sismat** (base de
precios 2026), **DataObra**, **Quercusoft**, **ACP**, **Foco en Obra**, **Nuqlea** (ecosistema de
compra de materiales) — todos exigen **cómputo manual**: el profesional carga ítem por ítem y el
software solo organiza y precia. **Nadie genera el cómputo desde el plano/foto con IA.** Hueco real
en el WORKFLOW (no en los datos, que ya existen y son insumo comprable/scrapeable).

**3) SAM/SOM AR:** ~90.000 arquitectos matriculados + MMO + constructores pymes (colegios
provinciales, estimado); presupuestando activamente ~30.000 (estimado). **SOM año 1: 150–300
usuarios pagos** (freemium: 1 cómputo gratis/mes).

**4) Lente MARKETING:** Google Search "presupuesto de obra" / "cómputo y presupuesto" tiene
intención pura y CPC bajo en AR — **paid cierra** contra $40.000/mes si la conversión free→pago
supera 5%. Canales orgánicos: YouTube/IG de arquitectura y oficios (categoría enorme en AR),
colegios de arquitectos (charlas), y el freemium viral: el PDF lleva marca de agua "hecho con
Cómputo Exprés" — cada presupuesto enviado es un anuncio al cliente y a otros colegas.

**5) Lente DESAFIADOR (triple filtro):**
1. *"Si el cómputo da mal UNA vez, el profesional no vuelve"* — el riesgo #1. Mitigación: mostrar
   rangos y supuestos editables (la IA propone, el profesional ajusta y valida), nunca venderlo
   como oráculo. Handoff hace exactamente eso.
2. *"Nuqlea o un player con capital lo agrega"* — Nuqlea está enfocada en la COMPRA de materiales
   para obra nueva; el nicho remodelación/profesional independiente les queda chico. Ventana real
   pero no eterna: 12–18 meses.
3. *"Los precios argentinos son un blanco móvil"* — cierto, y por eso es moat: pipeline semanal de
   actualización (corralones online + índice CAC) que un global no va a mantener nunca para AR.
   Costo operativo del scraping: bajo pero permanente.
- **Veredicto honesto: GO con guardas de precisión.** El de mayor potencial de escala orgánica
  (freemium viral) pero build más largo y precisión crítica. Encolado detrás de los cuatro anteriores.

**Cómo se cobra:** $40.000/mes plan pro ilimitado (~USD 27) o $12.000 por cómputo suelto (~USD 8).
**Números:** build 5–6 semanas · COGS ~USD 0,5–1 por cómputo (visión+LLM) · margen ~80% · 150
usuarios pro = **$6M/mes** (~USD 4.000) escenario base año 1.
**Índice honesto: 40.**

---

## 6. Carga al Día — el agente IA que atiende la operación del transportista ⚖️

**Perfil:** ⚖️ mixto · **Realizable ahora: SÍ (con venta lenta)** · **Costo de arranque: MEDIO**

**Qué es (de cero):** una empresa de transporte de cargas mediana vive del teléfono y WhatsApp:
clientes pidiendo cotización, dadores preguntando "¿dónde está el camión?", choferes avisando
demoras. Carga al Día es un agente IA que atiende ese WhatsApp: cotiza al instante con el tarifario
de la empresa (origen-destino, tipo de carga, peso), coordina turnos de carga/descarga, le pide la
ubicación al chofer por audio y le avisa solo al cliente ("tu carga llega 14:30"). El dueño deja de
ser el call center de su propia empresa.

**1) Evidencia de que factura afuera:**
- **HappyRobot (EE.UU./fundadores españoles):** AI workers para logística (llamadas, mails, check
  calls, cotización) — **revenue USD 10M+**, creció 10× en 2025, Serie B USD 44M a valuación ~USD
  500M (Sacra; FreightWaves 3-sep-2025). Clientes reportan cobranzas 119× la inversión.
- **Vooma:** copiloto IA para brokers y carriers (quoting + scheduling), respaldado por a16z.

**2) Verificación de competencia local (qué busqué):** "transporte cargas Argentina cotizador
automático IA seguimiento camiones WhatsApp dadores carga software" (2026-07-06). Resultado:
**Avancargo** (TMS/3PL digital), **Carga GO**, **Mi Carga**, **Humber** — todos **marketplaces o
TMS**: conectan carga con camión o gestionan flota. El GPS lo resuelven Sitrack y similares.
**Nadie vende el AGENTE DE COMUNICACIÓN** (cotización + check calls + aviso al cliente por
WhatsApp/voz). Hueco real en la capa de comunicación.

**3) SAM/SOM AR:** ~45.000 empresas de transporte de cargas (FADEEAC agrupa ~4.500 empresas + una
larga cola de monotributistas; estimado). Target: medianas de 10–50 camiones con tráfico de
cotizaciones diario ≈ 3.000–4.000 (estimado). **SOM año 1: 8–15 clientes.**

**4) Lente MARKETING:** venta consultiva vía cámaras (FADEEAC y federaciones provinciales), casos
con métrica dura ("el agente atendió 400 consultas este mes, tu gente cerró viajes en vez de
contestar dónde está el camión") y referidos entre transportistas (rubro chico y conversador. El
que funciona, se comenta). **Paid no aplica.** Ciclo de venta 30–60 días: es el más lento de la
ronda y por eso va último en la cola.

**5) Lente DESAFIADOR (triple filtro):**
1. *"El chofer no adopta nada"* — por eso TODO es WhatsApp y audio: el chofer manda un audio como
   ya hace hoy, la IA lo estructura. Cero apps nuevas. Si igual no responde, el agente escala al
   humano — el producto degrada con gracia.
2. *"El seguimiento ya lo resuelve el GPS (Sitrack etc.)"* — cierto, y NO competimos ahí: el valor
   es la COMUNICACIÓN (cotizar en 2 minutos a las 22h, avisar al cliente sin que nadie llame). Se
   integra al GPS existente, no lo reemplaza.
3. *"Voz + WhatsApp API = COGS alto y el rubro paga poco"* — regla de la célula: lo conversacional
   se cobra POR USO, nunca flat. Piso $150.000/mes + $1.500 por viaje gestionado por encima de 100
   viajes. Si el cliente no llega a 100 viajes/mes, no es cliente.
- **Veredicto honesto: GO cauto, encolado al final.** Evidencia global fuerte y hueco local limpio,
  pero venta artesanal, ticket que exige madurez del cliente y COGS de voz a vigilar. Es el
  negocio a arrancar cuando los 3 primeros ya facturan.

**Cómo se cobra:** $250.000/mes por empresa (~USD 168) con 100 viajes incluidos + $1.500/viaje extra.
**Números:** build 4–5 semanas · margen ~70% (voz) · 10 clientes = **$2,5M/mes** (~USD 1.700)
escenario base año 1.
**Índice honesto: 36.**

---

## Cola recomendada (realizable-ahora + barato primero)

| # | Negocio | Perfil | Índice | Build | 1er peso | Por qué en este orden |
|---|---|---|---|---|---|---|
| 1 | **Disputa Ganada** | ⚖️ | 48 | 2–3 sem | sem 4 | API documentada, success fee sin fricción, canal TiendaNube gratis |
| 2 | **Escriba** | 💥 | 46 | 3–4 sem | sem 5–6 | Mejor evidencia global (USD 100M ARR), sinergia con estetica-erp |
| 3 | **Débito Devuelto** | ⚖️ | 45 | 4–6 sem | mes 2–3 | Mayor ticket por cliente, moat de formatos; venta más lenta |
| 4 | **Costo al Plato** | 🌱 | 42 | 4–5 sem | sem 6 | Pasivo sustentable, anclaje inflación; ticket chico |
| 5 | **Cómputo Exprés** | 💥 | 40 | 5–6 sem | sem 7 | Escala freemium viral; precisión crítica, build más largo |
| 6 | **Carga al Día** | ⚖️ | 36 | 4–5 sem | sem 6–8 | Hueco limpio pero venta consultiva lenta y COGS de voz |

## Fuentes principales (consultadas 2026-07-06)

- Abridge/Freed ARR: [Sacra — Abridge](https://sacra.com/c/abridge/), [Sacra — Freed](https://sacra.com/c/freed/), [Fierce Healthcare (Serie D USD 250M)](https://www.fiercehealthcare.com/ai-and-machine-learning/abridge-scores-250m-series-d-ambient-ai-tech-now-use-100-health-systems)
- Chargeflow: [PRNewswire 18-nov-2025 (Serie A USD 35M, 15.000 merchants, revenue 3×)](https://www.prnewswire.com/news-releases/chargeflow-raises-35m-series-a-to-scale-ai-powered-chargeback-automation-platform-for-global-enterprise-merchants-302618744.html), [Pricing 25% success fee](https://www.chargeflow.io/pricing)
- MarginEdge: [Sitio + pricing USD 350/mes, 10.000 restaurantes](https://www.marginedge.com/pricing/), [BusinessWire 7-ago-2025 (AI suite)](https://www.businesswire.com/news/home/20250807784740/en/)
- Adonis / SmarterDx: [AlleyWatch mar-2026 (USD 40M, revenue 4× en 2025)](https://www.alleywatch.com/2026/03/adonis-ai-healthcare-payments-revenue-cycle-orchestration-platform-akash-magoon/), [PRNewswire SmarterDenials](https://www.prnewswire.com/news-releases/smarterdx-launches-smarterdenials-ai-appeals-to-help-hospitals-fight-payer-denials-302288518.html)
- Handoff: [handoff.ai (40.000 contratistas)](https://www.handoff.ai/), [Y Combinator](https://www.ycombinator.com/companies/handoff)
- HappyRobot: [Sacra (revenue USD 10M+, valuación USD 500M)](https://sacra.com/c/happyrobot/), [FreightWaves 3-sep-2025 (Serie B USD 44M)](https://www.freightwaves.com/news/happyrobot-raises-44m-to-revolutionize-supply-chains)
- Descartes (competencia local encontrada): [Moonflow es-AR](https://www.moonflow.ai/es-ar/blog/mejores-software-de-cobranzas), [Colektia](https://colektia.com/blog/mejores-software-cobranza-argentina), [GEO Metrics 3.000 marcas](https://ecosistemastartup.com/geo-metrics-3-000-marcas-ya-optimizan-para-chatgpt/), [Veredicta IA](https://veredicta.com.ar/soluciones/herramientas-ia), [EliseAI USD 200M ARR](https://www.businesswire.com/news/home/20260610244988/en/EliseAI-Hits-$200M-ARR-After-Five-Consecutive-Years-of-100-Growth-Across-Housing-and-Healthcare), [Simply consorcios](https://www.iprofesional.com/negocios/395267-la-pegaron-con-una-idea-genial-crearon-chatbot-para-consorcios), [Choco OrderAgent](https://choco.com/us/orderagent), [Galo AI](https://www.soygalo.com/)
- Verificación de hueco AR: [Mercado Pago API contracargos](https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/chargebacks/how-to-manage), [Perfil (HC digital cordobesa)](https://www.perfil.com/noticias/cordoba/medico-cordobes-ideo-un-sistema-de-historia-clinica-con-ia-para-que-el-profesional-no-pierda-la-mirada-del-paciente.phtml), [bcnsoft food cost](https://bcnsoft.com.ar/blog/food-cost-gastronomia-guia-completa/), [Traditum SGP](https://institucional.traditum.com/sgp/), [Sismat](https://sismat.com.ar/), [Avancargo](https://avancargo.com/)

> **Nota de método (ingeniería de datos):** las cifras globales tienen fuente y fecha; los SAM/SOM
> AR marcados "(estimado)" salen de padrones públicos aproximados y deben refinarse antes de
> cualquier GO definitivo. Dólar oficial $1.488,50. Ningún número de este documento tocó la DB de
> producción.
