# Nuevas líneas de negocio de bajo capital para GSG

**Fecha:** 2026-07-06
**Destinatario:** equipo interno GSG (founders / Agencia Grow)
**Objetivo:** shortlist priorizado de líneas de negocio de bajo capital, mercado local (Argentina), que aprovechen los activos ya construidos por GSG — no apuestas agresivas, no negocios que compitan por precio con plataformas grandes.

## Los activos de GSG que cambian la ecuación de costos

Cualquier análisis de "cuánto cuesta arrancar X" para un emprendedor promedio en Argentina no aplica igual para GSG, porque ya tiene construido:

- **ERP con blueprint retail**: catálogo, checkout con Mercado Pago, inventario y POS reusables — montar una vidriera para un rubro nuevo es horas, no semanas, y no requiere developer por cliente.
- **Agentes de diseño**: generan piezas gráficas, identidad de marca y fotos placeholder de producto sin pagar diseñador freelance.
- **Agentes de marketing**: contenido y campañas sin agencia externa.
- **Máquina de preventa**: proceso/checklist para levantar la vidriera de un negocio nuevo en días, ya probado en varios tenants (estética, retail, gastronomía).
- **Infraestructura de WhatsApp y facturación fiscal (ARCA)** ya construida y en producción, reusable como producto propio (no solo como feature del ERP).

Esto hace que, para GSG, el costo marginal de "probar" una línea nueva sea consistentemente más bajo que para un emprendedor que arranca de cero — el diferencial más grande está en las líneas donde el cuello de botella típico es "montar la tienda" o "diseñar las piezas", no en las que requieren stock físico o mano de obra manual (ahí el ahorro es menor).

## 1. Impresión 3D — análisis a fondo

### Precios relevados (Argentina, julio 2026)

| Ítem | Precio ARS | Fuente |
|---|---|---|
| Impresora Creality Ender 3 V3 (entrada) | $640.499 | [TP3D / comparadores](https://precialo.com.ar/p/impresora-3d-creality-ender-3-2) |
| Impresora Creality Ender 3 Max Neo | $666.498 | comparadores de precio AR |
| Impresora Creality Ender 3 S1-PRO (gama media) | $1.433.380 | comparadores de precio AR |
| Impresora Creality Ender 3 Neo Autonivel | $1.669.350 | comparadores de precio AR |
| Filamento PLA (marca local, 1kg) | ~$18.200–$19.200 | [3DInsumos](https://3dinsumos.com.ar/) |
| Filamento PETG (marca local PLAST.AR, 1kg) | ~$17.990 | [i3dtienda](https://www.i3dtienda.com.ar/productos/plastar-petg/) |
| Filamento PETG importado premium (1kg) | hasta ~$52.990 | 3DInsumos |
| Electricidad por pieza (impresión ~3hs, ~120W) | ~$60–$100 (**estimado, a confirmar con factura real** — no se encontró tarifa comercial específica por kWh) | cálculo propio |

**Lectura**: para arrancar con algo más que un juguete, la entrada real ronda los **$640.000–$670.000 ARS** solo en impresora (no hay opciones serias muy por debajo en el mercado formal argentino relevado). El filamento local (PLA/PETG genérico) es la opción de costo razonable; el importado premium casi triplica el costo por kg y no se justifica para piezas de venta masiva.

### Nichos: cuidado con el más obvio

Buscando emprendimientos activos de impresión 3D en Argentina aparecen jugadores ya instalados y especializados en **llaveros y merchandising empresarial** (FUS3D, Llaveros Personalizados Argentina, ANGI3D, Pymedia) — es el nicho más visible, pero también el más competido y el que menos aprovecha lo que GSG tiene de diferencial (esas empresas ya tienen su propio canal de venta y volumen).

Dos nichos con mejor encaje para GSG, en orden de recomendación:

1. **Piezas para los propios clientes del ERP (B2B2B)**: displays de exhibición, cartelería de mostrador, toppers de torta para pastelerías, soportes de joyería/accesorios para tiendas retail — vendidos directamente a los tenants que GSG ya tiene o está preventando. El costo de adquisición de cliente es ~cero porque ya existe la relación comercial; no compite en Mercado Libre contra FUS3D ni nadie.
2. **Personalización para eventos** (bodas, cumpleaños de 15, baby showers): ticket más alto que el llavero genérico, demanda estacional pero recurrente, y el diseño (donde GSG tiene ventaja con sus agentes) es el diferenciador real frente a la competencia.

Como contexto de mercado: el comercio electrónico argentino creció 55-79% en facturación en 2025, pero **Shein y Temu ya capturan 8-10% del share de marketplaces** y 4 de cada 10 compradores hicieron importación directa en 2025 ([Infobae, CACE](https://www.infobae.com/economia/2026/02/16/comercio-electronico-cuales-fueron-las-categorias-y-productos-que-mas-crecieron-en-la-argentina-y-cuanto-pesan-las-plataformas-chinas/)) — cualquier producto genérico y no personalizado (bijou, gadgets) compite directo contra precios que ninguna impresora 3D local puede igualar. La personalización y la venta B2B2B son las únicas defensas reales.

### Inversión inicial y punto de equilibrio (ejemplo ilustrativo)

| Concepto | Monto ARS |
|---|---|
| Impresora Ender 3 V3 | $640.000 |
| Filamento inicial (5kg mixto PLA/PETG) | $95.000 |
| Accesorios (espátulas, boquillas, adhesivo, calibración) | $30.000 |
| Insumos de embalaje/etiquetado | $20.000 |
| **Inversión inicial total (estimado)** | **~$785.000** |

Supuesto de venta: pieza mediana (llavero/topper personalizado), ~20-30g de filamento (~$500-570 en material) + ~$500 de mano de obra de post-procesado + ~$80 de electricidad ≈ **costo directo ~$1.100-1.200** por pieza. Vendida a **$3.000-4.000** (rango de mercado observado para personalizados, **estimado a confirmar** contra listados reales del nicho elegido) deja un margen bruto de ~65-70%.

Con margen de ~$2.000/unidad, recuperar $785.000 de inversión requiere ~**390 unidades**. Vendiendo 15-20 piezas/semana (razonable combinando canal B2B2B + Instagram + tienda propia) → **punto de equilibrio en 5-6 meses**. Este cálculo es una guía de orden de magnitud, no una proyección — los supuestos de precio de venta y ritmo de ventas son los que más pueden variar en la práctica.

### Por qué a GSG le sale más barato que a cualquiera

- La vidriera (catálogo + checkout MP + inventario) ya existe vía el blueprint retail — costo marginal ≈ cero.
- Las fotos de producto y el diseño de piezas personalizadas los puede generar el agente de diseño, evitando el costo de freelancer que sí paga cualquier otro emprendedor del rubro.
- La máquina de preventa permite **testear demanda con la vidriera armada antes de comprar la impresora** — se puede validar si hay pedidos reales (tomando encargos con plazo de entrega) antes de comprometer los $785.000 de inversión.
- El canal B2B2B (vender a los propios tenants del ERP) es un diferencial que ningún competidor de Mercado Libre tiene.

### Riesgos

- **No escala sin mano de obra**: cada pieza requiere tiempo de impresión + post-procesado manual; con una sola impresora el techo de producción es bajo (a diferencia de un negocio "de software").
- **Nicho de llaveros/merchandising genérico ya saturado** por jugadores establecidos — evitar competir ahí de frente.
- **Competencia de precio de productos genéricos importados** (Shein/Temu) en cualquier ítem que no sea personalizado o de nicho.
- Es un negocio de producción física: exige a alguien del equipo (o un tercero) dedicando horas reales, no es "configurar y olvidar".

## 2. Servicios de IA/automatización para pymes locales

GSG ya tiene construida infraestructura de WhatsApp (intención + envío de mensajes) y el plugin de facturación electrónica ARCA — la oportunidad es **empaquetar esto como servicio standalone** para pymes que no necesitan (o no pueden pagar) un ERP completo.

### Mercado y precios de referencia (Argentina, 2026)

| Ítem | Rango |
|---|---|
| SaaS de chatbot WhatsApp argentino (Wasapi) | desde USD 30/mes (1 agente, 1.000 conversaciones) — [Basework](https://www.basework.com.ar/blog/whatsapp-business-api-argentina) |
| SaaS chatbot + CRM (Cliengo) | USD 59–199/mes |
| WhatsApp Business API con soporte robusto (WATI) | desde USD 49/mes |
| Rango general de mercado para pyme con actividad media | USD 30–150/mes |
| Desarrollo a medida (agencias/freelancers AR) | USD 1.500 (bot básico) a USD 3.500–6.000 (empresa mediana/enterprise) |
| Mantenimiento mensual típico (actualizaciones, monitoreo) | $50.000–$150.000 ARS |

### Por qué GSG tiene ventaja real acá

No arranca de cero: el WhatsApp intent/dispatch y el plugin ARCA ya están construidos y en producción dentro del ERP. El costo de armar la oferta comercial es empaquetar lo que ya existe (landing, pricing, onboarding) — no desarrollo desde cero como hace cualquier agencia competidora. Esto significa **margen altísimo por cliente adicional** una vez armado el paquete, porque el costo variable es soporte, no ingeniería.

### Riesgos

- Ciclo de venta B2B más lento que retail (no es "click y compra").
- Competencia de herramientas no-code baratas o gratuitas (Chatwoot, Zapier+WhatsApp, Manychat) que un pyme técnico puede armar solo — el argumento de venta de GSG tiene que ser "te lo armamos y mantenemos nosotros", no "tenemos la única tecnología".
- Requiere soporte/atención continua, no es "vender y listo" como un producto físico.

**Encaje**: alto. Es la línea con menor inversión incremental real (la tecnología ya existe) y mayor apalancamiento de lo ya construido.

## 3. Productos digitales / plantillas de gestión

GSG ya tiene expertise real en implementar gestión para pymes (turnos, inventario, facturación, preventa por rubro) — empaquetable en plantillas y checklists vendibles, con inversión de caja prácticamente nula (es 100% tiempo propio + herramientas de IA).

### Mercado y plataformas

| Ítem | Dato |
|---|---|
| Plataformas recomendadas para venta a Argentina | Tienda propia + Mercado Pago (100% del ingreso, sin comisión de marketplace) |
| Plataformas para venta internacional en USD | Gumroad (comisión ~5-10%), Hotmart, Lemon Squeezy |
| Precio de referencia — plantillas simples | €9–19 |
| Precio de referencia — sistemas/plantillas completas | €27–89 |
| Precio de referencia — ebooks | USD 7–27 |

### Riesgos

- Mercado de "plantillas de Notion" genérico está saturado — GSG necesita el ángulo específico de gestión de pymes (turnos, inventario, preventa) donde sí tiene autoridad real, no competir con plantillas de productividad genérica.
- No hay canal de descubrimiento automático como Mercado Libre: requiere audiencia propia (redes, contenido) para vender, lo que hace la monetización más lenta al inicio.

**Encaje**: alto en costo (~$0 de caja), medio en velocidad de resultado (necesita construir audiencia primero, vía los agentes de marketing de GSG).

## 4. Print-on-demand (remeras/tazas personalizadas)

### Datos relevados

| Ítem | Precio ARS |
|---|---|
| Plancha de sublimación/DTF portátil (entrada) | $117.762 |
| Plancha portátil 26x26 | $291.913 |
| Plancha 40x40 bandeja fija | $503.998 |
| Costo directo por remera (tela + insumos + luz) | ~$2.500–$2.900 |
| Precio de venta remera personalizada | $3.800–$7.499 |
| Precio de venta taza sublimada | $2.000–$10.000+ |

Buena noticia: en 2025 aparecieron fulfillment locales tipo Printful — **Gudink** y **Printirol**, con producción en Buenos Aires, cobro en pesos, sin stock mínimo e integración a Tiendanube. Esto reduce el riesgo de inversión inicial (se puede vender sin comprar la plancha), aunque con menor margen por unidad que producir uno mismo.

Inversión inicial mínima con plancha propia: **~$200.000–$450.000 ARS**. Margen bruto en venta al público: **35-60%**.

### Riesgos

- Mercado **saturado y commoditizado** — el proceso técnico es idéntico entre competidores, el diseño es la única palanca de precio.
- No escala sin mano de obra manual (cada prenda es ~10 min de operación).
- Contexto macro adverso: 62,1% de argentinos temía fracasar emprendiendo en 2025 (vs 18,8% en 2024) y 83,5% reportó caída de ingresos del hogar ([GEM 2025](https://www.primeraedicion.com.ar/nota/101047102/emprendimiento-necesidad-oportunidad-gem-2025/)) — el gasto en "gustitos" personalizados es frágil.

**Encaje**: los agentes de diseño de GSG resuelven el cuello de botella real del rubro (generar estampas sin pagar diseñador), y la máquina de preventa permite testear demanda vía fulfillment local (Gudink/Printirol) **sin comprar la plancha**, antes de decidir si vale la inversión. Buen piloto de bajo riesgo, no una apuesta de crecimiento.

## 5. Dropshipping curado — por qué NO lo recomendamos en su forma clásica

El dropshipping "clásico" (importar directo desde China, sin stock) **dejó de ser viable en Argentina en 2026**, por tres motivos confirmados:

1. **Tiempos de entrega**: 30-60 días desde China vs. la expectativa de compra online actual — mata la conversión.
2. **Competencia de precio imposible de igualar**: Shein y Temu ya tienen 8-10% del share de marketplaces argentinos, y las importaciones de consumo vía courier treparon a ~USD 890-955 millones en 2025 (+274% interanual) — ningún revendedor chico compite comprando lote pequeño contra ese volumen.
3. **Restricción legal de fondo, sin cambios en la era Milei**: la Ley 24.977 (Monotributo), art. 20 inciso f), fija como causal de **exclusión de oficio** haber "realizado importaciones de cosas muebles para su comercialización posterior" en los últimos 12 meses. Es una prohibición explícita y de larga data (no una zona gris): un monotributista —la figura fiscal típica para arrancar algo chico— que importe para revender queda excluido retroactivamente, con reclamo de IVA, Ganancias, intereses y multas. Importar y revender legalmente exige pasar a Responsable Inscripto (o Certificado MiPyME), lo cual ya no es "bajo capital ni simple".

Lo que sí flexibilizó el gobierno (Decreto 1065/2024 y Resolución General ARCA 5608/2024, ambos vigentes desde diciembre 2024) es el régimen de courier para **consumo personal**: tope de USD 3.000 por envío, con los primeros USD 400 exentos de aranceles (solo IVA) hasta 5 envíos al año por persona. Todas las normas y guías oficiales de ARCA remarcan explícitamente que este régimen es "sin fines comerciales" — no es una vía para abastecer stock de reventa, más allá de que técnicamente se pueda pagar el envío.

Lo que sí está funcionando en 2026 es un modelo distinto: **"dropshipping local"** — conectar con mayoristas/distribuidores argentinos que ya tienen stock nacionalizado y entregan en 1-7 días con factura ARCA en regla. Pero esto, en la práctica, **no es dropshipping**: es reventa curada con stock chico comprado a un mayorista local — es decir, es simplemente **el blueprint retail que GSG ya tiene**, aplicado a un catálogo curado de productos de terceros, sin ninguna ventaja de costo adicional sobre las otras líneas de este documento.

**Conclusión**: no lo tratamos como línea de negocio separada. Si en el futuro aparece un mayorista local concreto con buen margen, es una variante del blueprint retail existente, no una apuesta nueva.

## Tabla comparativa

| Línea | Inversión inicial (ARS) | Margen bruto típico | Riesgo | Escala sin mano de obra propia | Encaje con activos GSG |
|---|---|---|---|---|---|
| **Servicios IA/automatización pymes** | ~$0 (tecnología ya existe; costo es tiempo de empaquetado) | Alto (SaaS-like, ~USD 30-150/mes/cliente) | Medio (ciclo de venta B2B lento, competencia no-code) | Sí, una vez armado el paquete | Muy alto |
| **Productos digitales/plantillas** | ~$0 (solo tiempo) | Muy alto (+90%) | Medio (necesita audiencia propia) | Sí | Alto |
| **Impresión 3D (nicho B2B2B/eventos)** | ~$785.000 | 60-70% | Medio-alto (mano de obra, nicho genérico saturado) | No | Alto (diseño + preventa + canal propio) |
| **Print-on-demand (remeras/tazas)** | $200.000–$450.000 (o $0 con fulfillment local) | 35-60% | Alto (mercado saturado, macro frágil) | No | Medio (diseño resuelve el cuello de botella) |
| **Dropshipping clásico** | No aplica — no recomendado | N/A | Alto (legal, competencia de precio, logística) | — | Ninguno (colapsa al blueprint retail existente) |

## Recomendación: por dónde empezar con poca plata

**Orden sugerido, de menor a mayor inversión de caja:**

1. **Arrancar por servicios de IA/automatización para pymes.** Es la línea de menor inversión incremental real porque la tecnología ya está construida y en producción — el trabajo es comercial (armar oferta, pricing, onboarding), no técnico. Ofrecerlo primero como add-on a clientes/prospectos actuales del ERP antes de salir a buscar clientes nuevos.
2. **En paralelo, empaquetar productos digitales/plantillas** con el expertise de gestión de pymes que GSG ya tiene — inversión de caja ~$0, aunque la monetización tarda más en arrancar porque necesita audiencia propia (usar los agentes de marketing para construirla).
3. **Recién con caja generada por 1 y 2, evaluar un piloto chico de impresión 3D** (~$785.000 ARS) apuntado al nicho B2B2B (piezas para los propios tenants del ERP) — no al mercado genérico de llaveros en Mercado Libre, que ya está ocupado por jugadores especializados.
4. **Print-on-demand queda como opción de prueba de muy bajo compromiso** (usando fulfillment local Gudink/Printirol, sin comprar plancha) si surge una oportunidad concreta de validar demanda vía la máquina de preventa — no como apuesta de crecimiento.
5. **Dropshipping clásico: no perseguir.** Si aparece una oportunidad real de reventa con mayorista local, tratarla como una aplicación más del blueprint retail existente, no como línea nueva.

## Fuentes principales

- [Comisiones MercadoLibre 2026 — SpomBridge](https://app.spomsolutions.com/blog/comisiones-mercadolibre-guia-2026)
- [Costos de envío MercadoLibre — ayuda oficial](https://www.mercadolibre.com.ar/ayuda/40538)
- [Dropshipping Argentina 2026 — Commercy](https://commercy.com.ar/blog/dropshipping-argentina)
- [Régimen courier Argentina 2026 — Arancely](https://www.arancely.com/blog/regimen-courier-argentina-2026)
- [Monotributo e importación — LVS Estudio](https://lvsestudio.com.ar/pueden-los-monotributistas-importar-bienes-para-revender/)
- [Gudink — print on demand Argentina](https://gudink.com/print-on-demand/) / [comparativa Gudink vs Printful/Printify](https://blog.gudink.com/printful-vs-printify-vs-gudink-argentina/)
- [Estudio Anual CACE 2025 — comercio electrónico Argentina](https://cace.org.ar/blogs/news/estudio-anual-de-cace-2025-el-ecommerce-como-canal-estructural-del-consumo-argentino)
- [Categorías con mayor crecimiento y share de Shein/Temu — Infobae](https://www.infobae.com/economia/2026/02/16/comercio-electronico-cuales-fueron-las-categorias-y-productos-que-mas-crecieron-en-la-argentina-y-cuanto-pesan-las-plataformas-chinas/)
- [GEM 2025 — percepción de riesgo de emprender en Argentina](https://www.primeraedicion.com.ar/nota/101047102/emprendimiento-necesidad-oportunidad-gem-2025/)
- [WhatsApp Business API Argentina 2026 — Basework](https://www.basework.com.ar/blog/whatsapp-business-api-argentina)
- [Vender productos digitales Argentina 2026 — Tiendli](https://tiendli.com/blog/vender-productos-digitales-argentina/)
- Precios de impresoras y filamentos: comparadores de precio y tiendas especializadas argentinas (TP3D, 3DInsumos, i3dtienda, Precialo) relevados julio 2026.

**Nota de método**: los precios de venta finales por pieza/producto (llaveros, remeras, plantillas) son estimaciones de mercado basadas en listados observados, no un relevamiento estadístico — están marcados como tal en cada sección y conviene validarlos con 5-10 listados reales del nicho elegido antes de fijar precio definitivo.
