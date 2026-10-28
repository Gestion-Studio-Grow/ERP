# Motor de facturación — contrato para la consola (y para cualquier otro llamador)

Lo que el motor ofrece, dónde vive y qué garantiza. Rama: `claude/facturacion-automatica-motor`.
Diagnóstico y decisiones: `docs/producto/motor-facturacion/DIAGNOSTICO.md`.

## Reglas que valen para todo

- **`tenantId` siempre explícito.** Todo corre parado en el negocio (`tenantTransaction`, RLS) y
  con el predicado `tenantId` en la consulta. La consola del contador llama **por cliente**, con el
  `tenantId` del cliente, después de verificar la cartera (ADR-077 §4). Nunca `operatorPrisma`.
- **Nunca dos CAE para el mismo comprobante.** La factura nace `PENDING` con su envío en el outbox
  (misma transacción). El despacho anota el número ANTES de pedirlo; si la respuesta se pierde
  («en duda»), el reintento consulta a ARCA (`FECompConsultar` + último autorizado) y adopta ese
  número en vez de pedir otro (ENG-020).
- **Los errores de dato vuelven en criollo** (`{ ok: false, error }`), no como excepción.

## Emitir

| Función | Módulo | Qué hace |
|---|---|---|
| `createInvoice(input)` / `createInvoiceInTx(tx, input)` | `src/lib/invoice-core.ts` | Crea la factura PENDING y encola su envío. Con `origin` es **idempotente**: el mismo origen devuelve la misma factura (también con dos pedidos a la vez: lo impone un índice único en la base). |
| `claveDeAbono(reglaId, "AAAA-MM")` | `invoice-core.ts` | La clave del origen `ABONO`. Lanza si no tiene la forma `<regla>:<AAAA-MM>`. |
| `crearNotaDeCreditoInTx(tx, input)` / `crearNotaDeCredito(input)` | `invoice-core.ts` | Nota de crédito asociada a una factura AUTORIZADA (pedido 1). |
| `montosDeRenglones(condicionIva, renglones)` | `src/lib/facturacion/renglones.ts` | Neto/IVA/total por renglón con su alícuota, para un abono de Responsable Inscripto (pedido 4). |

### `CreateInvoiceInput` — lo nuevo

```ts
origin?: { type: "ORDER" | "APPOINTMENT" | "MP_PAYMENT"; id: string }
       | { type: "ABONO"; id: string /* claveDeAbono(reglaId, mes) */ };   // pedido 2
descripcion?: string;   // «Honorarios de octubre» → Invoice.descripcion (PDF/CSV), no viaja a ARCA. Pedido 5
clase?: "factura" | "nota_credito";  asociado?: {...}   // sólo los usa crearNotaDeCreditoInTx
```

Con `origin: ABONO`, `reabrirSiRechazada: true` resuelve «volver a emitir» un abono rechazado
(misma fila, envío nuevo). **Se cae en la consola:** `emisionesPreviasEnTx` y las filas
`cartera.abono.emitido` como guarda de idempotencia (pueden quedar como auditoría).

> ⚠️ `abonoClave`, `descripcion` y `ReglaFacturacion` necesitan las migraciones
> `20261022140000_invoice_abono_descripcion` y `20261022140100_regla_facturacion` (**Gate 2, sin
> aplicar**). Hasta que el dueño las aplique, la consola sigue con su adaptador.

### Nota de crédito

```ts
crearNotaDeCreditoInTx(tx, {
  tenantId, facturaId,
  importe?,          // sin él: todo lo que queda por anular
  motivo,            // obligatorio; va a la descripción de la nota
  fecha,             // AAAAMMDD o AAAA-MM-DD (el día)
  fechaDeEnvio?,     // default: fecha
}) → { ok: true, invoiceId } | { ok: false, error }
```

- Toma la fila de la factura `FOR UPDATE` y suma las notas vivas (PENDING/AUTHORIZED): **dos
  pedidos a la vez nunca anulan más de lo facturado**.
- Usa los datos con que la factura viajó a ARCA (su envío) y prorratea al centavo
  (`nota-credito-core.ts`): neto + IVA = importe; las bases suman el neto.
- Valida con `decidirComprobante` (misma letra, mismo receptor, saldo, fechas). Lo que no queda
  «lista» vuelve con el motivo.
- Encola el envío como cualquier factura (CbtesAsoc). El tipo (3/8/13) lo decide el plugin con la
  letra de la factura y queda guardado al autorizar.

## R1 · Una factura por cobro (`src/lib/facturacion/cobros-facturados.ts`)

Todo disparador que factura un cobro lo hace con su **clave** y queda anotado en `CobroFacturado`
(`@@unique([tenantId, clave])`: el mismo cobro no se factura dos veces, ni con dos disparadores a la vez).

| Clave | Quién | Qué factura |
|---|---|---|
| `mp:<pago>` | aviso de MP (`facturarCobroMPDelTurno`), `facturarPagoMP` | ese pago (la seña de un turno, o una venta suelta) |
| `turno:<turno>` | completar el turno (`facturarAppointment`) | lo cobrado menos lo que MP ya facturó de ese turno (`pendienteDelTurno`) |
| `banco:<hash>` | extracto (`emitirPropuestas`) | el crédito, salvo que su clave o `mp:<referencia>` ya estén facturados |

| Función | Qué hace |
|---|---|
| `facturarCobros(input, cobros)` / `facturarCobrosInTx` | Si alguno de esos cobros ya tiene factura viva, la devuelve; si no, la crea y anota los cobros. Ante la carrera (P2002) reintenta una vez y devuelve la del ganador. |
| `vincularCobro(tenantId, cobro, invoiceId)` | Anota que un cobro ya está cubierto por una factura existente. |
| `cobrosYaFacturados(tenantId, claves)` | Las facturas vivas que ya cubren esas claves. |
| `pendienteDelTurno({...})` | La cuenta pura de lo que le queda por facturar a un turno. |

Una factura RECHAZADA no cuenta: el cobro se vuelve a facturar y la fila pasa a la nueva.
Necesita la migración `20261022150000_cobro_facturado` (Gate 2, sin aplicar).

## Mandar a ARCA y mirar

| Función | Módulo | Qué hace |
|---|---|---|
| `procesarEnviosDelNegocio(tenantId, limit?, deps?, opciones?)` | `src/lib/arca-dispatch.ts` | Manda los envíos pendientes de UN negocio. |
| `processArcaOutbox(limit?)` | `arca-dispatch.ts` | Barrido de todos los negocios (sólo el cron). |
| `contarPendientesDelNegocio(tenantId)` | `arca-dispatch.ts` | Cuántas facturas esperan CAE (pedido 6). Una sola cuenta. |
| `reactivarEnvios(enTx, tenantId, invoiceIds?)` | `src/lib/arca-reserva.ts` | «Reintentar los fallidos»: saca la espera y el detenido. |

`opciones` (`OpcionesDelNegocio`):

- `ignorarEspera: true` — **lo pide una persona** («Autorizar ahora»): toma también los que esperan
  su próximo intento. El cron y los disparos de las ventas lo dejan en `false`.
- `reactivarDetenidos: true` — antes de tomar, les da un intento más a los detenidos.
- `saltear`, `alFallarPorElSistema` — como antes (`autorizar-en-tandas.ts`).

`DispatchResumen`: `procesados`, `autorizados`, `rechazados`, `fallidos`, `descartados` y, sólo si
pasan, `detenidos`, `pospuestos` y `arcaNoDisponible: true` (la corrida se cortó con ARCA caído).

### Qué pasa con un envío que falla (`src/lib/arca-reintentos.ts`)

| Clase | Ejemplo | Qué hace el motor |
|---|---|---|
| Rechazo | ARCA dijo `R`, o no pasó la validación local | Factura `REJECTED` con el motivo; no se reintenta. |
| Pasajero | timeout, HTTP 5xx, 600, 10016, 501 | Queda PENDING; espera 1, 2, 4… hasta 60 min; al 8.º intento se **detiene**. |
| ARCA no disponible | interruptor abierto | Se **pospone sin contar** intento y se corta la corrida. |
| Configuración | sin CUIT, sin certificado, delegación sin verificar | Se **detiene** de entrada (reintentar no lo arregla). |
| Sistema | la base rechazó la operación | Como pasajero, y queda en el log. |

Detenido = `OutboxEvent.muertoEn`; la factura sigue PENDING (no se sabe si ARCA la autorizaría).

### Homologación / producción por negocio y quién firma

- `ARCA_MODO` (entorno) es el **techo**: `stub` no habla con ARCA; `homologacion` manda a todos al
  ambiente de prueba; `real` deja decidir a cada negocio: `Tenant.arcaHomologacion = true` (default)
  sigue en prueba (`modoEfectivoDelTenant`).
- Firma el certificado **propio** del negocio (cifrado, ADR-066); si no tiene, el del **estudio** con
  una delegación `wsfe` **verificada** (ADR-077 §6) de un cliente que **no está de baja** en la
  cartera. Sin ninguno: error de configuración. Las credenciales nunca están en el repo.
- El ticket de acceso de WSAA es del **certificado que firma**: se guarda parado en el negocio que
  lo tiene cargado (el estudio, en una delegación), así el estudio y sus delegados hacen un solo
  login.
- Una nota de crédito sólo entra por `crearNotaDeCreditoInTx`: `createInvoiceInTx` la rechaza.

— Elaborado por GSG
