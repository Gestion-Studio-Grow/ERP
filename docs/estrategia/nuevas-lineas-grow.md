# Nuevas líneas — Agencia Grow (borrador de negocio, dar forma a las 5 ideas del dueño)

**Qué es este documento:** el Advisory Board le da forma, afina y adapta a activos existentes las 5
ideas de negocio propio que tiró el dueño (Agencia Grow — no giran alrededor del ERP, `docs/sectores/
agencia-grow.md`). **No ejecuta nada:** ninguna cuenta, formulario, envío o scraping con login. Corre en
paralelo a la reingeniería Opus del Core (Balde B, `bases-gsg.md` §8) — no la toca ni depende de ella.

**Restricción dura para toda ejecución futura (anotada, no aplicada acá):** el **CUIL del dueño**, crear
cuentas y apretar "enviar/confirmar" **los hace el dueño**. El agente prepara todo listo (fichas,
análisis, texto, checklist) pero **nunca maneja identidad ni credenciales** — mismo principio que rige
compras/pagos en `impo` (ADR-038: "cada orden la cierra el dueño") y las dos fases de credenciales
(ADR-041).

---

## Paso 0 · Calibración (ADR-052)

*(corpus leído: `CLAUDE.md`, `bases-gsg.md`, `roadmap-gsg.md`, `docs/lecciones-aprendidas/registro.md`,
`docs/sectores/agencia-grow.md`, ADR-038 + `.claude/commands/impo.md`, ADR-030)*

1. **Disciplina de capital (ADR-030, heredada por ADR-038):** ninguna idea de esta ronda compromete
   plata — se valida a costo cero primero (análisis, demanda, margen) y el capital es **siempre**
   decisión y acción del dueño, nunca del agente.
2. **Reúso antes de crear (ADR-053, pool):** antes de proponer estructura nueva, reviso si `impo` (6
   células, TODO Opus) o el ERP ya existente (blueprints, tienda, Preset IA, WhatsApp CTA) ya cubren la
   necesidad — varias de estas 5 ideas son, en los hechos, **la misma máquina que `impo`** aplicada
   puertas adentro (doméstico) en vez de a China.
3. **Frontera Grow/Digital (`agencia-grow.md` §1):** si algo termina siendo una feature que vende el
   ERP a terceros, cruza a Agencia Digital con su ADR; si es negocio propio del grupo, se queda en Grow.
   Marco cada idea con esa frontera en mente.
4. **Definir ≠ instanciar** (regla reciente, `CLAUDE.md`/`charter-generico-agente.md`): esta ronda
   **documenta y da forma** — no abre sesiones, no crea agentes, no ejecuta nada operativo.
5. **Gate de Excelencia aplica igual a lo que se construya acá** (storefronts, fichas, campañas) aunque
   el negocio no gire alrededor del ERP — el sello de calidad GSG no es opcional por unidad.

---

## Marco general — dos ideas no son "líneas de negocio", son la TESIS y el MECANISMO

**Primer ajuste de forma, antes de ir idea por idea:** las 5 ideas del dueño no son 5 líneas
independientes al mismo nivel. Reorganizadas por lo que realmente son:

- **Idea 4 ("comprar barato, vender más caro") es la TESIS madre** — no es una línea operativa, es el
  criterio con el que se mide **todo lo demás**, incluido `impo` (que ya es exactamente esto: comprar en
  China a costo bajo, vender en Argentina a precio de mercado). No se "arranca" la idea 4: se usa como
  vara.
- **Idea 3 ("arbitraje de servicios o productos") es el MECANISMO general** bajo esa tesis. Tiene (al
  menos) dos variantes bien distintas en riesgo y en qué tan lista está GSG para ejecutarla:
  - **Arbitraje de producto físico** → es, en los hechos, la **idea 1** (doméstico) y `impo` (importado).
    No son ideas separadas de la 3: son instancias concretas de ella.
  - **Arbitraje de capacidad/servicio** → GSG **ya lo hace** con Agencia Digital (produce barato con la
    factory de agentes, vende a precio de mercado la implementación/feature). Es la variante de menor
    riesgo y menor esfuerzo incremental porque **no suma nada nuevo, solo aplica la misma lente a más
    categorías de servicio** (ver Idea 3, abajo).
- **Idea 5 ("listas de proveedores actualizadas") no es una línea, es INFRAESTRUCTURA compartida** que
  alimenta a 1, 2, 3 y a `impo` por igual — mismo tipo de trabajo que ya hace la célula **Analista de
  proveedores China** de `impo`, generalizada a proveedores domésticos y digitales.

Con ese reordenamiento, quedan realmente **3 líneas operativas evaluables** (1, 2, y 3-en-su-variante-
de-servicio) + **1 tesis transversal** (4) + **1 capa de infraestructura compartida** (5).

---

## Idea 1 — Comprá-vendé con logística propia (Once/Flores/La Salada → interior)

**Versión mejorada:** GSG arma un **mayorista digital doméstico** — compra en los polos mayoristas de
CABA (Once/Flores/La Salada), vende **sobre pedido** (no stockea especulativamente) a clientes del
interior vía una tienda digital propia, y resuelve el último tramo con **encomienda de larga distancia**
(Vía Cargo, Andesmar, micros de línea — el canal que YA usan los revendedores informales del interior),
no con flota propia.

**Cómo se apalanca en lo que ya existe:**
- **Blueprint retail + tienda digital** (`src/blueprints/retail/`, vidriera `/tienda` rubro-aware) —
  storefront listo para publicar catálogo en días, no meses.
- **Generador de Preset por IA** — arma ficha/catálogo/marca rápido si se decide con marca propia.
- **WhatsApp CTA** — canal de toma de pedido natural para un comprador del interior menos cómodo con
  checkout online puro.
- **Modelo Order/OrderItem del ERP** — el flujo "pedido → confirmación → pago → despacho" ya existe como
  dominio, no hay que inventarlo.
- **Sinergia directa con `impo`:** la célula **Analista de logística/fulfillment** de `impo` piensa
  exactamente este problema (propio vs. 3PL, SLAs, cobertura, devoluciones) — la misma lente sirve acá
  con "3PL" = empresa de encomiendas en vez de courier internacional. **Se puede prestar del pool
  (ADR-053) en vez de crear rol nuevo.**

**Factibilidad:**
- **Mercado:** validado — es un negocio informal que YA existe y funciona (revendedores que viajan
  físicamente a comprar). El valor real de GSG es sacarle el viaje al comprador del interior, no inventar
  demanda.
- **Márgenes:** finos, como el propio dueño anticipa — el modelo solo cierra con **volumen** y con
  **cero inventario especulativo** (comprar recién cuando el pedido y el cobro están confirmados,
  exactamente la disciplina de capital de `impo` aplicada puertas adentro).
- **Logística:** resuelta con encomienda tercerizada, no logística propia — "logística propia" en el
  sentido que la dueño la planteó se traduce mejor como **GSG dueño del PROCESO** (pickup en el mayorista
  + coordinar el despacho), no como flota/depósito propios, que rompería la disciplina de capital.
- **Marca:** arrancar **sin marca propia** (reventa/curaduría, menor carga legal y de branding) y
  evaluar marca propia recién si el volumen lo justifica — mismo principio DEMO→VENTA→INVERSIÓN.
- **Riesgo:** el mayor riesgo no es de mercado, es de **caja** (comprar antes de cobrar) — mitigado por
  el modelo "pedido+cobro confirmado, recién ahí se compra".

**Qué se puede armar YA vs. qué necesita más:**
- **YA (doc/diseño, sin ejecutar):** storefront sobre el blueprint retail, flujo de pedido por WhatsApp +
  checkout, borrador de acuerdo con una empresa de encomiendas.
- **Necesita más (análisis, no ejecución):** una ronda de análisis tipo `impo` pero doméstica — qué
  categoría (textil, bazar, calzado, indumentaria) tiene mejor margen real neto de flete de encomienda,
  y validar el costo real de la encomienda al interior por categoría/peso/volumen.

**Referencia de modelo que funciona:** el propio negocio informal de "revendedor del interior" ya es la
prueba de mercado; el análogo formal/escalado es el patrón de **mayorista B2B2C con logística
tercerizada** (mismo patrón que usan mayoristas online argentinos que despachan por Vía Cargo/Andesmar
en vez de flota propia).

---

## Idea 2 — Reventa de productos digitales en Argentina + publicidad

**Versión mejorada:** curar/revender productos digitales con derechos de reventa reales (cursos,
plantillas, licencias PLR/white-label) sobre una tienda digital propia, con adquisición vía pauta paga —
el modelo de los marketplaces de infoproductos LatAm (Hotmart/Eduzz/Monetizze), pero GSG como
**distribuidor curado**, no como creador de contenido original desde el día uno.

**Cómo se apalanca en lo que ya existe:**
- **Tienda digital / blueprint** — sin fricción de logística física: el producto es el archivo/acceso,
  no hay flete ni encomienda que resolver (el idea de menor riesgo operativo de las 3).
- **Preset IA** — genera landing/ficha por producto o por línea rápido.
- **WhatsApp CTA** — funnel de venta/soporte.
- **Factory de agentes** — puede, con revisión humana, generar parte del contenido propio a futuro
  (diferencial sobre revender contenido de terceros), aunque **no arranca por ahí** (ver abajo).

**Factibilidad:**
- **Mercado:** more competido/saturado que la idea 1 — no hay el mismo precedente de demanda cautiva
  local; el diferencial tiene que venir de la curaduría/nicho, no de "vender cursos" en general.
- **Márgenes:** potencialmente altos (sin COGS físico) **si** el costo de adquisición (pauta paga) no se
  come el margen — ese es el riesgo real, no la logística.
- **Riesgo de capital:** distinto al de la idea 1 — no hay inventario, pero **la pauta paga SÍ es gasto
  real** (a diferencia de lo que "sin logística = sin riesgo" podría sugerir) — igual disciplina: no se
  escala pauta hasta validar conversión con presupuesto chico primero.
- **Legal:** necesita derechos de reventa reales (PLR/white-label) o contenido propio — arrancar con
  productos con licencia clara, no contenido sin derechos.

**Qué se puede armar YA vs. qué necesita más:**
- **YA (doc/diseño):** landing/tienda vía Preset IA, estructura de catálogo digital.
- **Necesita más:** (a) sourcing de productos con licencia de reventa real — trabajo de "proveedores"
  análogo al de `impo` pero para licencias digitales (ver Idea 5); (b) **gestión de pauta paga es una
  competencia que GSG no tiene formalizada hoy** — Agencia Digital hace inteligencia de mercado, no
  media buying — vale la pena marcarlo como gap explícito antes de comprometer presupuesto de ads.

**Referencia de modelo que funciona:** Hotmart/Eduzz/Monetizze en LatAm (marketplace + afiliados de
infoproductos); el rol de GSG acá se parece más a un **afiliado/distribuidor curado** que a un creador.

---

## Idea 3 — Arbitraje de servicios o productos (mecanismo, no línea aparte)

**Versión mejorada:** en vez de tratarla como una 3ª línea nueva, se separa en sus dos variantes reales:

**3a. Arbitraje de producto físico** → ya cubierto por la Idea 1 (doméstico) y por `impo` (importado). No
se duplica acá.

**3b. Arbitraje de capacidad/servicio (la variante realmente nueva a formalizar):** GSG ya **produce**
servicios (implementaciones, presets, contenido, landing pages) a costo bajo vía la factory de agentes y
los vende a precio de mercado — **eso es Agencia Digital, ya operando**. Lo que agrega valor de esta
ronda es **nombrar la lente explícitamente y aplicarla a categorías de servicio fuera del ERP**: por
ejemplo, ofrecer como servicio independiente (no atado a vender el ERP) capacidades que la factory ya
sabe producir barato — diseño de tienda/landing, generación de catálogo/fichas, campañas de WhatsApp —
para clientes que **no** necesariamente van a comprar el ERP completo. Es el mismo motor, un empaquetado
comercial distinto.

**Cómo se apalanca en lo que ya existe:** 100% — es la factory de agentes + Diseño + Preset IA ya
construidos; **cero desarrollo nuevo, solo empaquetado comercial**.

**Factibilidad:** la de menor riesgo de las tres — no hay capital nuevo, no hay logística nueva, no hay
gap de competencia (a diferencia de la pauta paga de la Idea 2). El único trabajo real es de **producto
comercial**: definir qué servicios sueltos se venden, a quién, y a qué precio — trabajo de Pricing &
Packaging (`docs/estrategia/crecimiento-estructura-agentes.md` #4), no de infraestructura nueva.

**Riesgo/frontera a vigilar:** si esto crece, hay que vigilar la **frontera Grow/Digital** (`agencia-
grow.md` §1) — en cuanto un servicio suelto empiece a "vender el ERP" indirectamente (ej. el cliente que
compra una landing termina migrando al ERP), esa pieza cruza a Agencia Digital, no se queda mezclada en
Grow.

**Referencia de modelo que funciona:** el propio modelo de agencias que arbitran capacidad de producción
(diseño/dev) barata contra precio de mercado — el mismo mecanismo que ya usan estudios/agencias chicas
que tercerizan producción a bajo costo y venden a precio de mercado; GSG lo hace con agentes de IA en vez
de freelancers tercerizados, que es, en rigor, un arbitraje de costo más favorable todavía.

---

## Idea 4 — "Comprar barato y vender más caro" (tesis, no línea)

No se arranca como línea: es el **criterio de validación transversal** para 1, 2, 3 y `impo`. Cada
oportunidad que entre a cualquiera de estas líneas se mide contra la misma pregunta que ya usa `impo`:
demanda real + margen neto de todos los costos (flete/encomienda, pauta, comisión de plataforma) +
capital protegido (no se compra/gasta hasta validar). No requiere documento ni charter propio — ya está
encarnada en la disciplina de capital de ADR-030/038.

---

## Idea 5 — Listas de proveedores actualizadas (infraestructura compartida, no línea)

**Versión mejorada:** no es una idea de negocio, es un **activo de datos** que alimenta a 1, 2, 3 y a
`impo`. Se resuelve **generalizando** la célula ya diseñada **Analista de proveedores** de `impo` (hoy
enfocada en China/Alibaba/1688) a dos fuentes más:
- **Proveedores mayoristas domésticos** (Once/Flores/La Salada) — para la Idea 1.
- **Proveedores/licenciantes de productos digitales** (marketplaces de PLR/white-label) — para la Idea 2.

**Cómo se apalanca en lo que ya existe:** reúso directo de rol (ADR-053, pool) — mismo tipo de trabajo,
tres fuentes distintas. No hace falta un rol nuevo, alcanza con **extender el mandato** de la célula ya
definida en `impo` cuando se abra esa estructura (o encargarlo como tarea puntual, no un agente
permanente — mismo criterio "one-off vs. rol" ya aplicado en `crecimiento-estructura-agentes.md` §4).

**Qué necesita (no se ejecuta acá):** un directorio vivo (planilla o doc simple, no un sistema nuevo) con
proveedor, categoría, condiciones (MOQ/mínimos, precios, contacto), actualizado por la misma disciplina
de "repo = memoria" que ya usa `impo`. **Cero scraping ni formularios con login en esta ronda** — eso
queda para cuando el dueño abra la ejecución.

**Referencia de modelo que funciona:** el equivalente enterprise es un registro de proveedores
homologados (SAP Ariba); la versión criolla y proporcionada al tamaño de GSG es un directorio vivo
simple, no un sistema — coherente con "argentinizar SAP" (la disciplina, no el peso).

---

## Sinergias detectadas (resumen)

- **Ideas 1 + `impo` comparten el mismo mecanismo** (arbitraje de producto físico) y la misma célula de
  fulfillment/logística — se puede prestar del pool en vez de crear estructura nueva para ninguna de las
  dos.
- **Idea 5 no es una línea, es la capa de datos** que alimenta 1, 2 y `impo` por igual — un solo
  directorio de proveedores, tres fuentes.
- **Idea 3b (arbitraje de servicio) ya es Agencia Digital** — la única "novedad" es nombrarla y
  empaquetarla para categorías de servicio sueltas, sin ERP de por medio.
- **Ideas 4 (tesis) y `impo`'s disciplina de capital (ADR-030/038) son la misma regla** — no hace falta
  una regla nueva, se hereda.
- **Todas comparten el mismo cuello de botella de ejecución futura:** facturación (ARCA real) y cobro
  (MP real) siguen siendo gaps del roadmap del ERP (`roadmap-gsg.md` §2) — cualquier línea de Grow que
  cobre plata también depende de que esos dos móduros se cierren, aunque el negocio no gire alrededor
  del ERP.

## Ranking — por dónde empezar

1º — **Idea 3b (arbitraje de servicio vía factory)** — cero capital nuevo, cero logística nueva, 100%
   reúso de lo que ya existe (Agencia Digital); el único trabajo es empaquetado comercial (Pricing).
   Puede arrancar como una decisión de producto, sin gate de capital.
2º — **Idea 1 (reventa doméstica al interior, sin marca, sobre pedido)** — mercado ya validado
   informalmente, sinergia directa con la célula de fulfillment de `impo`; necesita una ronda de análisis
   (margen real por categoría neto de encomienda) antes de comprometer el primer peso — coherente con la
   disciplina de capital.
3º — **Idea 5 (directorio de proveedores)** — no es secuencial, corre **en paralelo** a 1 y 2 como
   infraestructura compartida, extendiendo la célula de proveedores de `impo`.
4º — **Idea 2 (productos digitales + pauta)** — mercado más incierto, y GSG tiene un gap real de
   competencia en gestión de pauta paga que ninguna de las otras ideas tiene — necesita más validación (o
   un socio/experto en performance marketing) antes de escalar presupuesto de ads.
5º — **Idea 4** no se activa como línea — queda como el criterio con el que se audita todo lo anterior.

---

**Estado:** borrador del Advisory Board, listo para que el **Challenger** lo tensione (ADR-045). No
instancia ningún agente ni ejecuta nada operativo — recomendación de negocio, doc-only.
