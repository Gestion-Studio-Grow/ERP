# Ronda 4 — 6 negocios nuevos (creativo + analítico + ingeniería de datos + desafiador)

> **Fecha:** 2026-07-06 · **Dólar oficial BNA:** $1.488,50 · **Todo LOCAL, sin publicar.**
> **Bajada de línea aplicada:** arrancar por BOLETINES OFICIALES / NUEVA LEGISLACIÓN (una obligación o
> un derecho nuevo crea un mercado el día que sale → cazar el gap); mercado local argentino; la
> **integración a entes públicos/privados es el MOAT**; salir del sesgo del modelo (nada de otro
> chatbot/wrapper/dashboard/agencia genérica); resolver un problema real de la sociedad; construible con
> Claude Code en semanas. **Dos perfiles válidos:** 💥 gran beneficio/escala y 🌱 pasivo sustentable.
> **Prioridad:** primero lo realizable YA y barato; lo caro/lento queda encolado (no descartado).
> **Índice honesto:** negocios nuevos, sin construir → 38–48.

**No repetimos** ninguno de los 27 ya cubiertos: Kudos, Testigo, Fantasma, Plantillería, El Data
Semanal, Mapa del Barrio, Calculadoras fiscales, Cambió el Precio, Mercader, Confesionario, Postora,
Recepcionista IA, Directorio B2B, VetVoz, Vitrina, Back-office AFIP, Comparador con afiliados,
Calificación de leads, MediaKit.ar, PrevenIA, GremioPro, Contra-Retención, Licita, Paritaria al Día,
Semáforo de Flota, Receta Clara, Quién Firma.

**Nota de método (ingeniería de datos):** cada número trae fuente y supuesto. Padrón MiPyME ≈ 1,8 M
(Argentina.gob.ar / RedCAME); monotributistas ≈ 4,5 M (padrón ARCA, orden de magnitud citado en prensa
fiscal). Los índices son conservadores porque ninguno está construido ni validado con clientes reales.

---

## 1. Buzón ARCA — que ninguna notificación fiscal te agarre dormido 🌱

**Qué es (de cero):** un vigilante del **Domicilio Fiscal Electrónico (DFE)** de ARCA (y de las
e-ventanillas de rentas provinciales y de la Secretaría de Trabajo). Lee las comunicaciones apenas
entran, las clasifica por urgencia y **plazo de vencimiento**, avisa por WhatsApp/email y arma un
checklist de qué responder — antes de que el plazo corra solo. La trampa que resuelve: en el DFE, si no
abrís el mensaje, quedás **notificado de oficio el lunes siguiente** a que esté disponible; el reloj
arranca igual y la multa cae automática.

**Integración (el MOAT):**
- **Pública:** ARCA — DFE (servicio con clave fiscal, con delegación nivel 3 del contribuyente); rentas
  provinciales (ARBA/AGIP y sus buzones); Secretaría de Trabajo (que también notifica por DFE).
- **Privada:** el canal del contribuyente/estudio (WhatsApp/email) para la alerta triada.

**Problema social que resuelve:** el pequeño contribuyente no entra al buzón, queda notificado de oficio
y le caen **multas automáticas actualizadas 2025–2026** que van desde $10.000 hasta clausura temporal,
embargo de cuentas o inhabilitación de CUIT para monotributistas. Es plata y continuidad del negocio
perdidas por no leer un mensaje.

**Señal regulatoria (fuente + fecha):** ARCA endureció y automatizó el régimen sancionatorio del DFE;
prensa fiscal 2025–2026 documenta las multas automáticas y el mecanismo de notificación de oficio el
lunes posterior (El Cronista, "Multas automáticas de ARCA", 2025–2026; guías oficiales ARCA/AFIP del DFE
vigentes 2025–2026).

**Cómo opera (ejemplo):** un monotributista delega el DFE al estudio. El sistema detecta una intimación
de ARCA cargada un miércoles, la clasifica "urgente — 10 días hábiles", avisa el mismo día por WhatsApp
"tenés una intimación por falta de presentación, vence el 22/07, así se responde" y le evita la multa
automática de $10.000 + la escalada a embargo.

**Cómo se cobra:** **suscripción $9.000/mes** (US$6) por CUIT monitoreado; plan estudio contable
multi-CUIT (hasta 50 CUIT) **$180.000/mes** (US$121). Pago por MP/tarjeta.

**SAM/SOM (con fuente):** ~**1,8 M** MiPyMEs (Argentina.gob.ar/RedCAME) + ~**4,5 M** monotributistas
(orden de magnitud, padrón ARCA en prensa). **SOM año 1 conservador:** 2.000 CUIT (mix directo + estudios
que revenden a su cartera).

**Unit economics (ARS):** precio $9.000/mes · COGS ~$400/CUIT/mes (login programático + parsing + tokens
de clasificación) · margen **90%** · build **2–3 semanas** · primer peso **3–5 semanas**.

**Perfil:** 🌱 pasivo sustentable (bajo mantenimiento, renovación mensual pegajosa). **Realizable ahora:**
sí. **Costo de arranque:** bajo.

**Riesgos:** ARCA **no expone una API oficial de lectura del buzón** → la automatización depende de sesión
con clave fiscal delegada (frágil ante cambios del portal y en zona gris de ToS); requiere que el cliente
delegue el DFE (barrera de confianza); responsabilidad si se pierde una notificación (mitigar: se vende
como asistente/alerta, no como garantía legal).

**Desafío del operador:** el make-or-break no es clasificar el mensaje (eso lo hace la IA), es **sostener
el acceso automatizado al DFE sin API oficial** cuando ARCA cambia el portal. Si eso se rompe seguido, el
producto miente y el cliente se va. Se arranca con delegación formal + monitoreo del portal, y se prioriza
el segmento **estudio contable** (un cliente = 30–50 CUIT, CAC amortizado y menos churn que el
monotributista suelto).

---

## 2. APOC Guard — la prueba fechada de que tu proveedor estaba limpio 💥/⚖️

**Qué es (de cero):** antes de que una pyme tome el crédito fiscal de IVA de una compra, chequea a cada
proveedor y comprobante contra la **base APOC de facturas apócrifas de ARCA** + CUIT activo + CAE/CAI
vigente, y **guarda una constancia con fecha y hora** de que "al momento de operar el proveedor estaba
limpio". Esa constancia es exactamente la defensa que la Justicia validó en 2025–2026: la inclusión
**posterior** de un proveedor en APOC **no es tacha retroactiva**, y el contribuyente solo está obligado a
verificar al momento de la operación (CUIT vigente + no estar en e-APOC). Sin esa foto fechada, no hay con
qué defenderse del ajuste.

**Integración (el MOAT):**
- **Pública:** ARCA — constancia de inscripción + consulta de la **base APOC** (accesible por servicios/API
  de facturación tipo TusFacturas). Empaquetar la consulta masiva + la constancia probatoria fechada es lo
  que nadie tiene prolijo.
- **Privada:** el ERP/sistema de compras del cliente (padrón de proveedores).

**Problema social que resuelve:** ARCA ajusta IVA y Ganancias impugnando el crédito por proveedores que
**años después** caen en APOC; la pyme pierde plata por algo que no podía saber. Este producto le da la
prueba objetiva y le baja el riesgo fiscal.

**Señal regulatoria (fuente + fecha):** cadena de fallos 2025–2026 que limitan a ARCA — el Tribunal Fiscal
y la Justicia sostienen que la inclusión posterior en APOC no opera como tacha automática ni retroactiva y
que la obligación del contribuyente se ciñe a verificar CUIT activo + CAI/CAE vigente + no inclusión en
e-APOC **al momento** de la operación (iProfesional, "Facturas apócrifas: fallo rechazó reclamo de ARCA",
2026; Ámbito, "La Justicia limita/pone límites a los ajustes por facturas apócrifas", 2025–2026; fallo CIJ
oct-2025).

**Cómo opera (ejemplo):** una distribuidora carga sus 40 proveedores del mes. El sistema corre la consulta
masiva, marca 2 proveedores con alerta APOC y 38 limpios, y emite un **PDF fechado** por cada compra
("verificado el 06/07/2026 14:12 — proveedor activo, sin inclusión en e-APOC"). Si en 2028 ARCA impugna,
la pyme abre el PDF y el ajuste no prospera.

**Cómo se cobra:** **SaaS $22.000/mes** (US$15) pyme; **estudio contable $120.000/mes** (US$81)
multi-cliente; o **por lote** de verificación ($6.000 / 100 comprobantes) para el que no quiere abono.

**SAM/SOM (con fuente):** ~**1,8 M** MiPyMEs (Argentina.gob.ar) + ~**50.000** contadores matriculados
(orden de magnitud, consejos profesionales). **SOM año 1:** 250 estudios/pymes.

**Unit economics (ARS):** precio $22.000/mes · COGS ~$2.500/mes (consultas API + almacenamiento probatorio
+ tokens) · margen **85%** · build **2–3 semanas** · primer peso **3–5 semanas**.

**Perfil:** 💥/⚖️ mixto — escala vía estudios contables (canal B2B2B) con margen alto. **Realizable ahora:**
sí. **Costo de arranque:** bajo.

**Riesgos:** la consulta a la base APOC depende de servicios de terceros/ARCA (si cambia el acceso, se
rompe); parte del valor es "seguro que ojalá nunca uses" → hay que educar por qué pagar antes del ajuste;
un software de facturación grande podría sumar la constancia como feature.

**Desafío del operador:** el diferencial no es "consultar APOC" (medio mundo lo hace suelto), es la
**constancia probatoria fechada e inalterable** que sirve en el Tribunal Fiscal. Si no es prueba sólida,
es una consulta más. El pitch al contador es "esto es tu escudo cuando ARCA te ajusta al cliente", no
"otra validación".

---

## 3. Reconoce — cuántos años de aportes te faltan para jubilarte (y cómo comprarlos) 🌱

**Qué es (de cero):** desde que **terminó la moratoria previsional el 23/03/2025**, millones que no llegan
a 30 años de aportes quedaron sin camino claro a la jubilación. Reconoce cruza la **historia laboral de
ANSES**, calcula exactamente los años/meses faltantes y arma la estrategia posible hoy: **Plan de Pago de
Deuda Previsional (Ley 27.705)** para activos (mujeres 50–59, varones 55–64, hasta 60 cuotas, comprando
períodos faltantes desde los 18 hasta mar-2012), reconocimiento **Ley 24.476** para quienes ya tienen edad,
o encaminar a **PUAM**. Te dice el número: cuánto cuesta y cómo comprar lo que falta.

**Integración (el MOAT):**
- **Pública:** ANSES (Mi ANSES — historia laboral y consulta de aportes), ARCA (aportes de autónomos y
  monotributo para reconstruir períodos). La biblioteca de reglas de cada régimen (27.705, 24.476, PUAM,
  edades, ventanas) mantenida al día es el moat.
- **Privada:** derivación a un estudio previsional aliado para el trámite formal donde haga falta firma.

**Problema social que resuelve:** enorme y urgente. Con moratoria se jubilaba la mayoría de las mujeres y
buena parte de los varones; sin ella hay un **tsunami de personas en edad sin cobertura**, perdidas entre
opciones que nadie les explica. Impacto social directo + disposición a pagar por resolver el futuro propio.

**Señal regulatoria (fuente + fecha):** fin de la moratoria previsional el **23/03/2025** (Infobae,
mar-2025; Chequeado, 2025); quedan vigentes el **Plan de Pago de Deuda Previsional Ley 27.705** (CPCE Santa
Fe 2; iProfesional 2026) y la **Ley 24.476** para edad jubilatoria.

**Cómo opera (ejemplo):** una mujer de 58 años, empleada, con 22 años de aportes, sube su historia laboral.
Reconoce detecta 8 años faltantes comprables por Ley 27.705, calcula la deuda y las cuotas (hasta 60),
arma el cronograma "si empezás hoy, a los 60 llegás con los 30 años" y la deriva al estudio aliado para la
gestión. Sale de la incertidumbre con un plan concreto.

**Cómo se cobra:** **diagnóstico $35.000** (US$24) + **honorario por armado del plan $120.000** (US$81) o
% del beneficio anualizado; **seguimiento del plan de cuotas $12.000/mes** (US$8).

**SAM/SOM (con fuente):** cientos de miles llegan cada año a edad jubilatoria sin 30 años (universo que
dependía de la moratoria; INDEC/ANSES y cobertura de prensa 2025). **SOM año 1:** 1.500 diagnósticos.

**Unit economics (ARS):** precio combinado ~$155.000/caso + seguimiento · COGS ~$3.000/caso (consulta +
tokens; el cómputo es liviano) · margen **82%** · build **3–4 semanas** · primer peso **4–6 semanas**.

**Perfil:** 🌱 pasivo sustentable con pico de demanda estructural (el fin de la moratoria alimenta el
mercado por años). **Realizable ahora:** sí. **Costo de arranque:** bajo.

**Riesgos:** el acceso a la historia laboral requiere clave de seguridad social del titular (fricción, no
delegable fácil); el cálculo de deuda previsional tiene aristas legales → hay que entregarlo como
**asistencia** con validación del estudio aliado, no como dictamen; ANSES puede cambiar las reglas del
juego (riesgo político-regulatorio, pero también crea más demanda de asesoría).

**Desafío del operador:** el valor no es "consultar tus aportes" (eso lo hace Mi ANSES gratis), es
**traducir la maraña de regímenes en un número y un plan accionable** — cuánto, en cuántas cuotas, y si te
conviene 27.705, 24.476 o PUAM. Si no baja a una decisión concreta, es otra calculadora. El canal más
barato: acuerdos con estudios contables y sindicatos que ya tienen la lista de gente a punto de jubilarse.

---

## 4. Compliance UIF — el oficial de cumplimiento enlatado para el Sujeto Obligado chico 💥/⚖️

**Qué es (de cero):** inmobiliarias, escribanías, concesionarias y contadores son **Sujetos Obligados**
ante la UIF y casi ninguno chico tiene compliance officer. Este producto arma y **mantiene vivo** su
sistema de Prevención de Lavado de Activos: manual, matriz de riesgo, **perfil del cliente** (adaptado a la
**Res. UIF 78/2025**: basado solo en documentación de origen lícito — escrituras, bancaria, registral — sin
DDJJ impositiva), monitoreo de **umbrales (750 SMVM)**, generación del **ROS**, y la gestión del alta y
actualización de datos que ahora es obligatoria **exclusivamente por el sistema SRO+ (Res. UIF 37/2026)**.

**Integración (el MOAT):**
- **Pública:** UIF — SRO+ (registro y actualización del SO), Reporteweb (ROS). La biblioteca de umbrales,
  formularios y procedimientos por tipo de SO, actualizada con cada resolución, es lo difícil de copiar.
- **Privada:** el sistema/legajo de clientes del SO.

**Problema social que resuelve:** el SO chico está expuesto a **multas UIF enormes** por no tener el
sistema al día, y la Res. 37/2026 endureció el registro. Democratiza un compliance que hoy solo pagan los
grandes, y ayuda a que el circuito inmobiliario/notarial esté más limpio.

**Señal regulatoria (fuente + fecha):** **Res. UIF 78/2025** (jun-2025) — nuevos criterios, perfil de
cliente basado en origen lícito sin DDJJ impositiva, umbrales llevados a 750 SMVM para escribanos y
registros; **Res. UIF 37/2026** — el alta y la carga de documentación como SO pasan a hacerse
**exclusivamente por SRO+**, con la documentación simultánea al registro (Tavarone Rovelli; Nicholson y
Cano; Comercio y Justicia, 2025–2026).

**Cómo opera (ejemplo):** una inmobiliaria de 3 martilleros contrata el servicio. El sistema le genera el
manual y la matriz de riesgo, la da de alta en SRO+ con la documentación exigida, y cada vez que aparece
una operación sobre 750 SMVM le arma el legajo del cliente con el perfil y, si corresponde, el ROS. Deja
de estar en infracción sin pagar un consultor caro.

**Cómo se cobra:** **onboarding $250.000** (US$168) + **suscripción $60.000/mes** (US$40) de mantenimiento
(actualización normativa, legajos, alertas de umbral).

**SAM/SOM (con fuente):** miles de inmobiliarias + ~**2.500** escribanías + concesionarias + contadores SO
(Colegio de Escribanos; padrones profesionales). **SOM año 1:** 120 SO.

**Unit economics (ARS):** precio $60.000/mes + onboarding · COGS ~$8.000/mes (tokens de armado de legajos +
soporte) · margen **80%** · build **4–5 semanas** · primer peso **5–8 semanas**.

**Perfil:** 💥/⚖️ — ticket medio-alto, canal por colegios profesionales, alta pegajosidad (compliance
recurrente). **Realizable ahora:** sí, con validación de un compliance officer aliado. **Costo de
arranque:** medio.

**Riesgos:** **responsabilidad legal** si el sistema falla ante una fiscalización UIF (mitigar: se entrega
como herramienta + validación de un oficial de cumplimiento matriculado, no como dictamen autónomo); la UIF
cambia resoluciones seguido → hay que mantener la biblioteca al día (es también la barrera de entrada);
consultoras de compliance ya atienden a los grandes y podrían bajar de segmento.

**Desafío del operador:** vender miedo regulatorio funciona una vez; para renovar hay que **mantener el
sistema realmente al día** con cada resolución UIF y que el alta en SRO+ pase sin observaciones. El pitch
es "seguro contra multa UIF y contra que te rechacen el registro", no "otro software". Canal barato:
convenio con colegios de escribanos e inmobiliarias que necesitan que sus matriculados cumplan.

---

## 5. FCEM Anticipo — la factura que la gran empresa te tiene que aceptar, cobrada antes 💥

**Qué es (de cero):** la MiPyME que le vende a una gran empresa está **obligada a emitir Factura de Crédito
Electrónica MiPyME (FCEM)** cuando supera el monto mínimo (**$5.549.862 desde el 14/04/2026**). FCEM
Anticipo emite la FCEM correcta, **vigila el plazo de aceptación tácita (21 días corridos** — si la gran
empresa no la rechaza, queda aceptada y se vuelve **título ejecutivo**), avisa cada hito, y una vez que es
título la **encamina a descuento** (MAV / mercado de capitales / banco) para que la pyme cobre anticipado.
No toma riesgo crediticio: es la capa de gestión + originación que hoy no existe empaquetada para el chico.

**Integración (el MOAT):**
- **Pública:** ARCA — régimen FCEM (emisión, registro, seguimiento de aceptación).
- **Privada:** **MAV / Mercado Argentino de Valores**, ALyCs y bancos para el descuento del título. El
  acuerdo de originación con un colocador es la parte difícil de armar (y el moat).

**Problema social que resuelve:** la MiPyME proveedora cobra a 60–90 días y financia con su caja a la gran
empresa; la FCEM le da **certeza de cobro y acceso a crédito**, pero el régimen está **subutilizado** por
desconocimiento. Convertir una obligación fiscal en liquidez es plata real para el proveedor chico.

**Señal regulatoria (fuente + fecha):** ARCA actualizó el **monto mínimo de emisión de FCEM a $5.549.862 a
partir del 14/04/2026** (Contadores en Red; Blog del Contador, 2026); el régimen se prorrogó y se ajustaron
casos de cesión en oct-2025 (Errepar, 28/10/2025). Aceptación tácita a 21 días corridos y conversión en
título ejecutivo negociable (Argentina.gob.ar / ARCA, vigente 2025–2026).

**Cómo opera (ejemplo):** una metalúrgica factura $8.000.000 a una automotriz. El sistema emite la FCEM,
cuenta los 21 días, avisa "aceptada tácitamente el 05/08 — ya es título ejecutivo" y le ofrece descontarla:
la pyme cobra ~$7.700.000 hoy en vez de esperar 75 días. FCEM Anticipo cobra su fee de originación.

**Cómo se cobra:** **fee de originación 0,8–1,5%** del monto descontado (en una FCEM de $8.000.000 ≈
$64.000–120.000 / US$43–81) + **suscripción $40.000/mes** (US$27) por la gestión y el seguimiento del
régimen.

**SAM/SOM (con fuente):** decenas de miles de MiPyMEs proveedoras de grandes empresas obligadas a emitir
FCEM (universo derivado del régimen ARCA + padrón MiPyME). **SOM año 1:** 150 empresas activas descontando.

**Unit economics (ARS):** ingreso mixto (fee variable + abono) · COGS ~$6.000/mes/cliente + costo de la
integración con el colocador · margen **75%** (hay tramo semi-manual con el ALyC) · build **5–6 semanas** ·
primer peso **6–9 semanas**.

**Perfil:** 💥 alto beneficio/escala (fee sobre volumen financiado). **Realizable ahora:** parcial —
depende de cerrar acuerdo con un ALyC/MAV. **Costo de arranque:** medio. **Encolado detrás de los baratos.**

**Riesgos:** el corazón (descuento) **depende de un acuerdo con un colocador/MAV** que puede tardar; hay
players de factoring y las propias grandes empresas con programas de confirming que compiten; el volumen
depende del ciclo económico y de la disciplina de emisión FCEM (que muchas pymes esquivan).

**Desafío del operador:** la emisión y el seguimiento se copian; el negocio vive del **spread de originación
y del acuerdo con quien descuenta**. Sin colocador aliado, es solo un recordatorio de facturas. Por eso va
encolado detrás de los baratos: gran upside, pero arranque más lento y dependiente de un tercero financiero.

---

## 6. Etiqueta Verde — la etiqueta energética que ya piden para escriturar 🌱/⚖️

**Qué es (de cero):** un negocio contrarian de segundo orden. **Santa Fe ya exige la Etiqueta de Eficiencia
Energética de la vivienda en toda escritura traslativa de dominio**; Entre Ríos, Mendoza y Río Negro
sancionaron su ley; el **PRONEV nacional (Res. 5/2023 Sec. Energía)** avanza hacia un sistema unificado.
Cada venta/alquiler en esas jurisdicciones va a necesitar la etiqueta (clase A–G). Etiqueta Verde es la
plataforma que (a) le da al **certificador acreditado** una herramienta que calcula la etiqueta rápido con
los datos de la vivienda y genera el documento oficial, y (b) capta la demanda de **inmobiliarias y
escribanías** que necesitan la etiqueta para poder escriturar.

**Integración (el MOAT):**
- **Pública:** PRONEV / plataforma provincial de etiquetado (Santa Fe primero), Secretaría de Energía,
  colegios profesionales acreditadores. Enchufarse al circuito oficial de emisión es lo que da barrera.
- **Privada:** inmobiliarias y escribanías (originan la demanda antes de cada escritura).

**Problema social que resuelve:** eficiencia energética = menos consumo de gas/luz, más valor de reventa y
**transparencia para el comprador**, que hoy compra a ciegas el gasto futuro de la casa. La obligación de
escritura crea el mercado el día que rige.

**Señal regulatoria (fuente + fecha):** **Santa Fe** — primera provincia en sancionar la ley que hace
**obligatoria la Etiqueta de Eficiencia Energética en toda escritura traslativa de dominio**
(santafe.gob.ar; Argentina.gob.ar, 2023–2025); Entre Ríos, Mendoza y Río Negro con ley aprobada; **PRONEV**
(Res. 5/2023) hacia el sistema nacional (etiquetadoviviendas.mecon.gob.ar, 2023–2025).

**Cómo opera (ejemplo):** una inmobiliaria de Rosario necesita la etiqueta para escriturar una casa. Carga
en Etiqueta Verde superficie, orientación, aberturas, aislación y sistema de calefacción; la plataforma
calcula la clase (ej. "D") y arma el documento; un certificador acreditado en el loop lo valida y firma. La
escritura avanza sin frenarse por la etiqueta.

**Cómo se cobra:** **$18.000 por etiqueta emitida** (US$12) al certificador (licencia de la herramienta) o
**comisión $8.000 por lead de vivienda a etiquetar** derivado a un certificador; **suscripción $30.000/mes**
(US$20) a estudios de arquitectura que emiten en volumen.

**SAM/SOM (con fuente):** arranca en Santa Fe (obligatoria) → miles de escrituras/año; se expande con cada
provincia que adopte y con el PRONEV (santafe.gob.ar / etiquetadoviviendas.mecon.gob.ar). **SOM año 1:** 800
etiquetas.

**Unit economics (ARS):** precio $18.000/etiqueta · COGS ~$1.500/etiqueta (cálculo + generación del
documento + tokens) · margen **88%** · build **3–4 semanas** · primer peso: **depende de la adopción
provincial** (más lento que el resto).

**Perfil:** 🌱/⚖️ pasivo con techo geográfico hoy, upside grande si el PRONEV nacional obliga. **Realizable
ahora:** parcial — el mercado nace en pocas provincias y necesita un certificador acreditado en el loop.
**Costo de arranque:** bajo-medio. **Encolado.**

**Riesgos:** el mercado es **nascent y depende de decisión política provincial** (varias provincias todavía
lo tienen voluntario o demorado); **necesita un certificador acreditado** para emitir el documento oficial
(no lo hace software solo); si el PRONEV nacional define su propia plataforma cerrada, comoditiza la capa
de cálculo.

**Desafío del operador:** honestamente, hoy el mercado obligatorio es chico (Santa Fe y pocas más), por eso
el índice es el más bajo del lote. El valor no es "calcular la etiqueta" (la fórmula es pública), es **ser
el canal entre la inmobiliaria que necesita escriturar y el certificador acreditado**, y estar parado el
día que la próxima provincia la haga obligatoria. Es una **apuesta de posicionamiento temprano**: barato de
construir, paciencia hasta que la regulación se expanda.

---

## Cuadro resumen (ARS al dólar oficial $1.488,50) — ordenado por prioridad (realizable ya + barato primero)

| # | Negocio | Perfil | Precio | Margen | Build | Realizable ya | Costo arranque | Idx | prod |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Buzón ARCA | 🌱 | $9k/mes/CUIT | 90% | 2–3 sem | Sí | Bajo | 44 | warn |
| 2 | APOC Guard | 💥/⚖️ | $22k/mes | 85% | 2–3 sem | Sí | Bajo | 46 | warn |
| 3 | Reconoce | 🌱 | ~$155k/caso | 82% | 3–4 sem | Sí | Bajo | 45 | warn |
| 4 | Compliance UIF | 💥/⚖️ | $60k/mes + onb | 80% | 4–5 sem | Sí | Medio | 43 | warn |
| 5 | FCEM Anticipo | 💥 | fee 0,8–1,5% + $40k/mes | 75% | 5–6 sem | Parcial | Medio | 42 | warn |
| 6 | Etiqueta Verde | 🌱/⚖️ | $18k/etiqueta | 88% | 3–4 sem | Parcial | Bajo-medio | 38 | warn |

---

## Fuentes (URLs)

**1 · Buzón ARCA (Domicilio Fiscal Electrónico / multas automáticas):**
- https://www.argentina.gob.ar/noticias/domicilio-fiscal-electronico-notificaciones
- https://www.afip.gob.ar/domiciliofiscalelectronico/notificaciones/default.asp
- https://www.cronista.com/economia-politica/multas-automaticas-de-arca-a-quienes-puede-sancionar-el-organismo-cuanto-duelen-y-que-hacer-para-evitarlas/
- https://serviciosweb.afip.gob.ar/genericos/guiasPasoPaso/VerGuia.aspx?id=81
- https://cuitificado.com/blog/domicilio-fiscal-electronico-arca

**2 · APOC Guard (base APOC / facturas apócrifas / fallos):**
- https://www.iprofesional.com/impuestos/455765-facturas-apocrifas-fallo-rechazo-reclamo-arca-proveedores-base-apoc
- https://www.ambito.com/novedades-fiscales/la-justicia-limita-el-ajuste-arca-facturas-apocrifas-n6124249
- https://www.ambito.com/novedades-fiscales/la-justicia-pone-limites-los-ajustes-arca-facturas-apocrifas-n6182438
- https://www.cronista.com/columnistas/facturas-apocrifas-fallo-clave-limita-responsabilidad-de-clientes-por-incumplimientos-de-sus-proveedores/
- https://developers.tusfacturas.app/consultas-varias-a-servicios-afip-arca/api-factura-apocrifa-base-apoc

**3 · Reconoce (fin moratoria previsional / planes de pago):**
- https://www.infobae.com/economia/2025/03/23/fin-de-la-moratoria-previsional-cual-fue-la-respuesta-y-que-pasara-con-los-que-no-puedan-completar-30-anos-de-aportes/
- https://chequeado.com/el-explicador/fin-de-la-moratoria-previsional-como-podra-jubilarse-una-persona-que-no-cumple-con-los-anos-de-aportes/
- https://www.cpcesfe2.org.ar/plan-de-pago-de-deuda-previsional-ley-27705/
- https://www.iprofesional.com/management/459019-anses-como-es-el-plan-de-pago-de-la-moratoria-previsional-y-quienes-pueden-acceder

**4 · Compliance UIF (Res. 78/2025 y 37/2026 · Sujetos Obligados):**
- https://tavarone.com/resolucion-uif-nro-78-2025-cambios-en-reportes-perfiles-y-umbrales-para-la-prevencion-de-la-ft-fp/
- https://nicholsonycano.com.ar/alertas-legales/resolucion-78-2025-actualizacion-normativa-en-prevencion-del-lavado-de-activos/
- https://comercioyjusticia.info/leyes-y-comentarios/la-uif-aumento-los-umbrales-para-depositos-en-efectivo-registro-de-propiedad-automotor-registro-propiedad-inmueble-y-escribanos/
- https://www.argentina.gob.ar/uif/normativa/resoluciones

**5 · FCEM Anticipo (Factura de Crédito Electrónica MiPyME):**
- https://www.argentina.gob.ar/servicio/emitir-una-factura-de-credito-electronica-mipyme
- https://contadoresenred.com/factura-de-credito-electronica-mipyme-monto-minimo-a-partir-de-abril-2026/
- https://blogdelcontador.com.ar/news-45736-nuevo-monto-minimo-para-emision-de-factura-de-credito-electronica-2
- https://documento.errepar.com/actualidad/prorrogan-regimen-de-factura-de-credito-electronica-mipymes-y-excluyen-casos-de-cesion-20251028094126797

**6 · Etiqueta Verde (etiquetado energético de viviendas / PRONEV):**
- https://www.argentina.gob.ar/noticias/se-aprobo-la-primera-ley-de-etiquetado-de-eficiencia-energetica-en-viviendas
- https://www.santafe.gob.ar/ms/eficienciaenergetica/viviendas/etiquetado-de-viviendas/
- https://etiquetadoviviendas.mecon.gob.ar/
- https://agbc.org.ar/?articulos=etiquetado-de-eficiencia-energetica-de-viviendas-la-falta-de-decision-politica-demora-su-aplicacion
