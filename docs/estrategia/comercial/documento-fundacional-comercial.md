> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Síntesis anclada en `docs/estrategia/comercial-fundacional-mariano.md`. Incorporado sin alterar el contenido.

---

# GSG — Documento Fundacional Comercial

**Análogo comercial del documento fundacional técnico**
**Propósito:** alinear y onboardear a Mariano como socio a cargo de la estrategia comercial / go-to-market.
**Estado:** decision-grade v1. Los puntos marcados **[DECISIÓN DE MARIANO]** son intencionalmente abiertos.
**Notación:** `[SUPUESTO]` = estimación no confirmada, a validar. Fuentes citadas al pie de sección donde aplica.
**Fecha:** julio 2026.

---

## 0. Cómo leer este documento

Este es el documento espejo del fundacional técnico. El técnico define *qué construimos y cómo*. Este define *a quién se lo vendemos, por qué nos eligen, cuánto cobramos y cómo lo hacemos crecer*. No re-discute lo ya decidido (los dos productos, el norte de diseño, el equipo IA, el hallazgo competitivo): construye encima. Donde una cifra no está confirmada, se marca `[SUPUESTO]` y queda como tarea de validación —no como hecho.

El lector objetivo es Mariano. Al terminar, Mariano debería poder responder: *¿qué es GSG, por qué ahora, a quién le vendemos, cómo le ganamos a la competencia, y qué decisiones dependen de mí?*

---

## 1. Resumen para el socio comercial (una página)

**Qué es GSG.** GSG construye software de gestión (ERP) para Argentina, con foco en el enorme segmento que hoy está mal servido: por abajo, las micro-empresas que operan con planilla, cuaderno o herramientas sueltas; por arriba, las PyMEs que ya necesitan un sistema serio pero no llegan —ni en presupuesto ni en complejidad— a SAP Business One.

**La visión.** Ser el sistema de gestión por defecto de la empresa argentina que hoy no tiene uno bueno. Un motor único, invisible, que resuelve lo que en Argentina es no-negociable (facturación ARCA nativa, rigor impositivo, seguridad) y encima dos productos con experiencias distintas según el tamaño del cliente. El diferencial no es "otro ERP más barato": es la combinación que hoy nadie ofrece —**factura ARCA nativa + experiencia de uso deleitosa + rigor de empresa + IA nativa**.

**Los dos productos.**

- **Comercio Micro** — para micro-empresas: kioscos, carnicerías, gastronomía chica, estética y servicios con turnos, retail chico. Simple, se usa desde el primer día sin capacitación, resuelve el día a día: vender, cobrar (Mercado Pago), facturar (ARCA) y ver cómo va el negocio. **Sale primero** (MVP casi listo).
- **PyME/Empresa** — para empresas que superaron las planillas y los sistemas de contador, pero para las que SAP B1 es demasiado (caro, lento de implementar, sobredimensionado). Profundidad real: multi-usuario, módulos, control impositivo argentino, operación en tiempo real, con una UX moderna que la categoría no tiene. **Sale después.**

**El norte de diseño** (heredado del fundacional técnico): **Apple × SAP**. La simpleza y el deleite de Apple sobre la profundidad y el rigor de SAP. Construido por un equipo 100%-IA, lo que nos da velocidad de producto y una ventaja estructural en costos que se traslada a precio y a la promesa de **IA nativa** —hoy prácticamente vacía en el mercado local.

**Por qué ahora.** La facturación electrónica ARCA es obligatoria para todos los contribuyentes, incluidos monotributistas de todas las categorías. Eso convierte "digitalizarse" de opción a obligación, y crea una puerta de entrada natural: todo negocio *tiene* que facturar electrónicamente, y hoy lo hace con herramientas fragmentadas o incómodas.

---

## 2. Mercado y segmento

### 2.1 El segmento

Dos capas de un mismo mercado sub-SAP-B1:

1. **Micro-empresas** — comercio y servicios de baja complejidad, típicamente monotributistas o pequeñas S.A./S.R.L. Alta informalidad operativa (cuaderno, Excel, WhatsApp), pero obligación creciente de facturar electrónicamente.
2. **PyMEs** — empresas formales con empleados, stock, múltiples puntos de venta o áreas, que necesitan un ERP real pero no justifican (ni pueden costear) SAP B1.

### 2.2 Tamaño de la oportunidad (TAM / SAM / SOM)

Las cifras de base son públicas; la conversión a valor de mercado es estimada y se marca como `[SUPUESTO]`.

**Datos ancla (confirmados por fuentes):**

- **~1,77 millones** de MiPyMEs con certificado MiPyME vigente en Argentina (sociedades, autónomos, cooperativas y monotributistas). De ese universo, **95,9% micro**, 3,4% pequeñas, ~0,7% medianas tramo 1 y ~0,03% medianas tramo 2. (Fuente: Argentina.gob.ar / Subsecretaría PyME.)
- **~525.538 empresas** formales registradas a abril 2025 (universo más acotado, empleadoras). (Fuente: Argentina.gob.ar.)
- Distribución sectorial MiPyME: **servicios 50%, comercio 24,1%**, industria 12,9%, agro 8,6%, construcción 4,3%, minería 0,1%. Es decir, ~3 de cada 4 MiPyMEs están en servicios+comercio —exactamente donde apuntan nuestros dos productos.
- Factura electrónica **obligatoria para todos los contribuyentes**, monotributistas incluidos (RG 5616/2024, actualización obligatoria desde abril 2025). (Fuente: ARCA / Argentina.gob.ar.)

**Estimación de mercado (embudo TAM → SAM → SOM):**

| Nivel | Definición | Universo | Valor anual estimado |
|---|---|---|---|
| **TAM** | Todas las MiPyMEs argentinas que deben facturar y podrían usar software de gestión | ~1,77 M unidades | **[SUPUESTO]** ~USD 500–900 M/año en gasto potencial de software de gestión |
| **SAM** | Micro (comercio/servicios) + PyMEs sub-SAP-B1 alcanzables por nuestros dos productos | ~500 mil–700 mil unidades activas y "software-ready" | **[SUPUESTO]** ~USD 200–350 M/año |
| **SOM (36 meses)** | Cuota realista a capturar en 3 años con GTM enfocado | ~10.000–25.000 cuentas pagas | **[SUPUESTO]** ~USD 8–20 M ARR |

**Cómo se construye el `[SUPUESTO]`** (para que Mariano lo pueda estirar o ajustar):

- **TAM:** de ~1,77 M MiPyMEs, asumimos que una fracción significativa (digamos 50–70%) es económicamente "software-addressable" (tiene actividad suficiente para pagar un SaaS). A un ticket promedio combinado micro+PyME de `[SUPUESTO]` ~USD 15–25/mes ponderado, el gasto potencial anualizado cae en la banda indicada. **Sensible al tipo de cambio** —conviene modelarlo en pesos y en dólares.
- **SAM:** recortamos a los sectores servicio+comercio (≈74%) con mínima capacidad de pago y necesidad real, y sumamos el subconjunto PyME.
- **SOM:** penetración de 2–5% del SAM en 36 meses, coherente con un lanzamiento por fases (Micro primero).

> **Tarea de validación (Mariano + datos):** afinar estos números con (a) datos de penetración actual de software de gestión en MiPyMEs, (b) ticket promedio real que pagan hoy, (c) mortalidad/rotación de micro-negocios. Sin (a) y (b) el modelo de ingresos queda con banda ancha.

### 2.3 Por qué es atractivo *ahora*

1. **Obligatoriedad ARCA como forzante.** Facturar electrónicamente dejó de ser opcional. Cada negocio necesita una herramienta; muchos usan hoy el "Comprobantes en línea" de ARCA o apps sueltas, incómodas y desconectadas de su operación. Somos la puerta de entrada natural.
2. **Digitalización post-pandemia + cobros digitales.** Mercado Pago y los QR ya están en el mostrador de casi todos. Falta el software que una *cobro + venta + factura + gestión* en un solo lugar.
3. **Ventana de IA.** La IA nativa está prácticamente vacía en el mercado local. Llegar temprano con IA útil (no de vitrina) es un diferenciador que hoy nadie ocupa.
4. **Ventaja de costos estructural.** Equipo 100%-IA → menor costo de construir y mantener → podemos ofrecer más producto por menos precio, sosteniblemente.

**Fuentes sección 2:**
- [Alivio fiscal para 1,8 millones de empresas (MiPyMEs) — Argentina.gob.ar](https://www.argentina.gob.ar/noticias/alivio-fiscal-para-18-millones-de-empresas-por-la-actualizacion-de-los-montos-para-ser)
- [¿Qué es una MiPyME? — Argentina.gob.ar](https://www.argentina.gob.ar/produccion/registrar-una-pyme/que-es-una-pyme)
- [Emitir factura electrónica para monotributistas — Argentina.gob.ar](https://www.argentina.gob.ar/emitir-factura-electronica-para-monotributistas)
- [Facturación electrónica ARCA 2025 (guía) — Develop Argentina](https://developargentina.com/blog/facturacion-electronica-arca-guia-completa-2025)

---

## 3. El hueco de mercado y la tesis de diferenciación

De un relevamiento previo de 18 competidores (SAP B1 / Public Cloud, Tango, Bistrosoft, Fudo, tuturno.io, AgendaPro, Colppy, Xubio, Alegra, Mercado Pago, entre otros), el hallazgo central es:

> **Nadie combina, en un solo producto: factura ARCA nativa + UX deleitosa + rigor de empresa. Y la IA nativa está prácticamente vacía.**

El mercado está partido en tres grupos, cada uno fuerte en un eje y débil en los otros:

- **Los "impositivos/contables"** (Colppy, Xubio, Alegra, Tango Factura): buenos en factura ARCA, pero pensados desde la contabilidad, con UX anticuada y sin operación real del negocio (sin turnos, sin POS integrado con delight).
- **Los "verticales de operación"** (Bistrosoft, Fudo en gastronomía; tuturno.io, AgendaPro en turnos/estética): buena operación de su nicho, pero la factura ARCA es un agregado, no el corazón, y no escalan a "empresa".
- **Los "de empresa"** (SAP B1, Tango Gestión): profundidad y rigor, pero caros, pesados de implementar, UX de otra época y cero deleite.

**El whitespace concreto:**

- **En Micro:** nadie une **turnos/POS + Mercado Pago + factura ARCA** en un solo flujo deleitoso. El comerciante hoy salta entre app de turnos, Mercado Pago y el facturador de ARCA.
- **En Empresa:** nadie combina **profundidad impositiva argentina + operación en tiempo real + UX moderna**. O tenés rigor sin UX (SAP/Tango), o UX sin profundidad.

**La tesis de diferenciación (una frase):**
Somos el único que trae **rigor de empresa con simpleza de app de consumo**, con **ARCA nativo de fábrica** (no como plugin) y **IA nativa** que hace el trabajo aburrido —en un motor único que sirve tanto al kiosco como a la PyME.

**Por qué es defendible:**
1. El motor invisible compartido (facturación ARCA, seguridad, núcleo transaccional) es costoso de construir una vez y barato de reusar —foso técnico.
2. La ventaja de costo del equipo IA permite invertir en UX y en IA donde los incumbentes no pueden justificar el gasto.
3. Ser AR-first (pesos, ARCA, realidad local) frena a los SaaS regionales/globales que tratan a Argentina como un mercado más.

---

## 4. Propuesta de valor e ICP por producto

### 4.1 Comercio Micro

**Propuesta de valor (una línea):** *Todo tu negocio en una sola app: vendé, cobrá con Mercado Pago, facturá con ARCA y sabé cómo vas —sin manuales ni contador para arrancar.*

**ICP (perfil de cliente ideal):**
- Dueño-operador de un micro-negocio, 1–5 personas.
- Ya factura (u obligado a facturar) por ARCA y cobra con Mercado Pago.
- Hoy usa cuaderno / Excel / apps sueltas y siente la fricción.
- Decisión de compra: **la toma el dueño, en el momento, sin comité**. Sensible al precio pero más al "esto me resuelve la vida".
- Anti-ICP: negocio informal que no piensa facturar; empresa que ya necesita módulos y multi-usuario (ese es PyME).

**Casos de uso por industria:**

| Industria | Dolor específico | Qué resuelve Comercio Micro |
|---|---|---|
| Kiosco / autoservicio | Vender rápido, controlar stock básico, facturar | POS ágil + stock simple + factura ARCA en el mismo gesto |
| Carnicería / dietética | Venta por peso, márgenes ajustados, caja diaria | POS por peso, cierre de caja, control de margen |
| Gastronomía chica (café, rotisería) | Pedidos, cobro, factura sin frenar la fila | Comanda simple + Mercado Pago + factura, todo en uno |
| Estética / peluquería / servicios | Turnos + cobro + comprobante | **Turnos + POS + Mercado Pago + ARCA en un flujo** (el whitespace) |
| Retail chico (indumentaria, regalería) | Stock por variante, ventas, factura | Catálogo con variantes, stock, factura |

### 4.2 PyME/Empresa

**Propuesta de valor (una línea):** *El sistema de gestión serio que tu empresa necesita —profundidad de ERP, control impositivo argentino y operación en tiempo real— sin el costo, la lentitud ni la complejidad de SAP.*

**ICP:**
- PyME formal, ~6–100 empleados `[SUPUESTO: rango a ajustar]`, con stock, múltiples usuarios/áreas y/o varios puntos de venta.
- Ya "se le quedó chico" el sistema del contador o una herramienta contable, pero SAP B1 es demasiado.
- Decisión de compra: **asistida**, participan dueño/gerente + administración/contador. Ciclo más largo, ticket mayor.
- Anti-ICP: corporación que realmente necesita SAP; micro-negocio de un solo operador (ese es Micro).

**Casos de uso por industria:**

| Industria | Dolor | Qué resuelve PyME/Empresa |
|---|---|---|
| Distribuidora / mayorista | Stock multi-depósito, listas de precios, cuenta corriente | Inventario real + CxC/CxP + facturación masiva ARCA |
| Retail multi-sucursal | Consolidar ventas y stock entre locales en tiempo real | Operación en tiempo real multi-punto + reportes |
| Manufactura chica | Costeo, órdenes, control de producción | Módulos de producción/costeo + impositivo AR |
| Servicios profesionales (con empleados) | Facturación recurrente, proyectos, impuestos | Facturación + control de rentabilidad por proyecto |
| Comercio en crecimiento | Migrar de planilla/contador a sistema sin trauma | Onboarding asistido + UX moderna + IA que ordena datos |

---

## 5. Posicionamiento y mensaje central

**Categoría que ocupamos:** el sistema de gestión argentino que se siente como una app de consumo y trabaja como un ERP.

**Los tres pilares del mensaje:**

1. **Apple × SAP.** "La profundidad de un ERP con la simpleza de tu celular." Contra los impositivos aburridos y los ERP pesados: nosotros somos ambos, bien.
2. **AI-native.** "La IA hace el trabajo aburrido: carga, ordena, te avisa, te sugiere." No IA de vitrina —IA que ahorra horas. Ocupamos un espacio hoy vacío.
3. **"En pesos y hecho para acá."** ARCA nativo, realidad impositiva argentina, soporte local, precios en pesos. Contra los SaaS regionales/globales que no entienden Argentina.

**Mensaje central (elevator, una frase):**
*"GSG es el sistema de gestión hecho para la empresa argentina —del kiosco a la PyME—: factura con ARCA de fábrica, se usa sin manual, y tiene IA que hace el trabajo aburrido. Rigor de empresa, simpleza de app, en pesos."*

**Tagline candidatos [DECISIÓN DE MARIANO]:**
- "Tu negocio, ordenado. Sin vueltas."
- "Del kiosco a la PyME. Un solo sistema."
- "Gestión con onda. Rigor sin dolor."

**Prueba de posicionamiento (lo que NO decimos):** no competimos por "el más barato" ni por "el más completo del mundo". Competimos por *la mejor relación entre lo que necesitás en Argentina y lo bien que se usa*.

---

## 6. Modelo de precios

### 6.1 Benchmarks de competidores (lo que se cobra hoy)

Precios de lista, en general **+ IVA (21%)**, a fecha reciente (2025–2026). Argentina ajusta tarifas seguido: tratar como referencia relativa, no absoluta.

| Competidor | Segmento | Precio de lista (ARS/mes, + IVA salvo aclaración) |
|---|---|---|
| **Xubio** | Micro/PyME contable | Gratis (10 fac./mes) → PyME desde ~$3.500 → ilimitado desde ~$8.500 |
| **Alegra** | Micro/PyME contable | Desde ~$2.599 (básico, 15 fac.) → PyME ilimitado desde ~$5.999 |
| **Colppy** | PyME contable | Desde ~$5.000–7.900 (facturación + contable + stock) |
| **Tango Factura** | Micro/PyME | Free (monotributo ≤20 comp.) → Factura ~$20.891 → Pro ~$48.207 → Negocios ~$106.237 → Negocios Pro ~$171.906 |
| **Tango Gestión** | PyME/Empresa | Escala hasta ~$231.400+/mes, ajuste trimestral |
| **Fudo** (gastronomía) | Micro vertical | Desde ~$15.500; con mesas+reportes+factura sube a ~$50.000+ |
| **Bistrosoft** (gastronomía) | Micro vertical | Cotización personalizada (no pública) |
| **SAP Business One** | Empresa | Nube ~€38–91/usuario/mes; on-prem hasta ~€2.700/usuario; implementación 7 usuarios ~USD 25.000–35.000 |

**Lectura para pricing:** hay un hueco claro. Los contables baratos (Alegra/Xubio) empiezan en ~$2.600–3.500 pero son "solo factura/contabilidad". Los que dan operación (Fudo, Tango) saltan a $15.000–100.000+. Entre "barato pero flaco" y "completo pero caro/feo" hay lugar para **producto completo, lindo, a precio medio**.

### 6.2 Estructura propuesta (a validar por Mariano)

**Principio:** precios en pesos, simples de entender, con la ventaja de costo del equipo IA trasladada parcialmente a precio para ganar share, sin regalar valor.

**Comercio Micro — suscripción mensual accesible (self-service):**

| Plan | Para quién | Precio propuesto (ARS/mes) `[SUPUESTO]` | Incluye |
|---|---|---|---|
| **Free / Arranque** | Monotributista chico, prueba | $0 (límite de comprobantes/funciones) | Factura ARCA básica, POS limitado — gancho de adquisición |
| **Micro** | Micro-negocio típico | ~$9.000–14.000 `[SUPUESTO]` | POS + factura ARCA ilimitada + Mercado Pago + stock simple + reportes |
| **Micro Pro** | Micro con turnos / multi-función | ~$18.000–25.000 `[SUPUESTO]` | Todo + turnos + IA (sugerencias, carga automática) + soporte prioritario |

> Posicionado por encima de Alegra/Xubio (porque damos operación, no solo factura) y muy por debajo de Fudo/Tango (porque somos self-service y eficientes en costo). El Free existe para adquisición, no para monetizar.

**PyME/Empresa — por módulos + tiers (venta asistida):**

| Componente | Lógica | Precio propuesto `[SUPUESTO]` |
|---|---|---|
| **Base (núcleo)** | Núcleo transaccional + factura ARCA + 1–3 usuarios | ~$60.000–120.000/mes `[SUPUESTO]` |
| **Por usuario adicional** | Escala con el equipo | ~$8.000–15.000/usuario/mes `[SUPUESTO]` |
| **Módulos** (stock avanzado, producción/costeo, multi-sucursal, CxC/CxP, IA avanzada) | Se activan según necesidad | ~$15.000–40.000/módulo/mes `[SUPUESTO]` |
| **Onboarding / implementación** | Setup asistido (una vez) | Fee único `[SUPUESTO]` o bonificado en contrato anual |

> Posicionado claramente **por debajo de Tango Gestión y a años luz de SAP B1** en costo total, pero por encima de los contables simples. El valor es "ERP de verdad, sin proyecto de 6 meses ni USD 30.000".

### 6.3 Lo que Mariano debe decidir en pricing **[DECISIÓN DE MARIANO]**

1. **Nivel exacto de cada precio** y si publicamos precios (transparencia, bueno para PLG) o cotizamos (bueno para Empresa).
2. **¿Free o trial?** en Micro: freemium permanente vs. prueba de 14–30 días. Trade-off: adquisición vs. canibalización.
3. **Anclaje a la inflación:** ajuste trimestral (como Tango) vs. precio en UVA/USD vs. congelado. Crítico en Argentina.
4. **Empaquetado Empresa:** módulos à la carte vs. 3 tiers cerrados (Starter/Pro/Enterprise). À la carte monetiza mejor; tiers venden más fácil.
5. **Descuento anual** y política de contratos (mensual sin permanencia vs. anual con descuento).
6. **Precio del onboarding** de Empresa: fee que genera caja vs. gratis para bajar fricción de cierre.

---

## 7. Go-to-market

### 7.1 Motion por producto

**Comercio Micro — Product-Led Growth (self-service):**
- El cliente se registra, configura y factura **sin hablar con nadie**. El producto se vende solo (por eso la UX es la estrategia comercial).
- Crecimiento por: SEO/contenido ("cómo facturar en ARCA", "sistema para kiosco"), performance ads, App/marketplaces, y **boca a boca** (referidos con incentivo).
- Métrica norte: activación (primera factura emitida) y conversión free→pago.

**PyME/Empresa — Venta asistida (sales-led):**
- Lead → demo → prueba guiada → propuesta → cierre. Ciclo de semanas.
- Requiere material comercial, un demo sólido y (a futuro) uno o dos vendedores/SDR.
- Métrica norte: pipeline, tasa de cierre, ticket promedio, tiempo de implementación.

### 7.2 Canales

1. **Directo / self-service (Micro):** el sitio y el producto como canal principal.
2. **Partners: contadores y gestorías.** Canal de altísimo apalancamiento —un contador recomienda a decenas de clientes. Programa de referidos/revshare para que nos vendan. **Prioridad estratégica.**
3. **Marketplaces / integraciones:** Mercado Pago, tiendas de apps, integradores. Estar donde el comerciante ya está.
4. **Creative Grow (agencia) como canal.** La agencia ya tiene relación con negocios y capacidad de producir marca, contenido y campañas. Puede: (a) generar demanda con contenido/performance, (b) vender GSG a su cartera, (c) ser el brazo de marketing de producto. Ver sección 12.
5. **SGS Lab (incubadora):** red y credibilidad, semillero de primeros clientes y aliados.

### 7.3 El embudo

```
                 MICRO (PLG)                         EMPRESA (asistido)
Conciencia   SEO, ads, contenido, boca a boca   Contadores, referidos, outbound, eventos
Interés      Landing + demo interactiva          Demo con vendedor
Prueba       Free / trial self-service           Piloto guiado
Conversión   Upgrade a plan pago (self)          Propuesta + cierre asistido
Retención    Activación → hábito → IA "pega"     Onboarding + éxito del cliente
Expansión    Upsell a Pro, más módulos           Más usuarios + más módulos
Referido     Incentivo por traer otro negocio    Caso de éxito + contador multiplica
```

**Palanca clave transversal:** los **contadores/gestorías** tocan ambos embudos. Un buen programa de partners baja el CAC en los dos productos a la vez.

---

## 8. Competencia — resumen accionable

**A quién le ganamos y cómo:**

| Competidor | Su fuerza | Su debilidad | Cómo le ganamos |
|---|---|---|---|
| **Alegra / Xubio / Colppy** | Baratos, factura/contable OK, marca | UX contable, sin operación real, sin IA útil | UX deleitosa + operación (POS/turnos) + IA, a precio competitivo |
| **Tango (Factura/Gestión)** | Marca instalada, profundidad, contadores | Caro, UX antigua, pesado, ajuste trimestral | Mejor UX, IA nativa, mejor precio-valor, AR-first moderno |
| **Fudo / Bistrosoft** | Vertical gastronómico fuerte | Encierran en un nicho, factura como agregado, sube de precio con módulos | Flujo unificado (turnos/POS + MP + ARCA) y capacidad de escalar a empresa |
| **tuturno.io / AgendaPro** | Turnos pulidos | Solo turnos, factura débil | Turnos + POS + cobro + ARCA en un solo producto |
| **Mercado Pago** | Distribución masiva, cobro | No es gestión ni ERP; factura/stock limitados | Somos la capa de gestión que se apoya en MP (aliado, no enemigo) |
| **SAP Business One** | Rigor, marca enterprise | Caro (USD 25–35k impl.), lento, sobredimensionado, feo | Para el sub-SAP: 10× más barato, semanas no meses, UX moderna |

**Con qué NO competir (disciplina):**
- **No** perseguir la corporación que realmente necesita SAP B1 —no es nuestro cliente, es un pozo de recursos.
- **No** entrar a una guerra de precios contra los contables gratis/baratos: nuestro terreno es *valor*, no *el más barato*.
- **No** convertirnos en un vertical cerrado (ser "el software de X"): el motor único y los dos productos son la ventaja; mantener la amplitud.
- **No** pelear con Mercado Pago en cobros: integrarlo, no competirlo.

---

## 9. Modelo de negocio y unit economics (esbozo)

Todo esta sección es `[SUPUESTO]` —el propósito es dar el esqueleto para que Mariano lo llene con datos reales.

**Ingreso:** SaaS por suscripción recurrente (MRR/ARR). Micro = volumen × ticket bajo; Empresa = pocos clientes × ticket alto + onboarding.

**Estructura de márgenes:**
- **Margen bruto SaaS alto** `[SUPUESTO: 75–85%]` —costo marginal casi solo infraestructura (equipo de construcción es IA, costo estructural bajo). Esta es una ventaja central: más margen para reinvertir en adquisición.

**Micro (PLG) `[SUPUESTO]`:**
- CAC: bajo, mayormente digital/orgánico → `[SUPUESTO]` USD 10–40 por cuenta paga.
- Ticket: ~USD 8–18/mes equivalente → ARPU anual ~USD 100–200.
- Churn: **el riesgo** (micro-negocios rotan y cierran) → `[SUPUESTO]` 3–6%/mes. Bajarlo con activación e IA que "pega" el hábito.
- LTV: fuertemente dependiente del churn → `[SUPUESTO]` USD 200–600. **LTV/CAC objetivo ≥ 3.**

**Empresa (asistido) `[SUPUESTO]`:**
- CAC: alto (venta + demo + onboarding) → `[SUPUESTO]` USD 300–1.500.
- Ticket: ~USD 80–400/mes → ARPU anual ~USD 1.000–5.000.
- Churn: bajo (costo de cambio alto una vez implementado) → `[SUPUESTO]` <2%/mes.
- LTV: alto → `[SUPUESTO]` USD 3.000–15.000. **LTV/CAC objetivo ≥ 4–5.**

**Camino a rentabilidad (narrativa):**
1. Micro genera **volumen, aprendizaje y flujo de caja temprano** con CAC bajo.
2. Empresa genera **margen y ARR estable** con tickets grandes.
3. El **motor compartido** hace que el segundo producto tenga costo incremental bajo → la rentabilidad mejora a medida que se amortiza el núcleo sobre las dos bases.
4. Los **contadores como canal** bajan el CAC blended; la **ventaja de costo IA** sostiene el margen.

> **Tarea de validación (Mariano):** definir 3–5 métricas norte (p.ej. MRR, cuentas pagas, churn Micro, LTV/CAC, tiempo de implementación Empresa) y sus metas por trimestre. Sin metas, no hay GTM medible.

---

## 10. Roadmap comercial por fases

Alineado a producto: **Micro sale primero (MVP casi listo), Empresa después.**

**Fase 0 — Preparación comercial (ahora → lanzamiento Micro)**
- Cerrar pricing v1 de Micro, landing, mensaje, y tracking de embudo.
- Reclutar 10–30 **clientes de diseño/beta** (usar red SGS Lab / Creative Grow).
- Armar el programa de contadores (aunque sea manual).
- *Entregable:* Micro listo para vender self-service con medición.

**Fase 1 — Lanzamiento y tracción Micro (PLG)**
- Adquisición digital + boca a boca + primeros partners contadores.
- Foco obsesivo en **activación y churn** (que la primera factura salga fácil).
- *Meta:* primeras N cuentas pagas y un LTV/CAC ≥ 3 demostrable. `[SUPUESTO: N a definir]`

**Fase 2 — Escala Micro + preparación Empresa**
- Optimizar el embudo Micro (conversión free→pago, upsell a Pro).
- Construir material de venta asistida, demo y primeros pilotos de Empresa (design partners PyME).
- Activar Creative Grow como motor de demanda a full.

**Fase 3 — Lanzamiento Empresa (asistido)**
- Venta asistida con 1–2 vendedores/SDR + canal de contadores multiplicando.
- Onboarding como proceso repetible.
- *Meta:* primeros contratos anuales de Empresa, ARR que empieza a pesar.

**Fase 4 — Motor de crecimiento**
- Los dos productos corriendo, canal de partners maduro, IA como diferenciador vendible.
- Expansión (más módulos, upsell, referidos), rentabilidad blended mejorando.

---

## 11. Qué necesitamos de Mariano

El rol de Mariano —"cerebro comercial"— desbloquea decisiones que hoy están abiertas y que el producto no puede resolver solo. En orden de prioridad:

1. **Pricing final** (sección 6.3): niveles, freemium vs. trial, anclaje a inflación, empaquetado de Empresa, política de descuentos y onboarding.
2. **Estrategia de canal:** diseñar y liderar el **programa de contadores/gestorías** (el de mayor apalancamiento), definir el rol operativo de Creative Grow como canal, y priorizar marketplaces/integraciones.
3. **Metas de venta y métricas norte:** fijar objetivos por trimestre (cuentas, MRR/ARR, churn, LTV/CAC, tasa de cierre Empresa) y el tablero para seguirlos.
4. **Primeros clientes:** conseguir y cerrar los **design partners / beta** de Micro y, más adelante, los pilotos de Empresa. Traer la primera cartera.
5. **Motion de ventas de Empresa:** definir el proceso (lead→demo→piloto→cierre), el material comercial, y cuándo/ a quién contratar como primer vendedor.
6. **Mensaje y marca comercial:** validar posicionamiento, tagline y narrativa de ventas (sección 5) con clientes reales.
7. **Validar los `[SUPUESTO]` del mercado y unit economics:** convertir las bandas anchas de TAM/SAM/SOM y CAC/LTV en números con datos reales.

> En una línea: **Mariano es dueño del "cómo se vende, a cuánto, por qué canal y con qué metas". El producto trae el "qué"; Mariano trae el mercado.**

---

## 12. Relación con SGS Lab / Creative Grow

Existe una estructura de marca con dos piezas que son **activos comerciales**, no solo contexto:

- **SGS Lab (incubadora):** aporta **credibilidad, red y semillero**. Fuente de primeros clientes, aliados, contadores y talento. Marco institucional que da respaldo a GSG frente a clientes y partners.
- **Creative Grow (agencia):** es un **canal y un motor de marketing listo para usar**. Puede: (a) producir la marca, el contenido y las campañas de GSG (marketing de producto y demand gen), (b) vender GSG a su propia cartera de clientes-negocios, (c) operar como el brazo creativo/performance del embudo Micro.

**Cómo lo aprovechamos (propuesta, a decidir con Mariano):**
- Creative Grow = **primer canal de adquisición y estudio de marca** de GSG desde el día 1, con un acuerdo claro (¿servicio interno? ¿revshare por cliente traído? **[DECISIÓN DE MARIANO]**).
- SGS Lab = **red de warm intros** para design partners, contadores y pilotos de Empresa.
- Cuidar que la relación esté ordenada: definir si GSG le "paga" a Creative Grow, si es equity/servicio, y cómo se atribuyen los clientes que traiga. Evitar ambigüedad que después genere fricción entre socios. **[DECISIÓN DE MARIANO + los tres socios]**

---

## Resumen ejecutivo (para Mariano)

GSG construye el sistema de gestión que la empresa argentina no tiene: dos productos sobre un mismo motor invisible —**Comercio Micro** para el kiosco, la carnicería, la estética y el retail chico (sale primero, MVP casi listo), y **PyME/Empresa** para las empresas que superaron las planillas pero no llegan a SAP B1 (sale después). El mercado es enorme y está mal servido: ~1,77 millones de MiPyMEs, 3 de cada 4 en servicios y comercio, todas obligadas a facturar electrónicamente por ARCA —una obligación que convierte "digitalizarse" en necesidad y nos da la puerta de entrada. El hueco es claro y confirmado por el relevamiento de 18 competidores: nadie combina factura ARCA nativa + UX deleitosa + rigor de empresa, y la IA nativa está prácticamente vacía. En Micro, nadie une turnos/POS + Mercado Pago + factura ARCA en un flujo; en Empresa, nadie junta profundidad impositiva argentina con operación en tiempo real y UX moderna. Nuestra tesis: **Apple × SAP, AI-native, en pesos y hecho para acá**, con una ventaja de costo estructural (equipo 100%-IA) que sostiene mejor precio y mejor margen. El pricing propuesto ocupa el hueco entre "los baratos que solo facturan" y "los caros y feos": Micro por suscripción accesible (self-service/PLG), Empresa por módulos y tiers (venta asistida), con los contadores/gestorías como canal de mayor apalancamiento y Creative Grow como motor de demanda. Los unit economics son sólidos en el esqueleto —margen SaaS alto, CAC bajo en Micro, ticket y LTV altos en Empresa—, con el churn de Micro como principal riesgo a gestionar con activación e IA. El rol de Mariano es ser dueño del "cómo se vende, a cuánto, por qué canal y con qué metas": cerrar el pricing, diseñar el canal de contadores y el rol de Creative Grow, fijar metas y métricas, y traer los primeros clientes. El producto trae el *qué*; Mariano trae el *mercado*. La oportunidad es grande, la ventana (ARCA + IA) está abierta ahora, y la ventaja es defendible. Falta el cerebro comercial que la ejecute.

---

### Anexo — Fuentes

- [MiPyMEs registradas y distribución — Argentina.gob.ar](https://www.argentina.gob.ar/noticias/alivio-fiscal-para-18-millones-de-empresas-por-la-actualizacion-de-los-montos-para-ser)
- [¿Qué es una MiPyME? — Argentina.gob.ar](https://www.argentina.gob.ar/produccion/registrar-una-pyme/que-es-una-pyme)
- [Factura electrónica monotributistas — Argentina.gob.ar](https://www.argentina.gob.ar/emitir-factura-electronica-para-monotributistas)
- [Facturación electrónica ARCA 2025 — Develop Argentina](https://developargentina.com/blog/facturacion-electronica-arca-guia-completa-2025)
- [Precios Tango (planes) — GPsystem / Axoft](https://www.gpsystem.com.ar/tango-punto-de-venta/precios/)
- [Planes y precios Alegra Argentina](https://www.alegra.com/argentina/gestion/precios/)
- [Planes y precios Colppy](https://colppy.com/planes-y-precios-pymes)
- [Xubio precios y funciones — Comparasoftware](https://www.comparasoftware.com.ar/xubio)
- [Precios Fudo](https://fu.do/es-ar/precios/)
- [Bistrosoft — preguntas frecuentes / precios](https://bistrosoft.com/ar/preguntas-frecuentes/)
- [Guía de precios SAP Business One — Seidor](https://www.seidor.com/en-us/blog-pyme/full-guide-pricing-and-licenses-sap-business-one)

> **Nota de método:** los datos de universo de empresas y obligatoriedad ARCA son de fuentes oficiales/públicas. Los benchmarks de precios son de listas comerciales sujetas a ajuste frecuente por inflación —usar como referencia relativa. Todo TAM/SAM/SOM y unit economics está marcado `[SUPUESTO]` y requiere validación con datos internos y de mercado antes de tomarse como base de planificación financiera.
