# Ronda 13 — 6 negocios nuevos (inteligencia de señales + creativos + analíticos + ingeniería de datos + marketing + desafiador)

> **Fecha:** 2026-07-06 · **Dólar oficial BNA:** $1.488,50 · **Todo LOCAL, sin publicar.**
> **Bajada de línea aplicada:** arrancar por BOLETINES OFICIALES / NUEVA REGULACIÓN (una obligación o un
> derecho nuevo crea un mercado el día que sale → cazar el gap); mercado local argentino; la **integración
> a entes públicos/privados es el MOAT**; salir del sesgo del modelo; resolver un problema real; construible
> con Claude Code en semanas. **Dos perfiles válidos:** 💥 gran beneficio/escala y 🌱 pasivo sustentable.
> **Prioridad:** primero lo realizable YA y barato. **Índice honesto:** negocios nuevos, sin construir ni
> validar con clientes → 39–46.
>
> **DIVERSIFICACIÓN DELIBERADA (Ronda 13):** las rondas 3–12 cubrieron fiscal/ARCA, agro/ganadería,
> salud/PAMI, seguros (retenciones y siniestros, NO la matrícula del PAS), RRHH, comex, energía, tránsito,
> minería, juego, textil, datos personales, guarderías, SUBE, GLP, áridos y sangre. Ronda 13 se corre a
> **SECTORES NUEVOS con regulación fresca 2025-2026: subastas judiciales electrónicas (CSJN), apicultura/
> trazabilidad SENASA, educación privada desregulada, náutica deportiva (REGINAVE), matrícula y capacitación
> del PAS (SSN) y órdenes médicas electrónicas para ópticas/ortopedias/kinesiología (Ley 27.553 ampliada)**
> — ninguno tocado antes en estos ángulos.

**No repetimos** ninguno de los ~83 ya cubiertos en rondas 1-12 (verificado contra `STATUS-NEGOCIOS.md` y
las rondas anteriores). Se chequeó específicamente que no haya solapamiento con: **Postora** (community
manager IA — nada que ver con subastas), **Receta Clara** (liquidaciones PAMI de farmacias — acá vamos al
lado receptor NO-farmacia de órdenes de prácticas/dispositivos), **Cuota Justa** (cuotas sindicales — acá
vamos a aranceles de colegios) y **Siniestro Claro / Contra-Retención** (seguros del lado asegurado/fiscal —
acá vamos a la matrícula y capacitación obligatoria del PAS).

**Nota de método (ingeniería de datos):** cada número trae fuente y supuesto. Apicultores: dato duro
RENAPA/Magyp 2025 (**22.330 productores, +5% vs 2024, 4,2 millones de colmenas**). Martilleros/corredores:
dato COFECI citado por Infobae 07/02/2025 (**~40.000 matriculados** en todo el país; los que actúan en
subastas judiciales son un subconjunto, estimado 3.000-5.000). Colegios sin aporte estatal: dato del
Ministerio de Desregulación citado por El Cronista (**~2.000 establecimientos, 6% del sistema**). Subastas
electrónicas CSJN: dato duro del propio portal (**20 inmuebles + 29 vehículos vendidos a mayo 2026**, a 3
meses del arranque). PAS: **~47.000 matriculados (estimado** sobre dataset público SSN en datos.gob.ar,
actualizado feb 2025). Embarcaciones REY y puntos receptores de órdenes (ópticas/ortopedias/kinesiología):
**sin padrón público consolidado → marcados (estimado)**. Los índices son conservadores: nada está
construido ni validado con clientes.

---

## 1. Martillo Digital — el back-office del martillero + el radar de remates judiciales electrónicos 💥

**Qué es (de cero):** dos patas sobre el nuevo régimen de subastas judiciales electrónicas. (a) Para
**martilleros**: un back-office que los sube al nuevo flujo de la Acordada 15/2025 — checklist de plazos
(acreditar designación, informar a la Oficina de Subastas, publicar edictos con 10 días hábiles de
antelación), generación del acta de remate en el formulario del Portal, y seguimiento de cada expediente.
(b) Para **inversores/compradores**: un radar que agrega TODAS las subastas electrónicas judiciales del
país (portal CSJN + Provincia de Buenos Aires + Entre Ríos + Córdoba + CABA) y manda alertas por WhatsApp
según tipo de bien, zona y precio base — hoy hay que revisar 5+ portales distintos a mano.

**Integración (el MOAT):**
- **Pública:** portal `subastaselectronicasjudiciales.csjn.gov.ar` (CSJN), portales provinciales de
  subastas (SCBA, STJ Entre Ríos, TSJ Córdoba), Boletín Oficial (edictos).
- **Privada:** colegios de martilleros (21 solo en PBA) como canal de distribución.

**Problema real que resuelve:** la Corte cambió de raíz cómo se remata en Argentina — desde el 01/10/2025
la subasta presencial a viva voz murió en el fuero nacional/federal y todo pasa por un portal con puja
continua online. El martillero de 55 años que remató toda su vida en la calle Talcahuano hoy tiene que
manejar un portal, plazos digitales y actas electrónicas. Y del otro lado, el comprador que caza
oportunidades tiene los remates dispersos en portales por jurisdicción, sin alertas.

**Señal regulatoria (fuente + fecha):** **Acordada 15/2025 CSJN** (11/07/2025, InfoLEG/argentina.gob.ar) —
nuevo Reglamento de Subastas Judiciales Electrónicas, obligatorio para todos los tribunales nacionales y
federales de CABA desde el **01/10/2025**. El portal arrancó el **20/02/2026** (csjn.gov.ar, "Ya están en
marcha las subastas electrónicas judiciales") y a **mayo 2026** ya se habían vendido **20 inmuebles y 29
vehículos** (csjn.gov.ar, "Subastas electrónicas judiciales: modelo consolidado"). Infobae (11/07/2025)
cubrió el reglamento; abogados.com.ar analizó el sistema para CABA. El modelo se está replicando en
provincias — Entre Ríos y PBA ya tienen reglamento propio.

**Cómo opera (ejemplo):** un martillero de San Isidro designado en una ejecución hipotecaria carga el
expediente en Martillo Digital; el sistema le arma el cronograma (edictos, informe a la Oficina, fecha de
puja), le genera los textos de edicto y el acta final, y le avisa cada vencimiento por WhatsApp. En
paralelo, 200 inversores suscriptos al radar reciben la alerta "departamento 3 amb. en Caballito, base
US$45.000, puja abre 15/08" con el link al portal oficial.

**Cómo se cobra:** martilleros: **$35.000/mes (US$23,5)** por back-office. Inversores: radar **$12.000/mes
(US$8)** con alertas ilimitadas. Sin comisión sobre la puja (eso es del martillero y del juzgado).

**SAM/SOM (con fuente):** ~40.000 martilleros/corredores matriculados país (COFECI vía Infobae 07/02/2025);
los activos en subastas judiciales: 3.000-5.000 (estimado — subconjunto judicial). Compradores de remates:
mercado de nicho pero probado (los grupos de remates judiciales en Facebook juntan decenas de miles de
miembros — señal de demanda medible). **SOM año 1:** 40 martilleros + 300 suscriptores del radar.

**Lente MARKETING (canal + paid):** el radar se vende con **SEO programático** (una página por subasta
publicada, indexando "remate judicial + zona/bien" — demanda de búsqueda existente y sin dueño claro) +
grupos de Facebook de remates. CAC orgánico casi cero, el contenido lo generan los propios portales
oficiales. Para martilleros: los **colegios departamentales** (charla/convenio) — venta directa, paid NO
cierra (universo chico). Veredicto marketing: el radar B2C es de los embudos más baratos de todas las
rondas; el B2B martillero es lento pero con canal institucional claro.

**Lente DESAFIADOR (triple filtro):**
1. **"El portal oficial es gratis y público"** — cierto, pero son 5+ portales sin alertas ni filtros; el
   valor es la agregación + el aviso a tiempo (una puja dura días y hay que señar antes). El dato: 49
   bienes vendidos en 3 meses solo en CSJN — el flujo recién arranca y va a crecer con las provincias.
2. **"Los martilleros no pagan software"** — olfato de calle: mitad de razón. El martillero judicial
   factura por remate (comisión de ley) y un remate perdido por un plazo vencido le cuesta cientos de
   miles; $35k/mes es seguro anti-mala-praxis. Igual, arrancar por el radar (B2C) y usar martilleros como
   segunda ola.
3. **"Ya existen portales de remates privados"** — existen para remates PRIVADOS (Narvaezbid, etc.); el
   agregador de subastas JUDICIALES electrónicas multi-jurisdicción con alertas es hueco real hoy — la
   ventana abrió en febrero 2026. Ventaja del primero.
**Veredicto:** VA. Señal fresquísima, demanda medible, build barato, doble ticket.

**Unit economics (ARS):** radar $12.000/mes + martilleros $35.000/mes · COGS ~$1.500/usuario/mes (scraping
+ WhatsApp + hosting) · margen **~87%** · build **3 sem** · primer peso **3-4 sem**.

**Perfil:** 💥 con cola 🌱 (el radar es suscripción de bajo mantenimiento). **Realizable ahora:** sí.
**Costo de arranque:** bajo.

**Riesgos:** los portales oficiales pueden sumar alertas propias (mitigación: multi-jurisdicción + filtros
ricos + historial de precios que el Estado no va a hacer); el volumen de subastas todavía es chico (49
ventas en 3 meses) — el radar necesita que el flujo crezca, aunque la obligatoriedad garantiza pipeline;
scraping de portales judiciales requiere mantenimiento continuo.

---

## 2. Colmena en Regla — el DT-e apícola y el RENAPA vigente, sin que el apicultor toque una computadora 🌱

**Qué es (de cero):** un servicio por WhatsApp para apicultores y salas de extracción que resuelve la nueva
trazabilidad obligatoria de la miel: emite el **DT-e (Documento de Tránsito electrónico)** para mover alzas
melarias del apiario a la sala de extracción, controla que el **RENAPA** esté vigente (vence cada 2 años y
sin él no se puede ni vender ni emitir DT-e), verifica la habilitación de la sala destino contra el padrón
SENASA, y arma el legajo de trazabilidad (SITA) que piden los exportadores/acopiadores.

**Integración (el MOAT):**
- **Pública:** SENASA (DT-e, padrón de salas de extracción y acopios), RENAPA (Magyp), SITA (Sistema
  Informático de Trazabilidad Apícola).
- **Privada:** salas de extracción, cooperativas apícolas y exportadores de miel (Argentina es top-3
  exportador mundial) como canal y como cliente pagador.

**Problema real que resuelve:** SENASA está implementando de forma paulatina el DT-e para el movimiento de
alzas melarias — un trámite de autogestión digital que el apicultor promedio (rural, mayor, con señal
intermitente) no va a hacer solo. Si el RENAPA está vencido o la sala no está habilitada, el DT-e no sale y
la cosecha queda trabada. La sala de extracción, que recibe de decenas de productores, es la que sufre el
cuello: necesita que TODOS sus proveedores lleguen con papeles en regla.

**Señal regulatoria (fuente + fecha):** SENASA/Secretaría de Agricultura — **incorporación del DT-e para
envíos de alzas melarias a salas de extracción, con implementación paulatina** y encuentros con el sector
para su adopción (argentina.gob.ar, noticia oficial "Apicultura: Encuentro con el sector sobre el uso del
DT-e en envíos a salas de extracción de miel", campaña 2025/26); **Resolución SENASA 723/2025** (exceptúa a
los transportes apícolas de la habilitación general de transporte de animales vivos — reacomodamiento
normativo del mismo paquete). Requisito duro documentado: para emitir el DT-e, RENAPA del origen y
habilitación de la sala destino deben estar **vigentes** (senasa.gob.ar). Dato de contexto: exportaciones
apícolas 2025 en el mayor volumen en 7 años (El Observador).

**Cómo opera (ejemplo):** una sala de extracción de Azul contrata Colmena en Regla para sus 60 proveedores.
Antes de la cosecha, el sistema barre los RENAPA de los 60 (aviso a los 8 que están por vencer, con el
trámite asistido por WhatsApp), y en temporada cada productor manda un audio ("llevo 40 alzas el jueves") y
recibe su DT-e emitido, listo para el control en ruta.

**Cómo se cobra:** salas de extracción/cooperativas: **$30.000/mes (US$20)** por gestión de todo su padrón
de proveedores. Apicultor directo: **$60.000/año (US$40)** o $8.000/mes en temporada.

**SAM/SOM (con fuente):** **22.330 productores apícolas registrados en RENAPA (2025, +5% vs 2024) con 4,2
millones de colmenas** (Magyp/renapa). Salas de extracción habilitadas: padrón público SENASA, cientos en
las provincias mieleras (PBA concentra ~50% de la producción). **SOM año 1:** 25 salas/cooperativas + 300
apicultores directos.

**Lente MARKETING (canal + paid):** canal dominante = **B2B2C vía salas de extracción y cooperativas** (un
convenio arrastra 40-80 productores de una vez) + grupos de WhatsApp/Facebook apícolas (muy activos) +
INTA/PROAPI como legitimador. Paid NO cierra (ticket chico, público rural disperso); el embudo es gremial
y de boca a boca. Estacionalidad: vender en invierno (ahora), cobrar fuerte en cosecha (oct-mar).

**Lente DESAFIADOR (triple filtro):**
1. **"El DT-e es gratis y autogestionable"** — igual que la garrafa: el valor no es el trámite, es
   hacerlo por un canal (WhatsApp/audio) que el productor rural usa de verdad. Precedente interno: el
   mismo patrón validado en Grano en Regla y Trazabovina.
2. **"El apicultor chico no paga"** — cierto, por eso el pagador primario es la SALA (que factura en
   serio y pierde plata si la cosecha se traba). El apicultor directo es upsell, no base.
3. **"Implementación paulatina = enforcement blando hoy"** — olfato: verdad, el control en ruta arranca
   laxo. Pero la ventana es exactamente esa: posicionarse ANTES de que sea exigido a rajatabla, con la
   sala como sponsor. Riesgo aceptado y explícito.
**Veredicto:** VA. Nicho sin competidor de software específico, canal claro, COGS mínimo.

**Unit economics (ARS):** $30.000/mes/sala + $60.000/año/apicultor · COGS ~$2.500/mes/sala (WhatsApp API +
scraping padrones) · margen **~89%** · build **2-3 sem** · primer peso **4-6 sem** (ciclo de venta gremial).

**Perfil:** 🌱 pasivo sustentable con pico estacional. **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** estacionalidad fuerte (la caja se concentra en la temporada de cosecha); SENASA puede demorar
o simplificar el DT-e; universo pagador acotado (el negocio es de nicho: techo realista bajo pero muy
defendible); dependencia de que los padrones SENASA/RENAPA sean consultables de forma estable.

---

## 3. Arancel Libre — inteligencia de precios para colegios privados en el primer año de cuotas libres 💥⚖️

**Qué es (de cero):** el benchmark privado de aranceles educativos. Desde noviembre 2025 los colegios
privados sin aporte estatal fijan cuotas SIN autorización previa, y desde junio 2026 ni siquiera están
obligados a informarlas — el dato público de precios DESAPARECIÓ justo cuando más lo necesitan. Arancel
Libre releva cuotas reales por zona/nivel/perfil (relevamiento propio + red de colegios que comparten datos
en forma anónima), y le vende al colegio: benchmark de su zona, simulador de aumento vs. riesgo de
morosidad/fuga, y kit de comunicación del aumento a las familias.

**Integración (el MOAT):**
- **Privada:** cámaras del sector (AIEPA, AIEPBA, consejos de educación católica), red de colegios
  aportantes de datos (el dataset colaborativo ES el moat — nadie más lo tiene desde que el Estado dejó
  de recolectarlo).
- **Pública:** normativa provincial residual (los subsidiados siguen regulados por provincia — segundo
  mercado).

**Problema real que resuelve:** un colegio sin aporte de zona norte hoy fija la cuota 2027 a ciegas: no
sabe qué cobran los 15 comparables de su zona (ya no se informa a nadie), tiene morosidad creciente y
familias que migran. Poner la cuota $50.000 arriba o abajo del mercado son cientos de millones al año.
Pagaban ese dato con la regulación; ahora nadie lo tiene.

**Señal regulatoria (fuente + fecha):** **Decreto 787/2025** (BO, noviembre 2025) derogó el Decreto
2417/1993 y liberó cuotas y matrículas de colegios sin aporte estatal (El Cronista, Ámbito, Río Negro,
11/11/2025). **Resolución 12/2026** de la Secretaría de Coordinación de Producción (BO **09/06/2026** — hace
27 días) derogó la Resolución 368/2025 y **eliminó la obligación de informar aranceles con anticipación**
(BAE Negocios, InfoRegión, 09/06/2026). Universo afectado: **~2.000 colegios, 6% del sistema** (Ministerio
de Desregulación vía El Cronista).

**Cómo opera (ejemplo):** un instituto bilingüe de Pilar contrata el informe de su corredor (Pilar-Escobar,
nivel inicial+primaria+secundaria): recibe percentiles de cuota por nivel, matrícula, extras (comedor,
deportes, doble escolaridad) y tendencia de aumentos del corredor; el simulador le dice que un aumento del
8% lo deja en el percentil 60 con riesgo de fuga bajo. La IA arma el relevamiento (llamadas/consultas de
admisión simuladas por operador + formularios web) y el informe; el humano audita muestras.

**Cómo se cobra:** **informe de zona $180.000 (US$121) una vez** + **suscripción $60.000/mes (US$40)** con
simulador, actualización trimestral y kit de comunicación. Cámaras: licencia institucional a negociar.

**SAM/SOM (con fuente):** núcleo: ~2.000 colegios sin aporte (fuente citada). Mercado ampliado: los
institutos subsidiados también compran benchmark para negociar con su provincia (universo total de gestión
privada: ~14.000 establecimientos, (estimado) sobre datos del sistema educativo). **SOM año 1:** 60
colegios suscriptos + 25 informes sueltos, concentrado en AMBA (donde está la densidad de sin-aporte).

**Lente MARKETING (canal + paid):** venta consultiva B2B — **cámaras y consejos** (una charla en AIEPBA pone
el producto frente a cientos de representantes legales), LinkedIn a apoderados/representantes legales,
y PR en medios del sector educativo (La Nación/Infobae cubren cuotas todos los años — el "índice Arancel
Libre" como contenido de prensa gratis). Paid NO aplica; el growth loop es el dataset: cada colegio que
entra aporta su dato y mejora el benchmark (efecto red).

**Lente DESAFIADOR (triple filtro):**
1. **"El dataset inicial cuesta"** — cierto, es el negocio de la ronda con arranque menos automático:
   relevar 300-400 colegios de AMBA lleva 4-6 semanas de trabajo asistido por IA (mystery shopping de
   admisión). Mitigación: arrancar por 2-3 corredores de alta densidad y vender ahí mismo.
2. **"Las cámaras lo pueden hacer gratis"** — pueden, pero no lo hicieron en 30 años de regulación y
   tienen conflicto (representan a los colegios, no van a publicar quién cobra caro). Un tercero neutral
   anónimo es la figura correcta. Riesgo real: que una consultora educativa establecida (hay 2-3) lo
   agregue como línea — ventaja nuestra: velocidad y precio.
3. **"2.000 colegios es SAM chico"** — con ticket de $60k/mes, 60 clientes = $43M ARR: chico para un
   fondo, excelente para esta célula. Y el primer año de libertad de precios + inflación es EL momento
   de máxima ansiedad de pricing. La ventana es ahora (cuotas 2027 se fijan sep-nov 2026).
**Veredicto:** VA, con la advertencia del costo del dataset. Es el 💥 de la ronda si el efecto red prende.

**Unit economics (ARS):** $180.000/informe + $60.000/mes · COGS ~$8.000/mes/cliente + costo hundido del
relevamiento inicial (~$1,5M en horas asistidas, (estimado)) · margen **~85%** post-dataset · build **3-4
sem** (relevamiento en paralelo) · primer peso **5-7 sem**.

**Perfil:** 💥⚖️ mixto — informe transaccional + suscripción con efecto red. **Realizable ahora:** sí
(ventana sep-nov 2026 para cuotas 2027 obliga a arrancar YA). **Costo de arranque:** medio-bajo.

**Riesgos:** el relevamiento por mystery shopping tiene zona gris reputacional (mitigar con red de aporte
voluntario anónimo cuanto antes); si la macro estabiliza los aumentos, la ansiedad de pricing baja; una
re-regulación futura devolvería el dato público (riesgo político real en año electoral).

---

## 4. PAS al Día — que ningún productor de seguros opere con la matrícula caída 🌱

**Qué es (de cero):** el tablero de cumplimiento del Productor Asesor de Seguros. Monitorea contra los
registros públicos de la SSN el estado de cada matrícula (vigencia, capacitación anual PCC cumplida,
sanciones), avisa las fechas duras del Programa de Capacitación (en 2026: primer cuatrimestre 16/03–17/07,
segundo 10/08–18/12, arancel $28.700 por cuatrimestre) y los vencimientos de rúbrica de libros. Para el PAS
individual es una agenda regulatoria; para **sociedades de productores, brokers y aseguradoras** es el
control de TODA su red: la aseguradora que liquida comisiones a un PAS inhabilitado tiene problema
regulatorio propio.

**Integración (el MOAT):**
- **Pública:** SSN (registro de PAS/REPAS, dataset público en datos.gob.ar, circulares del PCC, boletín de
  sanciones).
- **Privada:** aseguradoras (~190), sociedades de PAS y brokers, asociaciones (APAS/FAPASA), medios del
  sector (100% Seguro, Todo Riesgo) como canal.

**Problema real que resuelve:** el PAS que no hace el curso obligatorio del cuatrimestre queda inhabilitado
para operar; se entera tarde, pierde renovaciones y comisiones. Del otro lado, un broker con 80 PAS
asociados o una aseguradora con 2.000 productores activos no tiene un semáforo que le diga hoy quién de su
red está en regla — lo chequean a mano contra el sitio de la SSN, si lo chequean.

**Señal regulatoria (fuente + fecha):** la SSN oficializó el **Programa de Capacitación 2026** para PAS y
aspirantes, con estructura bicuatrimestral, temarios pautados obligatorios y **nuevos aranceles ($28.700
por asistente por cuatrimestre)** — cubierto por 100seguro.com.ar ("Atención Productores Asesores: este es
el Programa de Capacitación 2026 y los nuevos aranceles"), Revista Todo Riesgo y El Seguro en Acción
(fines 2025/2026). Cursada 1er cuatrimestre: **16/03–17/07/2026** (cierra en 11 días — pico de urgencia
AHORA); 2do: **10/08–18/12/2026**. Además la SSN publica altas de matrícula por resolución continua (ej.
Res. Sintetizada 483/2025, BO 05/09/2025) y mantiene el dataset público de PAS en datos.gob.ar.

**Cómo opera (ejemplo):** un broker de Rosario con 60 PAS asociados carga los números de matrícula; el
sistema los cruza semanalmente contra los registros SSN y el estado del PCC, y el 1 de julio le avisa:
"9 de tus PAS todavía no acreditaron el curso del cuatrimestre que cierra el 17/07 — estos son". A cada PAS
le llega el recordatorio por WhatsApp con el link de inscripción.

**Cómo se cobra:** PAS individual: **$6.000/mes (US$4)** — precio de vidriera. Sociedades/brokers:
**$90.000/mes (US$60)** hasta 100 matrículas monitoreadas. Aseguradoras: **$300.000/mes (US$202)** por red
completa + API.

**SAM/SOM (con fuente):** **~47.000 PAS matriculados (estimado** sobre el dataset público de la SSN en
datos.gob.ar, act. feb 2025); ~190 aseguradoras (SSN); sociedades de PAS: la SSN inscribe nuevas por tanda
todos los meses (estimado 1.500+ activas). **SOM año 1:** 400 PAS individuales + 20 brokers + 2
aseguradoras.

**Lente MARKETING (canal + paid):** el sector tiene **medios de nicho baratos y muy leídos** (100% Seguro,
Todo Riesgo, El Seguro en Acción — banners/sponsors de bajo costo, audiencia = 100% target): acá el paid SÍ
cierra (CAC estimado $15-25k contra LTV de $70k+ del PAS individual y de millones del broker). Segundo
canal: APAS/FAPASA (convenio de beneficio a afiliados). Imán: newsletter gratuito "lo que cambió esta
semana en la SSN" (patrón validado en la célula: Paritaria al Día).

**Lente DESAFIADOR (triple filtro):**
1. **"El dato es público, cualquiera lo chequea gratis"** — el REPAS es consulta manual uno-por-uno; el
   valor es el monitoreo CONTINUO de una red completa + la alerta a tiempo. Mismo patrón que APOC Guard
   (validado): dato público + vigilancia = producto.
2. **"FAPASA/APAS lo pueden regalar"** — riesgo real; mitigación: ser nosotros el proveedor white-label
   de la asociación (cobrarle a la asociación, no competirle).
3. **"El PAS individual a $6k no mueve la aguja"** — correcto, es marketing con precio: el negocio real
   son brokers y aseguradoras (compliance de red). Si en 6 meses no entra ningún broker, el negocio no
   es — criterio de corte explícito.
**Veredicto:** VA. Regulación con calendario duro que se repite todos los años = ingreso recurrente
estructural. El más 🌱 de la ronda.

**Unit economics (ARS):** $6.000-300.000/mes según capa · COGS ~$1.000/cliente/mes (scraping SSN + WhatsApp)
· margen **~90%** · build **2 sem** (el más corto de la ronda) · primer peso **2-3 sem** (la fecha del
17/07 es gancho de lanzamiento inmediato).

**Perfil:** 🌱 pasivo sustentable puro. **Realizable ahora:** sí. **Costo de arranque:** bajo (el más
barato de la ronda).

**Riesgos:** la SSN podría lanzar avisos propios a matriculados (baja el valor del recordatorio individual,
no del control de red); dependencia del formato de los registros públicos SSN; el mercado asegurador está
en consolidación — menos PAS chicos a futuro (el dato 2026 de altas sigue positivo).

---

## 5. Orden Válida — la bandeja de órdenes médicas electrónicas para ópticas, ortopedias y kinesiología 💥

**Qué es (de cero):** desde julio 2025 la receta electrónica dejó de ser solo de medicamentos: **estudios,
prácticas, procedimientos y dispositivos médicos** (anteojos, plantillas, órtesis, sesiones de kinesiología)
también deben prescribirse electrónicamente. Las farmacias ya tienen validadores; **el resto del ecosistema
receptor quedó huérfano**. Orden Válida es la bandeja de entrada del receptor no-farmacia: la óptica/
ortopedia/centro de kinesio recibe la orden digital, el sistema valida que el prescriptor exista y esté
habilitado (REFEPS) y que la plataforma emisora esté inscripta (ReNaPDiS), la archiva para la auditoría de
la obra social, y arma el legajo de facturación.

**Integración (el MOAT):**
- **Pública:** ReNaPDiS (Registro Nacional de Plataformas Digitales Sanitarias), REFEPS/SISA (padrón
  federal de profesionales de salud), normativa Ley 27.553 + resoluciones del Ministerio de Salud.
- **Privada:** obras sociales y prepagas (el auditor que rechaza órdenes truchas), cámaras de ópticas y
  ortopedias, distribuidores de insumos ópticos como canal.

**Problema real que resuelve:** la óptica de barrio vive de recetas de lentes; hoy le llegan como PDF por
WhatsApp, capturas, links de cinco plataformas distintas. No sabe validar si esa orden es legítima ni le
queda archivo prolijo, y la obra social le rechaza la facturación por "orden inválida" — plata perdida.
Con la ampliación de 2025, ese caos se volvió la norma para TODO estudio y dispositivo.

**Señal regulatoria (fuente + fecha):** **Resolución 2214/2025 del Ministerio de Salud** (oficializada
**21/07/2025** — COFA: "El Ministerio de Salud amplió el uso obligatorio de la receta electrónica a todas
las indicaciones médicas"; argentina.gob.ar: "El Ministerio de Salud completa la implementación de la
receta electrónica: ahora también será obligatoria para estudios, prácticas y procedimientos"). Base: Ley
27.553 con receta electrónica como única modalidad desde el **01/01/2025** (Infobae 03/12/2024) y
plataformas obligadas a inscribirse en ReNaPDiS con interoperabilidad exigida.

**Cómo opera (ejemplo):** una óptica de Quilmes recibe por WhatsApp la orden de lentes de un paciente; la
reenvía al número de Orden Válida, que en segundos responde: prescriptor verificado en REFEPS (matrícula
activa, oftalmólogo), plataforma inscripta en ReNaPDiS, orden archivada en el legajo del paciente con
sello de tiempo. A fin de mes, exporta el paquete de órdenes validadas para presentar a cada obra social.

**Cómo se cobra:** **$25.000/mes (US$17)** por punto receptor (bandeja + validación + archivo ilimitado);
plan cadena (3+ locales) $18.000/local.

**SAM/SOM (con fuente):** puntos receptores no-farmacia: ópticas ~4.500 (estimado, cámaras del sector),
ortopedias ~1.200 (estimado), centros/consultorios de kinesiología ~8.000 (estimado, sobre matriculados
activos con consultorio), laboratorios y centros de diagnóstico chicos ~5.000 (estimado) → **universo
15.000-19.000 puntos (estimado)**. **SOM año 1:** 150 puntos pagos, arrancando por ópticas (dolor más
claro: la receta ES su venta).

**Lente MARKETING (canal + paid):** Google Ads sobre búsquedas nuevas ("receta electrónica óptica
obligatoria", "validar orden médica digital") — demanda de búsqueda creada por la propia norma, CAC
estimado $20-30k contra LTV $300k+: **el paid SÍ cierra**. Canal 2: distribuidores de insumos ópticos y
laboratorios de lentes (llegan a todas las ópticas del país todas las semanas — comisión por alta). Canal
3: cámaras y colegios de kinesiólogos (cursos de "cómo cumplir").

**Lente DESAFIADOR (triple filtro):**
1. **"El enforcement es laxo — siguen todos con papel"** — olfato de calle: verdad a medias. La multa no
   llega, pero el RECHAZO de la obra social sí, y eso es plata hoy: el pitch no es "cumplí la ley", es
   "que no te rechacen la facturación". Si ese dolor no paga, el negocio muere — validar con 10 ópticas
   antes de escalar.
2. **"Las plataformas de prescripción van a cubrir al receptor"** — las grandes (del lado médico) están
   ocupadas con medicamentos y financiadores; el receptor chico no-farmacia es cola larga que no les
   mueve la aguja. Ventana de 12-18 meses (estimado).
3. **"No hay API pública unificada de REFEPS/ReNaPDiS"** — cierto: la validación es semi-artesanal
   (consultas a padrones públicos + heurísticas). Es fragilidad técnica Y barrera de entrada — quien
   arme ese motor de validación primero, lo licencia.
**Veredicto:** VA con warn. El mercado es grande y la norma es firme; el riesgo es la velocidad de
adopción real del receptor chico.

**Unit economics (ARS):** $25.000/mes/punto · COGS ~$2.000/punto/mes (WhatsApp + OCR/validación IA +
almacenamiento) · margen **~88%** · build **3-4 sem** · primer peso **4-5 sem**.

**Perfil:** 💥 escala (universo de 15-19k puntos con el mismo producto). **Realizable ahora:** sí.
**Costo de arranque:** bajo.

**Riesgos:** adopción lenta si las obras sociales no aprietan con los rechazos (el driver real no es la
multa); heterogeneidad de plataformas emisoras (mantenimiento de parsers); una plataforma grande de
recetas podría lanzar módulo receptor (mitigar firmando cadenas y distribuidores rápido); manejo de dato
sanitario exige cuidado legal desde el día uno (aprendizaje de Sangre en Regla / Ley 26.529).

---

## 6. Amarra Lista — la gestoría náutica digital del nuevo REGINAVE 🌱

**Qué es (de cero):** una gestoría digital para el dueño de embarcación deportiva y para guarderías/clubes
náuticos, sobre el REGINAVE desregulado: matriculación REY, transferencias de lanchas usadas, renovaciones,
bajas, con el nuevo **régimen simplificado para embarcaciones deportivas** del Decreto 37/2025 — más un
tablero de vencimientos (carnet náutico, matafuegos, bengalas, revisiones) para que la guardería tenga la
flota de sus clientes en regla. El diferencial: precio transparente y trámite 100% por WhatsApp, contra el
despachante naval tradicional de honorario opaco.

**Integración (el MOAT):**
- **Pública:** Prefectura Naval (trámites web/extranet, Registro Nacional de Buques, REY), nuevos
  aranceles (Disposición 117/2025).
- **Privada:** guarderías náuticas, clubes, brokers de lanchas y astilleros como canal (el broker que
  vende la lancha necesita la transferencia hecha YA).

**Problema real que resuelve:** comprar una lancha usada en Tigre sigue significando perseguir a un
despachante, papeles de Prefectura y semanas de espera — aunque el trámite de fondo se simplificó y
abarató muchísimo en 2025. La brecha entre "la norma ya es simple" y "el usuario no lo sabe/no lo hace"
es exactamente el negocio de la gestoría digital: cobrar por velocidad y certeza, no por acceso.

**Señal regulatoria (fuente + fecha):** **Decreto 37/2025** — nuevo REGINAVE (Régimen de la Navegación
Marítima, Fluvial y Lacustre), firmado por Sturzenegger/Bullrich: elimina autorizaciones por zona, libre
deuda para matrículas y trámites redundantes, y crea el **régimen especial simplificado que incluye a
todas las embarcaciones deportivas y de recreación** (Infobae 29/01/2025; Weekend/Perfil: "Nuevo régimen
de navegación: ¡burocracia, afuera!" y "Ya están vigentes las nuevas normativas para usuarios de
embarcaciones deportivas"; CACEL sobre el régimen simplificado). **Disposición 117/2025** de la Autoridad
Marítima: reducción de **más de 50 aranceles** para embarcaciones deportivas y mercantes, Valor Unidad a
$286 (argentina.gob.ar).

**Cómo opera (ejemplo):** un comprador cierra una semirrígida usada en San Fernando; el broker le pasa el
contacto de Amarra Lista. Por WhatsApp sube DNI, boleto y matrícula; el sistema arma el legajo de
transferencia REY con el arancel nuevo (mucho más barato que lo que el comprador cree), lo presenta vía
los canales web de Prefectura y le avisa cada avance. La guardería donde queda la lancha suma el barco a
su tablero de vencimientos.

**Cómo se cobra:** **$60.000 (US$40) por trámite** de transferencia/matriculación (más aranceles oficiales
aparte, transparentes) · guarderías/clubes: **$45.000/mes (US$30)** por tablero de flota + descuento para
sus clientes.

**SAM/SOM (con fuente):** parque de embarcaciones deportivas registradas: **(estimado) 130.000-180.000**
(no hay padrón público consolidado del REY; proxy: mercado náutico AMBA-Litoral, guarderías y clubes).
Guarderías náuticas y clubes: **(estimado) 400-600** entre Tigre/San Fernando, litoral y lagos. Mercado de
usados: miles de transferencias/año (estimado). **SOM año 1:** 25 trámites/mes + 12 guarderías.

**Lente MARKETING (canal + paid):** Google Ads sobre "transferencia lancha prefectura precio" y similares
— intención altísima, ticket $60k: **paid cierra** (CAC estimado $10-15k). Canal 2: **brokers náuticos y
guarderías con comisión por derivación** (ellos sufren el trámite trabado tanto como el comprador). Canal
3: grupos náuticos (Náutica/Weekend, foros, Facebook). Estacionalidad: la demanda pica ago-dic (pre
temporada) — lanzar ahora deja 1 mes de rodaje.

**Lente DESAFIADOR (triple filtro):**
1. **"Los despachantes navales ya existen"** — sí, y cobran opaco y atienden mal al deportivo chico
   (su cliente rentable es el mercante). Mismo playbook que gestorías DNRPA digitales (patrón validado
   en el mercado automotor: Patente Viva de la ronda 9 atacó el ángulo vecino). El diferencial es precio
   fijo + WhatsApp + velocidad.
2. **"La desregulación hace el DIY tan fácil que nadie paga gestor"** — riesgo cierto a 3-5 años; hoy la
   extranet de Prefectura sigue siendo hostil para el usuario ocasional (1 trámite cada 5 años). Cobramos
   la transición, no la eternidad — y el tablero de guarderías es el ingreso recurrente que queda.
3. **"Mercado estacional y AMBA-céntrico"** — verdad; se acepta y se dimensiona así (SOM chico). Es un
   negocio de nicho rentable, no un cohete.
**Veredicto:** VA como 🌱 de nicho. El más chico de la ronda en techo, pero de arranque simple y paid que
cierra desde el día uno.

**Unit economics (ARS):** $60.000/trámite + $45.000/mes/guardería · COGS ~$8.000/trámite (horas de gestión
asistida por IA + presentaciones) · margen **~80%** · build **2-3 sem** · primer peso **3-4 sem**.

**Perfil:** 🌱 pasivo sustentable de nicho (transaccional + recurrente de guarderías). **Realizable
ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** techo de mercado bajo (nicho deportivo); Prefectura puede seguir simplificando hasta volver
trivial el DIY; parte del trámite puede exigir presencialidad/documentación física según delegación
(operar con gestor corresponsal en Tigre al inicio); estacionalidad de la demanda.

---

## Resumen de prioridad (realizable ya + barato primero)

| # | Negocio | Perfil | Realizable ahora | Costo arranque | Índice |
|---|---|---|---|---|---|
| 1 | PAS al Día | 🌱 pasivo | Sí | Bajo (el más barato) | 43 |
| 2 | Martillo Digital | 💥 + cola 🌱 | Sí | Bajo | 46 |
| 3 | Colmena en Regla | 🌱 pasivo estacional | Sí | Bajo | 42 |
| 4 | Orden Válida | 💥 escala | Sí | Bajo | 41 |
| 5 | Amarra Lista | 🌱 nicho | Sí | Bajo | 39 |
| 6 | Arancel Libre | 💥⚖️ mixto | Sí (ventana sep-nov) | Medio-bajo (dataset) | 44 |

**Recomendación del ciclo:** arrancar por **PAS al Día** (build de 2 semanas, gancho de urgencia inmediato:
el cuatrimestre del PCC cierra el 17/07) y **Martillo Digital** (la señal más fresca y con demanda B2C
medible — el radar de remates se lanza con SEO casi gratis). **Arancel Libre** es el de mayor potencial
estratégico (efecto red sobre un dato que el Estado dejó de recolectar hace 27 días) pero exige decidir
YA por la ventana de cuotas 2027 — se eleva al dueño como decisión de inversión del dataset. Colmena en
Regla y Orden Válida en segunda ola (venta gremial/validación de dolor). Amarra Lista queda como nicho
oportunista si sobra capacidad.

**Fuentes principales de la ronda:** Acordada 15/2025 CSJN (InfoLEG/argentina.gob.ar, 11/07/2025) ·
csjn.gov.ar novedades 20/02/2026 y mayo 2026 · Infobae 11/07/2025 y 07/02/2025 · Decreto 787/2025 (BO
11/2025) y Resolución 12/2026 (BO 09/06/2026; BAE Negocios/InfoRegión) · El Cronista (colegios sin aporte)
· Resolución 2214/2025 Ministerio de Salud (COFA 21/07/2025; argentina.gob.ar) · Ley 27.553 / receta
electrónica única desde 01/01/2025 (Infobae 03/12/2024) · SENASA DT-e alzas melarias + Res. 723/2025
(argentina.gob.ar) · RENAPA/Magyp 2025 (22.330 productores) · SSN Programa de Capacitación 2026
(100seguro.com.ar, Todo Riesgo, El Seguro en Acción) · dataset PAS datos.gob.ar · Decreto 37/2025 REGINAVE
+ Disposición 117/2025 (Infobae 29/01/2025; argentina.gob.ar; Weekend/Perfil; CACEL).
