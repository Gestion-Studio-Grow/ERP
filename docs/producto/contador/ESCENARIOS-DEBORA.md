# Escenarios de Débora — qué resuelve hoy la consola del contador

**Para qué:** Débora es la primera contadora real del producto B·Contador (ADR-076 §6, ADR-077) y
nuestra *key user*. Este documento mapea lo que ella hace **cada mes** con su cartera contra lo que
la consola (`/contador`) ya resuelve, para construir primero lo que usa siempre.

**Relevado:** 2026-10-22, sobre la rama `claude/facturacion-automatica` (código de
`src/app/contador/**`, `src/lib/cartera-*.ts`, `src/lib/contador/**`, `src/lib/cierre-mes/**`,
`src/lib/facturacion/**`). Estado: **hecho** · **a medias** · **falta**. La columna «después»
dice cómo quedó al cerrar este frente (`claude/facturacion-automatica-contador`).

> Datos de ejemplo: todo CUIT de este documento y de los tests es ficticio (dígito verificador
> válido, sin dueño real). Ningún dato de clientes de Débora entra al repo.

---

## El mes de Débora, en el orden en que lo trabaja

1. A principio de mes revisa **quién no puede facturar** y por qué (certificado, punto de venta,
   límite del plan).
2. Emite las **facturas fijas** de cada cliente (abonos: honorarios, alquileres, cuotas): *«a este
   cliente facturale todos los meses $X a Fulano»*.
3. Sube los **extractos** (banco / Mercado Pago) y deja que se facture lo automático; completa a
   mano lo que quedó para revisar.
4. Mira el **estado ante ARCA** de cada comprobante: autorizados, pendientes, rechazados — y qué
   hacer con cada rechazo.
5. Si algo salió mal, lo **anula con nota de crédito**.
6. Cuando el cliente cierra el mes, **baja el paquete** para el estudio (ventas + compras) y lo lleva
   a su sistema de liquidación.

---

## Mapa escenario → estado

| # | Escenario | Antes de este frente | Después | Dónde vive |
|---|---|---|---|---|
| 1 | **Alta de cliente** con CUIT y punto de venta | **Hecho (por pedido).** «Agregar un cliente» deja un pedido a Soporte GSG con CUIT (dígito verificador), email y punto de venta; Soporte lo configura con `provisionTenant` desde `/operador/solicitudes`. Decisión del dueño GSG-20 (26/09): *el estudio no crea negocios*. | Sin cambios (ver «Decisiones para el dueño» abajo). | `AltaCliente.tsx`, `cartera-actions.ts → altaClienteCarteraAction`, `cartera-alta-reglas.ts` |
| 2 | **Facturación automática por reglas** («todos los meses X a Y») | **Falta.** Sólo existía lo automático que sale del extracto bancario / MP. | **Hecho (v1, monotributo y exento).** Reglas de abono por cliente con alta, baja y vigencia; responsable inscripto queda bloqueado con el motivo (ENG-024, pedido al motor). | `abonos/abonos-core.ts`, `abonos/` (página y formulario), `src/lib/cartera-abonos.ts` |
| 3 | **Lote mensual** (preparar, revisar, autorizar el mes de toda la cartera) | **A medias.** «Emitir automáticas» por cliente (propuestas del banco) y «El mes» (pendientes agrupados), pero sin un lote único. | **Hecho.** `/contador/lote`: vista previa del mes de toda la cartera (qué se emite, qué ya se emitió, qué está bloqueado y por qué), un botón que emite y manda a ARCA cliente por cliente, idempotente por regla y mes. | `lote/`, `abonos/abonos-core.ts → prepararLote`, `src/lib/cartera-abonos.ts` |
| 4 | **Estado CAE** por comprobante y por cliente | **A medias.** Por cliente: cantidad de facturas del mes y rechazos (monitor). Por comprobante: sólo entrando al panel propio del cliente. | **Hecho.** Por cliente: autorizados / pendientes / rechazados del mes en el lote. Por comprobante: `/contador/cliente/[id]/comprobantes` con filtros, CAE y motivo. | `cliente/[clienteId]/comprobantes/`, reusa `src/lib/facturacion/lista.server.ts` |
| 5 | **Rechazos y reintentos** | **A medias.** El monitor marca «Rechazos»; el motivo crudo de ARCA sólo se veía en el panel del cliente. | **Hecho.** Cada rechazo dice qué pasó en criollo, qué hacer y quién lo resuelve; botón «Mandar los pendientes a ARCA» (de a tandas) y «volver a emitir» del abono rechazado vía el lote. | `rechazo-core.ts`, `comprobantes/ReintentarEnvios.tsx` |
| 6 | **Notas de crédito** | **Falta en el motor.** La decisión fiscal (`decidir-comprobante.ts`) ya sabe de NC y la lista las resta, pero ningún camino las EMITE. | **A medias.** La consola las muestra (filtro «Notas de crédito», restan en los totales) y explica cómo anular hoy; la emisión queda pedida al motor. | `PEDIDOS-AL-MOTOR.md` §1 |
| 7 | **Exportar al estudio** (CSV / paquete) | **A medias.** Paquete del mes **por cliente** (`/contador/paquete`) y compras recibidas por cliente. | **Hecho.** Además, un CSV del mes de **toda la cartera** (una fila por comprobante con cliente y CUIT), con el mismo formato que Facturación. | `exportar/route.ts`, `exportar-core.ts` |
| 8 | **Multi-cliente con aislamiento** | **Hecho.** Toda lectura de un cliente va por `tenantTransaction(clienteTenantId)` tras verificar la cartera; jamás `operatorPrisma`. | Sin cambios; todo lo nuevo sigue la misma regla (ver GATE.md, bloque 3). | `cartera-core.ts`, `src/lib/cartera-gate.ts` |
| 9 | Quién no puede facturar / qué vence | **Hecho.** Monitor + «El mes». | Sin cambios. | `MonitorBandeja.tsx`, `mes-core.ts` |
| 10 | Compras recibidas (Libro IVA compras) | **Hecho.** Importa «Mis Comprobantes Recibidos» por cliente. | Sin cambios. | `cliente/[clienteId]/recibidos/` |

---

## Reglas de negocio que se fijaron (para que nadie las rediscuta)

- **Una regla de abono = un comprobante por mes y por regla.** La llave es (regla, mes), se
  chequea y se escribe **en la misma transacción del cliente** que crea la factura, con candado.
  Dos clics, dos pestañas o dos personas del estudio no emiten dos veces.
- **Si ARCA rechazó la factura del abono, el lote la vuelve a ofrecer** («volver a emitir»). Si
  está pendiente o autorizada, no.
- **La fecha del comprobante es el día en que se emite** (hora argentina), así nunca cae fuera del
  plazo de ARCA (5 días bienes / 10 servicios). En servicios va el período del mes facturado
  (desde / hasta) y el vencimiento de pago a los días que diga la regla.
- **Sólo Factura C por ahora** (monotributo y exento). Para un responsable inscripto el sistema
  todavía no discrimina IVA por renglón (ENG-024): la regla se guarda pero el lote la muestra
  bloqueada con el motivo, nunca emite algo que ARCA va a rechazar.
- **El lote respeta el límite de facturas automáticas del plan** del cliente (la misma cuenta que
  frena la emisión del banco).
- **Cliente pausado = no se le emite nada.** La regla queda, el lote la muestra como «en pausa».

## Decisiones para el dueño

1. **Alta directa vs. pedido.** El pedido de este frente decía «alta con `provisionTenant`»; la
   orden vigente (GSG-20, 26/09) es que el estudio **no crea negocios** y que Soporte GSG configura
   el pedido. Se respetó la orden vigente. Si el dueño quiere que Débora dé de alta sola, el core ya
   existe (`crearClienteProvisioning` en `cartera-core.ts`) y es un cambio chico — pero reabre el
   motivo de GSG-20 (no revelar si un CUIT ya existe en la plataforma).
2. **Dónde viven las reglas de abono.** Sin migración (Gate 2), se guardan como filas de auditoría
   del estudio (mismo molde que el pedido de alta). Es correcto y auditable, pero la tabla propia
   (`ReglaFacturacion`) es lo prolijo: está pedida en `PEDIDOS-AL-MOTOR.md` §3.

— Elaborado por GSG
