# Motor de facturación automática — diagnóstico (22/10/2026)

**Rama:** `claude/facturacion-automatica-motor` (sobre `claude/facturacion-automatica`).
**Contrato de API:** `src/lib/facturacion/README.md`. **Gate:** `GATE.md` (esta carpeta).

## Calibración (zona estándar: precisa, convencional)

- Nunca dos CAE por comprobante: la invariante vive en la base (índice único, fila tomada), no en
  la app (DB-4). Ante la duda se consulta a ARCA antes de pedir otro número.
- Todo parado en el negocio (`tenantTransaction`) y con `tenantId` en la consulta; tabla nueva con
  RLS en la misma migración (MT-1, MT-5, SEC-2).
- Credenciales fiscales por negocio, nunca en el repo; homologación a prueba de errores (ADR-066,
  ADR-077 §6, SEC-1).
- Migraciones generadas **sin aplicar**, con timestamp sin colisión (DB-1, DB-3).
- La lógica fiscal va con tests contra el simulador; verde antes de commitear (MP-8).

## Qué estaba sólido (no se tocó)

| Pieza | Dónde | Por qué es sólido |
|---|---|---|
| Outbox transaccional | `invoice-core.ts` | Factura PENDING + envío en la misma transacción (ADR-002). |
| «En duda» (ENG-020) | `plugins/arca/handler.ts` | Anota el número antes de pedirlo; el reintento consulta (`FECompConsultar`) y, si ARCA ya lo autorizó con esos datos y no es de otra factura, lo adopta. Contempla la autorización tardía (602 + último ≥ número). |
| Pasajero vs rechazo (ENG-021) | `arca-dispatch.ts`, `domain/errores-arca.ts` | 600/10016/501/5xx/timeout dejan PENDING; un `R` rechaza y cierra el envío en una transacción. |
| Toma con reserva | `arca-reserva.ts` | `FOR UPDATE SKIP LOCKED` + token de corrida: dos despachos no mandan el mismo envío. |
| Idempotencia por venta | `@@unique` de pedido/turno/pago MP | La base corta la carrera (P2002). |
| Decisión fiscal única | `fiscal/decidir-comprobante.ts` | Letra, NC (saldo, misma letra/receptor), ventana de fechas, umbral del consumidor final. |
| Credencial por negocio | `fiscal/tenant-cert.ts`, `afip/factory.ts` | Cifrada; fail-closed; guard cert↔CUIT en real. |

## Qué estaba a medias (WIP `5c066682`, sin verificar) y cómo quedó

| WIP | Estado encontrado | Qué se hizo |
|---|---|---|
| Reintentos con espera creciente y tope (`arca-reintentos.ts`, `arca-reserva.ts`) | Escrito, sin tests; las columnas `proximoIntentoEn`/`muertoEn` ya existían (`20260925120000_lanzamiento_base`) | Verificado (21/21 de los Postgres del WIP); tests puros; la acción humana «Autorizar los pendientes» ahora pasa `ignorarEspera` y `reactivarDetenidos` (si no, el backoff la dejaba «sin avance»). |
| Interruptor por servicio (`afip/interruptor.ts`) | Escrito, sin tests | Tests con reloj inyectado y con el transporte real + simulador. |
| Firmante / delegación (`fiscal/firmante.ts`, `resolverFirmaParaTenant`) | Escrito, sin tests | Tests puros y del resolvedor. |
| `modoEfectivoDelTenant` | Escrito, **sin usar** | Cableado en `crearClientePara`: con `ARCA_MODO=real`, un negocio en homologación corre como homologación (endpoint de prueba, sin guard estricto). |
| NC en el payload (`clase`/`asociado`) | Tipos y payload listos, **ningún camino la creaba** | `crearNotaDeCreditoInTx` / `crearNotaDeCredito`. |
| `LoteFacturacion` / `BorradorComprobante` en el schema | Modelos sin migración y sin código (`motor.server.ts` no existía) | **Sacados.** Nada los usaba y la consola ya resuelve el lote; sumarlos era otra migración sin consumidor (MP-13). Si se quieren, es una decisión aparte. |

## Qué faltaba y se cerró

1. **Nota de crédito asociada (pedido 1, alta).** Firma pedida, en `invoice-core.ts`. Toma la
   factura `FOR UPDATE`, suma las notas vivas, prorratea al centavo (`nota-credito-core.ts`),
   valida con `decidirComprobante` y encola el envío con CbtesAsoc. Probado contra el simulador:
   parcial + resto, saldo excedido, dos pedidos a la vez (sale uno), sobre otra nota, otro negocio.
2. **Conteo de pendientes por negocio (pedido 6).** `contarPendientesDelNegocio(tenantId)` en
   `arca-dispatch.ts`; el panel del negocio ya la usa (una sola cuenta).
3. **Descripción del comprobante (pedido 5).** `CreateInvoiceInput.descripcion` → `Invoice.descripcion`
   (sólo se escribe si viene). Migración nueva (Gate 2).
4. **Origen `ABONO` con clave única (pedido 2).** `origin: { type: "ABONO", id: claveDeAbono(regla, mes) }`
   → `Invoice.abonoClave` con `@@unique([tenantId, abonoClave])`. Probado: dos pedidos a la vez dan
   una factura y un CAE. Migración `20261022140000_invoice_abono_descripcion` (Gate 2).
5. **Tabla `ReglaFacturacion` (pedido 3).** Con la forma pedida, FK de dos columnas a
   `CarteraCliente` (sólo clientes de la cartera del estudio), CHECK y RLS en la migración.
   `20261022140100_regla_facturacion` (Gate 2). Ensayada en Postgres 16 local.
6. **Abonos de RI con IVA por renglón (pedido 4).** `montosDeRenglones` (`facturacion/renglones.ts`):
   misma cuenta que una venta, marca `ivaPorProducto` y el plugin lo deja emitir.
7. **Bug encontrado y arreglado:** en `createInvoice`, el perdedor de una carrera por el mismo
   origen leía al ganador con `prisma` sin contexto de negocio y, con `RLS_ENFORCEMENT=on`,
   reventaba (`getCurrentTenantId`). Ahora lee con `tenantTransaction`. Afectaba también a
   pedido/turno/pago MP.
8. **Umbral de identificación del consumidor final.** La tabla ya tenía $10.000.000 desde el
   29/05/2025 (RG ARCA 5700/2025), de fuentes secundarias. No se pudo leer el Boletín Oficial desde
   este entorno: el valor queda **«a confirmar con el contador»** (anotado en la fila).

## Hallazgos de la Auditoría GSG sobre la rama integrada (22/10/2026) — corregidos

| Id | Hallazgo | Arreglo | Prueba |
|---|---|---|---|
| **I3** (importante) | La firma por delegación no reusaba el ticket de acceso (TA): el store lo buscaba por la huella del certificado **del negocio**, y un cliente delegado no tiene certificado. Cada cliente se volvía a loguear en WSAA con el certificado del estudio; WSAA rechaza el 2.º login con un TA vigente (`coe.alreadyAuthenticated`), así que en un lote del 2.º delegado en adelante caían como «pasajero» y terminaban detenidos. | `FirmaResuelta.titularTenantId` (el negocio que TIENE el certificado que firma: el propio, o el estudio). `crearClientePara` lee y guarda el TA **parado en el titular** y por la **huella del certificado que firma** (`huellaDeCertificado(firma.credencial.certPem)`); el store acepta esa huella (`leerTicketAcceso`/`guardarTicketAcceso`, 3.er/4.º parámetro). El estudio y sus delegados comparten UNA fila sin tocar la RLS de hoy (ENG-137 queda sólo para negocios con el mismo certificado propio). | `motor-postgres.test.ts` «I3»: dos clientes delegados seguidos contra el simulador → **un solo `loginCms`**, y una sola fila de `ArcaAuthTicket`, del estudio. |
| **M1** | `createInvoiceInTx` aceptaba `clase: "nota_credito"` (o `asociado`) sin controlar el saldo. | Lanza: la única puerta de una NC es `crearNotaDeCreditoInTx`. Nada legítimo usaba esa vía (la NC escribe con `datosDelComprobante`/`encolarInvoiceCreated` directo). | `invoice-core.test.ts` «M1». |
| **M3** | `resolverFirmaParaTenant` firmaba por delegación aunque el cliente estuviera de **baja** en la cartera del estudio. | Exige la fila `CarteraCliente(estudio, cliente)` y que no esté de baja (leída parada en el estudio); si no, error de configuración (el envío se detiene). Pausada sigue firmando. | `arca-dispatch.test.ts` (baja, ausente, pausada). |

## R1 · «Una factura por cobro» (riesgo fiscal marcado por el Challenger) — cerrado

**El riesgo.** Cuatro disparadores de factura no se hablaban: (1) completar el turno facturaba la
suma de los cobros con la seña adentro; (2) el aviso de Mercado Pago de un turno facturaba **el
turno entero** (el precio, o lo cobrado hasta ahí) con el origen del turno, y el link de pago no
siempre queda atado al turno; (3) el extracto sólo evitaba el duplicado si coincidía el total;
(4) `money_transfer` y `account_fund` de MP eran siempre «cuenta propia», y el camino automático
armaba el clasificador sin `config`. Resultado: una seña de $5.000 terminaba con 0, 1 o 2 facturas.

**La regla del motor** (`src/lib/facturacion/cobros-facturados.ts`). Cada cobro tiene una **clave** y
queda anotado en `CobroFacturado` con la factura que lo cubre; `@@unique([tenantId, clave])` es el
árbitro entre disparadores, también a la vez (DB-4). Claves: `mp:<pago>`, `turno:<turno>`,
`banco:<hash>`. Una factura RECHAZADA no cuenta como facturado.

**Decisión (1 línea de rationale):** tabla nueva y no reusar/generalizar `abonoClave`, porque la
unicidad es del **cobro** y no de la factura: un comprobante puede cubrir varios cobros (el resto
de un turno) y `abonoClave` (una columna por factura) no lo puede expresar; además la consola ya
lee `abonoClave` y renombrarla rompía su código.

| Disparador | Antes | Ahora |
|---|---|---|
| Aviso de MP de un turno | facturaba el turno entero | factura **ese pago** (`mp:<pago>`, atado al turno). Si el turno ya estaba facturado, el pago queda anotado contra esa factura, sin emitir otra. |
| Completar el turno | lo cobrado entero | lo cobrado **menos** lo que MP ya facturó de ese turno (`pendienteDelTurno`: resta hasta lo que el libro tiene cobrado por MP; sin libro, del precio). Clave `turno:<turno>`. ENG-023 compara contra lo cobrado (`cobroDelTurno`), no contra el resto. |
| Pago suelto de MP / sincronización | `mpPaymentId` único | además `mp:<pago>`; si el extracto ya facturó ese pago por su referencia, lo reusa. Los pagos atados a un turno siguen sin facturarse desde la sincronización (ya lo hacía). |
| Extracto bancario | sólo por total (a revisión) | al emitir, reconoce el cobro por `banco:<hash>` o por la **referencia del pago de MP** (`mp:<referencia>`): queda atado a la factura existente (`yaFacturadas`). El aviso por total (revisión) sigue como red. |
| `money_transfer` | siempre «cuenta propia» | propia sólo si es fondeo (`account_fund`) o el pagador es el cobrador; de un **tercero** → REVISAR (no se pierde ni se factura a ciegas); sin datos, como antes. El camino automático arma el clasificador con `config` (`cuentasPropias`). |

**Migración nueva (Gate 2, SIN APLICAR):** `prisma/migrations/20261022150000_cobro_facturado` (tabla
`CobroFacturado`, FK a `Invoice(id)`, CHECK de clave e importe, RLS adentro). La FK es por `id` y
no la de dos columnas `(tenantId, invoiceId)` a propósito: esa depende del único `Invoice(tenantId,
id)` de `20260925120000_lanzamiento_base`, que tiene reversa, y el test de esa reversa arma una base
con todas las migraciones menos ésa; el negocio lo cuidan la RLS de las dos tablas y el predicado
`tenantId` del código. Va
**después** de `20261022140000` y `20261022140100`. Ensayada en Postgres local (el arnés aplica toda la
cadena) y sin drift propio contra el schema. ⚠️ `docs/runbooks/facturacion/publicacion.md` y
`prisma/lote-deploy.txt` tienen que sumar esta carpeta.

**Pruebas:** `src/lib/facturacion/una-factura-por-cobro-postgres.test.ts` (los 4 caminos contra
Postgres con RLS y ARCA en modo prueba: seña por MP → completar → sincronizar → extracto = una
factura por cobro y la seña sumada una vez; completar antes del aviso; seña no anotada en el libro;
dos disparadores a la vez; `money_transfer` de un tercero vs. propio vs. fondeo),
`cobros-facturados.test.ts` (la cuenta del turno), `plugins/mercadopago/transferencias.test.ts`.

**Límites conocidos (documentados, no resueltos acá):**
- Si la recepción anota en el libro como TRANSFERENCIA o EFECTIVO una seña que en realidad entró
  por MP, el motor no puede saber que es la misma plata: sólo resta lo anotado con medio Mercado Pago.
- Una transferencia bancaria anotada en el libro del turno no lleva la referencia del banco: el
  extracto la sigue mandando a revisión por total (no la emite sola).
- La lista editable de cuentas propias de MP por negocio necesita una columna (hoy la fuente es el
  `collectorId` de la config del gateway, si lo trae). Decisión del dueño.

## Lo que no se hizo (y por qué)

- **Interruptor compartido entre instancias.** Hoy vive en la memoria de cada instancia; entre
  procesos protegen la espera por envío y el corte de la corrida. Compartirlo es una tabla nueva
  → decisión del dueño (abajo).
- **Borrar los adaptadores de la consola.** Son de `src/app/contador/**` y `src/lib/cartera-*` (no
  son de este frente) y dependen de que se apliquen las migraciones.
- **Respuestas grabadas de ARCA.** El simulador sigue «provisional a confirmar» hasta la prueba de
  homologación del dueño (esta máquina no llega a `*.afip.gov.ar`).

## Ensayos

- Postgres 16 local (cluster aparte en `:5433`, `trust` sólo por socket local, el que documenta
  `src/test/base-efimera.ts`). El arnés aplica **todas** las migraciones, incluidas las dos nuevas,
  y la RLS (`0002_app_role`, `0001_enable_rls`) en cada base efímera: las dos nuevas aplican limpio.
- Drift schema ↔ migraciones (`prisma migrate diff --from-migrations`, base sombra local): sólo
  aparece `Client.phone SET NOT NULL`, **preexistente y ajeno** a este frente.
- Nada contra Neon.

## Decisiones del dueño

1. **Gate 2:** aplicar `20261022140000_invoice_abono_descripcion` y `20261022140100_regla_facturacion`
   (aditivas). Orden: migración → deploy (el código nuevo lee/escribe esas columnas).
2. **Umbral del consumidor final:** confirmar con el contador el monto vigente ($10.000.000, RG 5700/2025).
3. **Interruptor compartido** entre instancias (tabla nueva) — hoy no hace falta con el cron diario.
4. **Política de reintentos** (8 intentos, 1→60 min ≈ 3 h): con el cron diario de Vercel Hobby, en la
   práctica los reintentos los disparan las ventas y la persona; un cron más seguido es gasto/plan.

— Elaborado por GSG
