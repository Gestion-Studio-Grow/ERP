> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), material fundacional del dueño / reconstruido desde apps en vivo. Incorporado a la rama fundacional sin alterar el contenido original.

---

# GSG — Personalización de diseño por tenant: frontera, negocio y estándar fundacional

**Documento decision-grade**
**Producto:** ERP multi-tenant GSG (modelo CONFIG-SOBRE-CÓDIGO, equipo 100%-IA)
**Fecha:** 10/07/2026
**Estado:** Propuesta para decisión del dueño
**Caso disparador:** Tenant "Magra" (magrameatmarket.com.ar), autorizado por su dueño a replicar su web.

---

## Resumen ejecutivo

La pregunta del dueño —"¿un cliente que quiere su diseño propio entra en los estándares fundacionales, y si no, lo cobramos como servicio?"— tiene una respuesta que preserva la escalabilidad **sin cerrarle la puerta al negocio**:

1. **Sí entra**, siempre que el diseño propio se exprese como **datos de configuración y assets del tenant**, no como código a medida. La línea fundacional no es "estándar vs. propio"; es **"configuración/datos vs. código bifurcado por cliente"**. Todo lo que se pueda lograr moviendo tokens, eligiendo/combinando variantes de layout, cargando secciones parametrizables y sirviendo assets y CSS-como-dato del tenant, es escalable y sustentable con equipo IA. Un `if (tenant === "magra")` en el código compartido, no.

2. **La réplica exacta de un sitio cliente cae mayoritariamente en el Nivel B (config rica/custom)**, no en el Nivel C (código a medida), *siempre que* el motor de theming del ERP soporte tokens extendidos, variantes de layout combinables, slots de sección y CSS-por-tenant como dato. Se logra por configuración: paleta, tipografía, logo, orden y composición de secciones (hero, tarjetas de beneficios, grilla de productos, franja de proveedores, testimonios, footer de contacto). Requeriría trabajo a medida solo lo que hoy no existe como primitiva de configuración (p. ej. una sección o interacción novedosa). La recomendación es **construir esas primitivas una vez, en el core, y reutilizarlas para todos** —nunca resolver el caso puntual con un fork.

3. **Se monetiza como servicio premium pago: "Creative Grow".** Dos tiers: **Identidad Estándar** (config sobre ficha de marca + detección IA, **incluida** en el plan) e **Identidad a Medida** (**paga**: fidelidad alta a una marca real, incluida réplica de sitio existente). Creative Grow se entrega **como configuración y assets del tenant**, aislado del core; el entregable premium es *trabajo de diseño y curación de config*, no una rama de código. Precio sugerido: **setup one-time + fee mensual de mantenimiento de identidad** (ver §3).

4. **Magra es el primer "cliente con diseño propio" ideal**: su web es WordPress/Elementor con estructura de secciones estándar (hero, beneficios, grilla, proveedores, reviews, footer). ~80–90% es reproducible dentro de config; el resto alimenta el add-on premium y, sobre todo, alimenta el **catálogo compartido** de primitivas.

5. **Sí, requiere un ADR nuevo.** Tesis: *"La personalización de diseño se expresa exclusivamente como configuración y assets versionados por tenant; el código compartido nunca se bifurca por cliente. Cualquier necesidad no cubierta por la configuración se resuelve elevando una nueva primitiva al core, disponible para todos los tenants."*

> **[SUPUESTO] transversal:** No tengo acceso al código ni al esquema real del motor de theming de GSG. Este documento asume la arquitectura descrita por el dueño (ficha de marca por tenant + detección IA + catálogo de temas/presets) y propone la frontera *deseada*. Donde afirmo "se logra con config", la afirmación es condicional a que el motor exponga las primitivas listadas en §1-B; si alguna no existe, es trabajo de core, no de cliente.

---

## 1. La frontera de tres niveles

El principio rector: **la unidad de personalización es el dato, no el código.** Un tenant puede tener una identidad radicalmente distinta a otro siempre que esa diferencia viva en su registro de configuración y su bucket de assets. La sustentabilidad se rompe en el momento exacto en que el comportamiento visual de un tenant depende de una rama de código que solo ese tenant ejecuta.

### Nivel A — Configuración estándar (ficha de marca) · INCLUIDA · dentro de estándares

Es lo que ya existe: la **ficha de marca por tenant** más la **detección de marca por IA**. Personalización "de superficie" sobre presets del catálogo.

Cae en A:

- **Tokens de marca básicos:** paleta primaria/secundaria/acento, color de texto y fondo.
- **Tipografía:** familia(s) del catálogo de fuentes soportadas, escala tipográfica.
- **Logo e isotipo:** carga de assets de marca (claro/oscuro), favicon.
- **Variante de layout de catálogo:** elección entre las variantes pre-construidas y soportadas (p. ej. "compacto", "amplio", "sidebar").
- **Detección IA:** autocompletado de la ficha a partir de la marca del cliente (extraer paleta/logo/tono automáticamente).

**Propiedad clave:** cero intervención manual de diseño. Escala infinitamente porque el catálogo de presets es finito y compartido. **Costo marginal por tenant ≈ 0.** Es la base de la sustentabilidad con equipo IA.

### Nivel B — Configuración rica / custom · PERMITIDA · sin código por cliente

Personalización profunda que **sigue siendo dato**, pero más expresiva que la ficha básica. Es el corazón de la propuesta: **es donde vive el "diseño propio" sin romper el modelo.** Requiere que el core exponga primitivas de configuración más ricas (que se construyen una sola vez y sirven a todos).

Cae en B:

- **Tokens extendidos por tenant:** no solo 3 colores, sino el set completo de design tokens como dato (radios, sombras, espaciados, anchos de contenedor, estados hover, bordes, tipografía por rol —display/body/caption—).
- **Composición de layout por slots:** el tenant elige qué secciones muestra, en qué orden y con qué variante cada una, desde un catálogo de **bloques/secciones parametrizables** (hero, franja de beneficios en tarjetas, grilla de productos, carrusel de proveedores/logos, bloque de testimonios, footer de contacto con mapa/redes). Composición ≠ código: es una lista ordenada de bloques con sus props.
- **Assets del tenant como contenido:** imágenes de hero, fotos de producto, logos de proveedores, avatares de reviews, íconos —todo en el bucket del tenant, referenciado por config.
- **CSS-por-tenant como DATO (no como código fuente):** una hoja de estilo *scopeada* al tenant, almacenada como registro/campo, aplicada en runtime sobre el shell compartido. Es el "escape hatch" controlado: permite el 10-15% de ajuste fino que los tokens no cubren, **sin tocar el bundle compartido ni requerir deploy**. Debe estar sandboxeada (namespacing/scoping por tenant, allowlist de propiedades) para que no pueda romper el layout de otros ni el del propio ERP.
- **Contenido y microcopy por tenant:** textos, CTAs, enlaces (WhatsApp, lista de precios externa, redes).

**Propiedad clave:** dos tenants pueden verse completamente distintos y **ejecutar exactamente el mismo código**. La diferencia es 100% datos. Escala porque el costo marginal es *trabajo de configuración/curación* (acotado, delegable a IA + revisión), no *trabajo de ingeniería por cliente*.

**El límite superior de B:** mientras la necesidad se pueda expresar combinando tokens + slots + assets + CSS-dato scopeado, es B. Cuando la necesidad exige una **primitiva que no existe** (una sección con comportamiento nuevo, una interacción no soportada), la regla es: **NO forkear para el cliente → construir la primitiva en el core → queda disponible para todos.** Eso mantiene el caso dentro de B a nivel de arquitectura, aunque haya costado ingeniería una vez.

### Nivel C — Código a medida por cliente · A EVITAR · rompe la sustentabilidad

Cualquier cosa que haga que un tenant ejecute código que ningún otro ejecuta.

Cae en C (y se prohíbe):

- Ramas condicionales por tenant en el código compartido (`if (tenant === X)`).
- Componentes/archivos que existen solo para un cliente.
- Forks del bundle, del repositorio o del deploy por cliente.
- Lógica de negocio o de render específica de un tenant embebida en el código fuente.
- Integraciones "hardcodeadas" a la medida de un solo cliente (vs. conector configurable).

**Por qué se evita:** cada rama por cliente multiplica la superficie de mantenimiento, testing y regresión. Con N clientes en código a medida, el equipo (aunque sea IA) enfrenta N bases divergentes: se pierde el apalancamiento del "arreglar/ mejorar una vez, beneficia a todos". Es la muerte del modelo config-sobre-código.

**Regla de conversión C→B:** toda vez que aparezca una tentación de C, el reflejo correcto es preguntarse *"¿cómo convierto esto en una primitiva de configuración reutilizable?"*. Si la respuesta es viable, se construye en core (una vez) y el caso baja a B. Si genuinamente no es generalizable, es señal de que el pedido está fuera del producto.

| | **A — Ficha estándar** | **B — Config rica/custom** | **C — Código a medida** |
|---|---|---|---|
| Unidad | Dato (preset) | Dato (config + assets + CSS-dato) | Código fuente |
| ¿Fork por cliente? | No | No | Sí (prohibido) |
| Costo marginal / tenant | ≈ 0 | Trabajo de config acotado | Ingeniería divergente por cliente |
| Escala | Infinita | Alta | No escala |
| Comercial | Incluido | Add-on premium (Creative Grow) | No se ofrece |
| Ejemplo | Elegir preset + subir logo | Replicar estructura y estilo de una marca real | `if (tenant==="magra")` |

---

## 2. ¿La réplica exacta de un sitio cliente entra en (b) o cae en (c)?

**Recomendación: entra en (B)** — es un objetivo de configuración, no de código a medida — **con dos matices**: (1) "réplica exacta" debe redefinirse como **"réplica de identidad y estructura con alta fidelidad"**, no clonado pixel-perfect del HTML ajeno; (2) los huecos de fidelidad que la config no cubra se cierran **elevando primitivas al core**, nunca forkeando.

### Qué se logra solo con configuración + assets

Un sitio típico de marca (y Magra lo es) se descompone en primitivas que el ERP ya debería tratar como config:

- **Identidad visual:** paleta, tipografía, logo → tokens + assets. **100% config (Nivel A/B).**
- **Estructura de página:** hero, franja de beneficios, grilla de productos, franja de proveedores, testimonios, footer de contacto → composición de slots con bloques parametrizables. **Config (Nivel B),** si esos bloques existen en el catálogo.
- **Contenido:** textos, fotos, íconos, enlaces (WhatsApp, lista de precios, redes) → contenido/assets del tenant. **100% config.**
- **Ajuste fino de estilo** (espaciados, tratamiento de sombras/bordes, look "premium") → tokens extendidos + CSS-dato scopeado. **Config (Nivel B).**

### Qué requeriría trabajo (y de qué tipo)

- **Bloques/secciones inexistentes en el catálogo:** si el sitio del cliente tiene una sección con estructura o comportamiento que el ERP no ofrece, hay que **construir esa primitiva en el core**. Es trabajo de ingeniería, pero **de plataforma, reutilizable**, no de cliente. Cae conceptualmente en B (la salida es una primitiva compartida), aunque tenga costo.
- **Interacciones/animaciones específicas** no soportadas por los bloques → misma regla: primitiva nueva o se descarta.
- **Clonado pixel-perfect del markup ajeno:** replicar el DOM/CSS exacto de la web original (que suele estar hecha en otra tecnología —Magra es WordPress/Elementor) sería empujar hacia C y, además, es frágil, no aporta valor de producto y puede tener implicancias de autoría. **Se descarta explícitamente.** El objetivo correcto es *paridad de identidad y experiencia*, no igualdad de código.

### Regla operativa (checklist de clasificación)

Ante un pedido de "quiero que se vea como X", clasificar cada elemento:

1. ¿Se resuelve con tokens/tipografía/logo? → A.
2. ¿Se resuelve componiendo bloques + assets + CSS-dato scopeado? → B.
3. ¿Falta un bloque/primitiva? → construir en core (B a nivel arquitectura), reutilizable.
4. ¿Exige lógica o render que solo este tenant usaría y no es generalizable? → C: **no se hace** (o se replantea el alcance).

**Conclusión de §2:** la réplica es un ejercicio de **configuración de alta fidelidad + eventual inversión en primitivas de plataforma**. Es Nivel B. Solo sería C si se intentara clonar código ajeno o hardcodear al cliente — y ambas cosas se prohíben.

---

## 3. Modelo de negocio — "Creative Grow" (identidad a medida como servicio premium pago)

### Posicionamiento

Dos tiers de identidad, explícitos en la oferta comercial:

| Tier | Qué incluye | Nivel técnico | Precio |
|---|---|---|---|
| **Identidad Estándar** | Ficha de marca (paleta, tipografía, logo, variante de layout) + autocompletado por IA. Cliente autoservicio. | A | **Incluida** en el plan del ERP |
| **Identidad a Medida — Creative Grow** | Diseño de identidad de alta fidelidad a la marca real del cliente; incluye replicar la estructura/estilo de un sitio existente; composición de secciones, tokens extendidos, assets curados y CSS-dato scopeado; revisión humana + IA. | B | **Pago** (setup + mensual) |

### Estructura de precio [SUPUESTO — calibrar con costos y mercado GSG]

- **Setup one-time (diseño e implementación de la identidad):** honorario único por el trabajo de curación/configuración. Sugerencia de rango: **USD 300–900** según complejidad (nº de secciones a componer, si hay o no réplica de sitio, cantidad de assets a producir). Se puede tabular por "puntos de complejidad" (cada bloque no trivial suma).
- **Fee mensual de mantenimiento de identidad:** **USD 15–40/mes** [SUPUESTO], que cubre alojamiento de assets, versionado de la config de identidad, y ajustes menores. Diferencia el add-on de un "one-shot" y crea ingreso recurrente.
- **Cambios mayores posteriores** (rediseño, nuevas secciones a pedido): nuevo setup acotado o bolsa de horas.

**Racional de precio:** el costo real de Creative Grow es *tiempo de curación de configuración* (mayormente IA + revisión humana), no ingeniería recurrente. El precio debe (a) cubrir ese trabajo y su mantenimiento, (b) señalar valor premium, (c) **desincentivar pedidos que empujen a C** haciendo que lo verdaderamente a medida sea caro o directamente no ofrecido.

### Alcance (qué SÍ / qué NO)

**SÍ incluye Creative Grow:**

- Traducir la marca real del cliente (o su sitio existente autorizado) a la ficha extendida + composición de secciones.
- Producción/curación de assets (optimización de imágenes, logos en variantes, íconos).
- Tokens extendidos y CSS-dato scopeado para lograr el "look & feel".
- Una ronda (o N acotadas) de revisión con el cliente.

**NO incluye (o dispara conversación de alcance):**

- Clonado pixel-perfect de código ajeno.
- Cualquier funcionalidad que requiera una rama de código por cliente (C).
- Secciones nuevas que no sean generalizables (se evalúan como inversión de core, con su propio criterio y timeline, no como entregable garantizado del setup).

### Aislamiento del core (no negociable)

Creative Grow **jamás** produce un fork del código compartido. Su entregable vive enteramente en:

- **Registro de configuración del tenant** (tokens extendidos, composición de slots, microcopy, CSS-dato scopeado).
- **Bucket de assets del tenant.**

Garantías de aislamiento:

- El CSS-dato del tenant se aplica **scopeado** (namespacing por tenant, allowlist de propiedades) → no puede afectar a otros tenants ni al shell.
- Toda config de identidad es **versionada** (permite rollback, auditoría, y "clonar identidad" como plantilla).
- Si Creative Grow "descubre" la necesidad de una primitiva nueva, esa primitiva se construye en **core y queda para todos** — el cliente que la disparó no obtiene código exclusivo, obtiene una identidad configurada.

**Efecto de plataforma:** cada proyecto Creative Grow **enriquece el catálogo compartido** de bloques y presets. El add-on paga la construcción de primitivas que luego bajan el costo del siguiente cliente. El negocio premium financia la I+D del core en lugar de fragmentarlo.

---

## 4. Caso MAGRA — primer cliente con diseño propio

**Fuente:** magrameatmarket.com.ar (revisado 10/07/2026). Boutique de carnes envasadas al vacío, Canning (Buenos Aires). Sitio hecho en **WordPress + Elementor 3.29.2**, Google Fonts locales, diseño por @noctiluma_. Dueño autorizó la réplica.

### Inventario de la marca (lo que se traduce a config)

Estructura de secciones detectada (todas mapeables a bloques de catálogo):

1. **Header** con logo + iconos de redes (Facebook, Instagram, WhatsApp, email).
2. **Hero** con imagen de producto + kicker ("PRODUCTOS GOURMET PREMIUM") + título ("Esto no es una carnicería!") + subtítulo + **CTA a lista de precios externa** (Bistrosoft) + zona de reparto.
3. **Franja de 4 beneficios en tarjetas:** Free Shipping, Calidad Premium, Todos los medios de pago, Atención personalizada.
4. **Grilla de productos gourmet** (ensaladas, pescado, pasta, conservas…).
5. **Sección "Envasados al vacío"** (vaca / cerdo / pollo) con **CTAs a WhatsApp** por producto.
6. **Franja de proveedores** (logos: Tinos, Breaders, Estancia Don Ramón, etc.).
7. **Testimonios / reviews** (avatar + rating + texto).
8. **Footer** con "About us", datos de contacto, dirección, horarios, redes.

Identidad visual:

- **Logo:** `logoTransp` (webp, versión transparente) + isologo de footer.
- **Tono/estética:** premium, gourmet, apetecible; foto-céntrico. [SUPUESTO] paleta oscura/tierra (negros/marrones/burdeos) con acentos cálidos y tipografía sans de alto contraste — **a confirmar extrayendo los tokens reales del CSS del sitio**; la detección IA de GSG debería poblar esto automáticamente.

### Qué se logra dentro de config (estimado ~80–90%)

- Paleta, tipografía y logo → ficha de marca extendida (A/B).
- Las 8 secciones → composición de slots con bloques existentes: hero con CTA, franja de beneficios en tarjetas (4-up), grilla de productos, franja de logos de proveedores, bloque de testimonios, footer de contacto. **Config (B).**
- CTAs a WhatsApp y a lista de precios externa (Bistrosoft) → enlaces como dato/config. **100% config.**
- Fotos de producto, logos de proveedores, avatares de reviews → assets del tenant.
- Ajuste "look premium" (espaciados generosos, tratamiento de imágenes, sombras) → tokens extendidos + CSS-dato scopeado. **(B).**

### Qué quedaría para el add-on premium (Creative Grow) y/o inversión de core

- **Curación fina de assets:** reencuadre/optimización de las fotos actuales, versiones del logo, íconos consistentes. → Creative Grow (trabajo).
- **Extracción fiel de tokens reales** del sitio (colores/tipografía exactos) y afinado del CSS-dato. → Creative Grow (trabajo).
- **Bloques faltantes:** si algún bloque (p. ej. una variante específica de "franja de beneficios" o de "carrusel de proveedores") no existe en el catálogo → **construir la primitiva en core**, reutilizable para futuros clientes retail/gastronómicos. Es la primera inversión de plataforma que Magra financia parcialmente.
- **Lo que NO se hace:** clonar el HTML/Elementor de la web original. Se reconstruye la *identidad y estructura* dentro del ERP.

### Recomendación para Magra

Ofrecer **Creative Grow tier "Identidad a Medida"**: setup one-time (rango medio, es un sitio de complejidad estándar con ~7-8 secciones bien tipificadas) + fee mensual. Usar a Magra como **caso piloto documentado** para (a) validar el catálogo de bloques contra un sitio real, (b) identificar qué primitivas faltan, (c) construir el primer "preset sectorial" (retail gastronómico premium) que acelere futuros clientes. **[SUPUESTO]:** confirmar con el dueño de Magra el alcance (¿réplica fiel de estructura o rediseño inspirado?) y capturar por escrito la autorización de uso de marca/assets.

---

## 5. ¿Requiere un ADR nuevo? — Sí

Esta decisión establece un **estándar fundacional** (define la frontera de lo que el producto hará y no hará por cliente, y de qué se cobra). Amerita un ADR propio, referenciado por el ADR base de config-sobre-código.

### Tesis propuesta del ADR

> **ADR-XXX — Personalización de diseño por tenant: solo configuración, nunca fork.**
>
> **Contexto:** GSG es un ERP multi-tenant con equipo 100%-IA cuya sustentabilidad depende de no bifurcar el código por cliente. Existe demanda de identidad visual propia, incluida la réplica de sitios existentes.
>
> **Decisión:** La personalización de diseño se expresa **exclusivamente como configuración y assets versionados por tenant** — tokens (básicos y extendidos), composición de layout por slots desde un catálogo de bloques parametrizables, assets del tenant, y CSS-por-tenant **como dato scopeado**. **El código compartido nunca se bifurca por cliente** (prohibidos: condicionales por tenant, componentes/archivos exclusivos, forks de bundle/deploy). Toda necesidad no cubierta por la configuración se resuelve **elevando una nueva primitiva al core, disponible para todos los tenants** — nunca resolviéndola para un solo cliente.
>
> **Frontera comercial:** La identidad estándar (ficha de marca + detección IA) es **incluida**. La identidad de alta fidelidad a una marca real (incl. réplica de sitios existentes) es un **add-on pago ("Creative Grow")**, entregado como configuración/assets, aislado del core.
>
> **Consecuencias:**
> - (+) Se preserva el apalancamiento "mejorar una vez, beneficia a todos" y el costo marginal por tenant se mantiene acotado.
> - (+) Se abre una línea de ingreso premium que **financia I+D del core** en vez de fragmentarlo.
> - (−) Exige invertir en un motor de theming rico (tokens extendidos, slots, CSS-dato scopeado) y en gobernanza del CSS-dato (sandboxing/allowlist).
> - (−) Algunos pedidos quedarán fuera de alcance (clonado pixel-perfect, funcionalidad no generalizable); se asume como límite deliberado del producto.
>
> **Invariantes verificables:** (1) ningún build contiene identificadores de tenant en ramas de render; (2) todo estilo por tenant reside en config/assets versionados; (3) el CSS-dato está scopeado y no puede afectar a otros tenants; (4) toda primitiva creada por un proyecto Creative Grow queda disponible en el catálogo compartido.

### Requisitos técnicos que el ADR implica (para hoja de ruta)

- Motor de **design tokens extendidos** por tenant.
- **Catálogo de bloques/secciones parametrizables** con composición por slots.
- **CSS-por-tenant como dato**, scopeado y sandboxeado (namespacing + allowlist de propiedades).
- **Versionado** de la config de identidad (rollback, auditoría, clonar-como-plantilla).
- **Presets sectoriales** como aceleradores (retail gastronómico, servicios, etc.).
- **Gate de gobernanza:** proceso que, ante un pedido, lo clasifica A/B/C y bloquea cualquier deriva a C (revisión que Magra puede estrenar).

---

## Apéndice — Supuestos y cosas a confirmar

- **[SUPUESTO]** Arquitectura del motor de theming de GSG asumida a partir de la descripción del dueño; no verificada contra código.
- **[SUPUESTO]** Paleta/tipografía exactas de Magra a extraer del CSS real del sitio; la detección IA debería poblarlas.
- **[SUPUESTO]** Rangos de precio de Creative Grow (setup USD 300–900; mensual USD 15–40) son ilustrativos; calibrar con costos reales y disposición a pagar del mercado GSG.
- **A confirmar:** existencia/estado del catálogo de bloques y del soporte de CSS-dato scopeado (determina qué del caso Magra es config inmediata vs. inversión de core).
- **A confirmar:** autorización escrita de Magra para uso de marca/assets y alcance exacto (réplica fiel vs. rediseño inspirado).
