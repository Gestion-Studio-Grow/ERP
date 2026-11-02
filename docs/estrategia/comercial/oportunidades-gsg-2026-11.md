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
| ✗ | Supermercado, punto de venta gastronómico | – | Sólo fit-gap | No se sale a vender ahora | – | – | Fudo domina [EXTRACTO] |

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
