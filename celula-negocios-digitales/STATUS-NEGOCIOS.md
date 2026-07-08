# STATUS DE NEGOCIOS — Tablero del dueño

> **Cómo leer esto:** este es el parte de situación de todos los negocios que inventó y analizó la
> célula. Está escrito para que **alguien que no sabe nada del proyecto lo entienda solo**. Cada negocio
> trae: qué es en criollo, en qué estado está, y los números clave (qué cuesta construirlo, cuánto sale
> operarlo, a cuánto se vende, qué margen deja y cuántos clientes hacen falta para facturar).
>
> **Actualizado:** 2026-07-07 (motor Rondas 15–18) · **Autor:** PMO · **Regla:** todo LOCAL, nada publicado.
>
> **Ronda 18 (barrido seco):** 0 negocios nuevos — 7 espacios verificados y descartados (plan de pagos
> ARCA, REP envases, gastos corporativos, Tax Free, repricing, CBAM, turnos salud). Mapa de saturación +
> **recomendación de consolidar la veta de recupero** en un producto-plataforma. Detalle en
> `ronda-18/2026-07-07-barrido-saturacion.md`.

## Qué es la célula (contexto de cero)
Un equipo de agentes de IA que funciona como una **consultora interna**: inventa negocios digitales que
se pueden construir rápido con IA (Claude Code), los analiza con números reales de mercado, los somete a
un "red-team" que intenta tumbarlos, y le entrega al dueño solo los que sobreviven — con un plan para
construirlos y venderlos. Funciona en **ciclos semanales** hasta que el dueño lo frene.

## Leyenda de estados
🛠️ **En desarrollo** · ✅ **Validado** (pasó el filtro, esperando luz verde) · ⚠️ **Herido** (viable con
condiciones) · ☠️ **Descartado** (el red-team lo mató, con motivo) · 💡 **Idea** (propuesto, sin red-team aún)

> **Nota sobre los números:** "para US$X/mes" = cuántos clientes o ventas mensuales hacen falta para
> llegar a esa facturación. "Build" = semanas de trabajo del equipo (con Claude Code el gasto en efectivo
> es bajo, US$100–500). "COGS" = lo que cuesta atender a un cliente por mes (sobre todo tokens de IA).
> Todo en dólares (cobrar en USD desde Argentina se liberó en 2025).

---

## A. EN DESARROLLO AHORA (4 negocios — kickoff COMPLETO 2026-07-06)

> Los 4 tienen ya: spec del MVP + arquitectura + **código del corazón del producto funcionando** (demos
> verificadas offline) + plan hasta el primer peso. Próximo paso de cada uno abajo. Falta cablear las
> APIs reales (Claude Sonnet, WhatsApp, Google, pasarela) y salir a vender.

### 🛠️ Kudos — reseñas en piloto automático
- **Qué es (de cero):** un servicio que le consigue reseñas de 5 estrellas a un comercio (con un QR en el
  ticket o un WhatsApp después de la compra) y **responde todas las reseñas** por él, con el tono de su
  marca. Más reseñas buenas = más ventas.
- **Números:** build **2–3 semanas** · COGS **US$3–10/local/mes** · precio **US$99–149/mes** por local
  (+ setup US$100–200) · margen **90–95%** · para **US$5.000/mes → 34–50 locales** · primer peso en **3–5
  semanas**.
- **Por qué gusta:** el líder (Birdeye) cobra US$299–449 → hay lugar para entrar a un tercio del precio.
  Es el de **mejor margen** de todos.
- **Estado dev:** ✅ **kickoff COMPLETO** — spec + arquitectura + motor de respuestas (ruteo 1★→revisión / 5★→autopublica + anti-"gating" de Google) con demo offline verificada. Próximo: conectar Claude Sonnet real + Google Business Profile y probar 50+ reseñas reales.

### 🛠️ Fantasma — el "turno noche" de WhatsApp
- **Qué es (de cero):** un empleado de IA que atiende el WhatsApp del negocio **fuera de horario** (noche
  y fin de semana): responde, cotiza, agenda y deja los clientes "calientes" anotados para la mañana. El
  lunes entrega un reporte de "la plata que se hubiera escapado".
- **Números:** build **1–2 semanas** · COGS **US$15–30/cliente/mes** (¡sube a US$60–120 si hay mucho
  volumen!) · precio **US$120–300/mes** + extra por cliente atendido · margen **80–85%** · para
  **US$5.000/mes → ~25 clientes** · primer peso en **2–3 semanas** (el más rápido).
- **Regla de oro:** se cobra **por uso** (con un tope de conversaciones incluidas + excedente), nunca una
  tarifa plana, o los tokens se comen la ganancia.
- **Estado dev:** ✅ **kickoff COMPLETO** — agente (máquina de estados) + motor de COGS + **pricing por uso blindado** (Básica US$120/100 conv · Pro US$249/250 · Full US$399/500, excedente siempre > COGS). `tsc` verde + demo real (cotiza, agenda, link MP). Próximo: cablear Sonnet real y validar COGS contra 20 conversaciones de barbería.

### 🛠️ Testigo — parte de trabajo desde una foto y un audio
- **Qué es (de cero):** para plomeros, obras, jardineros, fumigadores. El operario manda una **foto + un
  audio** por WhatsApp y recibe un **informe de trabajo profesional** (foto antes/después, checklist,
  firma) en PDF para mostrarle al cliente. Hace que un laburo se vea prolijo y se cobre más caro.
- **Números:** build **3–4 semanas** · COGS **~US$2/operario/mes** (muy barato) · precio
  **US$15–30/operario/mes** (un contratista de 5 = US$75–150) · margen **~90%** · para **US$5.000/mes →
  35–50 cuadrillas** · primer peso en **4–6 semanas**.
- **Por qué gusta:** una vez que es su forma de entregar, **cambiarse duele** → los clientes no se van.
- **Estado dev:** ✅ **kickoff COMPLETO** — rubro faro **control de plagas/fumigación** (parte exigido por bromatología → menos evangelización); pipeline foto+audio→parte→PDF con ejemplo renderizado + regla dura: **nunca inventa datos regulatorios** (los marca pendientes y repregunta). Próximo: webhook WhatsApp + STT + PDF real de punta a punta.

### 🛠️ Plantillería — plantillas listas para Argentina
- **Qué es (de cero):** una tienda de **plantillas** (planillas de Excel / Notion) hechas para la realidad
  argentina: control de monotributo, sueldos, gastos, presupuestos por oficio. Se hacen una vez y se
  venden infinitas veces, sin costo de atención.
- **Números:** build **1–2 semanas** · COGS **~US$0** (solo la comisión de la pasarela de pago, ~5%) ·
  precio **US$25–75 por plantilla** (pago único) · margen **90–95%** · para **US$1.000/mes → ~37 ventas**
  (caso real citado: US$1.800 en un mes con 3 plantillas) · primeras ventas en **semanas**.
- **El desafío:** no es el costo, es la **distribución** — hay que hacer que la gente la encuentre.
- **Estado dev:** ✅ **kickoff COMPLETO** — scaffold Next.js (landing + producto + checkout Lemon Squeezy + entrega) + 5 plantillas definidas + plan de distribución (60% del trabajo real). Próximo: construir la plantilla de Monotributo contra un caso real y abrir la cuenta de Lemon Squeezy → con eso ya cobra.

---

## B. VIABLES PERO NO EN DESARROLLO (heridos — esperan decisión)

### ⚠️ El Data Semanal — newsletter de finanzas AR con sponsors
- **Qué es (de cero):** un boletín por email, 1 dato + 1 gráfico por semana sobre la economía cotidiana
  argentina (dólar, plazo fijo, inflación). Se monetiza con **auspiciantes** (fintech, billeteras).
- **Números:** build **1 semana** · CPM (precio por mil lectores) realista AR **US$20–45** · con **20.000
  suscriptores → ~US$600 por envío** · primeros sponsors chicos con ~3–5k subs (US$100–200) a los **4–8
  meses** · ingreso serio recién a los **12–18 meses**.
- **Veredicto:** no como negocio solo (tarda mucho); sí como **pieza de otro producto** (una herramienta
  capta el email → la newsletter retiene → el sponsor paga).

### ⚠️ Mapa del Barrio — micro-directorios locales
- **Qué es (de cero):** guías online hiperlocales ("veterinarias 24h en tal barrio") que se llenan solas
  con reseñas de la gente. Se cobra a los comercios por aparecer destacados.
- **Números:** build **2–3 semanas** por zona · precio **US$15–25/mes** por comercio · para **US$2–3k/mes
  → 100–150 comercios** + US$500–800 de banners · primer peso a los **2–4 meses**.
- **Veredicto:** sobrevive a Google pero **la venta a comercios es trabajo activo** — es más "negocio
  local replicable" que ingreso pasivo.

---

## B-bis. SOBREVIVIENTES DEL MOTOR CÍCLICO — Ronda 15 (2026-07-07)

> Ángulo de la ronda: **"recuperá lo que es tuyo"** — recupero y optimización para pyme/comercio/
> ciudadano (retenciones, tasas, subsidios, tarifas mal cobradas). Números **provisionales a confirmar**,
> dólar ~$1.500. Detalle completo en `ronda-15/2026-07-07-nuevos-negocios.md`. De 8 candidatos, 4
> sobrevivieron; 4 murieron en verificación de competencia (alquileres → Rents.ar; facturación OS
> profesionales → KLIA; sucesiones → patrocinio obligatorio + campo saturado; reintegros consumer →
> unit economics).

### 💡 Saldo a Favor — recupera las retenciones de Ingresos Brutos que te sacaron de más (Índice 45, 💥)
- **Qué es (de cero):** lee tus resúmenes de banco/Mercado Pago/billetera, detecta las retenciones de
  IIBB **indebidas o excesivas** (SIRCREB/SIRCUPA — sobre todo a monotributistas que no deberían ser
  retenidos) y el saldo a favor acumulado, y **arma el trámite** de atenuación de alícuota / compensación
  / devolución por provincia. Cobra sobre lo que corta o recupera.
- **Números (prov.):** build 3–4 sem · COGS ~cero · precio **25% de lo recuperado** + plan contador
  ~$60k/mes · margen ~90% · base año 1 ~$2M/mes (≈ USD 1.300), techo alto por canal contador.
- **Por qué sobrevive:** pain masivo (5,5M monotributistas), resultado medible en el próximo resumen,
  success-fee sin fricción, canal contador ya construido. **El de mayor mercado del motor.**

### 💡 Tasa Justa — impugna la tasa municipal (Seguridad e Higiene) que te cobran de más (Índice 44, ⚖️)
- **Qué es (de cero):** lee las boletas de TISH del comercio, detecta el sobrecobro (base mal calculada,
  duplicación, desproporción con el servicio), pide al municipio la info que está **obligado a dar**
  (prueba) y arma la impugnación administrativa. Cobra un % del ahorro.
- **Señal fresca:** fallo Cámara San Nicolás **7-abr-2026** que obliga a municipios a transparentar en
  qué gastan la tasa + doctrina CSJN/SCBA de proporcionalidad. Análogo probado: property-tax appeal (EE.UU.).
- **Números (prov.):** build 4–5 sem · COGS ~cero · precio **20% del ahorro anual** · margen ~88% · base
  año 1 ~$900k/mes (≈ USD 600), escala 5–20× con cadenas multi-local.
- **Por qué sobrevive:** **el moat más defendible** (biblioteca de ordenanzas + jurisprudencia por municipio).

### 💡 Subsidio Detectado — te encuentra el subsidio/ANR pyme y te arma la rendición (Índice 38, 🌱)
- **Qué es (de cero):** matchea al perfil de la pyme qué programas públicos (ANR, créditos, crédito
  fiscal) puede pedir hoy, alerta convocatorias y —el diferencial— **arma la carpeta de rendición**
  (el trámite que hace perder el beneficio).
- **Números (prov.):** build 3–4 sem · COGS ~USD 1–2/cliente/mes · freemium + plan pyme ~$30k/mes + plan
  consultora ~$120k/mes · margen ~85% · base año 1 ~$4M/mes (≈ USD 2.600).
- **Por qué sobrevive (nicho):** 🌱 pasivo sustentable, motor SEO + canal consultora. Directorios estáticos
  existen; el hueco es **matchear + alertar + rendir**, no listar.

### 💡 Tarifa Justa — audita la factura de energía del comercio y reclama recategorización (Índice 34, ⚖️ · GO piloto)
- **Qué es (de cero):** lee las facturas de luz/gas del comercio, detecta potencia sobredimensionada /
  categoría T2-T3 mal asignada / recargos evitables, y arma el trámite de recategorización. Cobra % del ahorro.
- **Señal fresca:** **Decreto 943/2025** (BO 2-ene-2026) reordena subsidios → la factura sube todo 2026.
- **⚠️ Verificación de competencia PARCIAL:** falta cerrar el barrido de consultoras de eficiencia
  energética antes del GO pleno → **queda como GO piloto en observación**. Honestidad de método.
- **Números (prov.):** build 4–5 sem · precio 25% del ahorro anual · margen ~85% · base ~$730k/mes (≈ USD 480),
  condicionado a validar hueco y ahorro real.

---

## B-ter. SOBREVIVIENTES DEL MOTOR CÍCLICO — Ronda 16 (2026-07-07, apuestas de ventana regulatoria)

> Ángulo: dos ventanas regulatorias frescas de 2026. Ronda flaca a propósito (2 de 5 candidatos; el
> filtro mató riesgo-de-contraparte → Nosis/Veraz, comisiones ML → adyacente, turismo USD → OwiBook/
> Bokun). Ambos son **GO piloto, pelotón medio**. Detalle en `ronda-16/2026-07-07-nuevos-negocios.md`.

### 💡 Mono-Tech — copiloto fiscal-cambiario del exportador de servicios (Índice 34, 💥, GO piloto)
- **Qué es (de cero):** para el que factura al exterior y cobra en dólares (devs, diseñadores,
  consultores): te dice si calificás al nuevo **régimen Mono-Tech**, te inscribe, te arma la **Factura E**
  correcta, te avisa el plazo de liquidación de divisas y te **blinda contra el cruce de ARCA** 2026.
- **Señal:** media sanción en Diputados del régimen Mono-Tech + BCRA duplica los USD que retiene el
  freelancer + ARCA cruza facturas E vs liquidaciones (2026).
- **Números (prov.):** build 4–5 sem · freemium + pro ~$18k/mes · margen ~85% · base ~$9M/mes (≈ USD 6.000)
  si sale la ley. **Caveat:** moat fino (Wallbit/YoFacturo adyacentes) + depende de que se sancione.

### 💡 Prepaga Justa — auditá el aumento de tu prepaga y reclamá lo cobrado de más (Índice 33, ⚖️, GO piloto)
- **Qué es (de cero):** audita tu historial de cuotas vs IPC, cuantifica lo que la prepaga te cobró de
  más tras el DNU 70/23, y arma el reclamo (denuncia a la Superintendencia + legajo de amparo con estudio
  aliado). Cobra un % de lo que se retrotrae/devuelve.
- **Señal:** fallo Cámara **11-feb-2026** declaró abusivos los aumentos de OSDE, ordenó retrotraer a IPC
  + devolver excedente; demanda probada (estudios de amparos ya facturan).
- **Números (prov.):** build 4–5 sem · precio 25% de lo recuperado · margen ~85% · base ~$3M/mes (≈ USD 2.000),
  techo alto con canal afinidad (sindicatos/RRHH). **Caveat:** requiere estudio jurídico aliado + resolver CAC consumer.

---

## B-quater. SOBREVIVIENTES DEL MOTOR CÍCLICO — Ronda 17 (2026-07-07, la veta también en el sector privado)

> Ángulo: extender la veta ganadora (recupero · success-fee · COGS casi cero) sin encasillarse. 2 de 5
> candidatos (el filtro mató reajuste jubilatorio → saturado + juicios 5–7 años; comisiones bancarias →
> reclamo BCRA gratis/rápido; Impuesto de Sellos → se pliega como módulo de Saldo a Favor). Detalle en
> `ronda-17/2026-07-07-nuevos-negocios.md`.

### 💡 Pagué de Más — recovery audit de cuentas a pagar para la mediana empresa (Índice 40, 💥)
- **Qué es (de cero):** se conecta al mayor de cuentas a pagar (export del ERP o Excel), cruza cada pago
  contra factura/orden/remito y **detecta los pagos duplicados, dobles facturaciones y notas de crédito
  no aplicadas** — la plata que la empresa pagó de más sin darse cuenta. Arma el legajo de recupero.
  Cobra solo sobre lo recuperado. Modelo global probado (PRGX/APEX), inexistente como producto en AR.
- **Números (prov.):** build 4–5 sem · COGS ~cero · precio **25–30% de lo recuperado** + monitoreo
  opcional ~$150k/mes · margen ~90% · base ~$5,4M/mes (≈ USD 3.600) año 1.
- **Por qué importa:** **diversifica la veta al sector privado** — cero riesgo regulatorio, no necesita
  estudio jurídico ni que salga una ley. El perfil más limpio de toda la veta.

### 💡 Multa Nula — impugnador de fotomultas mal labradas para flotas (Índice 37, ⚖️, GO piloto)
- **Qué es (de cero):** recibe las multas de la flota (por patente), verifica la **validez técnica** de
  cada una (radar homologado/calibrado INTI, cartelería, datos del acta, plazos) y arma el descargo de
  las impugnables. Cobra un % de lo que anula.
- **Señal fresca:** "cientos de radares no autorizados" (Infobae may-2026), fallo de inconstitucionalidad,
  Ley 14.226 art. 28bis (nulidad). Competencia (Multabot) solo en el segmento individual → foco FLOTAS B2B.
- **Números (prov.):** build 4–5 sem · precio 30% de lo anulado · margen ~88% · base ~$1,9M/mes (≈ USD 1.250).
- **Caveat:** medir tasa real de impugnaciones exitosas por jurisdicción antes de escalar. Distinto de
  "Frená a Tiempo" (r8, preventivo) — este es reactivo.

---

## C. DESCARTADOS POR EL RED-TEAM (con motivo)

| Negocio | Qué era | Por qué murió |
|---|---|---|
| ☠️ **Calculadoras fiscales** | red de calculadoras (sueldo, aguinaldo) con publicidad | ya hay 8 sitios gratis buenos + la publicidad en AR paga muy poco |
| ☠️ **Cambió el Precio** | historial de precios para detectar falsas ofertas | MeliPrice/MercadoTrack ya existen + cuesta mucho construirlo y monetiza flojo |
| ☠️ **Mercader** | gestión automática de una cuenta de MercadoLibre | MercadoLibre ya responde con su propia IA gratis + depende 100% de su plataforma |
| ☠️ **Confesionario** | encuestas por voz a clientes | ya hay competidores (Vokalis/Burbuxa) + la voz cuesta 15–30× el texto y funde el margen |

---

## D. PORTFOLIO RONDA 1 (12 ideas — anteriores al red-team, sin filtrar aún)

> Estas salieron del primer ciclo y **todavía no pasaron por el red-team**, así que sus números son de
> referencia, no confirmados. Ordenadas por puntaje del analista.

| Negocio | Qué es (de cero) | Precio ref. | Puntaje |
|---|---|---|---|
| 💡 **Postora** | community manager con IA para comercios de barrio (les hace el contenido del mes) | US$29–59/mes | 9 |
| 💡 **Recepcionista IA vertical** | recepcionista de IA (voz + WhatsApp + agenda) para clínicas/estéticas | setup US$300–1k + US$150–500/mes | 9 |
| 💡 **Directorio B2B + lead-gen** | directorio de un rubro que vende contactos de clientes | leads US$30–50 + suscripción | 8.5 |
| 💡 **VetVoz** | dicta la historia clínica por voz para veterinarias | suscripción | 8 |
| 💡 **Vitrina** | fotos de producto + ficha listas para vender online | freemium + créditos | 8 |
| 💡 **Back-office AFIP** | concilia facturas/AFIP para pymes y contadores | retainer US$500–2k/mes | 8 |
| 💡 **Comparador con afiliados** | comparador de un nicho que cobra comisión | comisión recurrente | 8 |
| 💡 **Calificación de leads WhatsApp** | filtra y califica clientes por WhatsApp para rubros de ticket alto | retainer + fee por resultado | 8 |
| 💡 **Calculadoras fiscales AR** | herramientas fiscales con tier pro | ads + tier pro | 7.5 |
| 💡 **MediaKit.ar** | arma el "media kit" de micro-influencers en 60s | freemium/one-time | 7 |
| 💡 **PrevenIA** | compliance de Seguridad e Higiene para pymes | suscripción | 7 |
| 💡 **GremioPro** | presupuesto + agenda + cobro para oficios | suscripción + MP | 7 |

*(Cuando el ciclo semanal los pase por el red-team, se moverán a las secciones A/B/C con sus números
firmes.)*

---

## Cómo pedir el status
Decí **"status"** y el PMO te devuelve este tablero actualizado: la lista de negocios, su estado y los
números precisos. El **Reportero ejecutivo** de la célula lo refresca en cada ciclo semanal. El ciclo
**sigue corriendo hasta que digas "frená"**.
