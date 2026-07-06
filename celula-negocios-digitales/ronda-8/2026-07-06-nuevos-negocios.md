# Ronda 8 — 6 negocios nuevos (creativo + analítico + ingeniería de datos + desafiador)

> **Fecha:** 2026-07-06 · **Dólar oficial BNA:** $1.488,50 · **Todo LOCAL, sin publicar.**
> **Bajada de línea aplicada:** arrancar por BOLETINES OFICIALES / NUEVA REGULACIÓN (una obligación o un
> derecho nuevo crea un mercado el día que sale → cazar el gap); mercado local argentino; la **integración
> a entes públicos/privados es el MOAT**; salir del sesgo del modelo (nada de otro chatbot/wrapper/
> dashboard/agencia genérica); resolver un problema real; construible con Claude Code en semanas. **Dos
> perfiles válidos:** 💥 gran beneficio/escala y 🌱 pasivo sustentable. **Prioridad:** primero lo realizable
> YA y barato; lo caro/lento queda encolado (no descartado). **Índice honesto:** negocios nuevos, sin
> construir ni validar con clientes → 36–47.
>
> **DIVERSIFICACIÓN DELIBERADA (Ronda 8):** las rondas 3–7 cubrieron fiscal/AFIP, salud/obras sociales,
> seguros, agro, comex-OEA, RRHH, turismo/inmobiliario, cooperativas, discapacidad, alimentos, deporte,
> exportación, marcas/INPI, transferencia de autos, defensa del consumidor, financiamiento SGR y energía
> renovable. Ronda 8 se corre a **SECTORES NUEVOS: tránsito y scoring de licencias (CABA/GBA), seguridad
> privada, patentes de invención (distinto de marcas), criptoactivos/CNV, delivery y última milla, y
> minería/litio (proveedores locales RIGI)**, manteniendo el moat de integración pública/privada.

**No repetimos** ninguno de los ~51 ya cubiertos: Kudos, Testigo, Fantasma, Plantillería, El Data Semanal,
Mapa del Barrio, Calculadoras fiscales, Cambió el Precio, Mercader, Confesionario, Postora, Recepcionista
IA, Directorio B2B, VetVoz, Vitrina, Back-office AFIP, Comparador con afiliados, Calificación de leads,
MediaKit.ar, PrevenIA, GremioPro, Contra-Retención, Licita, Paritaria al Día, Semáforo de Flota, Receta
Clara, Quién Firma, Buzón ARCA, APOC Guard, Reconoce, Compliance UIF, FCEM Anticipo, Etiqueta Verde, Grano
en Regla, ObraLibre, Siniestro Claro, Título Verificado, PAMI al 100, Aduana OEA Pyme, Club en Regla,
Cooperativa al Día, Anfitrión en Regla, Escudo CUD, Sello Alimento, Vendé al Mundo, Vigía de Marca, Dominio
Limpio, Reclamo Cero, Traé Nomás, Aval Listo, Sol en Red.

**Nota de método (ingeniería de datos):** cada número trae fuente y supuesto. Conductores de flotas de
reparto/remises expuestos al sistema de puntos: sin padrón público unificado, se estima por volumen de
flotas activas en CABA/GBA; vigiladores privados habilitados: la Ley 6441 de Mendoza documenta el salto de
400 a +10.000 en una sola provincia, de ahí se extrapola el piso nacional; patentes vigentes de titulares
pyme/individuales: universo del registro INPI, sin dato agregado público exacto, estimado conservador;
PSAV registrados/candidatos ante la CNV: universo público del propio registro (RegistrosPSAV), acotado;
repartidores de plataformas chicas/medianas: estimado por exclusión de los grandes players (Rappi/
PedidosYa) que ya tienen compliance propio; proveedores locales RIGI: universo de proyectos adheridos +
padrón de pymes proveedoras por provincia minera, estimado conservador. Los índices son conservadores:
nada está construido ni validado con clientes.

---

## 1. Frená a Tiempo — que a tu flota no le vacíen los puntos de la licencia sin que te enteres 🌱

**Qué es (de cero):** un **copiloto de compliance vial** para flotas: apps de delivery, remises, empresas
de reparto y corporativos con autos propios. Desde el **19 de junio de 2026** la ANSV (Disposición
167/2026) modificó el sistema nacional de puntos por infracciones, y CABA ya tiene su propio **Sistema de
Evaluación Permanente de Conductores**: cada licencia arranca con 20 puntos, cada infracción resta puntos,
y **al llegar a cero la licencia se inhabilita entre 60 días y 5 años**. El problema es que las notificaciones
llegan por **acta digital** (correo/domicilio electrónico) y nadie las mira hasta que es tarde: la fotomulta
ya restó puntos, el conductor no lo sabe, y una flota puede perder de golpe a su mejor repartidor o remisero
por inhabilitación. Frená a Tiempo monitorea el puntaje de cada licencia de la flota, avisa apenas hay una
resta, calcula si conviene pagar la Unidad Fija con descuento por pronto pago o presentar descargo, y
dispara el curso de reeducación vial (recupera hasta 4 puntos, una vez por año) antes de que alguien llegue
a cero.

**Integración (el MOAT):**
- **Pública:** ANSV — consulta nacional de infracciones y nuevo esquema de puntos (Disposición 167/2026);
  Gobierno de CABA — Sistema de Evaluación Permanente de Conductores, consulta de puntaje
  (buenosaires.gob.ar/infracciones), actas digitales con notificación electrónica. La biblioteca que
  normaliza el puntaje de cada jurisdicción y calcula el riesgo de inhabilitación por conductor es el moat.
- **Privada:** empresas de delivery/reparto, remises y corporativos con flota (clientes B2B); aseguradoras
  de flota como canal (les baja el siniestro por conductor inhabilitado manejando igual).

**Problema real que resuelve:** una flota no se entera de que un conductor está por quedarse sin licencia
hasta que ya pasó — y perder un repartidor de golpe en plena operación cuesta más que la multa en sí. Mirar
el puntaje de cada uno todos los días y actuar a tiempo es plata operativa concreta.

**Señal regulatoria (fuente + fecha):** la **Agencia Nacional de Seguridad Vial (ANSV) modificó el sistema
nacional de puntos por infracciones de tránsito mediante la Disposición 167/2026**, vigente desde el **19 de
junio de 2026** (El Cronista, "Tras 4 años de vigencia, cambiará para siempre el sistema de scoring en la
licencia de conducir", 2026); CABA opera el **Sistema de Evaluación Permanente de Conductores** con 20 puntos
por licencia, inhabilitación de 60 días a 5 años al llegar a cero, y recuperación de hasta 4 puntos por curso
de reeducación una vez al año (buenosaires.gob.ar/gobierno/licencias-de-conducir/sistema-de-evaluacion-
permanente-de-conductores); multas de tránsito en CABA con Unidad Fija actualizada a **$949,99** desde
marzo-2026 y fotomultas con notificación electrónica (Reporte Asia, "Multas de tránsito en CABA aumentan
controles y sanciones 2026", 21/02/2026).

**Cómo opera (ejemplo):** una app de delivery tiene 40 motos en la calle. Frená a Tiempo detecta que a uno de
sus repartidores le acaban de restar 6 puntos por una fotomulta que ni vio, y que le quedan 8. Avisa a la
flota, arma el descargo si corresponde y agenda el curso de reeducación para recuperar puntos antes de que
llegue a cero. El repartidor sigue en la calle; la flota no pierde a nadie de un día para el otro.

**Cómo se cobra:** **abono $8.000/mes por conductor monitoreado** (US$5,4) con descuento por volumen (flotas
de 20+). **Gestión de descargo/impugnación por evento $15.000** (US$10).

**SAM/SOM (con fuente):** universo de conductores de flotas de delivery, remises y corporativos en CABA+GBA
expuestos al nuevo esquema de puntos nacional y al SEPC porteño (miles, sin padrón único público). **SOM
año 1 conservador:** 1.500 conductores monitoreados (30–40 flotas medianas).

**Unit economics (ARS):** abono $8.000/mes/conductor · COGS ~$800/conductor/mes (consulta de puntaje +
alertas + armado de descargos con IA) · margen **90%** · build **2 semanas** · primer peso **2–3 semanas**.

**Perfil:** 🌱 pasivo sustentable con abono recurrente, bajo mantenimiento, alta pegajosidad (la flota que
empieza a monitorear no vuelve a mirar planillas sueltas). **Realizable ahora:** sí. **Costo de arranque:**
bajo.

**Riesgos:** depende de que las consultas públicas de puntaje/infracciones sigan siendo accesibles (mitigar
con consulta asistida si se traba el acceso automatizado); ya existen gestores de multas para consulta
individual (Multabot) pero no hacen monitoreo proactivo de puntaje para flotas B2B — ese es el diferencial;
esquema nacional recién cambiado (Disposición 167/2026) puede seguir ajustándose.

**Desafío del operador:** el valor no es "consultar una multa" (lo hace cualquiera gratis), es **vigilar el
puntaje de toda la flota todos los días y actuar antes de que alguien llegue a cero**. Canal de volumen:
apps de delivery chicas/medianas y empresas de remises. Pitch: "que ningún repartidor tuyo se quede sin
carnet de sorpresa". Barato, rápido y de alta recurrencia.

---

## 2. Chapa Vigente — que a tu empresa de seguridad no la clausuren por un vigilador con el papel vencido 🌱

**Qué es (de cero):** un **legajo digital de compliance** para empresas de seguridad y vigilancia privada.
El sector creció fuerte y sin pausa: solo en Mendoza, la ley que lo regula databa de 1997 con 20 empresas y
400 vigiladores, y **hoy hay 174 empresas habilitadas y más de 10.000 personas habilitadas como vigiladores**
en esa provincia — y el patrón se repite en el resto del país. Cada vigilador necesita el **certificado de
antecedentes penales renovado cada año**, el **examen psicofísico** vigente, la **credencial habilitante** al
día y, si porta arma, la **licencia CLU de RENAR** vigente; la empresa necesita el **seguro de responsabilidad
civil** obligatorio. Si en una inspección aparece un solo vigilador con un papel vencido, la empresa arriesga
la inhabilitación. Chapa Vigente centraliza el legajo de cada vigilador, calcula cada vencimiento, avisa con
30/15/7 días de anticipación y arma el reporte de cumplimiento listo para mostrar en la inspección.

**Integración (el MOAT):**
- **Pública:** Direcciones Provinciales de Seguridad Privada (habilitación de empresas y vigiladores), RENAR
  (licencia CLU para personal armado), Registro Nacional de Reincidencia (certificado de antecedentes). La
  biblioteca que mapea el circuito y los plazos de cada provincia (cada una regula distinto) es el moat.
- **Privada:** empresas de seguridad y vigilancia privada (clientes directos); aseguradoras de RC como canal
  y aliado (les baja el riesgo de siniestro por incumplimiento).

**Problema real que resuelve:** una empresa de seguridad con 50, 100 o 300 vigiladores no puede llevar a mano
el vencimiento de cada certificado, examen y licencia de cada uno — y un solo papel vencido en una inspección
puede costarle la habilitación completa del negocio, no solo una multa.

**Señal (fuente + fecha):** el crecimiento del sector de seguridad y vigilancia privada obliga a actualizar
la normativa provincial que en varios casos data de los 90: en Mendoza la ley 6441 de 1997 regulaba 20
empresas y 400 vigiladores; **hoy hay 174 empresas habilitadas y más de 10.000 personas habilitadas para
trabajar como vigilantes** en esa sola provincia (Legislaturas Conectadas / HCDMza, "Sanción inicial a la
regulación de la actividad de seguridad y vigilancia privada", 2026); la Ley 12.297 de la Provincia de
Buenos Aires y el Decreto 1002/99 fijan las obligaciones de habilitación, antecedentes y seguro (AICACYP,
"Decreto 1002/99 – Reglamentación de Servicios Privados de Seguridad y Custodia").

**Cómo opera (ejemplo):** una empresa de seguridad con 120 vigiladores en CABA tiene una inspección en 3
semanas. Chapa Vigente detecta que 8 vigiladores tienen el certificado de antecedentes vencido hace más de
un mes y 3 tienen la licencia CLU por vencer. Avisa a RRHH, se renuevan a tiempo, y el reporte de
cumplimiento sale listo para la inspección. La empresa no pierde la habilitación por un papel.

**Cómo se cobra:** **abono $3.500/mes por vigilador** (US$2,4) (legajo digital + alertas + reporte de
inspección), con descuento por volumen a partir de 50 vigiladores.

**SAM/SOM (con fuente):** decenas de miles de vigiladores privados habilitados en el país (solo Mendoza
reporta +10.000). **SOM año 1 conservador:** 2.000 vigiladores (10–15 empresas medianas de seguridad).

**Unit economics (ARS):** abono $3.500/mes/vigilador · COGS ~$300/vigilador/mes (legajo + cálculo de
vencimientos + alertas + tokens) · margen **91%** · build **2–3 semanas** · primer peso **3–4 semanas**.

**Perfil:** 🌱 pasivo sustentable, abono recurrente por cabeza, bajo mantenimiento, alta pegajosidad (nadie
vuelve al Excel una vez que automatizó esto). **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** normativa fragmentada por provincia (mapear de a una, arranque más lento en escala nacional);
empresas grandes ya llevan esto en RRHH interno con planillas (diferencial: alertas proactivas + reporte
listo para inspección, no una planilla pasiva que nadie mira); depende de que la empresa de seguridad no
cierre o pierda contratos grandes (afecta el volumen de vigiladores facturables).

**Desafío del operador:** el diferencial no es "tener un Excel de vencimientos" (cualquiera lo arma), es
**avisar a tiempo y tener el reporte listo el día de la inspección, para la empresa que factura por
vigilador activo y no puede permitirse una clausura**. Canal: cámaras de seguridad privada y aseguradoras de
RC. Pitch: "que ningún vigilador tuyo trabaje con el papel vencido". Barato, recurrente y de alta retención.

---

## 3. Patente Viva — que tu invento no caduque por no pagar la anualidad a tiempo 🌱

**Qué es (de cero):** un **vigía de anualidades de patentes**, distinto de vigilar marcas: una patente de
invención en Argentina **caduca de pleno derecho** (Art. 63, Ley 24.481) si no se paga la anualidad de
mantenimiento en término — **sin aviso previo del INPI**. Los montos crecen con la edad de la patente (133
UMAPI en los años 1–3, hasta 1.200 UMAPI en los años 16–20), y pymes, personas físicas, universidades
públicas e instituciones sin fines de lucro tienen **descuentos del 50% (años 3–10) y 60% (años 11–20)** que
muchos inventores no saben pedir o pierden por no presentar a tiempo la documentación de encuadre. Además,
desde el **29 de mayo de 2026** (Resolución INPI 162/2026) cambió el reglamento de **toma de razón** de
transferencias y cambios de rubro de marcas, patentes, modelos y diseños: ya no se exige apostilla ni
legalización consular, solo certificación de firma — más simple, pero igual de desconocido para el inventor
de a pie que quiere licenciar o vender su patente. Patente Viva calcula cada vencimiento de anualidad desde
la fecha de presentación, avisa con meses de anticipación, gestiona el pago y el encuadre del descuento, y
arma la toma de razón cuando el inventor licencia o vende.

**Integración (el MOAT):**
- **Pública:** INPI — Administración Nacional de Patentes (registro de anualidades, encuadre de descuento
  pyme/universidad, nuevo trámite simplificado de toma de razón, Resolución 162/2026). La biblioteca que
  calcula cada vencimiento por fecha de presentación + el encuadre correcto del descuento es el moat.
- **Privada:** agentes de la propiedad industrial aliados (firman los trámites que lo requieran);
  inventores, pymes tecnológicas, universidades e institutos de I+D con patentes propias.

**Problema real que resuelve:** perder una patente por no pagar una anualidad —sin que nadie te avise— es
perder el activo intangible más valioso de un desarrollo, a veces después de años de I+D. La mayoría de los
inventores individuales y pymes no tiene un agente de patentes con seguimiento activo de vencimientos.

**Señal (fuente + fecha):** la Ley 24.481 (Art. 63) establece la **caducidad de pleno derecho** de la patente
por falta de pago de anualidad (Marval, "Caducidad de patente y pago parcial de anualidad"); el esquema de
anualidades va de **133 UMAPI (años 1–3) a 1.200 UMAPI (años 16–20)**, con descuentos de **50% (años 3–10) y
60% (años 11–20)** para pymes, personas físicas, universidades públicas y entidades sin fines de lucro
(argentina.gob.ar/inpi, "Preguntas frecuentes de patentes de invención y modelos de utilidad"); el INPI
simplificó el trámite de **toma de razón** de transferencias y cambios de rubro de marcas, patentes, modelos
y diseños mediante la **Resolución 162/2026**, vigente desde el **29 de mayo de 2026**, eliminando apostilla y
legalización consular (Mitrani Caballero, "Resolución INPI 162/2026: nuevas reglas en materia de
transferencias y cambios de rubro aplicables a marcas, patentes, modelos y diseños"; Boletín Oficial,
Resolución INPI 162/2026, 29/05/2026).

**Cómo opera (ejemplo):** un instituto de I+D universitario tiene una patente de un desarrollo biotecnológico
presentada hace 6 años. Patente Viva detecta que se acerca la anualidad del año 7 (533 UMAPI, con 50% de
descuento por ser universidad pública) y avisa con 3 meses de anticipación. Se paga a tiempo con el descuento
correcto aplicado. Meses después, el instituto licencia la patente a una empresa; Patente Viva arma la toma
de razón simplificada sin apostilla.

**Cómo se cobra:** **alta de cartera $15.000** (US$10, one-shot) + **abono $9.000/mes por patente vigilada**
(US$6) (cálculo de vencimientos + encuadre de descuento + alertas). **Gestión de toma de razón por
transferencia/licencia $50.000** (US$34) por evento.

**SAM/SOM (con fuente):** miles de patentes vigentes de titulares pyme, individuales y universitarios en el
registro del INPI (universo más chico que el de marcas, pero de mayor valor unitario). **SOM año 1
conservador:** 400 patentes vigiladas.

**Unit economics (ARS):** alta $15.000 + abono $9.000/mes · COGS ~$700/patente/mes (cálculo de vencimientos
+ encuadre + alertas + tokens) · margen **92%** · build **2 semanas** · primer peso **3–4 semanas**.

**Perfil:** 🌱 pasivo sustentable, nicho más chico que marcas pero de altísimo valor por unidad protegida
(perder una patente es perder años de desarrollo). **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** universo más chico que el de trademarks (menos patentes vigentes que marcas registradas, techo
de escala más bajo); depende de que el inventor/pyme conozca el servicio (mercado que hay que educar);
agentes de propiedad industrial grandes ya llevan la cartera de anualidades de sus clientes corporativos
(diferencial: precio accesible para el inventor individual o la pyme chica que hoy no tiene agente propio).

**Desafío del operador:** el valor no es "saber que existen las anualidades" (es público), es **avisar a
tiempo con el descuento correcto aplicado, para el inventor que hoy no tiene a nadie vigilando su patente**.
Canal: universidades, incubadoras y agentes de propiedad industrial chicos. Pitch: "no pierdas tu patente
por no pagar $9.000/mes de aviso". Nicho, pero de altísima lealtad.

---

## 4. Activo Prolijo — el compliance officer de la CNV para exchanges y wallets cripto chicos ⚖️/💥

**Qué es (de cero):** compliance-as-a-service para **Proveedores de Servicios de Activos Virtuales (PSAV)**
chicos y medianos: exchanges, casas de cambio cripto, custodios, cajeros cripto y emisores de tokens. Desde
la **Resolución General CNV 1058/2025** (con ajustes de la **RG 1108/2026**), operar como PSAV sin estar
inscripto en el Registro de la CNV es ilegal en Argentina. Hay **5 categorías con patrimonio neto mínimo
entre USD 35.000 y USD 150.000** según la actividad (reducido al 50% si el volumen operado es menor a
USD 2.500.000/año), y obligaciones de **reporte anual** (el primer vence en 2026), ciberseguridad, custodia
de activos y prevención de lavado de dinero ante la UIF. El PSAV chico no tiene área de compliance propia y
corre el riesgo de perder la habilitación —o operar en negro— por no llevar esto al día. Activo Prolijo arma
el legajo de inscripción, calcula la categoría y el patrimonio neto mínimo que corresponde, arma el reporte
anual a la CNV y monitorea las obligaciones de AML/ciberseguridad en curso.

**Integración (el MOAT):**
- **Pública:** CNV — Registro de PSAV, categorías y régimen de reporte anual (RG 1058/2025, RG 1108/2026);
  UIF (reporte de operaciones sospechosas como Sujeto Obligado). La biblioteca que traduce cada resolución
  nueva de la CNV a una checklist de cumplimiento vigente es el moat.
- **Privada:** exchanges, wallets, custodios y OTC cripto chicos/medianos (clientes directos); estudios
  contables/legales especializados en fintech como canal de referidos.

**Problema real que resuelve:** desde 2025 operar cripto en Argentina sin registro es ilegal, pero el
PSAV chico no tiene plata para un estudio grande de compliance ni para armar el reporte anual solo — y
perder la habilitación por no reportar a tiempo es perder el negocio entero.

**Señal (fuente + fecha):** la **CNV estableció el Registro de Proveedores de Servicios de Activos
Virtuales (PSAV)** mediante la **Resolución General 1058/2025** (Boletín Oficial, 14/03/2025), con 5
categorías y patrimonio neto mínimo de **USD 35.000 a USD 150.000** (reducido 50% si el volumen operado es
menor a USD 2.500.000/año), plazo de adecuación hasta el 01/07/2025 (personas humanas) y 01/08/2025
(personas jurídicas), y **régimen de reporte anual con primera presentación en 2026** (Beccar Varela,
"Resolución General CNV N°1058: Regulación de Proveedores de Servicios de Activos Virtuales (PSAV)");
la normativa se ajustó con la **RG 1108/2026** (PaySpace Magazine, "Guía Experta: Cómo los Argentinos Pueden
Legalizar Sus Cripto-Activos en 2026").

**Cómo opera (ejemplo):** un exchange cripto chico de 15 empleados factura bajo volumen y necesita
inscribirse como PSAV categoría 5 (USD 35.000 de patrimonio neto mínimo, reducible a la mitad por su
volumen). Activo Prolijo arma el legajo, calcula que le corresponde el patrimonio reducido, lo inscribe en
el Registro de la CNV y le arma el primer reporte anual 2026. El exchange sigue operando legal sin contratar
un estudio de compliance full-time.

**Cómo se cobra:** **armado de legajo de inscripción $250.000** (US$168, one-shot) + **abono de compliance
continuo $90.000/mes** (US$60) (reporte anual + monitoreo AML/ciberseguridad + alertas regulatorias).

**SAM/SOM (con fuente):** decenas de PSAV ya registrados en la CNV y cientos de operadores cripto/fintech
chicos que aún deben regularizarse o mantener el registro vigente (cnv.gov.ar/SitioWeb/
ProveedoresServiciosActivosVirtuales/RegistrosPSAV). **SOM año 1 conservador:** 40 PSAV clientes.

**Unit economics (ARS):** legajo $250.000 + abono $90.000/mes · COGS ~$15.000/cliente/mes (research
regulatorio + armado de reportes + revisión humana especializada + tokens) · margen **83%** · build **3–4
semanas** · primer peso **5–6 semanas**.

**Perfil:** ⚖️/💥 mercado chico pero de ticket alto y muy defendible (compliance regulatorio no se
comoditiza fácil). **Realizable ahora:** parcial — requiere criterio legal-regulatorio especializado, no
100% automatizable. **Costo de arranque:** medio.

**Riesgos:** mercado acotado (cientos, no miles de PSAV en el país); alta especialización regulatoria
(depende de un socio legal/compliance real, no solo IA); competencia de estudios de abogados fintech ya
establecidos que asesoran a los PSAV grandes (diferencial: precio accesible + monitoreo continuo
automatizado para el PSAV chico que hoy no puede pagar un estudio grande); cambios regulatorios frecuentes
(la RG 1108/2026 ya modificó reglas sobre la 1058/2025, hay que mantenerse al día todo el tiempo).

**Desafío del operador:** el valor no es "saber que existe el registro PSAV" (es público y muy comentado),
es **armar el legajo correcto y sostener el reporte anual en el tiempo, para el PSAV chico que no tiene área
de compliance**. Canal: estudios contables/legales fintech como referidos. Pitch: "compliance CNV a precio de
PSAV chico, no de estudio grande". Ticket alto, mercado nicho, muy defendible.

---

## 5. Reparto en Regla — que tu flota de reparto cumpla la reforma laboral de plataformas antes que la
   fiscalicen ⚖️

**Qué es (de cero):** compliance de plataformas y flotas de última milla ante la **reforma laboral de
plataformas digitales** —ley nacional sancionada en febrero de 2026 que crea la figura de **"prestador
independiente de plataformas tecnológicas"**, con inscripción impositiva obligatoria (monotributo) y aportes
al Sistema Nacional del Seguro de Salud y a la PBU— y el proyecto que el gobierno de Kicillof envió a la
Legislatura bonaerense en junio de 2026, que crea el **Registro de Trabajo Mediante Plataformas Digitales** y
exige a las empresas contratar un **seguro de accidentes personales obligatorio a su cargo** para cada
repartidor. Reparto en Regla ayuda a plataformas de delivery chicas/medianas, dark stores y empresas de
logística de última milla —las que no tienen equipo legal propio, a diferencia de Rappi o PedidosYa— a
inscribir a sus repartidores, verificar que cada uno tenga el monotributo y los aportes al día, gestionar la
póliza de seguro por repartidor, y armar el reporte que exigirá el registro provincial (trabajadores activos,
condiciones contractuales, horas e ingresos promedio).

**Integración (el MOAT):**
- **Pública:** AFIP/ARCA (monotributo del prestador independiente de plataformas); Registro de Trabajo
  Mediante Plataformas Digitales de la Provincia de Buenos Aires (Ministerio de Trabajo bonaerense, en
  trámite legislativo 2026); Sistema Nacional del Seguro de Salud. La biblioteca que traduce la ley nacional
  + el proyecto provincial a una checklist operativa por repartidor es el moat.
- **Privada:** plataformas de delivery/mobility chicas y medianas, dark stores y empresas de logística de
  última milla; aseguradoras de accidentes personales como aliadas para la póliza obligatoria.

**Problema real que resuelve:** las plataformas chicas y las empresas de reparto que no son Rappi ni
PedidosYa no tienen área legal para adaptarse a una ley nueva y a un registro provincial que se viene —y el
riesgo es multas, reclamos laborales y quedar fuera del registro cuando se reglamente.

**Señal regulatoria (fuente + fecha):** el Congreso argentino **sancionó en febrero de 2026 la reforma
laboral que crea la figura del "prestador independiente de plataformas tecnológicas"**, con inscripción
impositiva y aportes obligatorios (Infobae, "Tras la sanción de la reforma laboral, qué cambia para los
repartidores de Pedidos Ya, Rappi y otras aplicaciones", 28/02/2026); el gobierno de Axel Kicillof **envió a
la Legislatura de la Provincia de Buenos Aires, en junio de 2026, un proyecto que crea el Registro de Trabajo
Mediante Plataformas Digitales** y exige seguro de accidentes personales obligatorio a cargo de la empresa,
paradores en los centros de operación y botón de pánico integrado (AgendAR, "El proyecto de Kicillof para
regularizar las aplicaciones de reparto en Buenos Aires", 02/07/2026; Ámbito, "Microcréditos, seguros y un
botón de pánico: en qué consiste el proyecto bonaerense para regularizar las aplicaciones de reparto", 2026).

**Cómo opera (ejemplo):** una dark store de comida rápida con 25 repartidores en GBA necesita adaptarse a la
nueva ley. Reparto en Regla verifica que cada repartidor tenga el monotributo activo, gestiona la póliza de
accidentes personales obligatoria de la flota completa, y arma el legajo que exigirá el registro provincial
cuando se sancione. La dark store sigue operando sin exponerse a una multa laboral ni quedar fuera del
registro el día que salga.

**Cómo se cobra:** **setup $60.000** (US$40, one-shot) + **abono $8.000/mes por repartidor activo** (US$5,4)
(verificación de monotributo + gestión de póliza + reporte al registro provincial).

**SAM/SOM (con fuente):** miles de repartidores activos en plataformas chicas/medianas y empresas de
logística de última milla en PBA/CABA, fuera del universo de Rappi/PedidosYa que ya tienen compliance
propio. **SOM año 1 conservador:** 1.000 repartidores (2–3 plataformas/empresas medianas).

**Unit economics (ARS):** setup $60.000 + abono $8.000/mes/repartidor · COGS ~$1.200/repartidor/mes
(verificación + gestión de póliza + reporte + tokens) · margen **85%** · build **4 semanas** · primer peso
**6–8 semanas**.

**Perfil:** ⚖️ mixto — mercado grande y ley nacional ya vigente, pero la pieza más valiosa (el registro
provincial) todavía es un proyecto de ley. **Realizable ahora:** parcial (la parte nacional —monotributo y
aportes— es ley vigente y ya facturable; el registro provincial aún no). **Costo de arranque:** medio.

**Riesgos:** el proyecto bonaerense puede demorar o cambiar en el trámite legislativo (Kicillof ya lo
reintentó sin éxito en años anteriores); las plataformas grandes ya tienen compliance interno (el target real
son las medianas/chicas y las empresas de logística que no); mientras el registro provincial no se
sancione, el valor inmediato es solo la parte nacional (monotributo + aportes), lo que baja el ticket
temporalmente.

**Desafío del operador:** el diferencial no es "saber que hay una reforma laboral" (salió en todos los
diarios), es **tener a cada repartidor en regla —monotributo, aportes y seguro— antes de que llegue la
fiscalización o el registro provincial**. Canal: dark stores y empresas de logística de última milla
medianas. Pitch: "que tu flota esté lista para la ley de plataformas antes de que te fiscalicen". Mercado
grande, pero va detrás de los tres primeros por depender parcialmente de un proyecto aún no sancionado.

---

## 6. Sello RIGI — certificá a tu pyme como proveedor local para los proyectos de litio y minería 💥
   (encolado)

**Qué es (de cero):** una **certificadora + directorio de proveedores locales** para proyectos adheridos al
**RIGI** (Régimen de Incentivo para Grandes Inversiones, Ley 27.742, vigente desde julio de 2024) y a su
ampliación en trámite, el **"Súper RIGI"** (media sanción en Diputados en 2026, pendiente de Senado), que
extendería el régimen a litio, uranio, baterías, hidrógeno verde y semiconductores. Todo proyecto adherido al
RIGI —ya HOY, con el régimen vigente— debe presentar y cumplir un **Plan de Desarrollo de Proveedores
Locales equivalente a al menos el 20% del monto de inversión** destinado a pago de proveedores, acreditado en
períodos bienales. El operador minero/litio necesita encontrar y probar que sus proveedores son locales y
están en condiciones de mercado; la pyme proveedora (transporte, catering, mantenimiento, insumos,
construcción) necesita aparecer en el radar y demostrar que califica. Sello RIGI certifica y lista pymes
proveedoras por provincia y rubro, arma el legajo de acreditación que el Vehículo de Proyecto Único presenta
ante la autoridad de aplicación, y hace seguimiento del cumplimiento bienal del 20%.

**Integración (el MOAT):**
- **Pública:** autoridad de aplicación del RIGI (Ministerio de Economía); registros provinciales de
  proveedores mineros (Salta, Jujuy, Catamarca); circuito de acreditación bienal del Plan de Desarrollo de
  Proveedores Locales. La biblioteca que certifica y prueba "proveedor local en condiciones de mercado" por
  provincia y rubro es el moat.
- **Privada:** operadoras de proyectos litio/minería/energía adheridos al RIGI (clientes que pagan la
  certificación y el seguimiento); cámaras mineras provinciales y pymes proveedoras como oferta certificada.

**Problema real que resuelve:** un proyecto adherido al RIGI puede perder beneficios fiscales si no acredita
el 20% de proveedores locales, y hoy no tiene forma sistemática de encontrarlos, certificarlos ni probar el
cumplimiento; la pyme proveedora de la zona, mientras tanto, no aparece en el radar del gran operador aunque
podría calificar y ganar un contrato de años.

**Señal regulatoria (fuente + fecha):** la **Ley 27.742** (Boletín Oficial, 08/07/2024) crea el RIGI y
**exige un Plan de Desarrollo de Proveedores Locales equivalente a al menos el 20% del monto de inversión**
destinado a pago de proveedores, acreditado en períodos bienales desde la adhesión del Vehículo de Proyecto
Único (Visión Desarrollista, "La reglamentación del RIGI y el Plan de desarrollo de proveedores locales");
en 2026 la Cámara de Diputados dio **media sanción al "Súper RIGI"**, que amplía el régimen a litio, uranio,
biotecnología, baterías, hidrógeno verde, semiconductores e IA (Espacio Tech, "El Gobierno Nacional presentó
el 'Súper RIGI', un plan para atraer inversiones millonarias en IA, litio y semiconductores", 27/05/2026;
La Nación, "El Gobierno envió al Congreso el 'Súper RIGI': cuáles son los beneficios que propone para las
empresas", 26/05/2026).

**Cómo opera (ejemplo):** un proyecto de litio en Salta adherido al RIGI necesita acreditar ante la autoridad
de aplicación que el 20% de su inversión fue a proveedores locales. Sello RIGI ya certificó a 30 pymes
salteñas de transporte, catering y mantenimiento; arma el legajo de acreditación bienal con esos contratos y
lo presenta en tiempo y forma. El proyecto no pierde beneficios fiscales; las pymes certificadas ganan
contratos de años con el operador.

**Cómo se cobra:** al operador del proyecto: **certificación + informe de cumplimiento bienal $1.200.000**
(US$806, por período) + **abono de curaduría de proveedores $150.000/mes** (US$101). A la pyme proveedora:
**certificación de proveedor local $80.000** (US$54, one-shot, para aparecer en el directorio).

**SAM/SOM (con fuente):** decenas de proyectos adheridos/candidatos al RIGI (litio en Salta/Jujuy/Catamarca,
minería, energía) y miles de pymes proveedoras potenciales en esas provincias. **SOM año 1 conservador:** 5
proyectos operadores + 150 pymes certificadas.

**Unit economics (ARS):** certificación bienal $1.200.000 + abono $150.000/mes + certificación pyme $80.000
· COGS ~$60.000/informe (research + verificación + trabajo humano de compliance + tokens) · margen **78%** ·
build **4–5 semanas** · primer peso **8–10 semanas**.

**Perfil:** 💥 alto beneficio — ticket muy alto por proyecto y recurrente (curaduría mensual + acreditación
bienal), pero venta B2B/B2G lenta. **Realizable ahora:** parcial — el RIGI original YA exige esto hoy (piso
de negocio inmediato), pero el universo grande (litio/uranio) depende de que el Súper RIGI pase el Senado.
**Costo de arranque:** medio-alto. **Encolado detrás de los cinco anteriores.**

**Riesgos:** depende de que el Súper RIGI avance en el Senado para expandir el universo a litio/uranio
(aunque el RIGI original ya exige el plan de proveedores hoy, dando piso de negocio inmediato con los
proyectos ya adheridos); ciclo de venta largo (se negocia con grandes operadoras y gobiernos provinciales);
competencia de consultoras grandes (Deloitte, PwC) que ya asesoran RIGI a los grandes clientes (diferencial:
el directorio/certificación de proveedores chicos, que las consultoras grandes no arman); dependencia de
decisiones políticas y del contexto macro que pueden demorar proyectos mineros.

**Desafío del operador:** el diferencial no es "saber que existe el RIGI" (lo sabe cualquier operador
minero), es **encontrar, certificar y probar el cumplimiento del 20% de proveedores locales, para el
operador que arriesga beneficios fiscales por no tener el legajo armado**. Va **encolado**: el ticket más
alto de la ronda, pero el más lento de vender y el más dependiente de que la macro y el Senado acompañen.

---

## Cuadro resumen (ARS al dólar oficial $1.488,50) — ordenado por prioridad (realizable ya + barato primero)

| # | Negocio | Sector | Perfil | Precio | Margen | Build | Realizable ya | Costo arranque | IA | Idx | prod |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Frená a Tiempo | Tránsito / scoring de licencias | 🌱 | $8k/mes por conductor | 90% | 2 sem | Sí | Bajo | full | 47 | warn |
| 2 | Chapa Vigente | Seguridad privada | 🌱 | $3,5k/mes por vigilador | 91% | 2–3 sem | Sí | Bajo | full | 45 | warn |
| 3 | Patente Viva | Patentes / INPI | 🌱 | $15k + $9k/mes | 92% | 2 sem | Sí | Bajo | full | 43 | warn |
| 4 | Activo Prolijo | Criptoactivos / CNV | ⚖️/💥 | $250k + $90k/mes | 83% | 3–4 sem | Parcial | Medio | parcial | 42 | warn |
| 5 | Reparto en Regla | Delivery / última milla | ⚖️ | $60k + $8k/mes por repartidor | 85% | 4 sem | Parcial | Medio | parcial | 39 | warn |
| 6 | Sello RIGI | Minería / litio (RIGI) | 💥 | $1,2M bienal + $150k/mes | 78% | 4–5 sem | Parcial | Medio-alto | parcial | 36 | warn |

---

## Fuentes (URLs)

**1 · Frená a Tiempo (ANSV Disposición 167/2026 · scoring nacional de licencias · SEPC CABA · UF marzo-2026):**
- https://www.cronista.com/informacion-gral/tras-anos-4-anos-de-vigencia-cambiara-para-siempre-el-sistema-de-scoring-en-la-licencia-de-conducir-asi-se-mediran-las-infracciones-de-transito/
- https://buenosaires.gob.ar/gobierno/licencias-de-conducir/sistema-de-evaluacion-permanente-de-conductores
- https://buenosaires.gob.ar/tramites/consulta-de-puntaje-en-licencia-de-conducir
- https://reporteasia.com/autos/2026/02/21/multas-de-transito-en-caba-aumentan-controles-y-sanciones-2026/
- https://consultainfracciones.seguridadvial.gob.ar/

**2 · Chapa Vigente (seguridad privada · Ley 6441 Mendoza · crecimiento 20→174 empresas · Ley 12.297 PBA):**
- https://www.legislaturasconectadas.gob.ar/Prensa/sancion_inicial_a_la_regulacion_de_la_actividad_de_seguridad_y_vigilancia_privada/5517
- https://www.hcdmza.gob.ar/site/noticias/68-noticia/9005-sancion-inicial-a-la-regulacion-de-la-actividad-de-seguridad-y-vigilancia-privada
- https://www.argentina.gob.ar/normativa/provincial/ley-6441-123456789-0abc-defg-144-6000mvorpyel/actualizacion
- https://www.mseg.gba.gov.ar/areas/dirprovsegpriv/normativa/ley_12297.pdf
- https://www.aicacyp.ar/blog/decreto-1002-99-reglamentacion-de-servicios-privados-de-seguridad-y-custodia/

**3 · Patente Viva (INPI · anualidades Ley 24.481 Art. 63 · Resolución INPI 162/2026 toma de razón 29/05/2026):**
- https://www.marval.com/publicacion/caducidad-de-patente-y-pago-parcial-de-anualidad-5243
- https://www.argentina.gob.ar/inpi/patentes-de-invencion-y-modelos-de-utilidad/preguntas-frecuentes-de-patentes-de-invencion-y
- https://mitranicaballero.com/resolucion-inpi-162-2026-nuevas-reglas-en-materia-de-transferencias-y-cambios-de-rubro-aplicables-a-marcas-patentes-modelos-y-disenos/
- https://noetingeryarmando.com/cambios-de-titularidad-en-el-inpi-nuevo-reglamento/
- https://www.boletinoficial.gob.ar/detalleAviso/primera/342588/20260529

**4 · Activo Prolijo (CNV · Registro PSAV · RG 1058/2025 · RG 1108/2026):**
- https://beccarvarela.com/novedades/resolucion-general-cnv-n1058-regulacion-de-proveedores-de-servicios-de-activos-virtuales-psav/
- https://www.cnv.gov.ar/SitioWeb/ProveedoresServiciosActivosVirtuales/RegistrosPSAV
- https://www.boletinoficial.gob.ar/detalleAviso/primera/322539/20250314
- https://payspacemagazine.com/articles/guia-experta-como-los-argentinos-pueden-legalizar-sus-cripto-activos-en-2026/
- https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-1058-2025-410635/texto

**5 · Reparto en Regla (reforma laboral plataformas · sanción nacional feb-2026 · proyecto Kicillof PBA jun-2026):**
- https://www.infobae.com/economia/2026/02/28/tras-la-sancion-de-la-reforma-laboral-que-cambia-para-los-repartidores-de-pedidos-ya-rappi-y-otras-aplicaciones/
- https://agendarweb.com.ar/2026/07/02/el-proyecto-de-kicillof-para-regularizar-las-aplicaciones-de-reparto-en-buenos-aires/
- https://www.ambito.com/ambito-nacional/microcreditos-seguros-y-un-boton-panico-que-consiste-el-proyecto-bonaerense-regularizar-las-aplicaciones-reparto-n6294468
- https://chequeado.com/el-explicador/reforma-laboral-que-cambia-para-los-repartidores-y-choferes-de-apps-que-dicen-expertos-y-como-se-regula-en-otros-paises/
- https://www.lanacion.com.ar/economia/esta-es-la-nueva-categoria-para-trabajadores-de-aplicaciones-tras-la-reforma-laboral-nid12022026/

**6 · Sello RIGI (Ley 27.742 · Plan de Desarrollo de Proveedores Locales 20% · Súper RIGI media sanción 2026):**
- https://visiondesarrollista.org/la-reglamentacion-del-rigi-y-el-plan-de-desarrollo-de-proveedores-locales/
- https://www.argentina.gob.ar/economia/rigi/que-es
- https://www.ambito.com/cual-sera-el-rol-los-proveedores-locales-el-rigi-n6057244
- https://www.espaciotech.net/2026/05/27/el-gobierno-nacional-presento-el-super-rigi/
- https://www.lanacion.com.ar/economia/el-gobierno-envio-al-congreso-el-super-rigi-cuales-son-los-beneficios-que-propone-para-las-empresas-nid26052026/
