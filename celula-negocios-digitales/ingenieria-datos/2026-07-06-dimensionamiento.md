# Dimensionamiento con datos duros — cartera de producción y 🟡 Ronda 1

> **Ingeniería de Datos · Célula de Negocios Digitales — Gestión Studio Grow · 2026-07-06.**
> Objetivo: darle **rigor cuantitativo con fuentes reales** a los análisis de mercado que hasta ahora
> corrían con corazonadas. Para cada negocio candidato a producción (Kudos, Testigo, Fantasma,
> Plantillería) y los 🟡 más fuertes de la Ronda 1 (Recepcionista IA, Back-office AFIP): **TAM/SAM/SOM
> con método explícito**, señal de demanda medible, chequeo de los break-even del análisis previo contra
> el SAM real, y oportunidad de integración pública/privada.
>
> **Reglas:** mercado local argentino primero; cada número trae fuente + método; lo que no tiene fuente
> dura va marcado **(estimado)**. Dólar oficial BNA venta al 06/07/2026 ≈ **$1.488,50** (para pasar
> precios USD↔ARS). Todo LOCAL — no se tocó prod, git ni deploy.

---

## 0. Universo de datos base (los "padrones madre" que alimentan todos los TAM)

Antes de dimensionar negocio por negocio, esta es la fotografía dura del mercado pyme/comercio argentino
que sirve de denominador. **Todas las cifras de abajo salen de acá.**

| Padrón / universo | Cifra | Fecha | Fuente | Nota de método |
|---|---:|---|---|---|
| Empresas **empleadoras** registradas | **~525.500** (98% pymes ≈ 515.600) | abr-2025 | UCEMA s/ AFIP+seg. social | Solo firmas con empleados en blanco. Otra fuente (LHH) cita ~605.000 "activas" con criterio más amplio. |
| **Monotributistas activos** | **~4.000.000** (algunas notas citan "+2 millones" con criterio más estricto) | 2025-26 | ARCA / prensa económica | Universo natural de "unipersonales/servicios". Rango 2–4 M según se cuente inscriptos vs. activos → se usa **4 M** como techo y 2 M como piso conservador. |
| Establecimientos **gastronómicos** | **67.000** (+17.000 hoteleros) | 2024-25 | FEHGRA | Afiliados/nucleados; es piso, el universo real con informalidad es mayor. |
| **Peluquerías / salones de belleza / estética** | **42.000–50.000** (~1 cada 1.000 hab.) | 2025-26 | Beauty Market / Rodolfo Urrea | Sector ≈ US$756 M/año, ~1% del PBI. 80% microemprendimientos. |
| **Matriculados** en Cs. Económicas (contadores + afines) | **+70.000** solo CPCE-CABA | 2025 | CPCECABA | Nacional (24 consejos, FACPCE) es varias veces mayor. Cada contador ≈ cartera de 20–100 pymes. |
| **Penetración WhatsApp** | 40 M usuarios · 90% de smartphones · **74% ya interactuó con un negocio** por WhatsApp | 2025-26 | La Nación / Blip / Chatsell | Es el canal de facto de la pyme AR → denominador de Fantasma. |
| **Control de plagas** — cámaras | CAECPLA (1995, CABA), CAEMIP (Santa Fe/centro), UCABA | — | Nosis / cámaras | **No hay padrón nacional único publicado**; el registro es municipal/provincial (ver Testigo). |

---

## 1. KUDOS — reseñas en piloto automático 🟢

**Break-even previo:** 34–50 locales para US$5.000/mes (precio US$99–149/local).

### TAM / SAM / SOM
- **TAM — comercios AR con atención al público y potencial de ficha en Google:** gastronomía (67.000) +
  estética/peluquería (42–50.000) + comercio minorista + salud + servicios. Tomando el universo de
  firmas con local de cara al cliente, **TAM ≈ 400.000–500.000 locales (estimado**, cruzando FEHGRA +
  beauty + el grueso de las ~525k empleadoras que son comercio/servicio).
- **SAM — locales con ficha de Google Business Profile *activa y con reseñas*** (los que ya juegan el
  juego de la reputación y por lo tanto son vendibles): Google no publica el dato para AR, pero con 40 M
  de usuarios y adopción altísima de Maps, una tasa de reclamo de ficha del 40–60% en rubros con público
  da **SAM ≈ 150.000–250.000 locales (estimado)**. Rubros faro con densidad de reseñas alta: gastronomía,
  estética, salud, hotelería.
- **SOM (12–18 meses, venta sin equipo comercial):** con un ritmo de venta artesanal de estudio chico,
  **100–300 locales** → **US$10k–40k/mes**. Es el **0,04–0,2% del SAM**.

### Señal de demanda
- El sector global de **Online Reputation Management** vale US$6,88 B (2025) creciendo 12,6% anual
  (Mordor) → la categoría está en expansión, no madura.
- Competencia local que **valida el pago** pero deja techo de precio: Birdeye US$299–449/local; gmbapi
  desde US$7; Localo gratis. Kudos entra a **1/3 del líder** → hay hueco de precio real.

### Chequeo de unit economics
- El break-even de **34–50 locales es el 0,02–0,03% del SAM** (150–250k). **Es irrisorio.** El mercado
  no es el limitante ni de lejos: para fundir el negocio por falta de mercado habría que no vender ni 1 de
  cada 3.000 locales elegibles.
- **Veredicto de datos: CONFIRMA con holgura enorme.** El número previo era **conservador en tamaño**.
  El cuello de botella es 100% **distribución/venta**, no demanda — exactamente lo que dijo el red-team.

### Integración pública/privada
- **Google Business Profile API** (privada) es el rail obligatorio. Riesgo de comoditización nativa ya
  señalado. Sin integración pública relevante; el moat es relación + servicio gestionado, no dato público.

---

## 2. TESTIGO — parte de trabajo desde foto+audio 🟢

**Break-even previo:** 35–50 cuadrillas para US$5.000/mes (US$15–30/operario; contratista de 5 ≈ US$75–150).

### TAM / SAM / SOM
- **TAM — field service AR** (plomería, obra, jardinería, refrigeración, fumigación, mantenimiento):
  cientos de miles de operarios/contratistas dentro de las 525k empleadoras + monotributistas de oficios.
  **TAM ≈ 50.000–100.000 cuadrillas/contratistas (estimado).**
- **SAM — rubro faro control de plagas/fumigación** (elegido porque bromatología **exige** el parte →
  cero evangelización): **no hay padrón nacional publicado**. El registro es **municipal/provincial**
  (ej. CABA: *Registro de Empresas Privadas de Desinsectación y Desinfección* — APRA; cada municipio del
  GBA e interior tiene el suyo). Cruzando cámaras (CAECPLA/CAEMIP/UCABA) + densidad de registros
  jurisdiccionales, estimo **3.000–6.000 empresas formales de control de plagas en AR (estimado)**,
  más un colchón informal.
- **SOM del rubro faro:** **60–150 empresas** en 12–18 meses → el **1–3% del SAM del vertical**.

### Señal de demanda
- Mercado LATAM de control de plagas: **US$2.644 M (2023)**, CAGR 5,6% → US$4.325 M en 2032
  (Informes de Expertos). Sector en crecimiento con obligación regulatoria de documentar.
- **Demanda regulatoria dura:** el parte de servicio es **requisito de habilitación bromatológica** para
  todo local gastronómico (67.000) e industria alimentaria → el cliente del fumigador *ya le exige* el
  papel. Eso es señal de demanda no elástica (no depende de "ganas", es cumplimiento).

### Chequeo de unit economics
- Break-even de **35–50 cuadrillas = 0,6–1,7% del SAM del rubro faro** (3–6k). **Alcanzable, pero
  ajustado**: a diferencia de Kudos, acá el SAM del vertical único es chico. Llegar a US$5.000/mes es
  factible; **crecer mucho más allá exige abrir un segundo vertical** (jardinería, refrigeración).
- **Veredicto de datos: CONFIRMA el break-even, pero el dato ACHICA el techo por vertical.** Ratifica al
  pie de la letra el diagnóstico del red-team ("ramp lento por rubro / dispersión"): el negocio da los
  números en fumigación, pero el crecimiento está capado por lo estrecho del padrón hasta sumar rubros.

### Integración pública/privada
- **Oportunidad concreta:** integrar el parte con los **registros municipales de control de plagas** y
  con la **presentación bromatológica** (el PDF de Testigo como comprobante aceptable ante inspección).
  Si el parte se vuelve el formato que el inspector espera, el switching cost se dispara. Integración
  pública **cuantificable y defendible** — es el mejor moat de la cartera.

---

## 3. FANTASMA — "turno noche" de WhatsApp 🟡

**Break-even previo:** ~25 clientes para US$5.000/mes (pricing por uso: Básica US$120 / Pro US$249 / Full US$399).

### TAM / SAM / SOM
- **TAM — pymes AR con WhatsApp y consultas fuera de horario:** con **40 M de usuarios**, 90% de
  penetración y **74% de argentinos que ya le escriben a negocios por WhatsApp**, prácticamente **todas
  las ~525k empleadoras + el grueso de los 4 M de monotributistas con clientes** son TAM. **TAM
  efectivo ≈ 300.000–500.000 negocios (estimado)** con volumen real de mensajes.
- **SAM — vertical elegido (gastronomía nocturna / delivery / turnos)**: de los 67.000 gastronómicos,
  los que operan de noche/fin de semana con flujo de consultas (delivery, reservas, pedidos):
  **15.000–25.000 (estimado)**. Sumando estética con reservas fuera de hora, el SAM del wedge sube más.
- **SOM:** **50–120 clientes** en 12 meses → **US$10k–30k/mes**. Es el **0,2–0,8% del SAM**.

### Señal de demanda
- **85% de crecimiento** interanual (2025) en transacciones cerradas dentro de conversaciones de WhatsApp
  en LATAM (Meta); +18% de uso de WhatsApp como canal comercial (Infobip). Tasa de apertura 98%.
- La demanda está **medida y creciendo**; el canal es donde la pyme AR ya vive.

### Chequeo de unit economics
- Break-even de **25 clientes = 0,1% del SAM del vertical**. Trivial en tamaño.
- **La trampa NO es el mercado, es el COGS:** el análisis previo ya lo blindó bien. Con 200–400
  conversaciones/mes de un heavy user (pizzería/e-comm nocturno) el COGS trepa a US$60–120 → el pricing
  por uso (tope + excedente) es **obligatorio** y está bien calibrado (excedente > COGS).
- **Veredicto de datos: CONFIRMA con holgura** en tamaño y demanda. El riesgo es competitivo
  (Aoki 300+ empresas, ConnectIA, Artics US$50–400) y de margen, no de mercado.

### Integración pública/privada
- **WhatsApp Business Platform** (Meta) es el rail — riesgo de plataforma real (baneos, cambios de precio
  de plantillas, y **WhatsApp AI nativo llegando a LATAM en 2026**). Sin integración pública. Privada:
  Mercado Pago para el cobro del link de pago dentro del chat.

---

## 4. PLANTILLERÍA — plantillas normativa AR 🟡

**Break-even previo:** meseta realista US$1.000/mes ≈ 37 ventas; US$5.000/mes ≈ ~185 ventas (US$25–75 c/u).

### TAM / SAM / SOM
- **TAM — universo de "control de monotributo":** **~4.000.000 de monotributistas activos** (piso
  conservador 2 M). Es un TAM masivo y con dolor recurrente (recategorización semestral).
- **SAM — monotributistas digitalmente activos que compran herramientas** (planillas Excel/Notion,
  apps): tomando 5–15% del padrón que resuelve su gestión con productos digitales, **SAM ≈
  200.000–600.000 (estimado)**. Sumar SKUs (sueldos, presupuestos por oficio) amplía el SAM a
  autónomos y micro-pymes.
- **SOM:** a puro orgánico sin audiencia previa, **20–200 ventas/mes** → **US$500–8.000/mes** según se
  resuelva o no la distribución. **0,01–0,1% del padrón anual.**

### Señal de demanda
- **Estacionalidad dura y predecible:** la recategorización de monotributo es **semestral (enero y
  julio)** → picos de búsqueda de "monotributo / categorías / recategorización" dos veces al año, sobre
  un stock de +4 M de contribuyentes. Es de los temas fiscales más buscados de AR (volumen exacto de
  Google Trends: **pendiente de medición directa en trends.google.com.ar** — *(estimado alto por tamaño
  del padrón + obligación recurrente)*).
- **Hueco de localización real:** no hay competidor directo de plantillas para monotributo/ARCA (el
  red-team ya lo confirmó); Gumroad/Lemon no dan tráfico.

### Chequeo de unit economics
- La meseta de **37 ventas/mes = 0,006–0,02% del SAM**. En tamaño, **el mercado sobra**.
- **Veredicto de datos: CONFIRMA el tamaño, pero el dato NO resuelve el verdadero cuello: la
  distribución.** El padrón gigante no vale nada sin canal orgánico propio (el caso feliz "US$1.800/mes"
  traía ~4.000 seguidores previos que el estudio no tiene). El dato **ratifica** el veredicto 🟡: negocio
  de COGS cero con techo de distribución, no de mercado.

### Integración pública/privada
- **Oportunidad pública cuantificable:** la plantilla puede consumir datos **abiertos de ARCA/AFIP**
  (topes y escalas de categorías, publicadas y actualizadas semestralmente) para **auto-actualizarse** →
  ese es el diferencial que ni Gumroad ni un PDF pirata pueden copiar sin mantenimiento continuo. El moat
  es la **actualización normativa automática**, no el archivo.

---

## 5. RECEPCIONISTA IA VERTICAL — voz+WhatsApp+agenda 🟡 (Ronda 1)

**Break-even previo:** ~15–25 clientes para US$5.000/mes (setup US$300–1.000 + US$150–500/mes).

### TAM / SAM / SOM
- **TAM — negocios de turnos con recepción:** peluquerías/estética **42.000–50.000** + consultorios
  médicos/odontológicos/kinesiología (decenas de miles más) + centros de bienestar. **TAM ≈
  80.000–120.000 (estimado).**
- **SAM — vertical estrecho estética (el que recomienda el red-team)**: de 42–50k salones, descontando el
  ~80% que son autoempleo puro sin capacidad de pago de un retainer, queda el segmento de estructura
  media/alta: **SAM ≈ 8.000–10.000 centros (estimado)**.
- **SOM:** **30–60 clientes** en 12–18 meses (venta consultiva) → **US$6k–20k/mes**. **0,3–0,6% del SAM.**

### Señal de demanda
- Sector belleza/estética AR mueve **US$756 M/año, ~1% del PBI**, con demanda de tratamientos en alza →
  base económica sólida.
- Viento regulatorio a favor: Meta cortó los bots genéricos (ene-2026) → los verticales integrados y
  compliant ganan. Competidor AR de referencia: **Mi Agenda Profesional** (turnos + bot WhatsApp + cobro
  de señas con MP, **plan gratuito**) → valida demanda pero fija el piso de precio.

### Chequeo de unit economics
- Break-even de **15–25 clientes = 0,2–0,3% del SAM**. Alcanzable en tamaño.
- **El limitante NO es mercado, son dos cosas medidas:** (1) la **voz recorta el margen a 40–60%**
  (US$0,13–0,31/min, todo incluido) → hay que cobrarla por uso; (2) hay un **competidor AR con MP y plan
  gratis** en la puerta de entrada. **Veredicto de datos: el mercado da los números, pero el margen (voz)
  y la venta consultiva ACHICAN** el atractivo. Se sostiene solo como versión premium de Fantasma
  (mismo stack), texto por default y voz como add-on por minuto — como ya concluyó el red-team.

### Integración pública/privada
- Integración privada con **Mercado Pago** (señas/turnos) es tabla; es lo que el competidor ya hace. Sin
  integración pública relevante.

---

## 6. BACK-OFFICE AFIP/ARCA — conciliación para pymes/contadores 🟡 (Ronda 1)

**Break-even previo:** ~5–8 clientes para US$5.000/mes (setup US$1.500–5.000 + retainer US$500–2.000/mes).

### TAM / SAM / SOM
- **TAM — universo que necesita conciliar contra ARCA:** ~515.000 pymes empleadoras + estudios
  contables. **TAM masivo.**
- **SAM — vía el canal que recomienda el red-team (contador aliado, no venta directa):** **+70.000
  matriculados solo en CPCE-CABA**; a nivel nacional (24 consejos, FACPCE) el padrón es varias veces
  mayor. Cada contador tiene cartera de 20–100 pymes. El SAM efectivo del modelo "el contador te trae 3
  clientes suyos" se cuenta en **decenas de miles de contadores** → **cientos de miles de pymes
  alcanzables por intermediación**.
- **SOM:** con venta lenta y ACV alto, **10–20 clientes retainer** en 12–18 meses → **US$5k–30k/mes**.
  Es una **fracción despreciable del SAM** (<0,01%).

### Señal de demanda
- ROI documentado de automatización de AP: costo por factura US$12–30 → US$1–5 (Peakflo) → hay ahorro
  real que vender. Competidores locales con IA ya operando y **validando el pago**: Genio Contable
  (recorta 83% del trabajo impositivo), ConciliaBot, Colppy, Aconpy.

### Chequeo de unit economics
- Break-even de **5–8 clientes = irrelevante frente al SAM**. **El tamaño no es el problema en absoluto.**
- **Veredicto de datos: el mercado SOBRA; lo que ACHICA es todo lo demás** — build pesado, margen
  erosionado por labor humana (60–75% real), y **venta consultiva lentísima a un comprador conservador**
  que ya tiene incumbentes locales instalados. El dato confirma el 🟡 "borderline, solo con contador
  aliado como canal": el negocio no muere por falta de mercado, muere por velocidad de venta y margen.

### Integración pública/privada
- **La integración pública ES el producto:** conciliar contra **ARCA/AGIP/ARBA** (padrones fiscales,
  Mis Comprobantes, libro IVA digital) es el core. Es la mayor oportunidad de integración pública de la
  cartera **y** su mayor barrera (los incumbentes ya la tienen). Cuantificable pero disputada.

---

## 7. TABLA RESUMEN — negocio → TAM/SAM/SOM → señal de demanda → veredicto de datos

| Negocio | TAM | SAM | SOM (12–18m) | Break-even vs SAM | Señal de demanda (dura) | Veredicto de datos |
|---|---|---|---|---|---|---|
| **Kudos** 🟢 | 400–500k locales c/ público *(est.)* | 150–250k con ficha+reseñas *(est.)* | 100–300 locales · US$10–40k/mes | 34–50 = **0,02–0,03% del SAM** | ORM global US$6,88B, +12,6%/año; Birdeye US$299–449 valida precio | **CONFIRMA (holgado).** Previo era conservador; cuello = distribución, no mercado |
| **Testigo** 🟢 | 50–100k cuadrillas field service *(est.)* | 3–6k empresas control de plagas *(est.)* | 60–150 empresas · US$5–15k/mes | 35–50 = **0,6–1,7% del SAM** | Parte **exigido por bromatología** (no elástico); LATAM plagas US$2.644M, +5,6%/año | **CONFIRMA break-even; ACHICA el techo** por vertical estrecho → sumar rubros para crecer |
| **Fantasma** 🟡 | 300–500k negocios c/ WhatsApp *(est.)* | 15–25k gastronomía nocturna/turnos *(est.)* | 50–120 clientes · US$10–30k/mes | 25 = **0,1% del SAM** | 74% ya usa WhatsApp con negocios; +85% txns en chat LATAM (Meta) | **CONFIRMA (holgado).** Riesgo = COGS + competencia, no mercado |
| **Plantillería** 🟡 | ~4M monotributistas | 200–600k compradores digitales *(est.)* | 20–200 ventas/mes · US$0,5–8k/mes | 37 = **0,006–0,02% del padrón** | Estacionalidad semestral (recat. ene/jul) sobre 4M; hueco AR real | **CONFIRMA tamaño; NO resuelve** el cuello real = distribución |
| **Recepcionista IA** 🟡 | 80–120k negocios de turnos *(est.)* | 8–10k estética estructura media *(est.)* | 30–60 clientes · US$6–20k/mes | 15–25 = **0,2–0,3% del SAM** | Estética US$756M/año (~1% PBI); competidor AR con MP+plan gratis | **Mercado alcanza; ACHICAN** voz (margen 40–60%) + venta consultiva |
| **Back-office AFIP** 🟡 | ~515k pymes | Decenas de miles de contadores → cientos de miles de pymes | 10–20 retainers · US$5–30k/mes | 5–8 = **<0,01% del SAM** | ROI AP real (US$12–30→US$1–5); Genio Contable/Colppy validan pago | **Mercado SOBRA; ACHICAN** build pesado + margen + venta lenta |

**Lectura de una línea:** en **los 6 negocios el mercado alcanza para el break-even** (ninguno muere por
falta de demanda). El dato **CONFIRMA con holgura** a **Kudos y Fantasma** (break-even = fracción ínfima
del SAM, demanda medida y creciente). **CONFIRMA pero ACHICA el techo** a **Testigo** (SAM del rubro faro
chico → crecer exige nuevos verticales). En **Plantillería, Recepcionista IA y Back-office AFIP** el
tamaño está pero **el dato no toca el verdadero limitante** (distribución / margen-voz / venta consultiva
lenta respectivamente) → el mercado no es la razón para dudar, la **ejecución comercial** sí.

---

## 7.b — SOM en PESOS (dólar oficial BNA venta $1.488,50 · 06/07/2026)

| Negocio | SOM mensual (USD) | **SOM mensual (ARS)** |
|---|---|---|
| **Kudos** 🟢 | US$10.000–40.000/mes | **$14,9 M – $59,5 M/mes** |
| **Testigo** 🟢 | US$5.000–15.000/mes | **$7,4 M – $22,3 M/mes** |
| **Fantasma** 🟡 | US$10.000–30.000/mes | **$14,9 M – $44,7 M/mes** |
| **Plantillería** 🟡 | US$500–8.000/mes | **$0,74 M – $11,9 M/mes** |
| **Recepcionista IA** 🟡 | US$6.000–20.000/mes | **$8,9 M – $29,8 M/mes** |
| **Back-office AFIP** 🟡 | US$5.000–30.000/mes | **$7,4 M – $44,7 M/mes** |

> Conversión al oficial del día; con dólar MEP/blue los importes en pesos serían mayores. Cifras de
> SOM marcadas *(estimado)* en la sección respectiva.

## 8. Fuentes y método

**Método general de TAM/SAM/SOM:** TAM = universo total del padrón madre (sección 0). SAM = recorte por
rubro faro/vertical y por elegibilidad (tiene ficha, paga retainer, opera de noche, etc.), aplicando tasas
de penetración conservadoras marcadas *(estimado)* cuando no hay dato oficial. SOM = ventana realista de
12–18 meses para un estudio chico **sin equipo comercial** (ritmo de venta artesanal). El break-even se
expresa como **% del SAM** para juzgar si es alcanzable: <1% = holgado, 1–5% = alcanzable, >10% = difícil.

**Padrones y universos base**
- Empresas/pymes registradas AR (~525.500, 98% pymes): UCEMA s/ AFIP — https://ucema.edu.ar/sites/default/files/2025-09/IndicadoresUCEMA_PyMEs092025.pdf · (contraste 605.000 "activas") LHH — https://lhh.com.ar/en-argentina-hay-605-000-empresas-activas-99-pymes-y-06-grandes/ · Infobae demografía empresarial — https://www.infobae.com/economia/2025/07/02/cuantas-empresas-existen-hoy-en-la-argentina-y-cuantas-habia-en-2013-el-ano-en-que-se-alcanzo-el-maximo-registro/
- Monotributistas (~4 M activos / "+2 M" según criterio): ARCA — https://www.afip.gob.ar/monotributo/ · prensa (Ámbito, Cronista) — https://www.ambito.com/informacion-general/monotributo-2026-cuanto-subiran-las-cuotas-arca-y-que-categorias-pagaran-mas-n6281786 · Informe recaudación ARCA 2024 — https://www.afip.gob.ar/institucional/documentos/ARCA-Recaudacion-ANUAL2024.pdf
- Gastronómicos (67.000) y hoteleros (17.000): FEHGRA — https://fehgra.org.ar/acerca-de-fehgra
- Peluquerías/estética (42–50.000; sector US$756M/año, ~1% PBI): Beauty Market America — https://www.beautymarketamerica.com/la-peluqueria-mueve-millones-de-dolares-anuales-en-argentina-11005.php · Rodolfo Urrea — https://rodolfourrea.com/2026/04/03/cuantos-hombres-y-mujeres-componen-la-industria-de-la-peluqueria/
- Contadores/matriculados (+70.000 CPCE-CABA): CPCECABA — https://www.consejo.org.ar/matriculas
- WhatsApp AR (40M usuarios, 90% penetración, 74% interactuó con negocios): La Nación — https://www.lanacion.com.ar/tecnologia/whatsapp-business-mas-175-millones-usuarios-utilizan-nid2485662/ · Blip LATAM — https://www.blip.ai/blog/es/whatsapp/estadisticas-whatsapp-marketing-latam/ · Chatsell — https://chatsell.net/whatsapp-business-tendencias-ventas-latam-2026-2/

**Por negocio**
- **Kudos** — ORM market US$6,88B/12,6%: Mordor — https://www.mordorintelligence.com/industry-reports/online-reputation-management-market · precios competencia: Birdeye https://birdeye.com/pricing/ · gmbapi https://gmbapi.com/product/review-management/ · Localo https://localo.com/local-seo-tool/free/ai-review-response-generator
- **Testigo** — mercado LATAM plagas US$2.644M (2023)/CAGR 5,6%: Informes de Expertos — https://www.informesdeexpertos.com/informes/mercado-latinoamericano-de-control-de-plagas · cámaras: CAECPLA (Nosis) https://trade.nosis.com/es/CAMARA-ARGENTINA-DE-EMPRESAS-DE-CONTROL-DE-PLAGAS-CAECPLA/30699335548/1/p · CAEMIP https://www.caemip.com.ar/institucional/ · registro CABA (APRA/desinsectación): TAD — https://tramitesadistancia.gob.ar/tramitesadistancia/detalle-tipo?id=5063 · requisitos municipales (Gualeguaychú, ejemplo de registro local) — https://gualeguaychu.gov.ar/ *(el conteo 3.000–6.000 empresas es **estimado**: no hay padrón nacional único publicado; se infiere de la suma de registros municipales/provinciales + cámaras)*
- **Fantasma** — +85% txns en chat LATAM (Meta) / +18% uso comercial (Infobip): Blip — https://www.blip.ai/blog/es/whatsapp/estadisticas-whatsapp-marketing-latam/ · competencia AR: Artics (US$50–400) https://www.artics.com.ar/cuanto-cuesta-chatbot-ia-para-empresas-argentina/ · Aoki https://www.aokitech.com.ar/
- **Plantillería** — recategorización semestral (ene/jul): ARCA https://www.afip.gob.ar/monotributo/categorias.asp · Infobae categorías 2026 — https://www.infobae.com/economia/2026/04/02/monotributo-cuanto-se-paga-segun-cada-categoria-en-abril-de-2026-y-como-son-las-escalas/ · realidad de distribución (Gumroad): Poonam Sharma — https://poonamsharmawriter.medium.com/1-year-on-gumroad-selling-notion-templates-what-ive-learned-20b59270e36d · *(volumen exacto de Google Trends de "monotributo" = **pendiente de medir** en https://trends.google.com.ar; señal de demanda inferida del tamaño del padrón + obligación semestral)*
- **Recepcionista IA** — voz US$0,13–0,31/min: Retell — https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis · competidor AR (Mi Agenda Profesional con MP + plan gratis): referenciado en el red-team de la célula
- **Back-office AFIP** — ROI AP (US$12–30→US$1–5): Peakflo — https://peakflo.co/blog/accounts-payable-automation-roi-analysis · MIT 95% pilotos sin ROI (cautela) — https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo/ · competidores locales (Genio Contable/Colppy/Aconpy): referenciados en el red-team de la célula

**Marcas de calidad del dato:** las cifras de padrones oficiales (empresas, monotributistas, gastronómicos,
peluquerías, contadores, WhatsApp) tienen **fuente dura**. Los SAM/SOM y el conteo de empresas de control
de plagas son **estimaciones de método** marcadas *(estimado)* — para firmarlos haría falta: (1) medición
directa de Google Trends AR; (2) pedido a CAECPLA/CAEMIP del padrón de socios; (3) scraping de los
registros municipales de desinsectación. Documento local, no se tocó producción, git ni deploy.
