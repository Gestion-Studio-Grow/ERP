> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), documento fundacional del dueño. Incorporado sin alterar el contenido original.

> **Nota:** este es el **maestro consolidado del bundle** (copia de todos los documentos). La
> **síntesis decisoria canónica** vive en [`fundacional-DEFINITIVO-v2.md`](fundacional-DEFINITIVO-v2.md); este
> archivo se preserva como respaldo íntegro del paquete de recuperación.

---

# GSG · Entregable completo (documento maestro)

> Copia consolidada de todos los documentos. Los mockups HTML van aparte (mockup-magra-vidriera.html, mockup-magra-mostrador.html).

---

# GSG · Challenge de Diseño + Dirección Creativa — Índice del entregable

**Fecha:** 10 jul 2026 · **Contexto:** ERP multi-tenant para comercios/PyMEs argentinas · Norte Apple × SAP.
Este paquete contiene todo el trabajo del challenge de diseño. Son 6 archivos, todos autocontenidos.

## Archivos

| # | Archivo | Qué es |
|---|---|---|
| 0 | `00-README-INDICE.md` | Este índice. |
| 1 | `01-challenge-diseno-actual.md` | Challenge honesto: qué sigue siendo genérico / sesgo de IA en el rediseño actual, con evidencia (el molde compartido entre velas/pádel/magra, el "hero + 2 botones", tipografía de librería) y los 6 mandatos de lo que hay que romper. |
| 2 | `02-direccion-creativa.md` | 3 direcciones bold (VIDRIERA+MOSTRADOR recomendada, TERMINAL CÁLIDA, ADN DE MARCA): lenguaje visual + paradigma de UX, referencias no-ERP, por qué gana, relación con Empresa. |
| 3 | `mockup-magra-vidriera.html` | Mockup HTML autocontenido — front público editorial de una tienda (MAGRA), con riel de pedido en vivo. Abrir con doble clic en el navegador. |
| 4 | `mockup-magra-mostrador.html` | Mockup HTML autocontenido — backoffice/POS "terminal cálida": KPIs, tablero kanban de comandas, ticket de cobro. Abrir con doble clic. |
| 5 | `04-magra-identidad.md` | Análisis de identidad real de magrameatmarket.com.ar: paleta hex verificada, tipografías, tono, layout, fotografía + kit de variables para clonar el tenant. |

## Cómo mostrárselo al dueño
1. Doble clic en `mockup-magra-vidriera.html` y `mockup-magra-mostrador.html` → se abren en el navegador.
2. Captura de pantalla completa de cada uno.
3. Acompañar con el resumen ejecutivo (abajo) o los .md 01 y 02.

## Resumen ejecutivo (1 párrafo)
El rediseño actual cambió la piel (color/copy por rubro) pero no el esqueleto: tres de cuatro tenants comparten literalmente la misma pantalla y frase-hero, y el molde es el promedio que genera cualquier modelo de IA ("hero + 2 botones", Inter, cards suaves, grilla segura). La propuesta rompe esto con dos lenguajes hermanos que encarnan el norte en vez de citarlo: una **VIDRIERA** editorial para la cara pública (Apple: opinado, fotográfico, con riel de pedido permanente) y un **MOSTRADOR** de terminal cálida para el operativo (SAP: denso, veloz, comandas que fluyen por carriles). Debajo, un motor de **ADN de Marca** que hace única cada tienda por construcción —la respuesta estructural al reproche de "todos se ven iguales / hecho por IA"— y que en Empresa se vuelve gobernanza de marca multi-sucursal.

## Paleta MAGRA (verificada en vivo, para el tenant)
```
--magra-carbon:#1D1D1B;  --magra-crema:#F2E6D7;  --magra-oro:#C5AE86;
--magra-acero:#CCD6DF;   --magra-gris:#69727D;   --magra-negro:#000000;
Display: 'Bebas Neue' · Texto: 'Open Sans'
```

---

# GSG · Challenge honesto del diseño actual

**Producto:** ERP multi-tenant para comercios/PyMEs argentinas · Norte: Apple × SAP
**Alcance revisado:** los 4 tenants en vivo (estética, velas, pádel, magra) + el molde de front público y backoffice.
**Postura de este documento:** no defender nada. Nombrar el sesgo, mostrar la evidencia, romperlo.

---

## 1. El diagnóstico en una frase

El rediseño cambió la **piel** (color, copy, ícono por rubro) pero no cambió el **esqueleto**. Y el esqueleto es exactamente el que un modelo de IA genera por defecto cuando le pedís "una landing de SaaS bonita y limpia". Por eso el dueño tiene razón: sigue oliendo a IA. No porque esté feo —está prolijo— sino porque es *el promedio*. Es la decisión que toma todo el mundo, ejecutada con competencia. Y el promedio no rompe ningún mercado.

La prueba está en el propio producto: **tres de los cuatro comercios (velas, pádel, magra) comparten literalmente la misma frase-hero y la misma pantalla.**

---

## 2. Evidencia concreta (esto es lo que sigue siendo genérico)

### 2.1. El molde compartido — el problema más grave

Velas, pádel y magra abren, palabra por palabra, con:

> *"Elegí lo que necesitás y hacé tu pedido. Pasá a buscarlo o te lo acercamos."*
> `[Enviar pedido]` · `Pedir por WhatsApp`
> `## Nuestros productos` → lista con botones `− / +` → `## Tu pedido`

Una carnicería boutique, una velería artesanal y un proshop de pádel **no pueden tener la misma primera pantalla.** Son tres negocios con clientes, rituales de compra y emociones opuestas. Que compartan molde no es "consistencia de marca de producto": es que el molde es un contenedor vacío al que se le cambió el relleno. El usuario final (el dueño del comercio y su cliente) percibe esto como plantilla. Es el equivalente digital de tres locales distintos con el mismo cartel de Pinturería genérica y solo cambia el nombre.

Estética, en cambio, recibió el *otro* molde de la biblioteca: la landing SaaS completa (hero + 3 features con ícono + servicios + equipo + "cómo funciona" en 3 pasos + CTA repetido + footer). Es más trabajada, pero es igual de reconocible: es la plantilla "Startup Template" de cualquier framework.

**Conclusión:** el sistema tiene dos plantillas, no cuatro identidades.

### 2.2. El "hero con título grande + 2 botones" — el tic más delator

Los cuatro repiten la fórmula: titular gigante centrado o a la izquierda, subtítulo de una línea, y **exactamente dos botones** (uno primario relleno, uno secundario/fantasma). Estética: `Reservar` + `Ver servicios`. Magra/velas/pádel: `Enviar pedido` + `Pedir por WhatsApp`.

Ese patrón "H1 + subtítulo + primary/secondary CTA" es la huella digital número uno del diseño generado por IA. No está mal *en sí*; está mal que sea **lo único que se sabe hacer**. No comunica el negocio: comunica "esto es una web hecha en 2020-2024".

### 2.3. Tipografía y espaciado "de librería"

- **Tipografía de sistema / Inter-por-defecto**: sans-serif neutra, un solo peso protagonista, sin pareja tipográfica con tensión. Es la fuente que nadie eligió: es la que venía.
- **Espaciado uniforme y tímido**: todo respira igual, todo está centrado o en la misma grilla de 12 columnas, márgenes "seguros". No hay jerarquía dramática, no hay una sola decisión de layout que te haga girar la cabeza.
- **Escala tipográfica plana**: el H1 es "grande", el resto es "normal". Falta el salto brutal (algo enorme conviviendo con algo diminuto) que da carácter editorial.

### 2.4. El vocabulario de componentes es el de la plantilla

Tres features con ícono lineal, cards con `border-radius` medio y sombra suave idéntica, botón pill, sección "cómo funciona" numerada 01/02/03, avatares generados (DiceBear/Lorelei en estética). Cada uno de esos componentes, por separado, es una decisión que tomó **todo el mundo** entre 2020 y 2025. Juntos, gritan "template".

### 2.5. El backoffice/POS no tiene tesis

El front público al menos intenta verse lindo. El operativo (la lista de productos con `− +` y "Tu pedido") es un formulario. No hay paradigma, no hay velocidad, no hay placer de uso, no hay una postura sobre *cómo se opera un comercio*. Para un norte SAP, esto es lo que más lejos está: SAP (bien entendido) es densidad de información con control total; acá hay una lista de compras.

---

## 3. Por qué pasa esto (nombrar el sesgo del modelo)

No es falta de gusto: es el **sesgo del promedio**. Un modelo de IA —y un equipo apurado— optimiza por "que se vea bien y no ofenda a nadie". Eso te lleva, siempre, al centro de gravedad del mercado: hero + 2 botones, Inter, cards suaves, grilla segura. Es el mínimo común múltiplo del buen gusto. **Es correcto y es invisible.**

"Limpio y seguro" es una zona de confort, no una identidad. Apple no es "limpio y seguro": Apple es *opinado*. Toma decisiones que excluyen. SAP no es "amigable": es *denso y poderoso*. El molde actual esquivó las dos cosas que hacen memorable a cada mitad del norte.

---

## 4. Qué hay que romper (el mandato para la Dirección Creativa)

1. **Matar el molde único.** Que el motor no imponga una plantilla: que imponga un *sistema de identidad* del que salgan identidades distintas por construcción. Una carnicería boutique y una velería no pueden compartir pantalla ni por error.
2. **Retirar el hero genérico.** Prohibido el patrón "H1 centrado + 2 botones" como apertura por defecto. La primera pantalla tiene que ser la del *negocio*, no la del *template*.
3. **Elegir tipografía con tensión.** Pareja tipográfica con carácter (display expresiva + funcional legible), escala dramática, no la fuente que viene.
4. **Layout con una postura.** Asimetría, full-bleed, densidad donde corresponde. Que haya al menos una decisión que sorprenda en cada pantalla.
5. **Darle una tesis al operativo.** El POS/backoffice necesita un paradigma de UX propio, veloz y placentero, que encarne la mitad SAP del norte —no ser un formulario con `− +`.
6. **Convertir la restricción en marca.** El hecho de ser multi-tenant no es un límite a esconder: es la oportunidad. El diferencial no es "otra web linda", es "un sistema que hace que cada comercio se vea inconfundiblemente suyo, y aún así todos sientan la misma calidad GSG".

> El objetivo no es "verse menos como IA". Es tener una **opinión** de diseño tan fuerte que ningún modelo la hubiera generado por promedio.

---

# GSG · Dirección Creativa — Comercio Micro

**Norte:** Apple × SAP, pero llevado más allá de "limpio y seguro".
**Traducción del norte para no quedar en abstracto:**
- **Apple** = el *front público* (la vidriera). Producto como objeto deseable, decisiones opinadas, calidad percibida absoluta.
- **SAP** = el *backoffice/POS* (el mostrador). Densidad de información, control total, velocidad, potencia operativa — pero *cálido*, no corporativo-frío.

El diferencial de GSG no es "hacer webs lindas". Es un **sistema** donde la cara pública se ve inconfundiblemente del comercio (Apple) y la cara operativa se maneja como un instrumento profesional (SAP). Dos caras, una misma señal de calidad.

A continuación, **3 direcciones bold**. Cada una define un *lenguaje visual* + un *paradigma de UX*, cubre front público y backoffice/POS, trae referencias fuera del mundo ERP, y explica por qué gana. La recomendada es la **Dirección 1 (VIDRIERA + MOSTRADOR)**, que es la que se materializa en los mockups.

---

## Dirección 1 — "VIDRIERA + MOSTRADOR" *(recomendada)*

**La tesis:** el comercio tiene dos caras y merecen dos lenguajes hermanos, no el mismo molde. La cara pública es una **vidriera editorial** (revista de autor); la cara operativa es un **mostrador** (terminal cálida, táctil, veloz). Es la traducción literal y honesta de Apple × SAP.

### Lenguaje visual (front público — la Vidriera)
- **Editorial retail maximalista, no landing SaaS.** La página se lee como un *spread* de revista: fotografía a sangre completa (full-bleed), grilla asimétrica, aire generoso y *un* gesto tipográfico enorme por pantalla.
- **Escala dramática.** Un display gigantesco (condensado, con personalidad) conviviendo con detalles diminutos en mayúsculas espaciadas (eyebrow/etiquetas). El salto de escala *es* el diseño.
- **Pareja tipográfica con tensión:** display condensado expresivo (tipo Bebas Neue / grotesca condensada / serif de alto contraste según rubro) + una sans funcional para lectura. Nunca una sola fuente neutra.
- **El producto es el héroe, no el titular.** La foto del corte, la vela, la pala — protagoniza. El texto la enmarca, no la tapa.
- **Color como firma del rubro**, no como decoración: paletas profundas y opinadas (ver Tenant DNA, Dirección 3).

### Paradigma de UX (front público)
- **"Scroll editorial con riel de pedido permanente".** El cliente se deja llevar por la historia visual, pero **el carrito/pedido nunca se va**: un riel lateral (desktop) o barra inferior (mobile) siempre visible, que suma sin sacarte de la experiencia. Cero fricción entre "mirar" y "pedir".
- **Un solo gesto de conversión, siempre presente.** No "hero + 2 botones": una acción viva que te sigue.

### Lenguaje visual + UX (backoffice/POS — el Mostrador)
- **Brutalismo operativo cálido.** Alto contraste, **números tabulares monoespaciados** (la plata se lee como en una calculadora seria), metáfora de *ticket/comanda*, micro-interacciones mecánicas y satisfactorias (el "tac" de cobrar).
- **Paradigma: "todo es un ticket que fluye por carriles".** El día del comercio es un tablero vivo tipo kanban de comandas: `Nuevo → En preparación → Listo → Cobrado`. Operás con teclado, sin recargar página. La **velocidad es el lujo** (norte SAP + Superhuman).
- **Densidad con jerarquía.** Mucha información, pero jerarquizada como un tablero profesional — no un formulario con `− +`.

### Referencias (fuera de ERP)
Aesop, SSENSE, Kinfolk/Cereal, Glossier, Toast (hospitality) para la Vidriera. Superhuman, Linear, Bloomberg terminal, Monzo/Nubank (feed de transacciones), Teenage Engineering para el Mostrador.

### Por qué gana
Es la única que **encarna el norte en vez de citarlo**: Apple no es "limpio", es opinado → la Vidriera opina. SAP no es "amigable", es potente → el Mostrador da potencia. Además resuelve el pecado original: dos lenguajes distintos para dos trabajos distintos, imposibles de confundir con una plantilla. Es bold *y* fundamentada, y es directamente demostrable (ver mockups).

### Relación con Empresa
- La **Vidriera** escala a *gestión de marca multi-local*: la misma editorial, varias sucursales, catálogo gobernado desde arriba.
- El **Mostrador** escala a *operación multi-terminal / multi-sucursal con roles*: los carriles de comanda se vuelven líneas por caja, por sucursal, por turno; con permisos, auditoría y consolidación. Micro y Empresa comparten ADN visual; Empresa agrega capas de control y consolidación. El comerciante que crece **no cambia de producto: el producto crece con él.**

---

## Dirección 2 — "TERMINAL CÁLIDA" *(la más SAP, la más veloz)*

**La tesis:** invertir la prioridad. En vez de "web linda con panelito", el corazón del producto es el **instrumento de operación**, y es tan bueno que da gusto usarlo. Bloomberg terminal para el comercio de barrio, pero cálido.

### Lenguaje visual
- Superficie oscura/cálida, tipografía monoespaciada para datos y una grotesca para etiquetas, acentos de color funcionales (verde = cobrado, ámbar = pendiente), *cero* decoración gratuita. Cada pixel informa o acciona.
- Estética de *instrumento*: se ve como algo que un profesional usa 8 horas y ama, no como una web de marketing.

### Paradigma de UX
- **Comando por teclado y paleta de acciones** (⌘K): "cobrar", "nueva venta", "buscar producto", "cierre de caja" a un atajo. Superhuman/Linear aplicado al POS.
- **Un solo lienzo vivo, sin recargas.** El "hoy" del negocio respira en tiempo real: ventas, caja, stock crítico, todo en un tablero que se actualiza solo.
- El front público existe pero es minimalista y rapidísimo: una **carta/catálogo instantáneo** que carga en un parpadeo, sin peso, pensado para pedir en 3 taps.

### Referencias
Bloomberg terminal, Linear, Mercury (banking), Stripe dashboard, Superhuman, Retool (pero cálido).

### Por qué gana / cuándo elegirla
Gana si la apuesta estratégica es que **el fierro operativo** sea el diferencial defendible (lo difícil de copiar). Es la dirección más "SAP puro". Riesgo: menos seductora en la primera impresión pública. Ideal como **evolución del Mostrador** de la Dirección 1 cuando el foco pase de vender el sueño a retener por potencia.

### Relación con Empresa
Nace lista para Empresa: la paleta de comandos, los roles y la consolidación multi-caja son su terreno natural. Micro es simplemente la Terminal con menos módulos encendidos.

---

## Dirección 3 — "ADN DE MARCA" *(el sistema anti-plantilla)*

**La tesis:** convertir la restricción multi-tenant en el superpoder. En vez de que un humano maquille cada comercio, **el sistema genera una identidad completa y única por comercio, por construcción.** La unicidad deja de ser trabajo manual y pasa a ser *estructural*: dos comercios no pueden verse iguales ni queriendo.

### Lenguaje visual
- Del *input* mínimo del comerciante (logo + 1 foto + 1 color + rubro) el sistema deriva **determinísticamente**: pareja tipográfica, motivo/patrón gráfico, ritmo de grilla, forma de los componentes y una **firma de movimiento** (cómo entran los elementos). Cada tenant recibe un "kit de ADN" propio.
- Resultado: la carnicería tiene su tipografía condensada y su rojo profundo; la velería, su serif suave y su crema; el proshop, su grotesca deportiva y su contraste alto. **Ninguno comparte molde** — y todos comparten *calidad* GSG.

### Paradigma de UX
- **"El producto se viste con la piel del comerciante".** Onboarding de 60 segundos: subís tu logo, el sistema propone 3 identidades generadas, elegís, y toda tu tienda + POS quedan vestidos.
- El comerciante siente autoría ("esto es *mío*") sin diseñar nada.

### Referencias
Marca programable de Stripe, sistemas generativos de Spotify Wrapped, identidades sistémicas de Airbnb (Bélo) e Instagram (gradiente), Readymag/Cosmos, Brand.ai.

### Por qué gana / cómo se usa
No compite con las otras dos: **las potencia**. Es el *motor* que hace que la Dirección 1 escale a miles de comercios sin caer en plantilla. Es la respuesta directa y estructural al reproche del dueño ("todos se ven iguales / hecho por IA"). Se recomienda adoptarla como **capa transversal**, con el lenguaje de la Dirección 1 como primer sistema que el motor sabe generar.

### Relación con Empresa
En Empresa, el ADN se vuelve **gobernanza de marca**: la casa central fija el ADN y las sucursales heredan; brand tokens versionados, aprobación centralizada, coherencia auditada. El mismo motor que da libertad a un micro-comercio da control a una cadena.

---

## Recomendación ejecutiva

Adoptar **Dirección 1 (VIDRIERA + MOSTRADOR)** como lenguaje central —es la que encarna Apple × SAP y la que se ve y se toca en los mockups—, construida sobre el motor de **Dirección 3 (ADN de Marca)** para garantizar unicidad a escala, con **Dirección 2 (Terminal Cálida)** como horizonte de profundización del operativo. Las tres son coherentes entre sí: una es la cara, otra es el motor, otra es el fierro.

---

# MAGRA Meat Market — Análisis de identidad (referencia real)

**Fuente:** https://magrameatmarket.com.ar/ (analizada en vivo; colores y tipografías extraídos de los estilos computados reales del sitio, no estimados).
**Qué es:** boutique de carnes envasadas al vacío en Canning (Sotavento Point). Cortes premium vacunos/cerdo/pollo + gourmet (pastas, conservas, congelados). Servicio puerta a puerta. Distribuidor oficial de Estancia Don Ramón.
**Plataforma:** WordPress + Elementor 3.29. Pedidos por WhatsApp y lista de precios externa (BistroSoft).

---

## 1. Paleta exacta (hex verificados en el sitio)

| Rol | HEX | RGB | Uso real en el sitio |
|---|---|---|---|
| **Negro carbón (base de marca)** | `#1D1D1B` | 29,29,27 | Color dominante: textos, fondos oscuros, superficies premium. Es el negro cálido (no puro), firma boutique. |
| **Negro puro** | `#000000` | 0,0,0 | Secciones/fondos de foto, refuerzo de contraste. |
| **Crema hueso** | `#F2E6D7` | 242,230,215 | Fondo claro y texto sobre oscuro. Da la calidez "artesanal / carnicería fina". (Variante `#F2E6D8`.) |
| **Oro cálido / tan (ACENTO principal)** | `#C5AE86` | 197,174,134 | **El color de marca.** Botones, títulos H1, detalles. NO es rojo carnicería: es un dorado terroso, sofisticado. |
| **Slate profundo** | `#0F172A` | 15,23,42 | Secciones oscuras alternativas (heredado de plantilla; se puede unificar hacia el carbón). |
| **Gris acero claro** | `#CCD6DF` | 204,214,223 | Textos secundarios sobre oscuro, líneas. |
| **Gris neutro medio** | `#69727D` | 105,114,125 | Texto de apoyo, metadatos. |

**Lectura de la paleta:** el acierto de MAGRA es *no* usar el rojo carnicería obvio. Elige **carbón + hueso + oro** — un código de boutique/delicatessen premium, más cercano a una casa de vinos o un steakhouse de autor que a una carnicería de barrio. Es exactamente el tipo de decisión opinada que el rediseño GSG debería respetar y amplificar.

**Recomendación para el tenant GSG-Magra:** trabajar sobre `#1D1D1B` como base, `#F2E6D7` como claro, `#C5AE86` como único acento (botones/títulos), y reservar el rojo sangre solo como *chispa* puntual si se quiere señalizar "carne". Descartar/absorber el `#0F172A` (es residuo de plantilla, no marca).

---

## 2. Tipografía (familias reales detectadas)

| Rol | Fuente | Detalle |
|---|---|---|
| **Display / Títulos (H1–H2)** | **Bebas Neue** | Condensada, alta, mayúsculas. H1 real: 52px, weight 400, color oro `#C5AE86`. Da el aire de cartelería / marquesina premium. |
| **Cuerpo / UI** | **Open Sans** | Sans humanista neutra para lectura y botones. Botón: fondo oro, texto carbón, radio 5px. |
| **Acentos serif** | *Times New Roman* (fallback) | Aparece en algunos bloques; conviene reemplazar por una serif intencional (ej. una serif de alto contraste) si se quiere elevar. |
| Secundaria detectada | *Metropolis* | Geométrica, en algunos elementos. |

**Pareja tipográfica de marca:** **Bebas Neue (display condensado) + Open Sans (texto).** Es una pareja con tensión real (enorme condensado vs. neutro legible) — justamente lo que la Dirección Creativa pide. Para el tenant GSG se puede mantener Bebas Neue o subir a una condensada con más carácter (ej. Anton, Druk-like), conservando el gesto.

---

## 3. Tono de voz

- **Directo, confiado, con guiño.** Titular real: *"Esto no es una carnicería!"*. Se posiciona por negación/aspiración: *"No hace falta saber de cocina, ni de cortes. Solo tener buen gusto (y hambre!)."*
- **Premium accesible:** "estilo, practicidad y sabor premium en un solo pack". Vende *conveniencia con estatus*, no commodity.
- **Cercano y local:** nombra los barrios (Canning, San Vicente, Guernica, Ezeiza, Monte Grande), empuja WhatsApp, "atención personalizada", "antojos".
- **Prueba social explícita:** reviews 5/5 con nombres, logos de proveedores (Estancia Don Ramón, Paladini, etc.) como sello de calidad.

**Traducción a UI:** títulos cortos y aseverativos en Bebas; microcopy cálido y coloquial-correcto (sin lunfardo forzado); CTA siempre hacia WhatsApp/pedido.

---

## 4. Estructura / layout actual

Orden real de la home:
1. Header con logo (blanco sobre transparente) + redes + WhatsApp.
2. Hero: imagen de carnes + eyebrow "PRODUCTOS GOURMET PREMIUM" + H1 "Esto no es una carnicería!" + bajada + CTA "LISTA DE PRECIOS".
3. Franja de 4 beneficios con ícono: *Free Shipping · Calidad premium · Todos los medios de pago · Atención personalizada*.
4. **Productos gourmet**: grilla de categorías con foto (ensaladas, pescado, pasta, conservas).
5. **Envasados al vacío**: bloques por proteína (vaca / cerdo / pollo), cada uno con CTA "Hacer pedido" → WhatsApp.
6. **Nuestros proveedores**: logos.
7. **Reviews** de clientes (5/5, con foto y nombre).
8. Footer: about, dirección (José Champagnat 4351, Local 1, Sotavento Point), horarios, redes.

**Patrón:** es una landing de e-commerce por catálogo con conversión vía WhatsApp — coherente, pero con la estructura estándar de Elementor. Para el tenant GSG bold: conservar el *contenido* y el *tono*, y reencuadrarlo en el lenguaje **Vidriera** (editorial full-bleed, escala dramática, riel de pedido permanente) — es lo que hace el mockup.

---

## 5. Fotografía / estilo visual

- **Producto sobre fondo neutro/oscuro**, packaging al vacío visible (refuerza "premium/higiénico/gourmet").
- Mezcla de fotos de producto reales y algunos assets de stock/ilustrativos (pastas, conservas).
- Logos de proveedores como retícula de credibilidad.
- Logo propio: lockup horizontal claro sobre fondo oscuro (se usa en `.webp` transparente).

**Recomendación de dirección de arte para el tenant:** foto de corte a sangre completa, luz cálida y lateral, fondo carbón `#1D1D1B`, mucho primer plano de textura (grasa, hueso, marmoleo) — tratar la carne como *objeto de deseo editorial* (referencia: editoriales de steakhouse premium / Aesop-de-la-carne). Evitar el collage de stock.

---

## 6. Kit rápido para replicar el tenant GSG-Magra fielmente

```
--magra-carbon:  #1D1D1B;   /* base / superficies oscuras */
--magra-negro:   #000000;   /* fondos de foto */
--magra-crema:   #F2E6D7;   /* claro / texto sobre oscuro */
--magra-oro:     #C5AE86;   /* ACENTO: botones, títulos */
--magra-acero:   #CCD6DF;   /* texto secundario s/oscuro */
--magra-gris:    #69727D;   /* metadatos */

Display: 'Bebas Neue', mayúsculas, tracking leve.  H1 ~52px+.
Texto:   'Open Sans'.
Botón:   fondo oro, texto carbón, radio ~5px.
Voz:     asertiva + guiño ("Esto no es una carnicería!"), cercana, premium accesible.
Norte:   carbón + hueso + oro; rojo sangre solo como chispa puntual.
```

Estos valores son los reales del sitio en producción y sirven para clonar/adaptar la identidad con fidelidad en el tenant. El mockup `mockup-magra-vidriera.html` ya está construido con esta paleta y tipografía.
