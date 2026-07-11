> **Procedencia:** análisis de viabilidad encargado por el dueño de GSG y elaborado por SGS Labs (research decision-grade, fecha original **11/07/2026**). Archivado en el repo el **11/07/2026** como vertical de SGS Labs, junto al de legaltech (`legaltech-analisis.md`). Incorporado **sin alterar el contenido original**; es el insumo que funda la spec del módulo en [`docs/adr/ADR-075-modulo-dropshipping.md`](../../adr/ADR-075-modulo-dropshipping.md).

---

# Análisis de Viabilidad — Dropshipping en / desde Argentina (2026)

**Preparado para:** Gestión Studio Grow (GSG) — SGS Labs
**Encargo:** evaluar si es posible hacer dropshipping en Argentina o desde Argentina de forma **sustentable y sin pérdidas**, de **baja carga operativa** (aunque rinda poco), y si conviene sumarlo a GSG como vertical, producto, servicio o módulo del ERP.
**Fecha:** 11/07/2026 · **Tipo:** research decision-grade · **Moneda:** ARS/USD según se indica
**Convención:** `[SUPUESTO]` = estimación propia no verificable · `[NO CONFIRMADO]` = mencionado por fuente pero sin norma/fuente primaria que lo cierre · `[VERIFICADO]` = confirmado en fuente oficial o primaria.

---

## 1. Resumen ejecutivo

**Recomendación: SÍ, pero condicionado — y no como "negocio de dropshipping" sino como *feature* del motor de GSG.**

Hacer dropshipping en Argentina de forma sustentable y de baja carga **es viable en 2026 en un solo formato: nacional puro** (proveedor mayorista argentino → cliente argentino), cobrando **antes** de comprarle al proveedor, sin stock propio, con facturación ARCA y márgenes ≥30%. Los otros dos formatos son mucho peores: el **cross-border** (proveedor del exterior → cliente AR) es de baja carga logística pero de **alto riesgo regulatorio y de experiencia** (IVA + eventual fin de la franquicia de USD 400, cupo de 5 envíos/año por persona, entregas de 2-6 semanas, aduana vigilando patrones comerciales); y **exportar desde Argentina** (AR → exterior) hoy es normativamente más fácil que nunca (Exporta Simple sin topes, 0% de derechos) pero el cuello de botella es el costo logístico y la competitividad, y es un negocio distinto, no "baja carga".

La conclusión estratégica para GSG es que **el dropshipping como línea de negocio propia rinde poco y trae fricción reputacional** (el vendedor asume por ley el costo de devolución y la garantía, y su reputación en Mercado Libre depende de despachos que ejecuta un tercero). En cambio, **GSG ya tiene construido el 80% de la infraestructura que un dropshipper necesita** — tiendas Next.js multi-tenant, Mercado Pago, factura ARCA nativa, fábrica de tenants. Por eso el encaje más rentable y de menor riesgo es el **(c): un módulo de dropshipping dentro del ERP/motor de tiendas**, que conecta catálogos de proveedores locales, sincroniza stock/precios y automatiza el flujo cobro→orden al proveedor. Ahí GSG monetiza la tendencia sin cargar con el riesgo operativo de vender productos de terceros. Una **tienda propia piloto (opción b)** sirve solo como banco de pruebas del módulo, no como fuente de ingresos.

---

## 2. Modelos de dropshipping aplicables

### 2.1 Nacional (proveedor local AR → cliente AR, sin importar) — **el único viable de baja carga**

Es el modelo que evita moneda extranjera, aduana y demoras internacionales. El ecosistema ya existe y está maduro en 2026:

- **Plataformas de proveedores locales con integración a tiendas** `[VERIFICADO]`: **Unidrop** (+2.000 productos, integra con Tiendanube, garantía 180 días vía mayorista Unistore), **Droppers** (reventa a precio mayorista, ellos despachan; cuentas por volumen con 5-10% de descuento), **Dropdeal** (importás productos a tu tienda con un clic, integración automática con Tiendanube), **Dropshipping.ar** (+5.000 productos, pagás la mercadería recién cuando el cliente ya compró) y **TornadoStore** (sincroniza stock de mayoristas AR, sin comisión por venta).
- **Mayoristas que habilitan triangulación** (vía plataforma, sobre todo tecnología): Invid, New Bytes, Elit, Solution Box, Microglobal, Unicom, entre otros.
- **Rubros típicos**: tecnología/electrónica, bazar y cocina, electrodomésticos, belleza/bienestar, deportes/fitness, herramientas, indumentaria, mascotas.

**Ventaja decisiva**: la mercadería nunca cruza la aduana, se paga en pesos, se factura por ARCA y se entrega en 1-7 días por logística local. Es el terreno donde "baja carga + sin pérdidas" es realmente alcanzable.

### 2.2 Cross-border (proveedor del exterior → cliente AR) — **baja carga logística, alto riesgo**

El paquete viaja directo del proveedor (China/EEUU) al cliente, quien figura como **importador** a efectos aduaneros. En 2026 el régimen es relativamente favorable pero frágil:

- **Régimen courier privado** `[VERIFICADO ARCA]`: tope **USD 3.000 FOB** y **50 kg** por envío; **franquicia de USD 400 FOB por envío** exenta de derechos de importación y tasa estadística (paga solo **IVA 21%**); sobre el excedente se pagan **todos** los tributos (derechos según NCM + tasa estadística 3% + IVA + percepciones). El cupo con franquicia es de **5 envíos por año calendario y por persona**, "sin fin comercial".
- **Régimen Puerta a Puerta (Correo Argentino)** `[VERIFICADO ARCA]`: franquicia de solo **USD 50** (CIF), 12 envíos/año, e **impuesto único del 50%** sobre el excedente + tasa del Correo. Más lento y más caro para valores medios.
- **Tiempos** `[VERIFICADO]`: courier 4-10 días; correo/postal 2-4 semanas (hasta 15-45 días); SHEIN ~20 días mínimo; al interior del país, notablemente más.

**Tres razones por las que NO es la base de un negocio sustentable de baja carga:**

1. **Riesgo regulatorio inminente** `[NO CONFIRMADO — anunciado, sin norma]`: en junio/julio 2026 el Director General de Aduanas de ARCA (José Andrés Velis) anunció que "los 5 envíos con trazabilidad de USD 400 van a desaparecer". Al 11/07/2026 **no hay norma publicada** en el Boletín Oficial y la franquicia sigue activa, pero está en agenda oficial. Un modelo que dependa de esa franquicia puede volverse inviable de un día para otro.
2. **Los límites chocan con la escala comercial**: la franquicia es por persona y "sin fin comercial"; la Aduana vigila patrones comerciales y uso de CUIT de terceros. No se puede escalar a nombre de un mismo importador.
3. **Costo e incertidumbre para el cliente final**: entre IVA y percepciones, una importación pequeña se encarece ~30-80% según el ítem `[SUPUESTO — rango de guías 2026]`, además de demoras y del riesgo de verificación manual en aduana (hubo colapso operativo en Ezeiza en ago-sep 2025).

### 2.3 Desde Argentina hacia afuera (AR → exterior) — **normativamente fácil, pero es otro negocio**

- **Exporta Simple** `[VERIFICADO — RG Conjunta 5846/2026, B.O. 14/05/2026]`: se **eliminaron los topes de monto** (antes USD 15.000/operación y USD 600.000/año) para la mayoría de los productos; **0% de derechos de exportación** (Dto. 783/2021) y acceso a reintegros; solo requiere CUIT + Clave Fiscal nivel 3 + alta en IVA/Ganancias/Monotributo, **sin inscripción como exportador**. Operadores habilitados: DHL, FedEx, UPS, Andesmar, entre otros.
- **Courier de exportación** `[VERIFICADO ARCA]`: hasta USD 3.000 FOB y 50 kg por envío, sin inscripción como exportador.

**Veredicto**: tiene sentido para vender producto argentino con marca/diferenciación al exterior, pero **no es dropshipping de baja carga**: el limitante es el **costo logístico** (variable por operador, sin tarifa fija oficial `[NO CONFIRMADO]`) y la competitividad de precio. No aplica al encargo de "baja carga, aunque rinda poco".

---

## 3. Realidades argentinas que definen la viabilidad (vigente 2026)

**Organismo fiscal — ARCA (ex-AFIP)** `[VERIFICADO]`: la AFIP fue reemplazada por **ARCA (Agencia de Recaudación y Control Aduanero)** en octubre 2024; es la continuadora jurídica y sigue siendo el recaudador nacional. CUIT, Clave Fiscal y facturación electrónica (CAE) funcionan igual.

**Monotributo 2026** `[VERIFICADO — con actualización semestral]`: se actualiza en enero y julio por IPC (subió 14,3% en enero 2026). Va de **Categoría A** (tope anual ~$10,28M, cuota ~$42.400/mes) a **Categoría K** (tope ~$108,3M). Un dropshipper **puede** operar como monotributista vendiendo bienes, pero con dos advertencias críticas: **(1)** el tope se mide sobre el **total facturado al cliente** (no sobre el margen), así que un modelo de bajo margen y alto volumen puede excederse fácil; y **(2)** el monotributista **no computa crédito fiscal de IVA**: el IVA de las compras a proveedores Responsables Inscriptos se vuelve **costo no recuperable**. Con margen fino y proveedor RI, conviene evaluar **Responsable Inscripto** (recupera el IVA como crédito fiscal). Verificar la escala exacta en ARCA al operar (próxima actualización jul/ago 2026 pendiente `[NO CONFIRMADO]`).

**IVA** `[VERIFICADO]`: alícuota general **21%**. Monotributista emite Factura C sin discriminar IVA; RI liquida débito − crédito fiscal (neutral para el RI). A esto se suma **Ingresos Brutos provincial (~3-4%)** sobre el total vendido `[SUPUESTO — varía por provincia]`.

**Percepciones/retenciones de medios de pago** `[VERIFICADO con matices]`: Mercado Pago y otras plataformas actúan como agentes de retención de IVA/Ganancias e informan a ARCA. Se disparan (para RI) al alcanzar ~10 cobros por ≥$50.000. **Los monotributistas y MiPymes correctamente inscriptos NO sufren estas retenciones** — dato a favor del dropshipper chico. Cobrar sin facturar es detectable (cruces con CBU).

**Controles cambiarios / dólar para pagar al exterior — muy flexibilizado en 2026** `[VERIFICADO]`:

- **Cepo para personas: levantado desde abril 2025.**
- **Impuesto PAIS: eliminado** (venció y no se aplica desde enero 2026).
- **Compra de dólares para atesoramiento: sin percepción y sin cupo** (desde 14/04/2025).
- **Persiste** la **percepción del 30% (a cuenta de Ganancias/Bienes Personales, recuperable)** sobre consumos con tarjeta en el exterior y servicios de no residentes (RG 5617/2024). El "dólar tarjeta" hoy = dólar oficial + 30% (antes era +60%).
- **Acceso al MULC (dólar oficial)** para importar bienes/servicios y pagar proveedores del exterior, muy flexibilizado (Comunicaciones BCRA desde 14/04/2025), mejor aún con certificado MiPyme. Persiste un "cepo parcial" residual con plazos según tipo de operación `[NO CONFIRMADO en detalle]`.

**Cómo pagar a un proveedor de China/EEUU en 2026**: lo más barato es **con dólares propios** (comprados sin percepción); con **tarjeta** el costo es dólar oficial + 30% recuperable; como **importador formal (RI + MiPyme)** se accede al MULC al oficial. El recargo cambiario efectivo bajó ~a la mitad respecto de 2025.

**Medios de pago (cobro al cliente)** `[PARCIALMENTE CONFIRMADO — cifras varían por provincia/loyalty]`: **Mercado Pago** cobra según plazo de acreditación — al instante ~**4,99% + IVA** (checkout online), a 14 días ~**3,99% + IVA**, tarjeta de crédito genérica ~**6,29% + IVA**, débito ~**3,25% + IVA**, QR con saldo ~**0,99% + IVA**. Alternativas: **Ualá Bis** (débito 2,9% / crédito 4,4% + IVA), **Mobbex** (~3,5% + IVA).

**Logística nacional** `[PARCIALMENTE CONFIRMADO — tarifas se cotizan, no publicadas]`: **Andreani** (CABA/GBA ~72h, interior ~2-7 días), **OCA** (48-72h, ~24h en AMBA), **Correo Argentino** (la red más extensa, +5.000 puntos; clásico 3-7 días, expreso 1-3; **MiCorreo** para PyMEs con tarifas públicas), **Mercado Envíos** (Flex para entrega en el día; Full para fulfillment) y **Shipnow/Shipfull** (fulfillment e integración con Tiendanube). Costo de envío promedio de mercado ~$7.900 (2025) `[SUPUESTO — cifra secundaria]`.

**Devoluciones — Defensa del Consumidor** `[VERIFICADO — Ley 24.240 + Disp. 954/2025]`: **derecho de arrepentimiento de 10 días corridos**, irrenunciable, y **los gastos de devolución son por cuenta del vendedor** (art. 34). **Botón de arrepentimiento obligatorio** en la web (Res. 424/2020, reforzado por Disp. 954/2025 que agrega botón de baja). Garantía legal 6 meses (nuevos). **Implicancia directa**: el dropshipper es el responsable legal frente al consumidor aunque el stock sea de un tercero — absorbe la logística inversa y responde por garantía. En una operación de margen fino, **una devolución puede consumir todo el margen de esa venta** `[SUPUESTO — interpretación de la norma]`. Excepciones útiles: perecederos, producto consumido, y **compras para reventa/proceso productivo**.

---

## 4. Cómo mantenerlo SIN PÉRDIDAS y de BAJA CARGA

**Principios no negociables para "sin pérdidas":**

1. **Cobro antes de comprar (dropshipping puro)**: nunca se le paga al proveedor hasta que el cliente pagó. Elimina el riesgo de capital inmovilizado y de stock muerto. Todas las plataformas locales verificadas lo permiten.
2. **Sin stock propio ni logística propia**: el proveedor despacha; se usa fulfillment de terceros (Shipnow/Mercado Full) cuando el volumen lo justifique.
3. **Margen mínimo que cubra TODO el stack de costos**: precio de venta debe absorber costo del producto + IVA no recuperable (si monotributo) + comisión de plataforma de tienda + comisión de Mercado Pago (~5-6%) + Ingresos Brutos (~3-4%) + envío (si es gratis) + una **reserva para devoluciones**. El consenso de mercado 2026 es que **por debajo de ~25-30% de margen el modelo no cierra**; un 15% no cubre plataforma + marketing + devoluciones `[SUPUESTO — guías de e-commerce AR]`.
4. **Nichos de baja devolución y baja expectativa de inmediatez**: evitar indumentaria/calzado (alta devolución por talle) y productos frágiles. Argentina juega a favor aquí: es el país con **menor tasa de devolución del mundo** (81% devuelve una vez al año o nunca, reporte DHL 2026) `[VERIFICADO — fuente secundaria]`. En contra: **68% abandona el carrito si el envío no convence** — no prometer plazos que el proveedor no cumple.
5. **Evitar cross-border como base**: usarlo, si acaso, solo para productos de nicho sin equivalente local y con expectativa de demora explícita al cliente.

**Baja carga operativa = automatización:**

- Sincronización automática de catálogo, stock y precios del proveedor (evita vender lo que no hay — la principal causa de reclamos).
- Ruteo automático de la orden al proveedor al confirmarse el pago.
- Facturación ARCA automática (CAE) en el momento de la venta.
- Tracking y estados sincronizados hacia el cliente.
- Botón de arrepentimiento y flujo de devolución integrados por defecto (cumplimiento legal sin trabajo manual).

**Riesgos concretos y mitigaciones:**

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Proveedor falla (demora/quiebre de stock/calidad) | Reclamos, cancelaciones y demoras → hunden la reputación en ML | Sincronización de stock en tiempo real; 2+ proveedores por SKU clave; SLA con el proveedor; no publicar sin stock confirmado |
| Devolución con logística inversa a cargo del vendedor (art. 34) | Puede consumir el margen de la venta | Reserva de ~5-10% del margen para devoluciones; nichos de baja devolución; describir bien el producto |
| IVA no recuperable (si monotributo) | Erosiona margen con proveedor RI | Evaluar pasar a Responsable Inscripto; negociar Factura A con el proveedor |
| Fin de la franquicia USD 400 (cross-border) | Encarece/inviabiliza importación directa | No basar el negocio en cross-border; monitorear Boletín Oficial |
| Superar el tope de monotributo por facturar el total | Exclusión al régimen general | Controlar facturación acumulada; planificar el salto a RI |
| Reputación ML (reclamos/cancelaciones/demoras) | Pérdida de visibilidad y ventas | Depender de proveedores confiables; canal propio (tienda GSG) para no depender solo de ML |

---

## 5. Números orientativos `[SUPUESTO]`

*Ejemplo ilustrativo de una venta de dropshipping nacional. Todos los valores son supuestos para mostrar la estructura; no son datos de mercado.*

**Estructura de costos sobre una venta de $100.000 (precio al cliente, IVA incluido), operando como monotributista, producto comprado al proveedor a $60.000:**

| Concepto | Monto aprox. | Nota |
|---|---|---|
| Precio de venta al cliente | $100.000 | — |
| Costo del producto (proveedor, IVA incl., no recuperable) | −$60.000 | El IVA del proveedor es costo si sos monotributo |
| Comisión Mercado Pago (~6% con IVA) | −$6.000 | Acreditación rápida |
| Comisión plataforma de tienda | −$0 a −$2.000 | $0 con Tiendanube+Pago Nube o Empretienda |
| Ingresos Brutos (~3,5%) | −$3.500 | Sobre el total vendido |
| Envío (si "gratis") | −$0 a −$7.900 | $0 si lo paga el cliente |
| Reserva devoluciones (~5%) | −$2.000 | Provisión |
| **Margen neto por venta** | **~$18.600 a $26.500** | **~19-27%** si el envío lo paga el cliente |

**Break-even orientativo** `[SUPUESTO]`: con un costo fijo mensual bajo (tienda gratis/plan básico + cuota de monotributo ~$42.000-$120.000 según categoría + herramientas), el punto de equilibrio se alcanza con **~15-40 ventas/mes** de este ticket, asumiendo que el envío no lo absorbe el vendedor. Si el vendedor regala el envío, el margen cae fuerte y el break-even se dispara — de ahí la regla de **no absorber envío en tickets bajos**.

**Carga horaria estimada** `[SUPUESTO]`: con automatización (sincronización + ruteo + facturación), la operación en régimen es de **~5-10 h/semana** (atención al cliente, curaduría de catálogo, marketing). Sin automatización, se duplica o triplica por la gestión manual de órdenes, stock y facturas. Esta diferencia es precisamente el valor que aporta el motor de GSG.

---

## 6. Encaje con GSG

GSG ya tiene: **tiendas Next.js multi-tenant**, **Mercado Pago** integrado, **factura ARCA nativa** y **fábrica de tenants**. Ese stack **es casi exactamente la infraestructura que un dropshipper necesita** — lo único que falta es la capa de conexión con catálogos de proveedores y la sincronización de stock/precios. Esto reordena las opciones:

**(a) Vertical de SGS Labs (montar una operación de dropshipping propia como línea de negocio)** — **No recomendado como fin en sí mismo.** Rinde poco, es intensivo en marketing y atención, y expone a GSG al riesgo reputacional y legal de vender productos de terceros (devoluciones, garantía, reputación ML). El encargo pedía "baja carga aunque rinda poco", pero como *línea de negocio* la relación esfuerzo/retorno es pobre frente a lo que GSG ya sabe hacer.

**(b) Producto / tienda propia usando el mismo motor/ERP** — **Recomendado solo como piloto de validación**, no como fuente de ingresos. Una tienda propia de nicho (baja devolución, proveedor local confiable) sirve como **banco de pruebas** para construir y depurar el módulo de dropshipping sobre el motor real, con dinero real, antes de ofrecérselo a clientes. Inversión baja, aprendizaje alto.

**(c) Módulo / feature del ERP para clientes que quieran dropshipping** — **La opción más recomendada.** GSG monetiza la tendencia **sin cargar con el riesgo operativo**. El módulo aprovecha directamente lo que ya existe:

- **Fábrica de tenants** → alta instantánea de tiendas dropshipping para clientes.
- **Factura ARCA nativa** → cumplimiento fiscal automático (CAE por venta), diferencial fuerte frente a Tiendanube+plugins.
- **Mercado Pago integrado** → cobro antes de ordenar al proveedor (dropshipping puro por diseño).
- **Nuevo desarrollo acotado**: conectores a plataformas de proveedores locales (Unidrop, Droppers, Dropdeal, TornadoStore), sincronización de stock/precios, ruteo automático de órdenes, botón de arrepentimiento y flujo de devolución embebidos.

Este módulo convierte una limitación del mercado (cumplir ARCA + Defensa del Consumidor + sincronizar proveedores es tedioso) en el **valor diferencial de GSG**. Es la jugada de "vender palas en la fiebre del oro": GSG no compite con miles de dropshippers, les da la herramienta.

**(d) No conviene** — Descartado: el mercado existe, es creciente, y GSG tiene ventaja estructural. No sumar nada sería dejar sobre la mesa una extensión natural del producto.

**Sinergia resumida**: el motor de GSG ya resuelve tienda + pagos + factura + multi-tenant. El dropshipping solo agrega la capa de proveedores. El esfuerzo marginal de desarrollo es bajo y reutiliza todo lo existente; el riesgo operativo se traslada al cliente-usuario del módulo, no a GSG.

---

## 7. Veredicto y próximos pasos

**Veredicto**: **viable y recomendable como módulo del ERP (opción c), validado con una tienda propia piloto (opción b).** No recomendable como operación de dropshipping propia de escala (a). El dropshipping nacional puro es el único formato "sin pérdidas y de baja carga"; el cross-border es demasiado frágil (aduana + riesgo de fin de franquicia) para ser la base; exportar es otro negocio.

**Próximos pasos concretos y de baja inversión para validar:**

1. **Semana 1-2 — Prueba de proveedores (costo casi cero).** Dar de alta cuentas en Unidrop, Droppers y Dropdeal; evaluar calidad de catálogo, márgenes reales, sincronización de stock y condiciones de despacho. Elegir 1-2 nichos de baja devolución.
2. **Semana 2-4 — Tienda piloto sobre el motor GSG (opción b).** Levantar un tenant real con 20-40 SKUs de un proveedor, con cobro Mercado Pago + factura ARCA + botón de arrepentimiento. Objetivo: **validar el flujo cobro→orden→factura→envío end-to-end**, no facturar.
3. **Semana 4-8 — Medir la economía unitaria real.** Registrar margen neto efectivo, tasa de devolución, tiempos de despacho del proveedor y horas/semana reales. Contrastar con los supuestos de la Sección 5.
4. **Semana 6-10 — Especificar el módulo (opción c).** Con los aprendizajes del piloto, definir los conectores de proveedor, la sincronización de stock/precios y el ruteo de órdenes como feature del ERP. Priorizar Factura ARCA + cumplimiento Defensa del Consumidor como diferenciales.
5. **Continuo — Monitorear el riesgo regulatorio.** Seguir el Boletín Oficial por la anunciada eliminación de la franquicia courier de USD 400 (afecta cualquier funcionalidad cross-border) y la actualización semestral de monotributo. No comprometer roadmap con cross-border hasta que la norma se aclare.

---

## Fuentes

**Oficiales (ARCA/AFIP, Gobierno, Boletín Oficial, BCRA, InfoLEG):**

- ARCA — Pequeños envíos courier (importación): https://www.afip.gob.ar/envios-internacionales/courier/importacion/pequenios-envios.asp
- ARCA — Puerta a Puerta, montos: https://www.afip.gob.ar/envios-internacionales/puerta-a-puerta/monto.asp
- ARCA — Courier, tributos: https://www.afip.gob.ar/envios-internacionales/courier/conceptos-generales/tributos.asp
- ARCA — Puerta a Puerta, procedimiento: https://www.afip.gob.ar/envios-internacionales/puerta-a-puerta/procedimiento.asp
- ARCA — Novedad simplificación courier import/export (RG 5631/2025): https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4509
- ARCA/AFIP — Institucional: https://www.afip.gob.ar/institucional/
- ARCA — Categorías Monotributo: https://www.afip.gob.ar/monotributo/categorias.asp
- argentina.gob.ar — Suba a USD 3.000 courier (02/12/2024): https://www.argentina.gob.ar/noticias/se-eleva-usd-3000-el-monto-para-importacion-de-mercaderias-traves-de-courier
- argentina.gob.ar — Exporta Simple: https://www.argentina.gob.ar/produccion/exportar/exportasimple
- argentina.gob.ar (ARCA) — Eliminación de percepciones por compra de moneda extranjera (14/04/2025): https://www.argentina.gob.ar/noticias/ganancias-y-bienes-personales-se-eliminaron-las-percepciones-cuenta-por-compras-de-moneda
- argentina.gob.ar — Botón de arrepentimiento (Ley simple): https://www.argentina.gob.ar/justicia/derechofacil/leysimple/boton-arrepentimiento
- Boletín Oficial — RG Conjunta 5846/2026 Exporta Simple (14/05/2026): https://www.boletinoficial.gob.ar/detalleAviso/primera/341940/20260514
- Boletín Oficial — Res. 424/2020 botón de arrepentimiento (05/10/2020): https://www.boletinoficial.gob.ar/detalleAviso/primera/235729/20201005
- InfoLEG — Ley 24.240 Defensa del Consumidor (texto actualizado): https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/638/texact.htm
- Correo Argentino — Puerta a Puerta: https://www.correoargentino.com.ar/puerta-puerta
- Mercado Pago — Percepciones: https://www.mercadopago.com.ar/ayuda/21757

**Medios y fuentes especializadas:**

- Ámbito (09/01/2025) — nuevos montos y cantidades courier: https://www.ambito.com/economia/compras-el-exterior-via-courier-segun-arca-cuales-son-los-nuevos-montos-y-cantidades-que-se-pueden-ingresar-al-pais-n6101015
- iProfesional (21/11/2025) — requisitos ARCA, prohibidos, SHEIN/Temu: https://www.iprofesional.com/actualidad/442468-compras-internacionales-requisitos-de-arca-productos-prohibidos-y-tope-para-shein-y-temu
- iProfesional (30/03/2026) — Correo Oficial como courier: https://www.iprofesional.com/negocios/451277-el-correo-oficial-busca-ser-courier-para-pelear-el-negocio-de-las-compras-al-exterior
- iProfesional (02/07/2026) — eliminación anunciada franquicia USD 400: https://www.iprofesional.com/impuestos/458945-courier-aduana-se-elimina-la-franquicia-de-us400-libres-de-impuestos
- iProfesional (30/01/2026) — Fin del Impuesto PAIS y dólar tarjeta: https://www.iprofesional.com/finanzas/445708-fin-del-impuesto-pais-como-impacta-la-baja-del-30-en-consumos-con-tarjeta-en-el-exterior
- iProfesional — Monotributo 2026 topes: https://www.iprofesional.com/impuestos/446005-monotributo-2026-cuales-son-los-nuevos-topes-de-facturacion-y-montos-mensuales
- El Cronista (23/06/2026) — Aduana prepara cambios courier: https://www.cronista.com/economia-politica/la-aduana-detecto-trampas-en-envios-por-courier-y-prepara-cambios-para-compras-en-el-exterior/
- El Cronista — Adiós AFIP / qué es ARCA: https://www.cronista.com/economia-politica/adios-afip-cuando-dejara-de-existir-que-significa-arca-y-como-va-a-funcionar/
- La Nación (31/03/2026) — Correo Argentino entra al courier + boom USD 894M: https://www.lanacion.com.ar/economia/negocios/correo-argentino-se-mete-en-el-negocio-de-los-envios-courier-nid31032026/
- Infobae (13/05/2026) — Exporta Simple sin topes: https://www.infobae.com/economia/2026/05/13/programa-exporta-simple-el-gobierno-elimino-una-restriccion-clave-para-que-las-pymes-vendan-al-exterior/
- Infobae (15/04/2025) — Fin del cepo, pagos con tarjeta: https://www.infobae.com/economia/2025/04/15/fin-del-cepo-como-pagar-los-consumos-fuera-del-pais-y-las-compras-con-tarjeta-en-moneda-extranjera-desde-ahora/
- Infobae (04/09/2025) — Disp. 954/2025, cambios en cancelación de compras online: https://www.infobae.com/economia/2025/09/04/implementaron-cambios-el-regimen-de-cancelacion-de-compras-online/
- Infobae (09/09/2025) — colapso en Ezeiza: https://www.infobae.com/movant/2025/09/09/colapso-en-ezeiza-importadores-alertan-por-fallas-en-el-nuevo-sistema-aduanero/
- Chequeado (14/01/2026) — Monotributo y Ganancias, valores enero 2026: https://chequeado.com/el-explicador/monotributo-y-ganancias-cuales-son-los-nuevos-valores-a-partir-de-enero-de-2026/
- Contablix — Dropshipping Argentina: impuestos y facturación 2026: https://contablix.ar/blog/dropshipping-argentina-impuestos-afip-2026
- Estudio O'Farrell — Requisitos de acceso al MULC y plazos de pago de importaciones: https://www.estudio-ofarrell.com/requisitos-de-acceso-al-mulc-y-plazos-de-pagos-de-importaciones/
- Bank Magazine (28/06/2026) — Devoluciones / Reporte Tendencias eCommerce DHL 2026: https://bankmagazine.com.ar/las-devoluciones/

**Proveedores y plataformas de tienda:**

- Tiendanube — ¿Cómo hacer dropshipping en Argentina? (11/06/2026): https://www.tiendanube.com/blog/dropshipping-argentina/
- Tiendanube — Planes y precios: https://www.tiendanube.com/planes-y-precios
- Unidrop: https://www.unidrop.com.ar · Droppers: https://droppers.com.ar · Dropdeal: https://dropdeal.ar · Dropshipping.ar: https://dropshipping.ar
- TornadoStore — proveedores de dropshipping en Argentina (28/10/2025): https://www.tornadostore.ar/proveedores-de-dropshipping-en-argentina--news--93-1180
- Empretienda: https://www.empretienda.com
- Mercado Envíos (servicio logístico) — Tiendanube (08/05/2026): https://www.tiendanube.com/blog/mercado-envios-servicio-logistico/
- Shipnow: https://shipnow.com.ar

**Nota de método**: varias páginas oficiales de Mercado Libre (costos, reputación) y Mercado Pago (comisiones) se renderizan con JavaScript y no fueron legibles por fetch directo; sus cifras se apoyan en agregadores especializados 2026 concordantes y quedan marcadas como `[PARCIALMENTE CONFIRMADO]`. Los valores de monotributo, umbrales de retención y comisiones se actualizan cada seis meses y por provincia — verificar en ARCA y en el panel de la propia cuenta al momento de operar. Para uso legal/contable, validar los textos normativos originales con un contador.
