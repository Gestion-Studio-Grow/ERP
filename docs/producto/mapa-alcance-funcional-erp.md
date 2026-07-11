> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), investigación fundacional del dueño. Incorporado sin alterar el contenido original.

---

# GSG — Mapa de Alcance Funcional ERP
## Dos productos: "Comercio Micro" y "PyME/Empresa" para el mercado argentino sub-SAP-B1

**Preparado por:** Análisis funcional senior de ERP
**Fecha:** 10 de julio de 2026
**Regla rectora:** No perseguimos la profundidad completa de SAP. Buscamos el 20% de cada área que entrega el 80% del valor para el segmento argentino que no puede pagar SAP Business One.

> **Cómo leer este documento.** Cada capacidad se mapea a un producto (**Micro**, **Empresa** o **ambos**) y a una prioridad (**Imprescindible** = sin esto no se vende / no cumple la ley; **Importante** = diferencia y retiene; **Futuro** = roadmap posterior al MVP). Las estimaciones sin fuente directa se marcan **[SUPUESTO]**. Las fuentes se listan al final.

---

## 0. Marco de referencia (qué comparamos y por qué)

| Producto de referencia | Qué es | Segmento | Aprendizaje para GSG |
|---|---|---|---|
| **SAP Business One (B1)** | ERP integrado para PyME, localizado y vendido por partners. Cubre FI/MM/SD/Inventario nativamente; QM, HR/Sueldos y PM vía add-ons. | PyME (hasta ~100 empleados). Cloud ~USD 95–250/usuario/mes; on-premise ~USD 1.650–3.200/usuario. | Es el "techo" de precio. Nuestro **Empresa** debe dar el 80% del valor a una fracción del costo. |
| **SAP S/4HANA Public Cloud** | SaaS estandarizado por "scope items"; empuja HR/Sueldos a SuccessFactors y depósito avanzado a EWM. | Mediana/grande. | Referencia de profundidad; fuera de nuestro alcance salvo como guía de módulos. |
| **Tango (Axoft / Softland)** | ERP horizontal argentino, marca líder. Ediciones: Gestión, Punto de Venta, Restô, Estudios Contables, Factura/Livianas, Nexo. Conexión directa a AFIP/ARCA sin costo extra. | Comercio y PyME hasta empresa grande. On-premise **y** cloud, canal de revendedores. | **Benchmark directo del producto Empresa.** Su fortaleza es la profundidad fiscal/contable y la base instalada. |
| **Bistrosoft** | POS/gestión gastronómica Android-first, SaaS todo-incluido (hardware + software + soporte 24h). Integra PedidosYa, Rappi, Uber Eats, Mercado Pago, MODO. | Gastronomía (restaurantes, bares, cafeterías). Abono mensual desde ~$35.500 + IVA (web) / ~$65.000 + IVA (avanzado). | **Benchmark directo del producto Micro** en gastronomía. Su fortaleza es la simplicidad, el bajo compromiso y las integraciones de delivery/pago. |

**Contexto fiscal argentino 2026 (crítico para ambos productos).** AFIP fue reemplazada por **ARCA** (Agencia de Recaudación y Control Aduanero) por Decreto 953/2024, vigente desde el 25/10/2024; CUIT, Clave Fiscal, certificados y web services continúan sin cambios. La facturación electrónica es obligatoria: autenticación **WSAA** + emisión doméstica **WSFEV1/WSMTXCA** + exportación **WSFEX**, obtención de **CAE** por comprobante, ambientes homologación→producción. Desde el **1/7/2025 es obligatorio el campo "condición frente al IVA del receptor"** (RG 5616/2024; sin él, rechazo automático, error 10242). El **Libro IVA Digital** se reemplazó por **"IVA Simple"** para Responsables Inscriptos (RG 5705/2025 y 5707/2025). Retail/gastronomía suele combinar **controlador fiscal de nueva tecnología** + factura electrónica.

---

## 1. Alcance funcional por área SAP → capacidades reales de una PyME argentina

### FI — Finanzas / Contabilidad

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Facturación electrónica ARCA con CAE (A/B/C, y M donde aplique) vía WSAA + WSFEV1 | Ambos | Imprescindible | Núcleo legal. Incluye campo condición IVA del receptor (RG 5616). |
| Notas de crédito / débito electrónicas (misma clase que el comprobante origen) | Ambos | Imprescindible | Devoluciones y ajustes. |
| Caja / arqueo diario y control de efectivo | Ambos | Imprescindible | En Micro es el corazón operativo. |
| Cuenta corriente de clientes (saldos, vencimientos, cobranzas) | Ambos | Imprescindible | Venta mostrador + fiado es universal en AR. |
| Cuenta corriente de proveedores (pagos, vencimientos) | Empresa (básico en Micro) | Imprescindible (Empresa) / Importante (Micro) | Micro necesita registro simple; Empresa, gestión de pagos programada. |
| Libro IVA compras/ventas y sustento para IVA Simple (RI) | Empresa | Imprescindible | Micro monotributista emite Factura C, no discrimina IVA. |
| Retenciones y percepciones nacionales (IVA, Ganancias) | Empresa | Imprescindible | Agente de retención/percepción; SICORE/SIRE. |
| Percepciones/retenciones IIBB provincial (ARBA, AGIP, etc.) con padrón de alícuotas | Empresa | Importante | Padrones mensuales por jurisdicción. |
| Convenio Multilateral (distribución IIBB multi-jurisdicción, SIFERE) | Empresa | Futuro | Solo para contribuyentes multi-provincia. |
| Conciliación bancaria (importación de extractos, matching) | Empresa | Importante | En Micro, conciliación manual simple. |
| Plan de cuentas y asientos automáticos desde ventas/compras/stock | Empresa | Importante | Contabilidad integrada; Micro puede exportar al contador. |
| Estados contables / balance / mayor | Empresa | Futuro | Muchas PyME lo delegan al estudio contable. |
| Gestión de cheques (propios y de terceros, cartera, e-cheq) | Empresa | Importante | Muy usado en la cadena de pagos AR. |
| Múltiples medios de pago (efectivo, transferencia, tarjeta, QR/MODO/Mercado Pago) | Ambos | Imprescindible | Conciliación de cobros con acreditaciones. |
| Reportes financieros simples (ventas del día, ranking, márgenes) | Ambos | Imprescindible (Micro) / Importante (Empresa) | Micro necesita dashboards estilo "un vistazo". |
| Validación de CUIT y condición fiscal vía padrón ARCA (constancia de inscripción WS) | Ambos | Importante | Autocompleta la letra del comprobante y evita rechazos. |

### MM — Compras / Abastecimiento

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Registro de compras / carga de facturas de proveedor | Ambos | Imprescindible | Micro: carga simple para costear y saldar. |
| Orden de compra | Empresa | Imprescindible | Micro rara vez la usa formalmente. |
| Recepción de mercadería (goods receipt) que actualiza stock y costo | Empresa | Imprescindible | Vincula OC → recepción → factura. |
| Gestión de proveedores (datos, condiciones, historial) | Ambos | Importante | Micro: agenda básica; Empresa: ficha completa. |
| Costeo de inventario (precio promedio ponderado / última compra) | Ambos | Imprescindible | Base para margen y reposición. FIFO como opción Empresa. |
| Costos de importación / gastos asociados (landed cost) | Empresa | Futuro | Solo para importadores. |
| Sugerencia de reposición / punto de pedido (mini-MRP) | Empresa | Importante | Basado en stock mínimo y lead time. **[SUPUESTO]** el segmento no necesita MRP completo. |
| Circuito de pago a proveedores (órdenes de pago, retenciones aplicadas) | Empresa | Importante | Integra con FI. |

### SD — Ventas / Distribución

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| POS / venta mostrador rápida (teclado, lector de código, táctil) | Micro (Empresa lo hereda) | Imprescindible | Estilo Apple: pocas pantallas, cero fricción. |
| Factura electrónica ARCA emitida desde la venta | Ambos | Imprescindible | Ticket/Factura B a consumidor final, A entre RI. |
| Remito (nota de entrega) que descuenta stock | Empresa | Imprescindible | Circuito remito → factura. |
| Listas de precios múltiples (minorista, mayorista, por cliente) | Ambos | Importante | Micro: al menos lista base + descuento. |
| Presupuestos / cotizaciones | Empresa | Importante | Cotización → pedido → factura. |
| Pedidos de venta con reserva de stock y fecha de entrega | Empresa | Importante | Distribución y venta con entrega diferida. |
| Notas de crédito / débito de venta (devoluciones) | Ambos | Imprescindible | Reversa asiento y stock. |
| Descuentos, promociones y combos | Micro | Importante | Gastronomía y retail chico los usan intensamente. |
| CRM básico (ficha de cliente, historial de compras) | Ambos | Importante | Micro: fidelización simple; Empresa: seguimiento comercial. |
| Vendedores / comisiones | Empresa | Futuro | Retail con fuerza de venta. |
| Integración e-commerce (Tiendanube / Mercado Libre) | Empresa (Micro futuro) | Futuro | Sincroniza catálogo y stock. **[SUPUESTO]** demanda creciente. |

### WM — Depósito / Logística

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Stock básico en tiempo real (un depósito) | Micro | Imprescindible | Alta/baja por venta y compra. |
| Múltiples depósitos / sucursales con stock por ubicación | Empresa | Imprescindible | Retail multi-sucursal es caso central. |
| Transferencias entre depósitos/sucursales | Empresa | Imprescindible | Con remito de traslado. |
| Stock por lote y vencimiento | Empresa (Micro donde aplique) | Importante | Alimentos, farmacia, cosmética. Micro: solo rubros con vencimiento. |
| Números de serie | Empresa | Futuro | Electro, tecnología, garantías. |
| Ajustes de inventario / recuento físico | Ambos | Imprescindible | Diferencias de arqueo de stock. |
| Ubicaciones (bin locations) dentro del depósito | Empresa | Futuro | Solo depósitos grandes; no lo necesita el sub-B1 típico. |
| Control de stock mínimo / alertas de faltante | Ambos | Importante | Micro: alerta simple; Empresa: ligado a reposición. |
| Trazabilidad / remito electrónico sectorial (cárnico, granos) | Empresa | Futuro | Rubros regulados específicos. |

### QM — Calidad

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Control de vencimientos y bloqueo de mercadería vencida | Empresa (Micro rubros perecederos) | Importante | Sustituto pragmático de QM para el segmento. |
| Registro de mermas / desperdicio (gastronomía, frescos) | Micro | Importante | Bistrosoft y Tango Restô lo cubren vía recetas. |
| Inspección de recepción (aprobar/rechazar lote) | Empresa | Futuro | Solo manufactura/distribución con control. |
| Planes de inspección formales | — | Futuro | Fuera de alcance sub-B1. En SAP B1 es add-on; en S/4 es nativo. |

> **Lectura estratégica:** para el segmento argentino sub-B1, "calidad" se traduce en control de vencimientos y mermas, no en inspección industrial. No construir QM formal.

### HR — Personal / Sueldos

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Legajos de empleados (datos, categoría, alta temprana) | Empresa | Importante | Base de personal. |
| Liquidación de sueldos (recibos, aportes, contribuciones, ART, SAC) | Empresa | Futuro (evaluar) | Alta complejidad y volatilidad normativa (paritarias). **[SUPUESTO]** conviene integrar con solución de sueldos existente antes que construir. |
| Control de presentismo / turnos del personal | Micro | Importante | Estética, gastronomía, servicios: agenda de staff. |
| Comisiones y propinas | Micro | Importante | Gastronomía y retail. |
| Gestión de talento / evaluaciones | — | Futuro | Fuera de alcance. |

> **Lectura estratégica:** Sueldos es el área donde incluso SAP delega (B1 vía add-on, S/4 vía SuccessFactors). Recomendación: **no construir liquidación propia en el MVP**; integrar o postergar. Tango sí liquida sueldos y es un diferencial fuerte de su edición Estudios Contables.

### PM — Mantenimiento

| Capacidad concreta (aterrizada a AR) | Producto | Prioridad | Nota |
|---|---|---|---|
| Órdenes de servicio / reparación (service, no planta) | Empresa | Futuro | Talleres, service técnico, garantías. B1 lo cubre con módulo Service. |
| Ficha de equipo / activo del cliente (nº de serie) | Empresa | Futuro | Postventa técnica. |
| Mantenimiento preventivo de equipos propios | — | Futuro | Fuera de alcance sub-B1. |

> **Lectura estratégica:** PM es prácticamente irrelevante para el segmento objetivo. SAP B1 ni siquiera tiene PM nativo (usa Service + add-ons). No priorizar.

---

## 2. Mapa de módulos por producto (y motor compartido)

Aunque **Micro** y **Empresa** son **productos separados** (código, UX y precio distintos), comparten un **núcleo técnico común** para no duplicar el trabajo más costoso y sensible: la integración fiscal y el stock.

```
                    ┌─────────────────────────────────────────┐
                    │        MOTOR COMPARTIDO (core)          │
                    │  • Facturación electrónica ARCA (WSAA,  │
                    │    WSFEV1/WSFEX, CAE, cond. IVA receptor)│
                    │  • Motor de stock (altas/bajas, costeo) │
                    │  • Caja / medios de pago (efvo, QR,      │
                    │    tarjeta, transferencia, Mercado Pago) │
                    │  • Maestros: clientes, productos, CUIT/  │
                    │    padrón ARCA                           │
                    └───────────────┬─────────────────────────┘
                                    │
             ┌──────────────────────┴──────────────────────┐
             │                                             │
   ┌─────────▼───────────┐                     ┌───────────▼─────────────┐
   │   COMERCIO MICRO     │                     │     PyME / EMPRESA       │
   │  (simple, Apple-like)│                     │  (profundidad tipo ERP)  │
   ├──────────────────────┤                     ├──────────────────────────┤
   │ • POS venta mostrador│                     │ • SD completo: remito,   │
   │ • Catálogo simple    │                     │   pedido, listas precios,│
   │ • Stock básico       │                     │   presupuesto            │
   │ • Clientes + cta cte  │                    │ • MM: OC, recepción,     │
   │   simple             │                     │   proveedores, reposición│
   │ • Caja / arqueo      │                     │ • WM: multi-depósito,    │
   │ • Facturación ARCA   │                     │   transferencias, lote/  │
   │ • Reportes simples   │                     │   vencimiento            │
   │ • Turnos/agenda      │                     │ • FI: cta cte prov, IVA, │
   │   (servicios)        │                     │   retenc/percep, banco,  │
   │ • Mesas/comandas/    │                     │   cheques, contabilidad  │
   │   delivery (gastro)  │                     │ • Multi-sucursal / roles │
   │                      │                     │ • HR básico (legajos,    │
   │                      │                     │   turnos) — sueldos:     │
   │                      │                     │   integrar/futuro        │
   └──────────────────────┘                     └──────────────────────────┘
```

**Módulos del producto Micro:** POS, Catálogo, Stock básico, Clientes + cuenta corriente simple, Caja/arqueo, Facturación electrónica ARCA, Reportes simples. Verticales opcionales: **Turnos** (servicios/estética) y **Mesas/Comandas/Delivery** (gastronomía).

**Módulos del producto Empresa:** todo el motor compartido + Ventas/Distribución completo (SD), Compras/Abastecimiento (MM), Depósito multi-sucursal (WM), Finanzas/Contabilidad profunda (FI: cuenta corriente proveedores, libro IVA, retenciones/percepciones, conciliación bancaria, cheques), gestión multi-sucursal con roles y permisos, y HR básico.

**Qué comparten motor (aunque sean productos separados):**
1. **Facturación electrónica ARCA** — la integración WSAA/WSFEV1/WSFEX + CAE + campo condición IVA receptor se construye una vez y se consume desde ambos. Es lo más caro de mantener por los cambios normativos; centralizarlo es la decisión de arquitectura más importante.
2. **Motor de stock** — altas/bajas, costeo (precio promedio), ajustes. Micro usa un subconjunto (un depósito); Empresa activa multi-depósito, lote y vencimiento sobre el mismo motor.
3. **Caja y medios de pago** — efectivo, tarjeta, transferencia, QR/MODO/Mercado Pago, con conciliación de acreditaciones.
4. **Maestros comunes** — clientes, productos, validación de CUIT/padrón ARCA.

---

## 3. Industrias objetivo, modelos de negocio y operaciones a probar

Para cada industria se listan los **modelos y operaciones que el ERP debe poder ejecutar** y que deben **probarse explícitamente** (casos de prueba de aceptación).

| Industria | Producto | Modelo de negocio / operación a ejecutar | Casos que hay que PROBAR |
|---|---|---|---|
| **Kiosco / autoservicio / almacén** | Micro | Venta mostrador de alto volumen y bajo ticket; efectivo + QR; reposición frecuente | Venta rápida por código de barras; arqueo de caja al cierre; corte de stock y alerta de faltante; Factura B/ticket con CAE. |
| **Carnicería / verdulería / fiambrería (frescos)** | Micro | Venta por peso; productos con vencimiento y merma; fiado a clientes del barrio | Venta por peso/balanza **[SUPUESTO integración balanza]**; control de vencimiento; registro de merma; cuenta corriente de cliente con saldo. |
| **Estética / peluquería / servicios profesionales** | Micro | Turnos con profesional asignado; cobro por servicio + venta de productos; señas | Agenda de turnos por profesional; cobro mixto servicio+producto; comisiones del staff; recordatorio de turno **[SUPUESTO]**. |
| **Gastronomía chica (bar, café, resto)** | Micro | Salón con mesas/comandas + mostrador + delivery; cocina; propinas | Abrir/cerrar mesa; comanda a cocina (KDS); división de cuenta; delivery con integración PedidosYa/Rappi; descuento de ingredientes por receta; factura/ticket con CAE. |
| **Retail chico (indumentaria, regalería, librería)** | Micro | Venta con variantes (talle/color); listas de precio; promociones | Producto con variantes; lista minorista + descuento; cambio/devolución con nota de crédito; cierre de caja. |
| **Retail / cadena multi-sucursal** | Empresa | Varias sucursales con stock propio; transferencias; precios centralizados; consolidación | Stock por sucursal; transferencia con remito; lista de precios central; reporte consolidado multi-sucursal; roles por sucursal. |
| **Distribuidora / mayorista** | Empresa | Venta con reparto; remito → factura; cuenta corriente amplia; listas mayoristas | Pedido → remito → factura; ruteo/reparto **[SUPUESTO fase 2]**; cuenta corriente con vencimientos; percepciones IIBB por jurisdicción. |
| **Comercio con cuenta corriente + fiado (ferretería, corralón)** | Empresa | Venta mostrador + cuenta corriente robusta; presupuestos; proveedores | Presupuesto → pedido → factura; cuenta corriente cliente y proveedor; cheques en cartera; retenciones a proveedores. |
| **Importador / mayorista con costos** | Empresa | Costeo con gastos de importación; múltiples proveedores | Landed cost; costeo FIFO; OC → recepción → factura; multi-moneda **[SUPUESTO fase 2]**. |
| **Manufactura liviana / producción simple** | Empresa (futuro) | Producción por receta/BOM simple; consumo de insumos | Lista de materiales simple; orden de producción; descuento de insumos. *(Roadmap, no MVP.)* |

---

## 4. GAPS y aprendizajes competitivos

**Lo que Tango cubre bien y debemos igualar (producto Empresa):**
- **Profundidad fiscal/contable argentina**: libros IVA, retenciones/percepciones, cuentas corrientes, conexión directa a ARCA sin intermediarios ni costo extra. Es la razón principal por la que la PyME argentina elige Tango. **Igualar esto no es opcional para el producto Empresa.**
- **Sueldos integrados** (liquidación, aportes, ART, legajos) — diferencial fuerte de Tango, especialmente vía su edición Estudios Contables. Aquí GSG puede optar por **integrar** en lugar de construir (ver §1 HR).
- **Ediciones por vertical** (Gestión, Punto de Venta, Restô, Estudios) sobre un núcleo común: valida nuestra estrategia de dos productos + motor compartido.

**Lo que Bistrosoft cubre bien y debemos igualar (producto Micro, gastronomía):**
- **Simplicidad y velocidad Android-first**, todo-incluido (hardware + software + soporte 24h), sin permanencia. El bajo compromiso y la usabilidad son su ventaja.
- **Integraciones nativas de delivery y pago**: PedidosYa, Rappi, Uber Eats, Mercado Pago, MODO. En gastronomía y retail chico argentino, esto es tabla estacas.
- **Comandas digitales + KDS + recetas/mermas + menú digital/tienda online**: el circuito gastronómico completo con UX moderna.

**Dónde está el hueco de mercado (sub-SAP-B1):**
1. **Precio y curva de adopción.** SAP B1 arranca en USD ~95–250/usuario/mes + implementación de miles de dólares. Tango es potente pero pesado, con canal de revendedores y curva de aprendizaje. **Hueco: un producto Empresa con el 80% de la profundidad fiscal/contable de Tango, con UX moderna, precio en pesos accesible y onboarding autoservicio.**
2. **UX moderna en el segmento Empresa.** Tango es funcionalmente profundo pero su experiencia es percibida como anticuada por dueños jóvenes. **Hueco: profundidad ERP con estética/simplicidad tipo Apple.**
3. **Un solo proveedor que cubra Micro→Empresa.** Bistrosoft es solo gastronomía; Tango es amplio pero fragmentado en ediciones y revendedores. **Hueco: una plataforma GSG que acompañe al comercio desde kiosco hasta PyME multi-sucursal sin cambiar de proveedor ni migrar datos** (mismo motor de facturación y stock).
4. **Verticales de servicios (turnos + cobros)** están mal atendidas por ambos: Tango es débil en agenda de servicios y Bistrosoft es solo gastronomía. **Hueco claro para el Micro en estética/salud/servicios profesionales.**

---

## 5. MVP vendible por producto y orden de construcción

### Producto Micro — MVP vendible

**Conjunto mínimo para vender:** POS de venta rápida + Catálogo + Stock básico (un depósito) + Clientes con cuenta corriente simple + Caja/arqueo + **Facturación electrónica ARCA con CAE** + Reportes simples (ventas del día, ranking de productos, arqueo).

Con eso, un kiosco, un retail chico o un comercio de barrio ya opera legalmente y cierra caja. **Es vendible el día uno** a los rubros más simples.

**Orden de construcción (Micro):**
1. Motor compartido: **facturación electrónica ARCA** (WSAA + WSFEV1 + CAE + condición IVA receptor) + maestros (clientes/productos/CUIT).
2. **POS + Caja/arqueo + medios de pago** (efectivo, tarjeta, QR/Mercado Pago).
3. **Stock básico** + catálogo + reportes simples.
4. **Cuenta corriente de clientes** simple.
5. Vertical **Gastronomía** (mesas/comandas/KDS/delivery + integraciones PedidosYa/Rappi/Mercado Pago) — desbloquea el segmento donde compite Bistrosoft.
6. Vertical **Servicios** (turnos por profesional + cobros + comisiones) — hueco desatendido.

### Producto Empresa — MVP vendible

**Conjunto mínimo para vender:** motor compartido + **SD** (remito, pedido, listas de precios, notas de crédito/débito) + **MM** (orden de compra, recepción, proveedores, costeo) + **WM** (multi-depósito + transferencias) + **FI** con la profundidad fiscal argentina que la PyME exige: **cuenta corriente de proveedores, libro IVA compras/ventas (soporte IVA Simple), retenciones/percepciones nacionales, conciliación bancaria, gestión de cheques** + gestión **multi-sucursal con roles**.

Sin la profundidad fiscal (retenciones/percepciones, libro IVA, cuenta corriente proveedores) **el producto Empresa no compite con Tango y no es vendible**. Ese es el piso.

**Orden de construcción (Empresa):**
1. Reutilizar motor compartido (facturación ARCA, stock, caja, maestros).
2. **SD completo** (remito → factura, pedidos, listas de precios, NC/ND).
3. **MM** (OC → recepción → factura, proveedores, costeo, cuenta corriente de proveedores).
4. **WM multi-depósito** + transferencias + lote/vencimiento.
5. **FI profundo**: libro IVA, retenciones/percepciones nacionales, conciliación bancaria, cheques. *(IIBB provincial y Convenio Multilateral como incremento.)*
6. **Multi-sucursal + roles/permisos** + reportes consolidados.
7. HR básico (legajos/turnos); **Sueldos: integrar o postergar.**

**Secuencia entre productos [SUPUESTO / recomendación]:** construir **Micro primero** (menor superficie, ciclo de venta más corto, valida el motor de facturación ARCA que es el activo compartido más valioso), y con ese motor probado en producción, escalar al **Empresa**. El motor de facturación curtido con miles de comprobantes reales es el mejor de-risking para el producto de mayor exigencia.

---

## Resumen ejecutivo

GSG debe construir **dos productos separados sobre un mismo motor**: **Comercio Micro** (simple, estilo Apple, para kioscos, frescos, gastronomía chica, servicios y retail chico) y **PyME/Empresa** (profundidad tipo ERP para quien no puede pagar SAP Business One). La regla es el 20% de cada área SAP que da el 80% del valor en Argentina: en la práctica, eso significa **FI, MM, SD y WM sí; QM, HR-Sueldos y PM casi no**. El activo compartido más crítico y más caro de mantener es la **integración fiscal con ARCA** (WSAA/WSFEV1/WSFEX, CAE, campo condición IVA del receptor obligatorio desde julio 2025, migración a IVA Simple), que debe construirse una sola vez y consumirse desde ambos productos, junto con el motor de stock y la caja. El benchmark del **Micro es Bistrosoft** (simplicidad Android-first, integraciones de delivery/pago, bajo compromiso) y el del **Empresa es Tango** (profundidad fiscal/contable y base instalada). El hueco de mercado es nítido: **la profundidad de Tango con UX moderna y precio en pesos accesible, y un único proveedor que acompañe al comercio desde kiosco hasta PyME multi-sucursal** sin migrar de sistema. Para calidad, el segmento solo necesita **control de vencimientos y mermas**, no QM industrial; para sueldos, conviene **integrar antes que construir**; mantenimiento (PM) es irrelevante. El **MVP de Micro** (POS + stock + caja + cuenta corriente + facturación ARCA + reportes) es vendible casi de inmediato; el **MVP de Empresa** no es vendible sin la profundidad fiscal argentina (retenciones/percepciones, libro IVA, cuenta corriente de proveedores). Recomendación de secuencia: **construir Micro primero** para curtir el motor de facturación en producción y luego escalar al Empresa, agregando verticales de gastronomía y servicios donde el hueco competitivo es mayor.

---

## Fuentes

**SAP Business One y S/4HANA Public Cloud**
- SAP Business One — features: https://www.sap.com/products/erp/business-one/features.html
- SAP B1 Financial Management (Top10ERP): https://www.top10erp.org/products/sap-business-one/financial-management
- SAP B1 Materials Management (Top10ERP): https://www.top10erp.org/products/sap-business-one/materials-management
- SAP B1 Sales & A/R documents (Firebear): https://firebearstudio.com/blog/sap-business-one-in-depth-review-sales-and-accounts-receivable-documents.html
- SAP B1 módulos (Seidor): https://www.seidor.com/en-sa/blog/guide-modules-sap-business-one
- SAP B1 QM add-on (Praxis): https://praxisinfosolutions.com/blog/manufacturing-quality-management-in-sap-business-one/
- SAP B1 HR/Personal (SAP Help): https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/44ac2bc1d8545af0e10000000a11466f.html
- SAP B1 pricing (Top10ERP): https://www.top10erp.org/products/sap-business-one/pricing · (ERP Research): https://www.erpresearch.com/pricing/sap-business-one
- S/4HANA Public Cloud Financials (ERP Research): https://www.erpresearch.com/erp/sap-s4-hana-public-cloud/financial-management
- S/4HANA Public Cloud Feature Scope Description: https://help.sap.com/doc/7c9e0bbbd1664c2581b2038a1c7ae4b3
- S/4HANA módulos (ERP Research): https://www.erpresearch.com/en-us/sap-s/4-hana-modules
- SAP B1 Argentina Electronic Invoice (RG 2904): https://userapps.support.sap.com/sap/support/knowledge/en/2370724
- SAP Document and Reporting Compliance — Argentina: https://help.sap.com/docs/cloud-edition/sap-document-and-reporting-compliance-cloud-edition/e-invoices-sap-s-4hana-cloud-argentina

**Tango (Axoft / Softland)**
- Axoft — sitio y soluciones: https://www.axoft.com/
- Tango software para gastronomía (Restô): https://www.axoft.com/tango/software-para-gastronomia-restaurant/soluciones/
- Tango Punto de Venta: https://www.axoft.com/tango/software-para-punto-venta/
- Tango Estudios Contables (Sueldos): https://www.axoft.com/tango/software-para-estudios-contables/soluciones/sueldos.php
- Tango Nexo / Tiendas: https://www.tangonexo.com/tiendas/
- Novedades Delta 3/4 (Grupo Tesys / Tecnar): https://grupotesys.com.ar/tango-gestion/tango-software-delta3-novedades

**Bistrosoft**
- Bistrosoft AR: https://bistrosoft.com/ar/bistrosoft/
- Bistrosoft precios: https://bistrosoft.com/ar/precios/
- Bistrosoft integraciones: https://bistrosoft.com/optimiza-tu-negocio-gastronomico-con-bistrosoft-ultimas-integraciones/

**Marco fiscal ARCA (ex-AFIP)**
- Decreto 953/2024 — creación de ARCA (Boletín Oficial): https://www.boletinoficial.gob.ar/detalleAviso/primera/316055/20241025
- Webservices de Factura Electrónica (ARCA): https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp
- Manual del Desarrollador ARCA COMPG v4.0: https://www.afip.gob.ar/fe/documentos/manual-desarrollador-ARCA-COMPG-v4-0.pdf
- Tipos de comprobantes en ARCA (Contagram): https://contagram.com/tipos-de-comprobantes-electronicos-en-arca-y-cuando-corresponde-usarlos/
- RG 5616/2024 — condición IVA del receptor (Intec): https://www.intecsoft.com.ar/noticias/resolucion-general-5616-2024/
- Libro IVA Digital → IVA Simple (RG 5707/2025, Contadores en Red): https://contadoresenred.com/resolucion-general-5707-2025/
- Controladores fiscales y FE 2025 (Zetek): https://www.zetek.com.ar/content/facturacion-electronica-y-uso-de-controlador-fiscal.html
- FCEM — monto mínimo (ARCA): https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4769
- Regímenes IIBB / Convenio Multilateral (ARBA): https://www.arba.gov.ar/Informacion/Agentes/Recaudacion/regimenes.asp
- Categorías Monotributo (ARCA): https://www.afip.gob.ar/monotributo/categorias.asp

> *Nota metodológica:* los umbrales monetarios (FCEM, categorías de Monotributo, padrones IIBB) se actualizan por inflación y deben tratarse como **parámetros configurables**, verificados contra ARCA al momento de construir. Las capacidades de SAP B1 en Argentina las entrega el partner local (localización), por lo que la comparación de profundidad fiscal se apoya en fuentes de partners y documentación de ARCA.
