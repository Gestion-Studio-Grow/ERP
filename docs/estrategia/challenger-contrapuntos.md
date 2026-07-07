# Contrapuntos del Challenger — Advisory Board GSG

**Qué es este documento:** el caso opuesto a `docs/fundamentos/bases-gsg.md` y
`docs/estrategia/roadmap-gsg.md`, producido por el rol Challenger (abogado del diablo) del Advisory
Board, 2026-07-06. No modifica esos docs — los tensiona. Objetivo: que la estrategia llegue más robusta
a la decisión del dueño, no ganar el debate.

---

## 0. Resumen de lo que propuso el Advisory

Identidad: GSG = "SAP argentinizado" — un solo Core sin forks, cercanía humana como diferencial, nadie
afuera por rubro/tamaño. Segmentación local por **tipo de contribuyente fiscal** (BAJA/MEDIANO/GRANDE)
en vez de facturación o rubro. Roadmap: BAJA ya vendible (cerrar ARCA+MP reales), MEDIANO con 3 módulos
"puerta" (multi-sucursal, facturación A/B+percepciones, inventario avanzado) y **primer cliente real a 6
meses**, GRANDE a 12-18 meses apalancando que el dueño implementa SAP Public Cloud Finance real en su
práctica profesional. Modelo comercial (pricing, canal, self-serve vs consultivo) **dejado deliberadamente
abierto**, delegado a Agencia Digital. Expansión regional pospuesta sin fecha.

---

## 1. "Un solo Core, nunca fork" + "suite integrada como SAP"

**Supuesto débil:** que la disciplina de no-fork escala igual de bien cuando el sistema tiene que
atender simultáneamente a un monotributista con caja diaria y a un Agente de Retención con régimen
SICORE. Un Core único para 3 tiers tan distintos en complejidad regulatoria no es gratis: cada feature
de GRANDE (retenciones automáticas, consolidación, SSO) vive en el mismo codebase que sirve al tenant
BAJA — riesgo de que el sistema se vuelva más pesado, más lento de auditar y más caro de mantener para
el 90% de la base (BAJA) que nunca usa ese código.

**Riesgo concreto:** "suite integrada tipo SAP" es la promesa que **mató a la mayoría de los ERP
verticales para pyme** — terminan siendo Frankenstein de módulos a medio construir (el propio doc lo
confiesa: multi-sucursal no existe, RRHH no existe, e-commerce parcial). SAP tardó décadas y miles de
consultores para sostener esa promesa; GSG la sostiene con una factory de agentes y un dueño part-time
en la práctica profesional SAP.

**Qué falta:** un criterio explícito de *cuándo* un feature de GRANDE se aísla (feature flag/plugin
verdaderamente desactivable) vs cuándo se comparte, y un tope de complejidad — algo como "ningún feature
de GRANDE puede degradar el onboarding self-serve de BAJA" medido con un número (tiempo de onboarding,
tamaño del bundle, etc.), no solo con la intención arquitectónica.

**Alternativa concreta:** declarar explícitamente que "un solo Core" es una restricción de **datos y
dominio** (mismo schema, mismo motor de reglas), no de **superficie de producto** — y medir cada tier
como una superficie de UI/onboarding distinta sobre el mismo Core, con un gate de que ningún cambio para
GRANDE puede tocar el path crítico de BAJA sin justificar por qué.

## 2. Segmentación por tipo de contribuyente fiscal

**Supuesto débil:** que el estatus fiscal ante AFIP/ARCA es un buen proxy de "qué necesita el negocio"
tecnológicamente. En la práctica, dos negocios con el mismo estatus fiscal (dos Responsables Inscriptos)
pueden tener necesidades de producto completamente distintas — una carnicería con lotes/vencimientos no
se parece en nada a una agencia de servicios RI, aunque ambas caigan en MEDIANO. El propio roadmap ya lo
delata: "Inventario avanzado... crítico para carnicería-tipo" aparece como módulo "puerta" de MEDIANO,
pero es un caso de **rubro**, no de fiscalidad — la segmentación fiscal se está mezclando en la práctica
con la segmentación por rubro que el documento dice haber descartado.

**Riesgo:** encasillar el pricing/mensaje comercial en categorías AFIP que (a) el propio doc admite no
están validadas con un contador, y (b) son terminología que el cliente potencial no usa para describirse
a sí mismo ("soy Responsable Inscripto" no es cómo un carnicero piensa su negocio; "tengo 3 locales y
necesito controlar el stock" sí lo es). El riesgo comercial es vender con un lenguaje que no resuena en
el punto de venta, aunque sea correcto puertas adentro para diseñar el roadmap técnico.

**Qué falta:** separar dos preguntas que el documento fusiona — "¿qué construyo primero?" (ahí el
estatus fiscal es un buen proxy de complejidad regulatoria real) vs "¿cómo lo vendo?" (ahí el rubro y el
dolor concreto — stock, sucursales, empleados — venden mejor que una categoría de AFIP).

**Alternativa concreta:** usar el tier fiscal como **motor de ingeniería de producto** (qué construir y
en qué orden) pero mantener el **mensaje comercial por dolor/rubro** (igual que hoy: estética, carnicería,
velas, pádel) — que Agencia Digital traduzca tier→propuesta de valor en el idioma del cliente, no en el
de AFIP.

## 3. Roadmap de módulos — "primer MID a 6 meses"

**Supuesto débil:** que 3 módulos "puerta" (multi-sucursal desde cero, facturación A/B+percepciones,
inventario avanzado con multi-depósito) son alcanzables en 6 meses **cuando multi-sucursal hoy no existe
ni a nivel de schema** (`BusinessSettings` es singleton por tenant — no es un flag a prender, es un
cambio de modelo de datos que toca RLS, reportería, permisos y el Generador de Preset). El propio doc de
riesgos lo dice ("depende de cerrar Gate 2... hoy pausado") pero subestima que multi-sucursal es, en
esfuerzo, comparable a construir de nuevo buena parte del Core de tenant.

**Riesgo:** el hito de 6 meses se transforma en una fecha de marketing interna que presiona a construir
multi-sucursal rápido y mal (schema apurado = deuda técnica en el corazón del sistema, el peor lugar
para tenerla, justo antes de escalar a GRANDE donde la consolidación multi-sucursal es aún más crítica).

**Qué falta:** el documento no dice **con qué cliente real** se valida el piloto MEDIANO ni si ya existe
un candidato con intención de compra — "el cliente real como forzador de alcance" (roadmap §3) es
circular si todavía no hay cliente identificado: no se puede forzar alcance con un cliente que no
existe.

**Alternativa concreta:** convertir el hito en dos gates secuenciales explícitos: (a) ¿hay un cliente
MEDIANO real con LOI o intención de pago identificado en los próximos 60 días? Si no, el hito de 6 meses
es ficticio y hay que decirlo. (b) diseñar multi-sucursal v1 deliberadamente acotado (2 sucursales, sin
consolidación, sin tesorería) como un spike de arquitectura *antes* de comprometer la fecha, para saber
si el singleton de `BusinessSettings` se puede evolucionar o hay que migrar.

## 4. Posicionamiento "argentinizar SAP"

**Supuesto débil:** que competir en la categoría mental de SAP ("suite integrada, profundidad enterprise")
es una ventaja y no una carga para una pyme con caja chica. El propio target BAJA (monotributista,
"prende y factura sin fricción") es precisamente el cliente que **no quiere** ni necesita pensar en
términos de suite — quiere una solución de nicho simple, y ahí GSG compite de hecho contra Tiendanube/
apps de POS simples, no contra SAP. Anclar el mensaje de marca en SAP puede generar disonancia: se vende
"simplicidad sin fricción" al tier BAJA con un posicionamiento de marca que promete "profundidad de
suite enterprise".

**Riesgo:** mensaje de marca dividido — el posicionamiento único (§4 de bases-gsg) puede no sostenerse
igual de bien en los tres tiers al mismo tiempo. Lo que vende a GRANDE (know-how SAP real) es ruido o
hasta intimidante para BAJA.

**Qué falta:** el documento no resuelve cómo un mismo mensaje de marca ("GSG es SAP + adaptabilidad
argentina") aterriza en un pitch de venta a un monotributista sin sonar sobre-vendido o fuera de
alcance para su bolsillo.

**Alternativa concreta:** separar **posicionamiento de compañía** (SAP argentinizado, válido puertas
adentro y para GRANDE) de **mensaje de venta por tier** — a BAJA se le vende "el POS/facturación que no
te hace perder tiempo", el ancla SAP se reserva como argumento de autoridad para MEDIANO/GRANDE donde sí
resuena.

## 5. Modelo comercial "dejado deliberadamente dinámico"

**Supuesto débil (el más peligroso del set):** que dejar el pricing/canal abierto es una decisión
estratégica y no una decisión pendiente disfrazada de estrategia. "Dinámico" puede leerse como madurez
(flexibilidad para adaptarse) o como que **nadie se hizo cargo de decidir cuánto cuesta el producto**,
lo cual bloquea cosas muy concretas: sin pricing no hay forma de calificar si un lead "califica" para
MEDIANO, ni de saber si 6 meses de esfuerzo de ingeniería se recupera con el primer cliente.

**Riesgo:** que Agencia Digital, al ser "satélite" y no dueña del roadmap de producto, termine vendiendo
reactivamente lo que cada lead pide, sin una franja de precio de referencia — y que ingeniería construya
sin saber si el ROI del módulo "puerta" (ej. multi-sucursal) se paga con lo que ese primer cliente puede
pagar.

**Qué falta:** al menos un rango de referencia (aunque sea provisional, marcado "a confirmar") de
cuánto debería costar cada tier, para poder testear si el mercado lo paga *antes* de invertir 6 meses de
ingeniería en el módulo puerta más caro (multi-sucursal).

**Alternativa concreta:** no dejar pricing 100% abierto — fijar un **rango** provisional por tier (ej.
"BAJA: X-Y USD/mes, MEDIANO: 3-5x BAJA") como hipótesis de trabajo explícita, igual que se hizo con el
mapeo fiscal ("hipótesis a confirmar"), en vez de dejar el vacío total. Agencia Digital ajusta el
canal/mensaje, no el orden de magnitud del precio.

## 6. El activo SAP del dueño como ventaja competitiva

**Supuesto débil:** que el know-how personal del dueño (implementación real de SAP Public Cloud Finance)
es un activo **de GSG como compañía** y no un activo **del dueño como persona**, no transferible al
producto ni al equipo. Hoy el roadmap para GRANDE depende explícitamente de que el piloto sea "guiado
directamente por él" — eso es bueno como argumento de venta inicial, pero es un cuello de botella de
capacidad: GSG no puede vender más de un piloto GRANDE a la vez si cada uno necesita al dueño en persona,
y el know-how no está codificado en ningún proceso, playbook o incluso en el propio Generador de Preset.

**Riesgo:** confundir "tenemos un activo diferencial" con "tenemos un producto escalable" — el activo
solo escala si se convierte en metodología documentada (un playbook de implementación GRANDE, análogo a
`docs/metodologia/generador-preset-ia.md`), no si vive solo en la cabeza del dueño.

**Qué falta:** el documento no plantea ningún plan de "codificar" ese know-how — ni un playbook, ni una
segunda persona capacitada, ni un mecanismo para que la ventaja sobreviva si el dueño no puede estar en
cada piloto GRANDE.

**Alternativa concreta:** tratar el primer piloto GRANDE explícitamente como una oportunidad de
**extracción de metodología** (documentar cada decisión de implementación como se hizo con el Generador
de Preset) para que el segundo piloto GRANDE no dependa 100% del dueño — de lo contrario GRANDE es, en
los hechos, un servicio de consultoría boutique con marca GSG, no un tier de producto escalable.

---

## Las 3 tensiones que el dueño debería resolver (priorizadas)

1. **Pricing en cero define ROI en cero.** Sin al menos un rango de precio por tier, no hay forma de
   validar si el esfuerzo de 6 meses en multi-sucursal (el gap más caro y riesgoso del roadmap) se
   recupera con el primer cliente MEDIANO. Esto es más urgente que decidir el canal de venta — es la
   pregunta que determina si vale la pena construir.

2. **El hito de 6 meses no tiene cliente real detrás.** "El cliente real como forzador de alcance"
   presupone un cliente que hoy no está identificado en el documento. Sin LOI o intención de pago
   concreta, la fecha es aspiracional y multi-sucursal (que toca el corazón del schema multi-tenant) se
   corre el riesgo de construirse apurada y mal, justo el módulo que menos margen de error tolera.

3. **El activo SAP del dueño y la ambición "suite completa tipo SAP" comparten el mismo riesgo:
   dependencia de una sola persona sin metodología codificada.** Tanto GRANDE (consultivo, guiado por
   el dueño) como el Core "suite integrada" (mantenido con una factory de agentes dirigida por el
   dueño) escalan solo si ese conocimiento se convierte en proceso documentado. Hoy ninguno de los dos
   documentos plantea cómo se transfiere ese conocimiento fuera de la cabeza del dueño.

---

*Elaborado por el rol Challenger del Advisory Board GSG — 2026-07-06. Solo lectura sobre
`docs/fundamentos/bases-gsg.md` y `docs/estrategia/roadmap-gsg.md`; no los modifica.*

---
---

# Ronda 2 — Contrapuntos a la v2 de `crecimiento-estructura-agentes.md`

**Fecha:** 2026-07-07 · **Alcance:** doc-only, no toca el documento del Advisory, no instancia agentes.
**Pedido del dueño:** nueva ronda de mejora de ciclo sobre la versión ya corregida por la Ronda 1.

## Paso 0 · Calibración (ADR-052)

*(corpus leído: `CLAUDE.md`, ADR-045/047/048/049/052, `docs/lecciones-aprendidas/registro.md`,
`docs/organizacion/roster-completo-gsg.md`, `docs/estrategia/crecimiento-estructura-agentes.md` v2)*

- Mi rol (ADR-045) es **antítesis**, no "segunda opinión amable": mi único fracaso posible es volverme
  complaciente. Corro en Sonnet (default de la valla, ADR-045), zona humana/criolla en el tono.
- ADR-052 es el propio objeto de esta ronda: calibro leyendo el corpus del rol Advisory + Challenger, no
  solo el documento a criticar — para detectar si la propia v2 sigue de verdad el protocolo que invoca.
- Lección **MP-4/MP-7** pesa: el costo se fue en Opus por herencia y contexto mal acotado — reviso si la
  v2 repite ese patrón (agentes en Opus sin filtro, calibraciones simultáneas que inflan contexto).
- Lección **SEC-1/SEC-2/SEC-3** pesa directo sobre el punto abierto de Legal/PII — es zona estándar-
  precisa (seguridad/legal), no zona de tono libre.
- El estándar de esta ronda no es "encontrar más contrapuntos" por deporte — es **evitar que la Ronda 1
  se vuelva un ritual que se aprueba a sí mismo** sin tensión real de segundo orden.

---

## 1 · Inconsistencias NUEVAS introducidas por las propias correcciones (más grave primero)

**[1.a — grave] Legal se autodeclara "igual de urgente que Data/DBA" y sin embargo se secuencia 3
lugares detrás.** El propio §4 de la v2 dice textual: *"Legal/Compliance cumple 2 (PII real circulando
hoy, **igual que Data/DBA**)"*. Pero la tabla de olas (§3) pone a Legal en **H0.c**, detrás de Data/DBA
**y** de Docs/Índice vivo. Si el criterio de orden es "costo de demora medible hoy" (el mismo que justifica
poner a Data/DBA primero), la propia lógica del documento debería poner a Legal en **H0.a junto a
Data/DBA**, no en la tercera ola junto con Pricing y Advisory (que no tienen ese tipo de urgencia — son
"importantes" pero no "riesgo activo hoy"). Tal como quedó, la v2 comete la **misma clase de error** que
el Challenger de la Ronda 1 ya corrigió (mezclar tiers de urgencia distintos en el mismo bloque) — solo
que ahora la mezcla es sutil: dice una cosa en el texto (§4) y hace otra en la secuencia (§3).

**[1.b — grave] La sub-secuenciación de H0 no resuelve el problema que dice resolver — lo corre un
casillero.** La corrección original (Challenger #5, Ronda 1) fue "no calibrar 4 charters a la vez sobre-
carga al PMO". La v2 arma 3 olas, pero **H0.c sigue calibrando 3 cosas a la vez** (Pricing + Advisory +
Legal-checklist). Si "3 simultáneos" es aceptable, hace falta decir **por qué** el número mágico bajó de
4 a 3 y no, por ejemplo, a 1 (secuencial estricto) — hoy no hay ese argumento, solo la afirmación de que
"con la capacidad liberada" alcanza. Además, el modelo de cuello de botella es cuestionable (ver 1.d).

**[1.c — moderado] Scope creep en Docs/Índice vivo, introducido por el propio mecanismo de pre-charter.**
El roster (`roster-completo-gsg.md` ítem 7) define a Docs/Índice vivo como **"Sonnet puro, tarea
mecánica"** (mantener TABLERO/ADR-INDEX/ESTADO-ACTUAL sincronizados) — y la v2 (§1, ítem 7) lo valida
exactamente con ese argumento: *"lo más barato de los nueve"*. Pero el mismo documento (§3, "Pre-charter")
le agrega una tarea nueva: **redactar el borrador de charter de 4 roles futuros** (Release Manager,
FinOps, Soporte/CS, SRE on-call/SLOs) — que exige entender qué debería cubrir un SLO, qué debería
telemetrar FinOps, qué debería resolver Soporte. Eso **no es sincronizar un índice**, es **diseño de rol
con criterio de dominio** — más cerca del trabajo del PMO (autor de planes, Opus) que de una tarea
mecánica de Sonnet. La propia corrección introdujo, sin decirlo, una escalada de alcance sobre un rol que
2 párrafos antes se vendía como "el más barato".

**[1.d — moderado] El cuello de botella que motiva las 3 olas puede estar mal modelado.** Toda la
sub-secuenciación de H0 asume que el recurso escaso es **la capacidad de ejecución del PMO**. Pero
ADR-052 dice que **cada agente calibra por sí mismo** (lee el corpus, escribe su propia declaración) — no
es el PMO quien "hace" la calibración de Pricing o de Legal, cada uno la corre en su propia sesión. Si
eso es así, el verdadero recurso escaso al activar 3 agentes a la vez no es el tiempo del PMO: es la
**atención de aprobación del dueño** (ADR-049: el dueño es quien aprueba el plan, RACI columna "Dueño").
Si el cuello de botella real es el dueño y no el PMO, la v2 está optimizando la variable equivocada — 3
charters en paralelo siguen exigiéndole al dueño 3 decisiones en la misma ventana, folder que la
sub-secuenciación no ataca en absoluto.

**[1.e — leve] El checklist mínimo de Legal no tiene dueño de ejecución declarado.** H0.c lista "Legal/
Compliance (checklist mínimo)" como si se auto-ejecutara. La v2 nunca dice **quién** redacta y corre ese
checklist (¿Seguridad, que ya existe y ya cubre SEC-1/2/3? ¿Data/DBA? ¿el propio PMO?). Es el mismo tipo
de hueco que la v2 marcó como problema para "consolidación" en el roster (`roster-completo-gsg.md` §5.b:
"el único hueco recurrente sin dueño formal") — pero acá lo comete de nuevo, sin notarlo, en el punto más
sensible (PII real).

## 2 · ¿El pre-charter reduce lead time o es teatro? (test)

**Test aplicado:** tomar el caso concreto más exigente — **SRE on-call/SLOs** — y preguntar qué parte de
un charter real se puede escribir **hoy**, sin el contrato que lo dispara, y qué parte no.

- **Lo que SÍ se puede pre-escribir hoy (y tiene valor real):** el **shell organizacional** — misión en
  una línea, entradas/salidas, división, modelo, y sobre todo la **lista mínima de lectura de calibración**
  (ADR-052) — qué ADRs y qué entradas del registro de lecciones tiene que leer ese rol antes de operar
  (para SRE: ADR-018/041 + SEC-* + PD-*). Esto es genuinamente reusable y barato.
- **Lo que NO se puede pre-escribir (y es el contenido real del charter):** los **SLOs concretos**
  (dependen del SLA que firme un cliente que hoy no existe), el **runbook** (depende de los incidentes
  reales acumulados hasta ese momento — hoy el hardening es ad-hoc, sin historial), y la **calibración
  contra el corpus vigente en ese momento** (no el de julio 2026) — ADR-052 exige calibrar contra el
  estado actual, no contra una foto vieja.
- **Veredicto: parcialmente teatro.** La v2 promete que el pre-charter baja el lead time de "semanas a
  días" — eso es **cierto solo para el 20% administrativo** (shell + reading list) y **falso para el 80%
  sustantivo** (SLOs, runbook, checklist legal real), que necesariamente espera al evento disparador
  porque depende de su contenido. Vender el pre-charter como "ya está casi listo" genera una falsa
  sensación de cobertura — el mismo patrón de riesgo que el propio Challenger anterior señaló para el
  checklist mínimo de Legal (ver §4 abajo): un artefacto liviano puede *parecer* más cobertura de la que
  realmente da.
- **Riesgo adicional no contemplado — pre-charter que envejece mal:** si pasan 6-12 meses entre H0.b
  (cuando se redactan) y H1/H2 (cuando se activan), el corpus habrá cambiado (nuevos ADRs, nuevas
  lecciones). Un pre-charter viejo, tomado como "ya resuelto", puede llevar a **saltear la recalibración
  real** exigida por ADR-052 — exactamente lo que el protocolo existe para evitar.
- **Corrección propuesta:** llamar al artefacto por lo que es — **"shell + reading list"**, no "charter"
  — y agregar una regla explícita: *todo pre-charter se re-valida contra el corpus vigente al momento de
  activarse; nunca se activa "tal cual" sin ese paso.*

## 3 · La secuencia Data/DBA → Docs → Pricing+Advisory+Legal: ¿maximiza riesgo × valor?

**Intento de cuantificación (escala 0-10, riesgo de NO tenerlo hoy × valor de tenerlo ya):**

| Candidato | Riesgo de no tenerlo hoy | Valor de tenerlo ya | Score aprox. |
|---|---|---|---|
| Data/DBA | 9 (Gate 2 bloquea TODO el roadmap MID) | 10 | ~9.5 |
| **Legal (checklist)** | **8 (PII real de 4 tenants, hoy, sin resguardo)** | 6 | **~7** |
| Pricing | 3 (no bloquea nada hoy; bloquea decidir si construir vale la pena) | 8 | ~5.5 |
| Docs/Índice vivo | 2 (incomodidad, no riesgo) | 5 (libera PMO) | ~3.5 |
| Advisory (formalizar) | 1 (ya opera de facto) | 2 | ~1.5 |

Con este score, el **orden que maximiza riesgo × valor no es el de la v2**. El orden implícito en los
números sería: **Data/DBA → Legal(checklist) → Pricing → Docs → Advisory**. La v2 pone a Docs en segundo
lugar por una razón **operativa** (liberar al PMO), no por riesgo×valor — lo cual es una razón legítima,
pero **el documento no lo declara así**: presenta la secuencia como si fuera una sola vara (riesgo×valor)
cuando en realidad mezcla dos varas distintas (riesgo×valor **y** capacidad de ejecución) sin decir
cuál manda cuando compiten. Ese es el hueco de rigor, no el orden en sí — que Docs vaya temprano puede
seguir siendo correcto, pero por el argumento correcto (multiplica la productividad de TODO lo que sigue),
no disfrazado de "reduce riesgo".

**Alternativa concreta:** declarar explícitamente **dos colas, no una** — cola de **riesgo activo hoy**
(Data/DBA, Legal-checklist — corren en paralelo, no en olas separadas, porque no compiten por el mismo
recurso: distintos dominios, distintas sesiones) y cola de **apalancamiento** (Docs, luego Pricing,
luego Advisory-formal). Esto resuelve 1.a (Legal ya no queda mal secuenciado respecto a su propia
urgencia declarada) sin reintroducir el problema de "4 a la vez" (siguen siendo como máximo 2 en
paralelo en la primera cola).

## 4 · El punto abierto de Legal/PII — las dos puntas para el dueño

**Antes de las dos puntas, un hallazgo que las cruza:** la v2 ya resolvió un caso gemelo —
**Contador/Fiscalista** (§2.2) — con la regla *"responsabilidad legal real → consulta externa puntual con
un profesional habilitado, NO agente interno de IA"*. Legal/Compliance sobre datos personales (Ley
25.326/AAIP en Argentina) tiene exactamente el mismo perfil de riesgo: es una **responsabilidad legal
real** que un agente de IA, sea "checklist" o "agente completo", **no puede sostener legalmente** — un
checklist mal armado por IA da tanta falsa seguridad como ninguno. La v2 no corrió el caso Legal por el
mismo test que corrió Contador/Fiscalista, y debería: la pregunta correcta puede no ser "checklist vs.
agente completo" sino **"consulta puntual con un abogado real que audite el checklist, análogo al
contador"** — un tercer camino que ninguna de las dos puntas de abajo cubre.

Dicho eso, con las dos puntas tal como el dueño las planteó:

**Caso más fuerte a favor de AGENTE COMPLETO YA:**
- La PII no es hipotética: **hoy** circula de 4 tenants reales (clientes, contactos, WhatsApp, compras).
  El filtro 3 del propio documento ("señal de negocio") es la vara equivocada acá — el riesgo legal no
  espera a que entre plata, espera a que **exista el dato**, y ya existe.
- Un checklist "mínimo" ejecutado sin dueño claro (hallazgo 1.e) y sin experiencia legal real corre el
  riesgo de dar **falsa sensación de cobertura** — peor que reconocer el gap abiertamente, porque invita
  a no revisarlo de nuevo hasta H3.
- El costo de un incidente (denuncia ante la AAIP, reclamo de un cliente, la reputación de GSG justo
  cuando busca su primer contrato MEDIANO/GRANDE) es **asimétrico e irreversible** — exactamente el perfil
  que, según el propio filtro 2 del documento, "justifica el rol aunque el volumen sea bajo" (el mismo
  argumento que ya se usó para Data/DBA).
- Un agente Legal, una vez de pie, se enchufa directo al flujo **ya obligatorio** de autorización del
  Generador de Preset (`generador-preset-ia.md` — "autorización primero") — no es estructura ociosa, es
  la pieza que hoy ese flujo da por sentada sin dueño formal.

**Caso más fuerte a favor de CHECKLIST (como está en la v2):**
- La exposición real hoy es acotada: 4 tenants chicos (tier BAJA), con datos operativos de volumen bajo,
  ya bajo un paso de autorización explícita (Preset IA) — no es PII a escala de un contrato GRANDE con
  régimen de información.
- Parte del riesgo real (¿el dato vive en EE.UU. vía Neon? ¿hay opt-in explícito en el WhatsApp CTA? ¿hay
  forma de borrar datos a pedido?) es **conocido y acotado** — un checklist puntual, ejecutado ahora
  contra esas preguntas concretas, cierra la mayor parte de la exposición real sin montar una estructura
  Opus permanente.
- Levantar un agente Legal completo en Opus hoy consume presupuesto de juicio caro (ADR-032: "costo
  manda sobre velocidad") en un dominio donde, igual que con el Contador, **ninguna estructura de agente
  interno reemplaza la responsabilidad legal real** — el gasto no compra la cobertura que promete.
- El checklist es **reversible y escalable**: si un incidente real o un prospecto GRANDE exige auditoría
  de compliance (ellos van a preguntar), ahí sí hay señal de negocio real (filtro 3) para pasar a agente
  completo — exactamente la misma lógica de "invertir después de la señal" que rige todo el resto del
  documento.

**Recomendación del Challenger (no reemplaza la decisión del dueño, pero la enmarca):** ninguna de las
dos puntas por sí sola cierra el riesgo legal real — la vía más barata y más sólida es un **híbrido**:
checklist ejecutado YA (por Seguridad, que ya existe y ya cubre SEC-1/2/3 — ver hallazgo §5) **+ una
consulta puntual, pagada, con un abogado real** que audite ese checklist una sola vez (mismo patrón que
el Contador/Fiscalista) — eso es más barato que un agente Opus permanente y más sólido que un checklist
sin respaldo legal real.

## 5 · Agentes que sobran o que faltan

**Sobra (cuestionable, no descartable):** ninguno de los 9 se justifica claramente como innecesario — el
propio documento ya degrada correctamente a Release Manager, FinOps y Migración a protocolo/one-off. El
único candidato a "sobra tal como está planteado" es **Advisory Board (roster) como entrada formal
separada**: el propio documento admite que "ya opera de facto" y que formalizarlo es "poner por escrito
lo que ya pasa" — bajo riesgo, pero también bajo valor; podría directamente fusionarse como una nota
dentro del charter del Challenger (ADR-045) en vez de sumar una entrada de roster propia.

**Falta — el más grave, nadie lo vio:** **no existe ningún rol dueño de "qué hacemos las primeras 24hs si
la exposición ya pasó"** (breach/incident response), distinto de SRE on-call (que cubre disponibilidad,
no exposición de datos) y distinto de Legal/Compliance (que cubre el papeleo de consentimiento/
autorización, hacia adelante). Con PII real circulando y la lección **SEC-2** ya registrada (un rol de
app pudo evadir RLS en el pasado), la pregunta "¿quién declara el incidente, a quién se avisa, cómo se
contiene" no tiene dueño en ninguno de los 9 + 1 candidatos. Es más urgente que varios de los ya
propuestos (Soporte/CS, SRE-SLOs) porque, a diferencia de esos, **no depende de que llegue un contrato
nuevo** — depende de que ya hay datos reales corriendo, hoy.

**Falta — moderado:** el documento nunca corrió el **filtro 4** ("¿otro rol ya existente lo absorbe sin
diluirse?") contra **Legal/Compliance**, aunque sí lo corrió contra Release Manager (→ Arquitecto) y
Migración (→ Adaptador). El candidato obvio a absorber el checklist de PII es **Seguridad** (ya ✅
existe, ya en Opus, ya dueño de SEC-1/2/3 — secretos, RLS, webhooks — que son, en sustancia, la misma
familia de riesgo que "datos personales expuestos"). Si el filtro 4 se corre con la misma vara que a los
otros dos casos, el resultado más probable es: **el checklist mínimo de PII lo escribe y corre Seguridad,
no un agente Legal nuevo** — lo cual, además, resuelve de una sola vez el hallazgo 1.e (dueño de
ejecución sin declarar) y reduce el punto abierto del dueño (§4) a una decisión más barata: no "¿checklist
o agente completo?" sino "¿lo absorbe Seguridad ya, o justifica un rol nuevo?".

---

## Síntesis — qué le llevo al Advisory para la v3

1. Mover Legal-checklist a la **misma ola que Data/DBA** (o declarar explícitamente por qué no, si el
   dueño prioriza otra cosa) — la propia v2 ya dice que tienen la misma urgencia.
2. Renombrar "pre-charter" a lo que realmente es (shell + lista de lectura) y agregar el paso de
   re-calibración obligatoria contra el corpus vigente al activarlo.
3. Declarar explícitamente las **dos varas** de secuenciación (riesgo×valor vs. capacidad de ejecución)
   en vez de mezclarlas en una sola narrativa.
4. Antes de resolver "checklist vs. agente completo" para Legal, correr el **filtro 4** contra Seguridad
   (rol ya existente) — probablemente cambia la pregunta que se le lleva al dueño.
5. Sumar a la lista de candidatos (aunque sea para descartarlo con criterio, no por omisión): un rol o
   protocolo de **respuesta a incidentes de exposición de datos**, hoy sin dueño.

---

*Ronda 2, elaborada por el rol Challenger — 2026-07-07. Doc-only, no modifica
`docs/estrategia/crecimiento-estructura-agentes.md`; entrega su crítica para que el Advisory sintetice
la v3.*
