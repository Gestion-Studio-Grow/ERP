# GSG: qué vender, a cuánto y dónde (Canning primero) · noviembre 2026

**Fecha:** 2026-11-02 · **Estado:** propuesta para el dueño · **Precios:** ARS/mes + IVA, *provisionales a confirmar*.

**Marcas de confiabilidad.** `[FUENTE]` y `[EXTRACTO]` vienen del buscador: la red de la sesión no dejó
abrir las páginas. `[INFERIDO]` es cálculo propio.

## 1. El criterio de precio (realista)

- **El código ya no es lo caro.** Lo generamos con IA y una agencia también puede. No se cobra como si
  fuera escaso.
- **Lo que sí cuesta es tiempo de personas:** poner en marcha, cargar datos, capacitar, dar soporte y
  responder un sábado.
- **El cuello de botella es el equipo, no la infraestructura.** El hosting de toda la flota cuesta unos
  $54.000/mes (`docs/estrategia/costos-por-segmento.md`). Con dos clientes de $30.000 ya se cubre.
- **Regla:** entrada barata o gratis, abono justo por mes, y priorizar lo que se vende solo (autoservicio)
  o con poco acompañamiento.
- **Techo práctico** `[INFERIDO]`: unas 4–6 puestas en marcha asistidas por mes con el equipo actual.

## 2. Catálogo vendible

| # | Producto | Para quién | Base que ya existe | Madurez | Entrada | Abono | Competencia |
|---|---|---|---|---|---|---|---|
| 1 | **Facturita** (facturador ARCA) | Monotributistas, oficios, servicios | `src/lib/facturita-planes.ts`, `src/plugins/arca` | Publicado; faltan 8 condiciones del dueño y ARCA en modo real | $0 (autoservicio) | Gratis hasta 5 facturas/mes · Solo $14.900 · Comercio $39.900 (`facturita-planes.ts:49,75,91`) | Xubio $94.900+ [EXTRACTO] |
| 2 | **Consola del contador** | Estudios contables (canal: cada uno trae clientes) | `facturacion`, `libros`, `retenciones`, `cierre-mes` | Publicado, sin clientes | $0 | Pyme $89.900 · Multiprovincia $149.900 (`facturita-planes.ts:100,109`) | Tango ~$171.906 [EXTRACTO] |
| 3 | **Turnos + caja + ARCA + WhatsApp** | Estética, salud, veterinarias, profes | CH: `turnos`, `caja`, `espera`, `recordatorios`, E2E 40/40 | En UAT (rama `claude/ch-nivel-bp`) | $0–$150.000 (carga de datos) | $29.900–39.900 · Profe solo $9.900 | AgendaPro ~$7.900 sin ARCA [EXTRACTO] |
| 4 | **Mostrador por kilo** | Carnicerías, almacenes premium | magra: `balanza`, `despiece`, `vender`, `lotes` | Antes de producción | $150.000–250.000 | $39.900 con balanza incluida | Fudo $20.900–65.000 + $19.500 la balanza [EXTRACTO] |
| 5 | **Servicios para countries** *(vertical nueva)* | Piletas, jardinería, mantenimiento | Reutiliza `taller` (orden de trabajo), `recordatorios`, cobro MP, factura | Sólo armado de piezas existentes `[INFERIDO]` | $0 | $19.900–29.900 | Talonario y WhatsApp a mano |
| 6 | **Pádel** | Clubes, torneos, profes | breakpoint (club), circuito-wpe (torneos), matiasconsoli (`clases`) | WPE ya vendido, falta el alta · club en demo · profe listo | Club $300.000 · torneo por evento | Club $49.900–89.900 · profe $9.900 | Turneros genéricos |
| 7 | **Gestión de productora** | Eventos y stands | Rama `tenant/mia-producciones` (11 apps tipo Heka) | En la PC del dueño, sin push | USD 2.500–3.000 | USD 300 | Agencias de IA USD 10–25k |
| 8 | **Vidriera web + pedidos por WhatsApp** | Locales nuevos, retail | Shine, Qué Bien Olés, CH, magra | El servicio más probado; sin precio | $250.000–450.000 `[INFERIDO]` | $25.000–35.000 (hosting y cambios) | Agencias de zona sur, sin precios publicados |
| – | Taller, inmobiliaria | – | `taller`, `inmobiliaria` | Demo; al taller le falta `MIGRATE_DATABASE_URL` | Segunda ola | – | – |
| 9 | **Autoservicio / supermercado de barrio** | Autoservicios, minimercados, proveedurías de countries | En `main` (`src/lib/supermercado/`, 36 archivos): caja con lector, balanza 20–29, «3 ×», pago mixto, promos (2×1, 3×2, 2.ª unidad, por día y medio de pago), aumentos por margen, carteles de góndola, mermas, sugerido de compra, listas de proveedores, vidriera con pedido online; catálogo semilla de 380 productos (`docs/tenants/supermercado/fit-gap.md`) | Demo lista, sin cliente | $300.000–500.000 (catálogo, balanza, capacitación de cajeros) | $59.900 por local con 1 caja `[INFERIDO]` | Tango Punto de Venta ~$171.906 [EXTRACTO] |
| ✗ | Punto de venta gastronómico | – | – | No se sale a vender ahora | – | – | Fudo domina [EXTRACTO] |

## 3. Canning como mercado de prueba

- **Por qué Canning sirve:**
  - Más de 60 barrios cerrados y más de 5.000 casas en obra [FUENTE].
  - Lotes de USD 90–180k [FUENTE].
  - Locales nuevos: NÜ (~2.250 m²) y Castex 4200, con entregas de diciembre 2026 a febrero 2027 [FUENTE].
  - No hay ninguna agencia digital con base en Canning o Ezeiza. La más cercana es Bartistic, en Lomas
    de Zamora [FUENTE].
  - El pádel crece: Lasaigues tiene 9 canchas y va a 15 [FUENTE].
- **Lo que falta saber:** la población actual (Canning no tiene dato propio en el Censo 2022) y cuántos
  comercios hay por rubro.
  - **Acción barata:** contar rubros en Google Maps a mano, en una tarde.

**Ranking para salir a vender en Canning:**

1. **Estética y salud** (producto 3). Hay referencia viva (CH). Turnos, ARCA y WhatsApp juntos son lo que
   AgendaPro no tiene. AgendaPro levantó US$35 M y se expande en Argentina [FUENTE]: el lugar libre se achica.
2. **Servicios para countries** (productos 5 + 1). Son monotributistas que trabajan con talonario. La
   temporada de piletas va de diciembre a marzo y los empujan las ventanas de ARCA (sección 4). Se entra con
   Facturita gratis y se sube al abono.
3. **Carnicerías y almacenes premium** (producto 4). El pico es en las fiestas y la balanza va incluida.
   **Riesgo:** magra no llega a diciembre sin cobro ni precios reales. Si no está lista el 25/11, pasa a
   marzo.
4. **Pádel** (producto 6). Las canchas crecen y está todo diseñado. Se cobra por cancha y por torneo.
- **Autoservicios y proveedurías de countries** (producto 9). Va junto con el puesto 3 en las fiestas y
  el verano.
  - **Hoy sirve para** un local de 1 caja: la tarjeta entra por el posnet de Mercado Pago.
  - **No sirve todavía para** varias cajas con arqueo propio, tarjeta como medio aparte ni lotes con
    vencimiento. Cada una necesita una migración o un ADR, y eso es decisión del dueño (fit-gap,
    pendientes 1–3).
  - **Antes de facturar,** el contador valida el IVA por producto y la ley de góndolas.

5. **Locales nuevos de Castex 4200** (producto 8). Se les vende vidriera y pedidos por WhatsApp el día que
   abren. No conviene pelear el punto de venta contra Fudo.

## 4. Ventanas con fecha

| Fecha | Qué pasa | Qué se vende |
|---|---|---|
| **1/11/2026 (ya vigente)** | RG 5893/2026: factura electrónica obligatoria para el Monotributo Social y el Promovido [FUENTE] | Facturita gratis, por los contadores |
| Diciembre | Fiestas: pico de carnicerías, almacenes y salones `[INFERIDO]` | Mostrador por kilo, sólo si magra está lista |
| Dic 2026 – mar 2027 | Temporada de piletas y jardinería; abren los locales de Castex 4200 | Servicios para countries, vidrieras |
| **5/2/2027** | Recategorización del monotributo [FUENTE, una sola fuente] | Facturita y Consola del contador |
| **1/3/2027** | Factura electrónica obligatoria para los no alcanzados por IVA [FUENTE] | Facturita: segunda ola |

## 5. Plan de 90 días

1. **Noviembre, cobrar lo ya vendido.**
   - Dar de alta Circuito WPE en producción.
   - Publicar CH.
   - Cerrar las 8 condiciones de Facturita y probar ARCA en modo real.
   - Publicar una sola lista de precios.
   - Todo esto pasa por los gates del dueño: push a `main` y Gate 2.
2. **Noviembre, relevar y abrir el canal.**
   - Contar rubros de Canning en Google Maps.
   - Ofrecer la Consola del contador a 3 estudios contables de la zona.
3. **Diciembre, entrar por la temporada.**
   - Armar el paquete de servicios para countries con la orden de trabajo del taller.
   - Ofrecer vidrieras a los locales nuevos.
   - Decidir el 25/11 si magra sale para las fiestas.
4. **Enero y febrero.**
   - Campaña de recategorización (5/2) con los contadores.
   - Salir a vender pádel: club y torneos.
5. **Marzo.** Segunda ola de Facturita por la obligación del 1/3.

**Meta orientativa** `[INFERIDO]`: 15 abonos pagos a $30.000 de promedio dan unos $450.000 por mes. Eso es
8 veces el costo fijo de la flota.

## 6. Pendientes del dueño

- Confirmar la lista de precios: todos son provisionales.
- Dar las órdenes de los gates: alta de WPE, publicar CH, `MIGRATE_DATABASE_URL` del taller y del profe,
  y el pase de MIA.
- Definir quién hace la venta presencial en Canning.

## Fuentes

- **Canning y ARCA:**
  - iprofesional.com (barrios nuevos y lotes 2026; recategorización)
  - lanacion.com.ar (ampliación de Toscas)
  - zonaprop.com.ar y mudafy.com.ar (locales de Castex)
  - billiken.lat (pádel)
  - finder.techleap.nl (AgendaPro)
  - sovos.com, siap.blogdelcontador.com.ar y canal26.com (RG 5893)
  - telencuestas.com (Censo 2022 por partido)
- **Interno:**
  - `src/lib/facturita-planes.ts`
  - `docs/estrategia/costos-por-segmento.md`
  - `docs/tenants/*/README.md`
  - `docs/sectores/agencia-digital/analisis-mercado/2026-07-05-segmento-local-canning.md`
  - `docs/tenants/mia-producciones/ESTUDIO-MERCADO-Y-PRESUPUESTO.md`

---

## 7. Dónde hacernos fuertes: la economía del country (Canning)

**Tesis.** GSG no gana peleando de frente contra jugadores nacionales con plata, como AgendaPro en
estética o Fudo en gastronomía, ni contra facturadores que ya son gratis, como Xubio o Alegra. Gana donde
se juntan tres cosas: un rubro **que nadie atiende**, una **obligación con fecha** y **presencia local**.
En Canning eso es **la economía del country**: los que trabajan para los barrios cerrados y los comercios
que les venden por WhatsApp.

### Anillo 1: proveedores de servicio a countries (la bandera)

Son piletas, jardinería, mantenimiento, limpieza y pequeñas obras.

**Por qué ahí:**

- **No hay competencia local.** No aparece ningún software argentino con precio para piletas o
  jardinería. La referencia es Jobber, de Estados Unidos, en dólares y sin ARCA ni Mercado Pago [EXTRACTO].
  AgendaPro vende turnos en un local, no trabajo en la casa del cliente.
- **Hay mercado concentrado:** más de 60 barrios y más de 5.000 casas en obra [FUENTE]. El mantenimiento
  de una pileta cuesta $40.000–80.000 por mes (servidos.ar, abril 2026) [EXTRACTO]. Un piletero con
  30 piletas factura unos $1,8 M por mes `[INFERIDO]`, y nuestro abono de $19.900–29.900 es menos del 2 %.
- **Hay obligación:** la RG 5893 (1/11), la recategorización (5/2) y el 1/3 para los no alcanzados por
  IVA. Además, muchos barrios piden factura y seguro para dejar entrar a un proveedor [EXTRACTO, guía
  general; **validar con 3 administraciones**].
- **El canal es barato:** los grupos de WhatsApp de cada barrio y las recomendaciones entre vecinos. Un
  proveedor atiende muchas casas del mismo barrio.
- **Ya está casi todo construido:**
  - órdenes de trabajo (`TallerOrden`);
  - factura recurrente (`ReglaFacturacion`, `prisma/schema.prisma:2366`, hoy usada por la Consola del
    contador);
  - recordatorios y WhatsApp;
  - link de Mercado Pago;
  - Facturita.
- **Falta un paquete de 1 o 2 tandas** `[INFERIDO]`:
  - un abono por casa que factura y cobra solo cada mes;
  - la ruta del día ordenada por barrio;
  - el aviso al vecino: «hoy pasamos» y «listo», con foto;
  - la carpeta de papeles del proveedor (seguro, ART, monotributo) para presentar en la guardia.

**Oferta:** un mes gratis con Facturita, y después **$19.900–29.900 por mes**, sin costo de entrada.

**Ventana:** **de noviembre a marzo.** La temporada de piletas y las tres fechas de ARCA caen juntas. Si no
entramos en este verano, la próxima ventana igual de buena es el verano 2027–28.

### Anillo 2: comercio de cercanía que vende al country por WhatsApp

Son carnicerías, almacenes premium, proveedurías y autoservicios. Productos 4, 8 y 9 del catálogo.

- **Qué se vende:** vidriera con pedido por WhatsApp, venta por kilo y, en el súper, promociones, más la
  entrega en el barrio.
- **Por qué:** magra ya es de Canning y el súper está en `main`.
- **Ventana:** las fiestas y el verano, y la apertura de Castex 4200 entre diciembre y febrero.

### Anillo 3: servicios a la persona del barrio

Son estética (CH), pádel (Break Point, WPE y profes) y eventos (MIA).

- **Rol:** se vende y se cobra, pero **no es la bandera**. En estética, AgendaPro con US$35 M va a ganar
  la pelea por precio. Estos clientes sirven de casos de éxito locales y para vender de a varios productos.

### Dónde NO hacernos fuertes ahora

- Facturita como producto nacional suelto: la competencia es gratis.
- Punto de venta gastronómico, porque Fudo domina.
- Supermercados con varias cajas, porque falta la migración.

### Cómo validar barato (2 semanas, $0)

1. **Entrevistar a 10 pileteros o jardineros de Canning.** Preguntar:
   - cuántas casas atienden;
   - cómo facturan y cobran;
   - qué les pide la guardia.
2. **Llamar a 3 administraciones de barrios.** Preguntar qué papeles le piden a un proveedor y si tienen
   un registro.
3. **Ofrecer el mes gratis a los 10.**
   - Criterio para seguir: **si 3 o más pagan el segundo mes**, se arma el paquete completo.
   - Si no, la bandera pasa al anillo 2.

Fuentes de esta sección:

- servidos.ar (precios de servicios de jardinería y piletas 2026; guía para jardineros independientes)
- capterra.es (software de jardinería y de órdenes de trabajo)
- iprofesional.com (barrios y obras en Canning)
- finder.techleap.nl (AgendaPro)

---

## 8. Servicio de desarrollo de apps a medida: cuánto cobrar

**Criterio.** El código lo genera la IA, también para la competencia. Lo que se cobra es:

- entrega en semanas;
- que funcione con datos reales;
- seguridad;
- integraciones argentinas (ARCA, Mercado Pago, WhatsApp);
- soporte.

El recurso escaso son las **horas del dueño**: relevar, revisar, probar y publicar. Se valúan a
USD 30–40 por hora `[INFERIDO]`.

**Referencias de mercado** `[EXTRACTO]`:

| Quién | Precio |
|---|---|
| Fiverr con Lovable | USD 25–1.500 |
| Software factory AR (Nexosmart) | 1 módulo USD 3.500–4.000 · ERP USD 6.500–8.200 · mantenimiento USD 80–150/mes |
| Drimfix | Simple USD 3–7k · ERP pyme USD 8–20k |
| Agencias de MVP con IA | USD 5–25k en 2–4 semanas |
| Programador argentino | USD 28–45/h · software factory USD 48–65/h |
| Mantenimiento | 15–25 % anual del desarrollo |

**Lista propuesta** (USD + IVA, cobrados en pesos al oficial BNA; *provisional a confirmar*):

| Paquete | Qué es | Plazo | Precio | Abono |
|---|---|---|---|---|
| **Prototipo** | Demo navegable con datos de ejemplo; se descuenta si avanza el proyecto | 1 semana | USD 400–800 | – |
| **App simple** | Catálogo, reservas, formularios y panel de administración | 1–2 semanas | USD 1.200–2.500 | USD 40–80 |
| **Sistema de gestión** | 3–6 módulos, roles, cobro MP, factura ARCA, WhatsApp | 3–6 semanas | USD 3.000–7.000 | USD 150–300 |
| **Proyecto grande** | 10 o más apps con integraciones (tipo MIA) | 6–10 semanas | USD 8.000–15.000, o implementación + abono si va sobre el motor | USD 300–500 |
| Adicional: app en las tiendas | Por defecto se entrega app web instalable; publicarla en las tiendas | +1–2 semanas | +USD 1.500–3.000 (más USD 99/año de Apple y USD 25 de Google) | – |
| Cambios fuera del abono | Bolsa de 10 horas | – | USD 300 | – |
| Código propio fuera del motor | El cliente se queda con un sistema independiente | – | Precio × 1,5–2 | Mantenimiento aparte |

**Posicionamiento.** Por encima de Fiverr y Lovable, por seguridad, soporte, ARCA y MP. Entre 30 y 50 %
por debajo de una agencia de IA.

**Reglas:**

1. **Nunca proyecto sin abono.** El negocio es lo recurrente; los proyectos sueltos no escalan con un equipo chico.
2. **Si el pedido entra en el motor** (comercio, turnos, gestión), se vende como **implementación + abono**,
   no como desarrollo. Es más barato para el cliente y deja más margen.
3. **Capacidad:** 2–3 proyectos por mes como máximo, con el dueño revisando `[INFERIDO]`.
4. **Pago de proyectos:** 50 % al empezar y 50 % al entregar. El prototipo se cobra por adelantado.
5. **Gates:** no se gasta nada antes de vender. Si la demo usa la marca del cliente, hace falta su
   autorización registrada.

**Escenario** `[INFERIDO]`: 2 sistemas por mes a USD 4.000 son USD 8.000 por mes en proyectos. Con 10 abonos
acumulados de USD 200 en 5 meses se suman USD 2.000 por mes que quedan aunque no entre ningún proyecto nuevo.
