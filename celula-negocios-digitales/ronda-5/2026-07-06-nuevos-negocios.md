# Ronda 5 — 6 negocios nuevos (creativo + analítico + ingeniería de datos + desafiador)

> **Fecha:** 2026-07-06 · **Dólar oficial BNA:** $1.488,50 · **Todo LOCAL, sin publicar.**
> **Bajada de línea aplicada:** arrancar por BOLETINES OFICIALES / NUEVA REGULACIÓN (una obligación o un
> derecho nuevo crea un mercado el día que sale → cazar el gap); mercado local argentino; la **integración
> a entes públicos/privados es el MOAT**; salir del sesgo del modelo (nada de otro chatbot/wrapper/
> dashboard/agencia genérica); resolver un problema real de la sociedad; construible con Claude Code en
> semanas. **Dos perfiles válidos:** 💥 gran beneficio/escala y 🌱 pasivo sustentable. **Prioridad:**
> primero lo realizable YA y barato; lo caro/lento queda encolado (no descartado). **Índice honesto:**
> negocios nuevos, sin construir → 39–46.
>
> **DIVERSIFICACIÓN DELIBERADA:** las rondas 3 y 4 quedaron muy fiscal/AFIP-ARCA. Ronda 5 se corre a
> **agro/logística, salud (obras sociales + PAMI), seguros, educación/RRHH y comercio exterior**,
> manteniendo el moat de integración pública/privada.

**No repetimos** ninguno de los 33 ya cubiertos: Kudos, Testigo, Fantasma, Plantillería, El Data Semanal,
Mapa del Barrio, Calculadoras fiscales, Cambió el Precio, Mercader, Confesionario, Postora, Recepcionista
IA, Directorio B2B, VetVoz, Vitrina, Back-office AFIP, Comparador con afiliados, Calificación de leads,
MediaKit.ar, PrevenIA, GremioPro, Contra-Retención, Licita, Paritaria al Día, Semáforo de Flota, Receta
Clara, Quién Firma, Buzón ARCA, APOC Guard, Reconoce, Compliance UIF, FCEM Anticipo, Etiqueta Verde.

**Nota de método (ingeniería de datos):** cada número trae fuente y supuesto. Padrón MiPyME ≈ 1,8 M
(Argentina.gob.ar/RedCAME); afiliados PAMI ≈ 5 M (INSSJP); trabajadores en el sistema de salud ≈ 14 M
(cobertura de prensa sobre la desregulación). Los índices son conservadores porque ninguno está construido
ni validado con clientes reales.

---

## 1. Grano en Regla — que la carta de porte no te desactive el CUIT en plena cosecha 🌱

**Qué es (de cero):** un vigilante del estado de un productor/transportista/acopio chico en el **SISA
(Sistema de Información Simplificado Agrícola)** y de la **Carta de Porte Electrónica de Granos (CPEDG)**.
Desde febrero-2026 ARCA **ató la carta de porte al estado SISA**: si el operador o el establecimiento no
está bien registrado en SISA (nivel de seguridad 3, datos al día), **no puede emitir la carta de porte** y,
peor, el incumplimiento documental puede **desactivar al operador y sus establecimientos en SISA** —lo que
lo deja fuera de todo el circuito de comercialización de granos—. Grano en Regla chequea el estado SISA,
avisa antes de que se caiga, valida que cada carta de porte salga bien (peso, especie, destino, CTG) y
arma el checklist para no quedar desactivado en plena cosecha.

**Integración (el MOAT):**
- **Pública:** ARCA — SISA + servicio de Carta de Porte Electrónica de Granos (emisión, CTG, control de
  cargas); cruce con el padrón de establecimientos habilitados.
- **Privada:** el corredor/acopio/transportista y su canal (WhatsApp/email) para la alerta triada.

**Problema social que resuelve:** el productor y el transportista chicos viven de la ventana de cosecha; un
error de registro o de carta de porte los para en la ruta o los saca del SISA, y pierden la venta del año.
Ordena y da certeza a la parte más informal de la cadena agrícola, que es la que menos back-office tiene.

**Señal regulatoria (fuente + fecha):** **RG Conjunta (Ministerio de Economía + ARCA) N° 5821/2026, BO
10/02/2026** — actualiza los requisitos de la Carta de Porte Electrónica de Granos y **la ata al SISA**:
solo operadores/productores inscriptos en SISA con establecimientos habilitados pueden emitir; el
incumplimiento documental habilita la **desactivación del operador y/o sus establecimientos** más sanciones
(La Nación, "Transporte de granos: el Gobierno ata la carta de porte al SISA", 10/02/2026; Tristán y
Asociados, RGC 5821/2026; Data Portuaria, 2026).

**Cómo opera (ejemplo):** un transportista de granos de 6 camiones carga sus CUIT y establecimientos. El
sistema detecta que un establecimiento quedó con datos vencidos en SISA, avisa "regularizá antes del 20/07 o
no vas a poder emitir carta de porte", y en cada viaje valida que la CPEDG salga con peso y especie
correctos y el CTG activo. No se queda parado en un control ni fuera del SISA en plena campaña.

**Cómo se cobra:** **suscripción $12.000/mes** (US$8) por CUIT monitoreado; **plan acopio/corredor
multi-CUIT** (hasta 50 CUIT/establecimientos) **$150.000/mes** (US$101). Pago por MP/tarjeta.

**SAM/SOM (con fuente):** cientos de miles de operadores inscriptos en SISA entre productores,
transportistas, acopios y corredores (padrón SISA / ARCA sector agro); campaña gruesa concentra millones de
cartas de porte al año. **SOM año 1 conservador:** 1.200 CUIT (mix directo + acopios que revenden a su red
de fleteros).

**Unit economics (ARS):** precio $12.000/mes · COGS ~$1.500/CUIT/mes (consultas SISA/CPEDG + parsing +
tokens) · margen **88%** · build **2–3 semanas** · primer peso **3–5 semanas**.

**Perfil:** 🌱 pasivo sustentable con pico estacional de cosecha (renovación pegajosa; el que lo usó una
campaña no lo suelta). **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** el acceso programático a SISA/CPEDG depende de sesión con clave fiscal delegada (frágil ante
cambios del portal, zona gris de ToS); estacionalidad fuerte (demanda pico en cosecha, valle fuera de
campaña → mitigar con abono anual); los sistemas de gestión agrícola grandes (AgroTrack, sistemas de
acopio) podrían sumar la vigilancia como módulo.

**Desafío del operador:** el diferencial no es "emitir la carta de porte" (lo hace el servicio de ARCA
gratis), es **avisar ANTES de que el SISA te desactive** y garantizar que cada carta salga sin error en la
ventana en que un día parado cuesta la venta. Canal más barato: el **acopio/corredor** (un cliente = 30–50
fleteros de su red), no el productor suelto. El pitch es "seguro contra quedar afuera del SISA en cosecha".

---

## 2. ObraLibre — ahora podés elegir tu obra social; que no te la elijan mal por default ⚖️/💥

**Qué es (de cero):** con la **desregulación de obras sociales y prepagas**, todo trabajador (relación de
dependencia, monotributista, casas particulares) puede **elegir libremente** a dónde van sus aportes y
**derivarlos directo** a la entidad que quiera —sin quedar atrapado un año en la obra social de la actividad
ni pasar por una "pasamanos"—. Pero casi nadie sabe hacerlo bien: el 90% queda en la obra social default y
pierde plata y cobertura. ObraLibre es el motor que (a) cruza el sueldo/aporte de la persona con el registro
de entidades y calcula **a qué obra social o prepaga le conviene derivar** (cobertura vs. costo de bolsillo
vs. copagos), y (b) **hace el trámite de derivación de aportes** completo, sin que pierda el beneficio.

**Integración (el MOAT):**
- **Pública:** Superintendencia de Servicios de Salud (registro de obras sociales/entidades habilitadas y
  circuito de opción de cambio), ANSES/ARCA (validación de aportes y CUIL). La biblioteca de reglas de
  derivación, topes y del Fondo Solidario de Redistribución (20% de la cuota) mantenida al día es el moat.
- **Privada:** estudios de sueldos/liquidación de haberes y áreas de RRHH que dan de alta empleados nuevos
  (canal B2B2C: cada alta es una decisión de obra social).

**Problema social que resuelve:** enorme y masivo (**14 M de trabajadores** en el sistema). La libre elección
existe en el papel pero la gente no la ejerce por desinformación y termina con peor cobertura o pagando de su
bolsillo un plus que podría cubrir con su aporte. Traducir la maraña en "a esta entidad derivá y esto ganás"
es plata y salud concretas para la familia.

**Señal regulatoria (fuente + fecha):** **Decreto 170/2024** (reglamenta el DNU 70/2023) — libre elección de
obra social/prepaga al ingresar a un empleo, sin permanencia obligatoria; **desde fines de 2024 los aportes
van directo a la entidad elegida** (se eliminó la "pasamanos"); las prepagas aportan 20% al FSR (El Cronista,
"Obras sociales y prepagas: qué cambia con la desregulación", 2024–2026; Argentina.gob.ar/salud; Arizmendi,
2025–2026). El circuito se sigue afinando con nuevas actualizaciones en 2026.

**Cómo opera (ejemplo):** un empleado nuevo con sueldo de $1.200.000 entra a una pyme. RRHH lo pasa por
ObraLibre: el motor compara su obra social por default contra 4 alternativas, detecta que derivando a otra
entidad accede al mismo plan sin copagos de guardia y sin poner plata de su bolsillo, y dispara el trámite de
opción de cambio. El trabajador gana cobertura; el estudio de sueldos entrega un servicio de valor.

**Cómo se cobra:** **fee por trámite de derivación bien hecho $25.000** (US$17) al trabajador; **abono a
estudio de sueldos/RRHH $60.000/mes** (US$40) para procesar todas las altas de su cartera; o **% del ahorro
anual** de bolsillo del empleado.

**SAM/SOM (con fuente):** ~**14 M** de trabajadores con derecho de opción (cobertura de prensa sobre la
desregulación) + rotación laboral y nuevas altas mensuales. **SOM año 1:** 4.000 trámites (mix directo +
estudios de sueldos que lo ofrecen a su cartera).

**Unit economics (ARS):** precio $25.000/trámite (o $60.000/mes B2B) · COGS ~$2.000/trámite (validación de
aportes + tokens + generación del formulario) · margen **85%** · build **3–4 semanas** · primer peso **4–6
semanas**.

**Perfil:** ⚖️/💥 — ticket chico pero **volumen enorme** vía el canal estudios de sueldos/RRHH; escala por
B2B2C. **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** riesgo de **conflicto de interés / percepción de venta de prepagas** (mitigar: cobrar al usuario
o al estudio, no comisión de la entidad, para ser asesor neutral); el trámite de opción tiene ventanas y
requisitos que cambian (hay que mantener la biblioteca al día — también es la barrera); las prepagas grandes
tienen sus propios ejecutivos de venta (pero venden lo suyo, no comparan neutral).

**Desafío del operador:** el valor no es "comparar planes" (medio mundo lo hace en una landing), es **hacer
el trámite de derivación bien y sin que el usuario pierda el beneficio**, que es donde todos se traban. Si es
solo comparador, es humo; si es "yo te muevo los aportes al lugar correcto y te queda hecho", se paga. Canal
más barato y de volumen: convenio con **estudios de liquidación de sueldos** que ya tocan cada alta.

---

## 3. Siniestro Claro — que la aseguradora te pague el auto destruido rápido y sin vueltas 🌱/⚖️

**Qué es (de cero):** un gestor del reclamo cuando tu auto es **destrucción total, incendio o robo**. Desde
2026 la SSN **cambió la documentación exigida para cobrar** —conviven títulos digitales y papel del automotor,
con formularios distintos del **DNRPA** según el caso— y las aseguradoras aprovechan la confusión para demorar
o pedir papeles de más. Siniestro Claro le arma al asegurado el **legajo correcto** (según si tiene título
digital o papel, robo vs. destrucción), controla los **plazos legales de pago**, y si la aseguradora se pasa
del plazo, **arma el reclamo ante la SSN** (que tiene procedimiento formal de denuncia del asegurado). Además
verifica que el monto ofrecido respete los **nuevos topes de RC** vigentes desde enero-2026.

**Integración (el MOAT):**
- **Pública:** SSN (condiciones contractuales uniformes, procedimiento de reclamo del asegurado, topes de
  cobertura), DNRPA (baja del automotor, título digital/papel, formularios). Empaquetar el legajo correcto por
  tipo de siniestro + el reclamo ante SSN es lo que nadie tiene prolijo para el asegurado común.
- **Privada:** el asegurado y su documentación (póliza, cédula, denuncia).

**Problema social que resuelve:** el asegurado sufrió el peor día (le robaron o destrozaron el auto) y encima
la aseguradora lo pasea con papeles y plazos; la mayoría no sabe que tiene un reclamo formal ante la SSN.
Equilibra la cancha entre la persona y la compañía, y acelera plata que ya le corresponde.

**Señal regulatoria (fuente + fecha):** **SSN Resolución 136/2026** — modifica las condiciones contractuales
uniformes del seguro automotor e incorpora disposiciones del **DNRPA** para agilizar el pago de siniestros,
contemplando la **coexistencia de títulos digitales y en papel** y los formularios aplicables en robo y
destrucción total; **SSN Res. 589/2025** — nuevos límites de cobertura de RC automotor **desde el 01/01/2026**
(Argentina.gob.ar/SSN; Boletín Oficial, Res. Sintetizada 589/2025, 03/11/2025; TodoRiesgo, análisis Res. SSN
2026).

**Cómo opera (ejemplo):** a una persona le roban el auto. Sube su póliza y datos. Siniestro Claro le dice
exactamente qué formulario del DNRPA usar (tiene título digital → tal circuito), arma el legajo, marca "la
aseguradora tiene X días para pagarte", y cuando se pasa, genera la denuncia ante la SSN. Cobra en semanas en
vez de meses, y por el monto correcto según los topes 2026.

**Cómo se cobra:** **diagnóstico $20.000** (US$13) + **success fee 12%** sobre el monto efectivamente cobrado
del siniestro (fee promedio ~$180.000 / US$121 sobre una destrucción total). Sin cobro exitoso, solo el
diagnóstico.

**SAM/SOM (con fuente):** millones de autos asegurados; cientos de miles de siniestros totales/robos al año
(universo derivado del parque automotor asegurado + estadística de robo). **SOM año 1:** 500 casos gestionados.

**Unit economics (ARS):** ingreso mixto (diagnóstico + fee variable) · COGS ~$4.000/caso (armado de legajo +
tokens + tramo semi-manual de reclamo) · margen **80%** · build **3–4 semanas** · primer peso **4–6 semanas**.

**Perfil:** 🌱/⚖️ — demanda estructural y recurrente (siempre hay robos y choques totales), ticket por caso
decente vía success fee. **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** demanda "por evento" (no recurrente por cliente → hay que alimentar flujo constante de casos vía
marketing/derivación); parte del reclamo ante SSN tiene tramo semi-manual y tiempos que no controla; los
**productores de seguros y estudios jurídicos** ya hacen parte de esto → el diferencial es el legajo DNRPA
2026 automatizado y el precio accesible; hay que educar que existe el reclamo ante la SSN.

**Desafío del operador:** el make-or-break es el **flujo de casos** (es negocio por evento, no suscripción):
sin un canal barato de captación (talleres, desarmaderos, grupos de "me robaron el auto", productores
aliados) se seca. El valor real es **el legajo correcto según la doc 2026 + el reclamo ante SSN**; sin eso es
un gestor más. Success fee para alinear: solo cobra si el asegurado cobra.

---

## 4. Título Verificado — el diploma y la matrícula del candidato, chequeados en 1 minuto 🌱

**Qué es (de cero):** verificación exprés, para empleadores y RRHH, de que el **título** y la **matrícula
profesional** que dice tener un candidato **existen y tienen validez nacional** de verdad. Cruza el título
contra el **SIDCER/Validez Nacional de Títulos** del Ministerio de Educación y la matrícula contra el colegio
o consejo profesional correspondiente, y —donde ya se emite— valida el **diploma digital** (Argentina avanza a
títulos digitales verificables, ITBA y UNC ya emiten). Devuelve un reporte simple con semáforo:
verde (verificado) / amarillo (no consta) / rojo (dato falso), con PDF para el legajo.

**Integración (el MOAT):**
- **Pública:** Ministerio de Educación — consulta de validez nacional de títulos (SIDCER) y padrón de
  instituciones autorizadas; colegios/consejos profesionales (matrícula activa). Consolidar la consulta
  fragmentada (cada jurisdicción/colegio tiene su verificador) en un flujo de 60 segundos es el diferencial.
- **Privada (opcional):** verificadores de diploma digital/blockchain de universidades que ya emiten
  (integración progresiva a medida que se digitaliza el título).

**Problema social que resuelve:** el CV mentido es epidemia (títulos inflados, matrículas vencidas, cursos
que no existen); contratar a alguien que dijo ser lo que no es cuesta caro —y en salud, seguridad o técnica
es peligroso—. Da a la pyme la verificación que hoy solo hacen las grandes con áreas de background check.

**Señal (fuente + fecha):** el Estado tiene el servicio oficial de **consulta de validez nacional de
títulos** (Argentina.gob.ar/servicio/consultar-si-un-titulo... ; SIDCER — Sistema Informático de Diplomas y
Certificaciones, sicer.educacion.gob.ar) y avanza la **digitalización verificable de diplomas** en 2025–2026
(ITBA emitió 350+ diplomas digitales; UNC emite con firma digital; proyectos LACChain/RedCLARA), lo que abre
la ventana para empaquetar la verificación (InfoNegocios; Blockchain Federal Argentina, 2025–2026).

**Cómo opera (ejemplo):** una constructora va a contratar un ingeniero. Ingresa el DNI y el título declarado.
En 1 minuto: título con validez nacional confirmada, matrícula del Colegio de Ingenieros **activa** (no
vencida), instituto emisor autorizado. Semáforo verde + PDF al legajo. En otro caso, el "MBA" declarado **no
consta** → amarillo, y RRHH repregunta antes de contratar.

**Cómo se cobra:** **pago por verificación $5.000** (US$3) o pack de 20; **abono RRHH/consultora de selección
$28.000/mes** (US$19) para verificación por volumen.

**SAM/SOM (con fuente):** cientos de miles de contrataciones formales al año + consultoras de selección +
sectores que exigen matrícula (salud, ingeniería, arquitectura, contadores). **SOM año 1:** 2.500
verificaciones/mes.

**Unit economics (ARS):** precio $5.000/verificación · COGS ~$700/verificación (consultas a servicios
públicos + tokens; buena parte es gratis) · margen **82%** · build **2–3 semanas** (el más rápido del lote) ·
primer peso **3–5 semanas**.

**Perfil:** 🌱 pasivo sustentable (bajo mantenimiento, uso recurrente del cliente B2B). **Realizable ahora:**
sí. **Costo de arranque:** bajo.

**Riesgos:** las fuentes públicas de títulos/matrículas están **fragmentadas y sin API uniforme** (parte de la
verificación es scraping/consulta por portal, frágil); consentimiento del candidato y datos personales (Ley
25.326); la digitalización de diplomas puede volverla más fácil… o hacer que la universidad ofrezca el
verificador gratis (mitigar: valor está en consolidar TODAS las fuentes + matrícula, no una sola).

**Desafío del operador:** el diferencial no es "consultar el SIDCER" (está gratis), es **consolidar título +
matrícula + institución en un semáforo de 60 segundos** para RRHH que no tiene tiempo. Si es una consulta
suelta, no se paga; si es "pegá el DNI y te digo si te está mintiendo", sí. Canal barato: consultoras de
selección y ART/medicina laboral que ya piden documentación al ingreso.

---

## 5. PAMI al 100 — el subsidio social que le devuelve al jubilado el remedio gratis 🌱

**Qué es (de cero):** desde 2026 PAMI dejó de dar los medicamentos gratis "por ser afiliado" y los ató a un
**esquema de fiscalización patrimonial**: muchos jubilados perdieron la cobertura al 100% y fueron mandados a
**recategorizarse**. Existe una salida —el **subsidio social / cobertura al 100% por razones sociales**— pero
el trámite es engorroso y lleno de requisitos patrimoniales (ingresos < 1,5 haberes mínimos, no tener más de
un inmueble, no tener prepaga, etc.). PAMI al 100 evalúa si el jubilado **califica**, arma el trámite del
subsidio social en Mi PAMI con la documentación correcta, y lo sigue hasta que la cobertura vuelve.

**Integración (el MOAT):**
- **Pública:** PAMI/INSSJP — Mi PAMI (trámite de medicamentos por razones sociales / subsidio social),
  vademécum y padrón de cobertura. La biblioteca de requisitos patrimoniales y del circuito de subsidio
  social, actualizada con cada cambio de PAMI, es el moat.
- **Privada:** el canal de contacto del afiliado o su familia; y **farmacias de barrio y geriátricos** como
  canal (les conviene que su cliente/residente recupere la cobertura y siga comprando ahí).

**Problema social que resuelve:** durísimo y masivo. Millones de jubilados con haberes mínimos que perdieron
el remedio gratis y no entienden cómo recuperarlo; muchos directamente **dejan de comprar la medicación**.
Recuperar la cobertura es salud y plata directa para el más vulnerable. Impacto social altísimo.

**Señal regulatoria (fuente + fecha):** PAMI implementó en 2026 un **nuevo esquema de fiscalización
patrimonial** para los medicamentos gratis: dejan de ser universales y dependen de la vulnerabilidad; se
exige **recategorización** y se habilita el **subsidio social por razones sociales** con requisitos
(ingresos < 1,5 haber mínimo; sin prepaga; no más de un inmueble) — (El Cronista, "Medicamentos gratis PAMI:
requisitos enero 2026"; Ámbito, "nuevo subsidio del 100% marzo 2026"; PAMI, trámite "Medicamentos sin cargo
por subsidio social", 2026).

**Cómo opera (ejemplo):** una jubilada de 74 años con haber mínimo va a la farmacia y le dicen que ya no tiene
el remedio gratis. La farmacia (aliada) la deriva a PAMI al 100: el sistema verifica que **sí califica** por
el subsidio social, arma el trámite en Mi PAMI con la DDJJ y la documentación, y en el plazo del circuito le
devuelve la cobertura al 100%. Vuelve a retirar su medicación sin pagar.

**Cómo se cobra:** **honorario por trámite $30.000** (US$20) por afiliado (o a cargo de la familia); **convenio
con farmacia/geriátrico/mutual $40.000/mes** (US$27) para gestionar a todos sus afiliados/residentes; opción
**bono social** subsidiado (la farmacia lo absorbe como fidelización).

**SAM/SOM (con fuente):** ~**5 M** de afiliados PAMI (INSSJP); una porción grande con haberes mínimos afectada
por la recategorización (cobertura de prensa 2026). **SOM año 1:** 3.000 trámites (fuerte vía farmacias y
geriátricos).

**Unit economics (ARS):** precio $30.000/trámite (o $40.000/mes B2B) · COGS ~$2.000/trámite (armado del
trámite + tokens; el cómputo es liviano) · margen **82%** · build **2–3 semanas** · primer peso **3–5
semanas**.

**Perfil:** 🌱 pasivo sustentable con **pico estructural** (la recategorización 2026 alimenta demanda por
años); B2B2C vía farmacias/geriátricos baja el CAC. **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** cliente final de **baja capacidad de pago** (por eso el canal B2B —farmacia/geriátrico/familia—
es clave, no el jubilado suelto); trámite **por evento** (no recurrente por afiliado → churn natural, se
compensa con volumen y con el abono a farmacias); PAMI puede cambiar el circuito (riesgo regulatorio, pero
también genera más demanda de gestión); sensibilidad social — hay que entregarlo como asistencia honesta, no
prometer lo que no califica.

**Desafío del operador:** el valor no es "explicar el trámite" (está en la web de PAMI), es **hacerlo por el
jubilado que no puede solo** y saber de antemano si califica para no hacerle perder el viaje. La monetización
sana es el **convenio con farmacias y geriátricos** (les recupera clientes/residentes que dejaban de comprar);
cobrarle $30.000 al jubilado suelto es más difícil. Negocio de impacto con caja modesta pero sustentable.

---

## 6. Aduana OEA Pyme — la pyme importadora/exportadora, certificada para despachar más rápido y con menos garantía 💥 (encolado)

**Qué es (de cero):** acompaña a la **pyme de comercio exterior** a certificarse como **Operador Económico
Autorizado (OEA)** —que hasta 2025 era cosa de grandes y ahora **se abrió a pymes sin volumen mínimo**— y a
operar la **VUCEA (Ventanilla Única de Comercio Exterior)**. Ser OEA da beneficios concretos: **reducción de
hasta 50% de las garantías** de actuación, despacho acelerado, menos inspecciones. El producto arma el legajo
de adhesión (buenas prácticas, seguridad de la cadena, requisitos por categoría OEA-Cumplimiento /
-Simplificación / -Seguridad), mantiene el estado de cumplimiento y guía el uso de la VUCEA.

**Integración (el MOAT):**
- **Pública:** ARCA/Aduana — programa OEA (adhesión, categorías, mantenimiento) y VUCEA (trámites de comex).
  La biblioteca de requisitos por categoría y por tipo de operador, actualizada con cada resolución, más el
  armado del legajo de seguridad de la cadena, es lo difícil de copiar.
- **Privada:** despachantes de aduana aliados (canal + validación de la parte que exige matrícula).

**Problema social que resuelve:** la pyme importadora/exportadora paga garantías caras, sufre demoras de
despacho e inspecciones, y no accede a la ventaja competitiva que ya tienen los grandes vía OEA. Democratiza
el comercio exterior eficiente para el chico —capital de trabajo inmovilizado en garantías que se libera—.

**Señal regulatoria (fuente + fecha):** **RG 5668/2025** — amplía el programa OEA e **incorpora a las pymes,
en igualdad de condiciones y sin volumen mínimo de operaciones**; beneficios: reducción de garantías (hasta
50% con aduana domiciliaria + máxima categoría), despacho acelerado, menos inspecciones; **VUCEA prorrogada
hasta el 31/12/2026** y OEA como eje de facilitación 2026 (Argentina.gob.ar, "Nuevos beneficios en el programa
OEA"; CIRA, "Avances en el programa OEA"; AduanaNews, "Las normas que marcarán 2026").

**Cómo opera (ejemplo):** una pyme que importa insumos y exporta manufactura contrata Aduana OEA Pyme. El
sistema evalúa qué categoría OEA le conviene, arma el legajo de seguridad de la cadena y de cumplimiento, la
lleva por la adhesión y —una vez certificada— le baja a la mitad las garantías y le acelera el despacho. Libera
capital de trabajo y gana previsibilidad.

**Cómo se cobra:** **onboarding de certificación $600.000** (US$403, one-shot) + **abono de mantenimiento del
estatus OEA $70.000/mes** (US$47, actualización normativa + legajo vivo + alertas).

**SAM/SOM (con fuente):** decenas de miles de pymes que operan comercio exterior (padrón de importadores/
exportadores ARCA); universo OEA recién abierto al segmento pyme. **SOM año 1:** 80 pymes certificadas.

**Unit economics (ARS):** ingreso mixto (onboarding alto + abono) · COGS ~$10.000/mes/cliente (tokens de
armado de legajo + soporte + tramo semi-manual) · margen **78%** · build **5–6 semanas** · primer peso **6–9
semanas**.

**Perfil:** 💥 alto beneficio (ticket alto, cliente que mueve volumen y valora liberar garantías).
**Realizable ahora:** parcial — la certificación tiene tramo que exige validación de despachante/experto OEA y
ciclo de venta más largo. **Costo de arranque:** medio. **Encolado detrás de los baratos.**

**Riesgos:** ciclo de venta y de certificación **largo** (la adhesión OEA no es instantánea → primer peso más
lento); depende de mantener la biblioteca OEA/VUCEA al día ante cada resolución; los **despachantes de aduana**
ya asesoran a sus clientes y podrían ofrecer el armado (mitigar: aliarse con ellos como canal, no competir);
el volumen depende del ciclo de comercio exterior.

**Desafío del operador:** el diferencial no es "saber qué es el OEA" (el despachante lo sabe), es **empaquetar
el armado del legajo de seguridad de la cadena + el mantenimiento del estatus** para que la pyme lo logre sin
un consultor carísimo. Va **encolado**: gran upside y ticket alto, pero arranque más lento, costo medio y
dependencia de un aliado matriculado. Se prioriza detrás de los cuatro baratos-y-ya de arriba.

---

## Cuadro resumen (ARS al dólar oficial $1.488,50) — ordenado por prioridad (realizable ya + barato primero)

| # | Negocio | Sector | Perfil | Precio | Margen | Build | Realizable ya | Costo arranque | Idx | prod |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Grano en Regla | Agro/logística | 🌱 | $12k/mes/CUIT | 88% | 2–3 sem | Sí | Bajo | 46 | warn |
| 2 | ObraLibre | Salud/obras sociales | ⚖️/💥 | $25k/trámite · $60k/mes | 85% | 3–4 sem | Sí | Bajo | 45 | warn |
| 3 | Siniestro Claro | Seguros | 🌱/⚖️ | fee 12% (~$180k) + $20k | 80% | 3–4 sem | Sí | Bajo | 44 | warn |
| 4 | Título Verificado | Educación/RRHH | 🌱 | $5k/verif. · $28k/mes | 82% | 2–3 sem | Sí | Bajo | 40 | warn |
| 5 | PAMI al 100 | Salud/adultos mayores | 🌱 | $30k/trámite · $40k/mes | 82% | 2–3 sem | Sí | Bajo | 39 | warn |
| 6 | Aduana OEA Pyme | Comercio exterior | 💥 | $600k onb + $70k/mes | 78% | 5–6 sem | Parcial | Medio | 41 | warn |

---

## Fuentes (URLs)

**1 · Grano en Regla (Carta de Porte Electrónica de Granos / SISA · RGC 5821/2026):**
- https://www.lanacion.com.ar/economia/campo/transporte-de-granos-el-gobierno-ata-la-carta-de-porte-al-sisa-y-endurece-los-controles-nid10022026/
- https://tristanyasociados.com/2026/02/resolucin-general-conjunta-arca-n-58212026-bo-10022026/
- https://dataportuaria.ar/nota/24703/actualizan-requisitos-para-la-carta-de-porte-electronica-en-el-transporte-de-granos-y-derivados-en-argentina/
- https://www.afip.gob.ar/actividadesAgropecuarias/sector-agro/carta-porte-electronica/carta-porte-granos/que-es.asp
- https://aduananews.com/argentina-moderniza-las-cartas-de-porte-para-granos-y-derivados-con-nuevos-controles/

**2 · ObraLibre (desregulación de obras sociales y prepagas · Decreto 170/2024):**
- https://www.cronista.com/economia-politica/obras-sociales-y-prepagas-que-cambia-con-la-desregulacion/
- https://www.cronista.com/economia-politica/desregulacion-de-obras-sociales-y-prepagas-como-hacer-el-tramite-para-cambiar-de-cobertura/
- https://arizmendi.ar/desregulacion-de-obras-sociales-y-prepagas
- https://www.argentina.gob.ar/salud/nueva-actualizacion-del-monto-cubrir-por-obras-sociales-y-prepagas
- https://www.25digital.com.ar/index.php/2026/03/15/monotributo-2026-que-obras-sociales-aceptan-nuevos-afiliados-y-como-ampliar-la-cobertura-medica/

**3 · Siniestro Claro (SSN Res. 136/2026 y 589/2025 · seguro automotor):**
- https://www.argentina.gob.ar/noticias/nuevas-condiciones-para-el-cobro-del-seguro-automotor
- https://www.argentina.gob.ar/noticias/nuevos-limites-de-cobertura-de-los-seguros-de-responsabilidad-civil-automotor-y-de
- https://www.boletinoficial.gob.ar/detalleAviso/primera/333893/20251103
- https://todoriesgo.com.ar/analisis-resolucion-ssn-actualizacion-condiciones-cobertura-seguro-automotor/
- https://www.grupoprofessional.com.ar/blog/a-partir-de-2026-nuevos-topes-de-cobertura-en-los-seguros-de-responsabilidad-civil-automotor/

**4 · Título Verificado (validez nacional de títulos / SIDCER / diploma digital):**
- https://www.argentina.gob.ar/servicio/consultar-si-un-titulo-o-certificado-cuenta-con-validez-nacional
- https://sicer.educacion.gob.ar/sidcer/index.html
- https://www.argentina.gob.ar/tema/estudiar/validar-titulos
- https://bfa.ar/blockchain/casos-de-uso/titulos-academicos
- https://infonegocios.info/enfoque/nunca-mas-un-titulo-perdido-o-dudoso-llega-el-blockchain-para-garantizar-titulaciones

**5 · PAMI al 100 (fiscalización patrimonial medicamentos / subsidio social 2026):**
- https://www.cronista.com/economia-politica/medicamentos-gratis-pami-los-requisitos-para-mantener-la-cobertura-en-enero-2026-y-no-quedarse-afuera/
- https://www.ambito.com/informacion-general/jubilados-pami-como-acceder-los-medicamentos-gratis-y-al-nuevo-subsidio-del-100-marzo-2026-n6255174
- https://www.pami.org.ar/tramite/medicamentos-razones-sociales/seleccionar-motivo?motivo=7&id_subtipo=301
- https://www.lmneuquen.com/pais/pami-marzo-2026-los-3-requisitos-patrimoniales-acceder-medicamentos-gratis-el-nuevo-esquema-fiscalizacion-n1231165
- https://www.ambito.com/informacion-general/pami-cuales-son-los-nuevos-limites-ingresos-acceder-medicamentos-gratis-2026-n6264731

**6 · Aduana OEA Pyme (Operador Económico Autorizado · RG 5668/2025 · VUCEA):**
- https://www.argentina.gob.ar/noticias/nuevos-beneficios-en-el-programa-oea-de-simplificacion-del-comercio-exterior
- https://www.cira.org.ar/es/ejes-estrategicos/facilitacion-de-comercio/avances-en-el-programa-oea/
- https://aduananews.com/las-normas-que-marcaran-2026/
- https://www.afip.gob.ar/oea/aspectos-generales/
- https://servicios.infoleg.gob.ar/infolegInternet/anexos/355000-359999/357317/norma.htm
</content>
</invoke>
