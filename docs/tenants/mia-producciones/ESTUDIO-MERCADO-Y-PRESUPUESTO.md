# Mia Producciones: estudio de mercado y presupuesto del sistema

**Fecha:** 2026-11-02 · **Estado:** borrador para el dueño, no para enviar todavía · **Dólar:** $1.450 *(provisional a confirmar)*

> **Supuesto de rubro *(provisional a confirmar)*.** En el repo no hay nada sobre Mia Producciones, y la web
> tampoco da un perfil claro. Este estudio supone que es una **productora de eventos y espectáculos**:
> fiestas, casamientos, 15, corporativos y shows, quizás con alquiler de sonido, iluminación y staff.
> Si es una productora audiovisual o de contenido, cambian los competidores (sección 2), pero el método y los
> valores de desarrollo (sección 3) siguen sirviendo.

> **Confiabilidad de las cifras.** La red de la sesión no permitió abrir las páginas de los proveedores.
> Los precios salen de los extractos del buscador sobre los dominios oficiales, marcados `[OFICIAL-B]`, o de
> agregadores, marcados `[INFERIDO]`. **Antes de cotizarle al cliente, hay que reconfirmar los 4 o 5 precios
> que sostienen la propuesta** (Brinden, HoneyBook, Rentman, Nexosmart, Tango).

---

## 1. Conclusión en una línea

Proponemos **una implementación de USD 3.500 (~$5.075.000) más un abono de $190.000 por mes + IVA, con ajuste
trimestral por IPC**. Queda en la parte baja de lo que cobra el mercado por un sistema de varios módulos y
por debajo de la combinación de herramientas que hoy usaría una productora. Además trae lo que ningún
competidor tiene junto: **factura ARCA, Mercado Pago o transferencia, y WhatsApp.**

---

## 2. Qué software usa hoy una productora, y cuánto paga

### 2.1 Competencia directa (USD/mes; dólar $1.450)

| Producto | Para quién | USD/mes | Marca |
|---|---|---|---|
| **Brinden** (AR) | Salones: agenda, presupuesto PDF, caja | ~21 ($30.000; anual $300.000; +50 % por sucursal) | OFICIAL-B |
| Booqable | Alquiler de equipos | 29–149 | INFERIDO |
| Dubsado | Planners: CRM, contratos, cobros | 35–55 | OFICIAL-B |
| HoneyBook | Planners: CRM, contratos, portal del cliente | 36–129 | OFICIAL-B |
| Aisle Planner | Bodas | 70–230 | INFERIDO |
| Event Temple | Salones (contrato anual) | 109–199 | INFERIDO |
| Rentman | Equipos + staff de producción | ~€150 (3 usuarios) | OFICIAL-B |
| Current RMS | Alquiler + servicios | ~190 (3 usuarios) | OFICIAL-B, posiblemente viejo |
| Planning Pod | Salones y planners | 199–319 | OFICIAL-B |
| Perfect Venue | Salones | 239–339 | OFICIAL-B |
| Tripleseat | Salones | 375+ por salón | INFERIDO |

Las ticketeras cobran comisión por entrada, sin abono: Eventbrite AR cobra 5,99–6,99 % más el procesamiento,
Alpogo 15–20 % y Fanz 5–10 % `[OFICIAL-B / INFERIDO]`. En Passline paga el comprador.

### 2.2 Lo que pagaría una pyme argentina por un genérico (ARS/mes + IVA)

| Producto | ARS/mes | Marca |
|---|---|---|
| Alegra | 19.999–79.999 | INFERIDO |
| Xubio | 123.100–375.900 | INFERIDO |
| Colppy | 128.500–310.900 | INFERIDO |
| Tango Nube | ~731.000 (6 meses mínimo) | INFERIDO |
| Bitrix24 (CRM) | USD 69–289 | OFICIAL-B |

### 2.3 Lectura

- **Lo que trae todo el mercado:** cotizador, contrato con firma, seña o cuotas online, calendario que
  avisa la doble reserva, CRM de consultas, portal del cliente y reportes.
- **Lo que sólo traen los de alquiler** (Rentman, Booqable, Current RMS): stock de equipos y turnos del staff.
- **Lo que nadie resuelve para Argentina:**
  - Los globales cobran con Stripe, que no opera para comercios argentinos, y no emiten factura ARCA.
  - Los argentinos que facturan no gestionan eventos.
  - Brinden cobra en pesos, pero es para salones, no para productoras.
  - Ninguno tiene WhatsApp de verdad.
- **Cuánto se paga hoy.** Una productora chica o mediana que arma su combinación (CRM de eventos, alquiler
  de equipos y facturación argentina) paga **USD 150–330 por mes, unos $220.000–480.000**. El piso
  (Brinden o Dubsado) es USD 20–60 y el techo (Perfect Venue o Tango) USD 340–500.

---

## 3. Cuánto cuesta construirlo a medida en Argentina

### 3.1 Valor hora 2026 `[extractos del buscador]`

| Perfil | USD/h |
|---|---|
| Junior nearshore | 18–28 |
| Semi senior | 28–45 |
| Senior (mediana Lemon.io) | 40 (33–45) |
| Software factory | 48–65 |

### 3.2 Proyectos comparables (precio cerrado)

| Fuente | Alcance | Setup | Mantenimiento |
|---|---|---|---|
| Nexosmart 2026 | 1 módulo / varios / ERP | USD 3.500–4.000 / 4.000–5.200 / 6.500–8.200 | USD 80–150/mes |
| Drimfix | Simple / ERP pyme | USD 3.000–7.000 / 8.000–20.000 | – |
| Neowyze (pesos, posiblemente desactualizado) | Intermedio / complejo | $1,5–4 M / $4–15 M | – |
| Prisys | – | – | Servidor USD 15–35 + soporte |

### 3.3 Estimación desde cero para este alcance `[INFERIDO]`

| Bloque | Horas |
|---|---|
| Ficha de evento: tipo, fecha, lugar, invitados, checklist, minuta del día | 40 |
| Cotizador con ítems, versiones, PDF y aceptación online | 60 |
| Contrato, plan de cuotas y ajuste | 40 |
| Reserva de equipos y staff por fecha, con aviso de doble reserva | 50 |
| Portal del cliente: ver presupuesto, pagar cuota, ver estado | 40 |
| Liquidación de staff y proveedores, rentabilidad por evento | 30 |
| Base: clientes, agenda, cobros MP, factura ARCA, WhatsApp, roles | 120 |
| Configuración, carga de datos, QA y capacitación | 30 |
| **Total** | **~410 h** |

A USD 35 por hora, **el valor de mercado desde cero ronda los USD 14.000** (rango USD 11.000–18.000), más
mantenimiento. Es la referencia del valor que el cliente recibe.

### 3.4 Por qué GSG puede cobrar menos y ganar más

El ERP ya trae el bloque «Base» de 120 h, verificado en `prisma/schema.prisma`:

- `Client`, `Appointment` y `Resource`: agenda y recursos.
- `Payment`: señas y Mercado Pago.
- `Invoice` con `src/plugins/arca`: factura.
- `AccountReceivable` / `AccountPayable` y `Supplier`.
- `CommissionPayout`: pagos al staff.
- `ConversacionWhatsapp`.
- El patrón de orden de trabajo de `TallerOrden`, reutilizable como ficha de evento.

Lo nuevo son unas 260–290 h, y el equipo es 100 % IA. El hosting es compartido por toda la flota
(`docs/estrategia/costos-por-segmento.md`: $54.000/mes en total), así que el costo marginal de un tenant
más es casi cero.

---

## 4. Cuánto puede pagar Mia Producciones `[INFERIDO]`

- Una fiesta de 15 o un casamiento de 100 personas cuesta en 2026 **$15,5–30 M** (iProfesional). El cubierto
  va de $60.000 a $160.000 por invitado.
- Supuesto: la productora hace 2–4 eventos por mes y se queda con ~10 %, o sea $4–8 M por mes de ingreso
  propio. Si destina 5–10 % a herramientas, **puede pagar entre $200.000 y $800.000 por mes.**
- No encontramos ningún dato público de facturación de productoras chicas. Hay que preguntárselo al cliente.

---

## 5. Propuesta de presupuesto (3 opciones)

Todas las opciones se cotizan con estas condiciones:

- **Moneda e impuestos:** precios en pesos + IVA. Si GSG factura como responsable inscripto y la
  productora es monotributista, el IVA no le sirve como crédito y le encarece el servicio un 21 %
  *(provisional a confirmar)*.
- **Ajuste:** el abono se ajusta cada trimestre por IPC del INDEC. La implementación se fija en USD y se
  paga en pesos al tipo de cambio del día del pago (oficial vendedor BNA).
- **Costos que paga el cliente aparte:** la comisión de Mercado Pago y las conversaciones de WhatsApp
  Business que cobra Meta.

| | **Arranque** | **Productora** ✅ recomendada | **Productora Pro** |
|---|---|---|---|
| Para | Empezar a ordenar | El día a día completo | Productora con equipos propios |
| Incluye | Clientes, agenda, cotizador simple en PDF, seña por MP, factura ARCA, WhatsApp, 2 usuarios | Todo Arranque + ficha de evento, cotizador con versiones y aceptación online, contrato y cuotas, staff y proveedores por evento, rentabilidad, 4 usuarios | Todo Productora + stock y alquiler de equipos con doble reserva, portal del cliente, venta de entradas integrada a una ticketera, 8 usuarios |
| **Implementación** | USD 1.200 (~$1.740.000) | **USD 3.500 (~$5.075.000)** | USD 6.000 (~$8.700.000) |
| **Abono mensual** | $120.000 | **$190.000** | $290.000 |
| Cómo se compara | Por encima de Brinden, con factura y MP | Debajo de la combinación típica ($220k–480k) | Al nivel de Planning Pod o Rentman, pero argentino |
| Plazo estimado | 2 semanas | 4–6 semanas | 8–10 semanas |

- **Forma de pago de la implementación:** 50 % al firmar y 50 % al entregar, o 3 cuotas.
- **Permanencia:** mínimo 12 meses, con el primer mes de abono bonificado.
- **Usuario adicional:** $12.000 por mes.

**Por qué la opción «Productora».** La implementación queda dentro del rango de un sistema de varios
módulos (USD 3.500–5.200) y es la cuarta parte del valor desde cero. El abono queda debajo de lo que la
productora pagaría juntando herramientas, y dentro de lo que puede pagar. Con 12 meses de contrato, GSG
cobra unos **$7,4 M en el primer año** con un costo marginal casi nulo.

---

## 6. Qué falta confirmar antes de mandar el presupuesto

1. **Rubro exacto** de Mia Producciones: eventos, espectáculos o audiovisual.
2. Eventos por mes, usuarios, si alquila equipos propios y si vende entradas.
3. **Condición fiscal** de Mia (monotributo o responsable inscripto) y de GSG como emisor, por el tema del IVA.
4. Dólar del día y reconfirmación de los precios de la sección 2 en las fuentes oficiales.
5. Si se muestra una demo con su marca, hace falta **autorización registrada del cliente**
   (`docs/metodologia/generador-preset-ia.md`).

## Fuentes

- Competencia:
  - brinden.com
  - honeybook.com/pricing
  - dubsado.com/pricing
  - rentman.io/pricing
  - current-rms.com/pricing
  - planningpod.com
  - perfectvenue.com (comparativas)
  - help.booqable.com
  - bitrix24.com/prices
  - eventbrite.com (tarifas para organizadores)
  - productorxs.alpogo.com
  - producers.passline.com
  - app.spomsolutions.com/blog/cuanto-cuesta-erp-argentina-2026
- Desarrollo:
  - lemon.io/rate-calculator/argentina
  - developargentina.com (salarios y costos de software factory 2026)
  - devico.io
  - nexosmart.com.ar/costos/desarrollo-sistema-gestion
  - drimfix.com
  - neowyze.tech
  - prisys.com.ar
- Rubro e impuestos:
  - iprofesional.com (costo de fiestas 2026)
  - hacecuentas.com/eventos/casamiento
  - lanacion.com.ar (REM: inflación 2026 del 20,1 %)
  - presupuestofamiliar.com.ar (escala de monotributo de agosto 2026)
- Interno:
  - `docs/estrategia/costos-por-segmento.md`
  - `docs/estrategia/comercial/documento-fundacional-comercial.md` §6
