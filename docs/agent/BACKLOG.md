# BACKLOG de ingeniería

Primera auditoría del estándar (`Factory-GSG/.claude/rules/engineering.md` §0) sobre el commit
`3a96b52`, 2026-09-24. Cada slice sale de una violación medida; la evidencia es `archivo:línea`
del código de ese commit o la salida de un script de la auditoría.

**Cómo se usa.** Toda sesión de ingeniería arranca por el primer slice abierto de este archivo
(§0.7). Cuando un slice ya está planificado en el backlog de lanzamiento
(`Factory-GSG/30-LANZAMIENTO/realize/backlog.json` y `backlog-catalogo.json`), acá no se repite:
se lo referencia y sólo se agregan los criterios del estándar que le faltan.

**Convenciones.**
- Numeración: `ENG-000` es el arnés que habilita a todos los demás. `ENG-001` a `ENG-027` son
  las violaciones de severidad ALTA (ENG-027 salió de la refutación y va con las fiscales).
  `ENG-1xx` son MEDIA, `ENG-2xx` habilitan mediciones que hoy dicen "sin medir" y `ENG-3xx` son
  BAJA.
- Orden de ejecución: ENG-000, después **ENG-203** (la evidencia vive en `/tmp`; DECISIONS.md
  DEC-010) y después las ALTA.
- Orden de las ALTA: pérdida de datos → seguridad → fiscal → resto. Dentro de cada grupo, primero
  lo más probable y más caro.
- Tamaño: **S** = una sesión corta, un par de archivos. **M** = una sesión completa. **L** = varias
  sesiones o una migración que toca la base de los cuatro negocios.
- **Gate 2** = pide una migración. Se prueba en local y en `erp_lab`; se aplica a Neon sólo con
  la autorización del dueño (`prisma migrate deploy`, nunca `migrate dev`).
- `$AUD` = `/tmp/claude-0/-home-user-Factory-GSG/12bc8dd5-60d3-5e22-95c1-3816d17ad0a9/scratchpad/auditoria-ingenieria`,
  la carpeta de la auditoría donde están los scripts y salidas que se citan. Es temporal:
  ENG-203 trae al repo los que sirven para medir.
- Todo "test de integración" de un criterio corre dentro de `npm test` contra la base efímera
  de ENG-000, con el rol `app_rls` y `RLS_ENFORCEMENT=on`. Un doble de la base no cuenta (§3, §11).

---

## 0. Habilitante (va primero)

### ENG-000 · Arnés de integración: Postgres efímero en `npm test` y en CI · M
- **Qué.** Un helper de test que crea una base `erp_test_<aleatorio>`, le aplica
  `prisma migrate deploy` más `prisma/rls/0001_enable_rls.sql` y `0002_app_role.sql`, siembra
  dos negocios A y B, y la borra al terminar. Otro helper que ejecuta una Server Action real con
  la sesión de un usuario (cookies y headers de Next simulados). En CI, el job `tests` levanta un
  servicio Postgres e instala Chromium (`npx playwright install --with-deps chromium`, como ya
  hacen `visual` y `visual-aa`).
- **Por qué.** El job `tests` de `.github/workflows/gates.yml:65-75` corre sin Postgres y sin
  Chromium: sólo `visual` (`:126`) y `visual-aa` (`:151`) instalan el navegador, y `npm ci` no lo
  baja (`node_modules/playwright/package.json` 1.61.1 no tiene `scripts`). Reproducido en local
  sin base y sin Chromium: **76 de 2.980 tests saltados** (9 de base y 67 de los 5 archivos de
  componentes en Chromium; `$AUD/correccion/npmtest-como-ci.txt`, `# skipped 76`). La primera
  versión de esta línea base decía 9 porque la corrida local encontró Chromium en `/opt/pw-browsers`.
  Los tests que usan base apuntan por defecto a bases compartidas:
  `src/lib/reintento-de-venta-postgres.test.ts:13` y `src/cambios/interruptores-escritura.test.ts:115`
  usan `erp_qa_apps`, y en esta auditoría la suite escribió dos veces en esa base
  (`$AUD/npmtest-base-asis.txt:2765` y `:10432`, corridas sin redirigir las variables). Ningún
  test ejecuta una Server Action real (0 de 205). Sin este arnés no se puede verificar ningún
  criterio de los slices de abajo.
- **Criterios de aceptación.**
  1. `npm test` en CI termina con `# skipped 0`: los tests de base corren contra una base creada por el propio test (incluidas las de `PREVIEW_TEST_PROD_URL`, `PREVIEW_TEST_QA_URL` y `PREDEPLOY_TEST_DATABASE_URL`, que hoy saltean 5) y los 5 archivos de componentes encuentran Chromium. Se verifica leyendo el log del job (hoy, sin medir).
  2. `grep -rnE "erp_qa_apps|erp_lab|erp_scope" src --include=*.test.ts` devuelve 0 líneas.
  3. Test de humo: con la sesión de A, una acción de lectura real devuelve sólo filas de A.
  4. Al terminar no queda ninguna base `erp_test_%` (`psql -l`).
- **Registro.** DECISIONS.md DEC-001 explica por qué va antes que las ALTA.

---

## 1. ALTA: pérdida o alteración de datos

### ENG-001 · `npm run seed` no puede borrar datos de negocios reales · S · **CERRADO 2026-09-24**
- **Cierre.** Guarda `src/lib/seed/guarda-base.ts` (sólo Postgres local; el `host` de libpq manda;
  el motivo no muestra la contraseña), borrados con `where: { tenantId }` del negocio de muestra y
  todo en una transacción (`prisma/seed.ts`), `DEPLOY.md` §4 sin seed contra producción. Criterios
  1, 2 y 4: `src/lib/seed/guarda-base.test.ts`. Criterio 3: `src/lib/seed/seed-postgres.test.ts`
  (base propia con todas las migraciones, rol dueño). Evidencia en `.qa/ENG-001/`. El test de base
  se saltea sin Postgres local hasta que ENG-000 lo lleve a CI.
- **Qué.** Una guarda que aborta el seed contra producción, borrados con `where: { tenantId }`
  y todo dentro de una transacción.
- **Por qué.** `prisma/seed.ts:9-17` hace 9 `deleteMany()` sin `where` (Payment, Appointment,
  Client, ServiceProduct, Product, Service, Professional, BoxBlock, Box). `seed.ts:1` carga `.env`,
  `seed.ts:5` se conecta con `DATABASE_URL` y `package.json:10` lo expone como `npm run seed`.
  `grep -cE 'neon|NODE_ENV|abort' prisma/seed.ts` = 0. No usa transacción: si el borrado de
  Client choca con una FK, Payment y Appointment ya se borraron. El patrón correcto ya existe en
  `prisma/seed-qa-tenants.ts:165-168`.
- **Cuándo borra los cuatro negocios.** Depende del rol de `DATABASE_URL`. Medido con el seed real
  sobre una base propia con dos negocios (`migrate deploy` + `prisma/rls/0001` y `0002`; datos en
  `$AUD/correccion/seedrol-datos.sql`):
  - **Rol dueño de las tablas o con BYPASSRLS** (el mismo que pide `MIGRATE_DATABASE_URL`): las
    filas de Box y Client de los dos negocios quedan en 0 y se siembra el negocio de ejemplo
    (`$AUD/correccion/seed-como-duenio.txt`).
  - **`app_rls`, el rol de producción**, sin negocio seteado: los `deleteMany` no ven filas y no
    borran nada; crea la fila de Tenant de ejemplo si no existe (Tenant está fuera de RLS) y falla
    en el primer insert de Box, "new row violates row-level security policy"
    (`$AUD/correccion/seed-como-app_rls.txt`).
  El procedimiento escrito arma la condición peligrosa: `DEPLOY.md:53-57` pide `DATABASE_URL`
  "apuntando a la base de producción", corre `prisma migrate deploy` (necesita el rol dueño) y
  después `npm run seed`. Qué rol tiene el `.env` de quien corre el seed: **sin medir**. Sigue
  siendo ALTA porque con el rol dueño borra datos de clientes reales sin pedir confirmación.
- **Criterios de aceptación.**
  1. Con una `DATABASE_URL` de host `*.neon.tech`, o sin marcador de base local o QA, `npm run seed` sale con código distinto de 0 antes de la primera sentencia (test de la guarda).
  2. `grep -c 'deleteMany()' prisma/seed.ts` = 0.
  3. Test de integración con el rol dueño: base con 2 negocios, se siembra uno y la cantidad de filas del otro queda igual.
  4. `DEPLOY.md` §4 deja de indicar `npm run seed` contra producción.

### ENG-002 · Cerrar el turno de caja una sola vez · S
- **Qué.** El cierre cambia el estado sólo si sigue abierto (condición en la escritura, o
  transacción Serializable), y el ajuste de arqueo tiene clave única.
- **Por qué.** `src/lib/caja-actions.ts:216-268`: la transacción no fija aislamiento (queda en
  ReadCommitted, mientras `openCashSession` usa Serializable en `:150`); `findFirst` del turno
  abierto sin bloqueo; `update` en `:236` con `where: { id }` sin `status: "OPEN"`; el ajuste se
  crea en `:264` sin clave única (los `@@unique` de CashMovement, `schema.prisma:1357-1363`, no
  cubren `sessionId`). `closeCashSession` no tiene test. Medido contra Postgres con `app_rls`:
  `BARRERA=0 CORRIDAS=20 node --import tsx auditoria/carrera-cierre-turno.mts` (en
  `$AUD/copia-tesoreria`) da **de 15 a 19 de 20** corridas con el ajuste asentado dos veces, según
  la serie (5 series: 15; 19 en la refutación; 18, 19 y 19 en `$AUD/correccion/carrera-cierre-turno-3x20.out`):
  un faltante de $100 queda en el libro como $200. El script copia el cuerpo de la transacción de
  `closeCashSession`; no ejecuta la acción real, que necesita la sesión de Next.
- **Criterios de aceptación.**
  1. Test de integración: 20 corridas con dos cierres simultáneos → exactamente 1 fila `createdBy='arqueo-turno:<sessionId>'` y 1 transición OPEN→CLOSED por corrida; el segundo cierre recibe "la caja ya está cerrada".
  2. `carrera-cierre-turno.mts` da 0 de 20 en 3 series seguidas, y el test del criterio 1 ejecuta la acción real (con el helper de ENG-000), no una copia de su cuerpo.

### ENG-003 · Un día cerrado no acepta movimientos nuevos · M
- **Qué.** Todo el que escribe en el libro de caja lee la fecha del último cierre dentro de su
  propia transacción, con aislamiento Serializable o bloqueando la fila del cierre. El cobro de
  turno también.
- **Por qué.** Diez lugares leen la frontera fuera de la transacción antes de escribir:
  `caja-actions.ts:179`, `actions.ts:1211`, `order-actions.ts:309`, `:766` y `:918`,
  `libro-caja-actions.ts:302` y `:491`, `order-core.ts:1152`, `stock/purchase-core.ts:306`,
  `commission-actions.ts:151`. El cobro de turno no la lee nunca
  (`grep -c 'lastClosedDay|isFrozenDay'` = 0 en `caja/cobro-turno.ts` y en
  `turnos/cobro-turno-repo.ts`), y por ahí pasan `registrarCobroTurno` (`actions.ts:1051`), la
  seña (`actions.ts:374`) y `completeAppointment` (`actions.ts:1705`). El propio código dice que
  esto no puede pasar (`caja/frontera-cierre.ts:15-19`). Medido:
  `node --import tsx auditoria/carrera-libro-vs-cierre.mts` → el cierre congela un esperado de
  $5.000 y el libro de ese día cerrado queda en $5.777 (2 filas).
- **Criterios de aceptación.**
  1. `grep` de escritores de CashMovement que leen `lastClosedDay` fuera de una transacción = 0.
  2. Test de integración que intercala alta, borrado y cobro de turno con `cerrarDia`: la suma del día cerrado es igual al esperado guardado por el cierre, y no hay filas nuevas con `occurredAt` ≤ la fecha cerrada.

### ENG-004 · «Pesar y ajustar» no pisa un cobro ni una anulación · S
- **Qué.** El ajuste escribe con la condición "sin cobrar y no anulado" en el `where` (o bloquea
  la fila del pedido) y rechaza si otro ya lo cobró o lo anuló.
- **Por qué.** `src/lib/order-anulacion.ts:765-790` lee el pedido sin bloqueo; `:825-828` decide
  "sin cobrar" con esa lectura; `:882` y `:911-914` reescriben líneas y totales con
  `updateMany({ tenantId, id })` sin exigir `paid: false` ni el estado. Medido contra Postgres
  (`node --import tsx scripts/aud/ajuste-vs-cobro.mts` en `$AUD/copia`): pedido cobrado por
  $15.000 con $10.000 en el libro, **descuadre de $5.000**. Con una anulación
  (`ajuste-vs-anulacion.mts`): pedido anulado que conserva 1,5 kg y stock en 49,5 cuando arrancó
  en 50.
- **Criterios de aceptación.**
  1. Test de integración con un cobro y una anulación confirmados entre la lectura y la escritura del ajuste, 20 corridas: 0 pedidos con total distinto de VENTA − EGRESO del libro y 0 pedidos anulados con movimientos de stock posteriores a la anulación.
  2. El ajuste devuelve "ya se cobró" o "está anulado" en esos casos.

### ENG-005 · El estado de un turno se cambia con la condición en la escritura · S
- **Qué.** "No se presentó", la cancelación pública y las dos reprogramaciones escriben con el
  estado permitido en el `where` (como ya hace `cancelAppointment`) o validan dentro de la
  transacción.
- **Por qué.** `markNoShow` lee en `src/lib/actions.ts:1623`, valida en `:1628` y escribe en
  `:1631-1634` con `where: { id }`. `cancelMyAppointment` (pública): `client-actions.ts:77`,
  `:79-87`, `:89`. `rescheduleMyAppointment` valida en `client-actions.ts:114` fuera de la
  transacción y escribe en `:155-158`. `rescheduleAppointment` valida en `actions.ts:876` fuera
  y escribe en `:923-926`. El patrón correcto existe (`crm/wheres.ts:28-45`) y sólo lo usa
  `cancelAppointment` (`actions.ts:1606`). Reproducido en SQL (base propia de la auditoría): un
  turno ya COMPLETED (con cobro, factura y comisión) queda en NO_SHOW (UPDATE 1); con la condición
  en el `where`, UPDATE 0.
- **Criterios de aceptación.**
  1. Test de integración: turno COMPLETED → las 4 acciones rechazan y el turno sigue COMPLETED con su hora.
  2. Test de carrera (lectura, otra transacción lo completa, escritura): termina COMPLETED.

### ENG-006 · Mercado Pago: ningún pago aprobado se descarta · M
- **Qué.** Todo aviso de pago aprobado termina guardado en un destino (factura, cobro o
  movimiento a revisar) antes de responder 200; si no se pudo guardar, la ruta responde error
  para que Mercado Pago reintente.
- **Por qué.** `src/plugins/mercadopago/handler.ts:93-94` devuelve "procesado, no facturado" sin
  motivo cuando la referencia no es un turno del negocio; `src/lib/mercadopago-dispatch.ts:39`
  sólo deriva al circuito de ventas sueltas si el motivo menciona `external_reference`; `:33-36`
  no conecta el cobro de pedidos (`pedido:` también se descarta); la ruta responde 200
  (`src/app/api/webhooks/mercadopago/route.ts:89-90`) y Mercado Pago no reintenta. Los reintentos
  internos viven en memoria (`mercadopago-auto.ts:18-19`, `:186-192`). Medido:
  `node --import tsx auditoria/aviso-mp-perdido.mts` (en `$AUD/copia-tesoreria`) → 3 de 4
  referencias posibles ('Turno Sofía 24/9', 'PRUEBA-…', 'pedido:…') terminan sin destino y con 200.
- **Criterios de aceptación.** Test de contrato con avisos grabados para las 4 variantes de
  referencia (vacía, turno inexistente, texto libre, `pedido:`): cada pago aprobado queda en
  exactamente un destino; ningún camino responde 200 sin haber guardado.
- **Nota.** Está activo sólo si Mercado Pago está prendido en producción: sin medir (ENG-204).
  El ruteo por negocio es ENG-017 / R5-F4; este slice no depende de él.

### ENG-007 · Un movimiento del banco genera una sola factura · M
- **Qué.** Reservar el movimiento, crear la factura y enlazarla en la misma transacción, o una
  clave única (negocio, movimiento) en la factura.
- **Por qué.** `src/lib/bancos-glue.ts:672-720` usa tres transacciones; si falla el enlace, el
  `catch` devuelve la propuesta a "auto" y el próximo intento factura de nuevo. `createInvoice`
  sin origen no deduplica (`invoice-core.ts:93-94`) y `MovimientoImportado.invoiceId` no tiene FK
  ni índice único. Medido con una falla única inyectada en el enlace
  (`$AUD/bancos-link-out-falla-unica.txt`): 1 movimiento → **2 facturas** y 2 envíos a ARCA; el
  primer intento informa "emitidas: 0".
- **Criterios de aceptación.** Test de integración con falla inyectada en el enlace → exactamente
  1 factura y 1 evento de envío por movimiento.
- **Relación.** R2-F2 (backlog de lanzamiento) edita el mismo archivo para el receptor fiscal:
  hacer este slice antes o en la misma tanda.

### ENG-008 · Los asientos del libro de caja no se borran · M
- **Qué.** Borrar un asiento manual lo anula (marca o contra-asiento) y la auditoría se escribe
  en la misma transacción. Las escrituras de plata que no dejan rastro pasan a dejarlo.
- **Por qué.** `src/lib/libro-caja-actions.ts:513` hace `tx.cashMovement.delete`; la auditoría va
  en `:520`, fuera de la transacción, y `audit-core.ts:65-71` atrapa su error y sólo lo loguea: un
  asiento borrado puede no dejar ningún rastro. Además 8 escrituras de plata o conciliación no
  dejan auditoría: en `bancos-actions.ts` procesar extracto, confirmar mapeo, completar revisión,
  emitir propuestas, marcar no facturable y guardar configuración (cambia el umbral de la
  facturación automática); y `registerReceivableCollection` y `registerPayablePayment`.
- **Criterios de aceptación.**
  1. `grep -rn "cashMovement\.delete" src` (sin tests) = 0.
  2. Test de integración que fuerza la falla del insert de auditoría: el borrado vuelve atrás.
  3. Un test por cada una de las 8 escrituras verifica su fila de auditoría.

### ENG-009 · Borrado lógico en todo lo que tiene valor contable · L · Gate 2
- **Qué.** Marca de anulado o `deletedAt` en los modelos contables; las líneas de un pedido
  ajustado, los movimientos bancarios reprocesados, los cupones usados y las fichas unificadas
  dejan de borrarse físicamente.
- **Por qué.** `deletedAt` existe sólo en 5 modelos maestros (`prisma/schema.prisma:381`, `:410`,
  `:460`, `:516`, `:547`) y en 0 modelos contables (Invoice, Payment, Order, OrderItem,
  CashSession, CashMovement, Collection, AccountPayable, PayableCheque, AccountReceivable,
  StockMovement, StockPurchase, CommissionPayout, MovimientoImportado, Coupon). Borrados físicos:
  `order-anulacion.ts:882` (líneas del pedido en el ajuste; la auditoría guarda sólo el total,
  `order-actions.ts:1062-1074`), `bancos-actions.ts:211` (movimientos del reproceso),
  `coupon-actions.ts:101` (el cupón y su auditoría sólo guarda el id, `:102`),
  `crm/unificar-en-tx.ts:73` (fichas al unificar).
- **Criterios de aceptación.**
  1. `grep -rnE '\.(orderItem|movimientoImportado|coupon|invoice|payment|collection|cashMovement)\.(delete|deleteMany)\(' src` (sin tests) = 0.
  2. Test: ajustar un pedido conserva la versión anterior de sus líneas.
  3. Test: borrar un cupón usado deja la fila, no aparece en Promociones, y anular la venta que lo usó le devuelve el uso.

### ENG-010 · La purga de la bitácora no borra estado de negocio · S
- **Qué.** La purga a 18 meses exime a los registros que hoy son estado: el remito del traslado
  (con su clave para no repetirlo) y la regla del cupón de cada pedido.
- **Por qué.** El traslado guarda su registro sólo en AuditLog (`multilocal/traslado-core.ts:52`,
  `:570`, `:610`) y de ahí lee la clave que impide repetirlo (`:508-510`) y rearma el remito
  (`multilocal-actions.ts:520-525`). La regla del cupón vive en AuditLog con entity "Order"
  (`order-core.ts:429-444`) y la leen el ajuste y la anulación para calcular la plata
  (`order-anulacion.ts:489`, `:833-841`). `audit-retention.ts:23` no exime a ninguno de los dos y
  `:83` borra el resto a los 18 meses (`scripts/purge-audit-logs.ts:32`).
- **Criterios de aceptación.** Test en `audit-retention.test.ts`: con filas de traslado y de regla
  de cupón de hace 19 meses, `purgeAuditLogs` en modo prueba cuenta 0 para borrar; el test falla
  si se saca la exención. (Alternativa válida: tablas propias con `tenantId` y RLS, Gate 2.)

### ENG-011 · Dinero en decimal y con moneda · L · Gate 2 · **bloqueado por la decisión D1 del dueño**
- **Qué.** Los importes pasan de Float a `Decimal(14,2)` con moneda explícita; el código usa un
  tipo decimal de punta a punta.
- **Por qué.** 24 de 33 campos de importe son Float y 9 son `Decimal(14,2)`; 0 columnas de moneda
  (`node $AUD/schema-parse.mjs prisma/schema.prisma numeric` → `$AUD/schema-numericos.tsv`).
  Ejemplos: `Order.subtotal/discount/total` (`schema.prisma:1188-1190`), `OrderItem`
  (`:1232-1233`), `Payment.amount` (`:713`), `CashMovement.amount` (`:1304`),
  `StockPurchase.totalCost` (`:1414`). La misma compra va a Float si se paga y a Decimal si queda
  en cuenta corriente: 99.999.999 × $99.999.999 falla a cuenta corriente y pagada se graba como
  1e+41 (`$AUD/stock-compras/borde-stock.out`). En la base, `0.1::float8 + 0.2::float8` =
  0,30000000000000004; 100.000 sumas de 1234,56 en float se desvían 0,000157698988914 de numeric.
  ARCA recibe moneda fija `PES` y cotización 1 (`src/plugins/arca/afip/soap.ts:367-368`).
  `prisma/pending-gate2/CarniceriaRubro.sql:37`, `:62` y `:109` repiten DOUBLE PRECISION.
  `docs/adr/ADR-057` eligió Float: contradice §2 y §11 del estándar, y por §10 decide el dueño.
- **Criterios de aceptación.**
  1. Decisión D1 registrada: un ADR que reemplaza a ADR-057, o una excepción explícita al estándar.
  2. Si se migra: consulta a `information_schema.columns` de columnas de importe en `double precision` = 0; migración aditiva con reversa probada sobre el seed de ENG-201.
  3. Test: una venta de 0,1 + 0,2 deja exactamente 0,30 en `Order.total` y en `CashMovement.amount`.
  4. `CarniceriaRubro.sql` corregido a NUMERIC antes de aplicarse.

---

## 2. ALTA: seguridad

### ENG-012 · Cada negocio procesa sólo sus propios envíos a ARCA · S
- **Qué.** Las acciones del negocio procesan sólo los comprobantes pendientes de su negocio; el
  barrido de todos queda únicamente en el cron.
- **Por qué.** `src/lib/arca-dispatch.ts:197-201` lee con `operatorPrisma` hasta 20 pendientes,
  sin filtro de negocio. Ese cliente es el del rol dueño **sólo si `OPERATOR_DATABASE_URL` apunta
  al rol dueño**; si falta, usa `DATABASE_URL` (`operator-db.ts:21`). Con el rol dueño lee los
  pendientes de **todos** los negocios. Lo llaman acciones del panel del negocio:
  `facturacion-actions.ts:138`, `facturita-actions.ts:103`, `bancos-glue.ts:733`,
  `invoice-from-order.ts:91`, `invoice-from-mp.ts:69`, `invoice-from-appointment.ts:121`. El
  resumen con conteos ajenos vuelve a la pantalla de A (`EmitirFacturas.tsx:113-118`,
  `bancos-glue.ts:754`) y se guarda en la auditoría (`cartera-actions.ts:621-629`). Medido con
  `OPERATOR_DATABASE_URL` apuntando al rol dueño de la base local
  (`$AUD/tenancy-auth/drain-cross-tenant.out`): dentro del negocio A, con un pendiente sólo de B,
  el resumen dice `fallidos: 1` y la fila de B quedó con `attempts=1` y un error escrito.
  Contradice `operator-db.ts:5-7`. Si en Vercel la variable apunta al rol dueño: sin medir
  (ENG-204). Si falta, el problema es el opuesto: ENG-027.
- **Criterios de aceptación.**
  1. `grep -rn processArcaOutbox src` (sin tests) aparece sólo en la ruta del cron y en funciones que reciben el negocio.
  2. Test de integración con pendientes de A y B: la acción de A no toca los de B (intentos, error y fecha de proceso sin cambio) y su resumen cuenta sólo los de A.
- **Relación.** R7-F1 rehace el procesador; este slice es previo, chico y no toca el envío a ARCA.

### ENG-013 · La sesión del panel vence y se puede revocar en el servidor · M
- **Qué.** El token de sesión lleva fecha de emisión y una versión del usuario; el servidor
  rechaza tokens viejos o anteriores a un cambio de contraseña o a un cierre de sesión.
- **Por qué.** `src/lib/auth.ts:61-63`: token = id del usuario + firma del id; sin fecha ni
  versión. `auth.ts:69-81` sólo verifica la firma. Las 8 h son sólo la vida de la cookie en el
  navegador (`auth-actions.ts:50-56`); cerrar sesión borra la cookie del navegador
  (`auth-actions.ts:76-79`); cambiar o resetear la contraseña no invalida nada
  (`change-password-actions.ts:52-53`, `user-actions.ts:131-132`). Medido: dos logins del mismo
  usuario con 1,1 s de diferencia dan el mismo token, aceptado sin vencimiento. Una cookie copiada
  da acceso permanente a caja, ventas y facturación. La consola del operador ya lo resuelve
  (`operator-auth.ts:33-34`, `:224`).
- **Criterios de aceptación.** Tests: dos logins → tokens distintos; token de hace 8 h + 1 s →
  rechazado; token anterior a un cambio o reset de contraseña, o a un logout → rechazado.
- **Nota.** Puede pedir una columna nueva en User (Gate 2, aditiva).

### ENG-014 · Los ids que llegan del formulario se verifican contra el negocio · M
- **Qué.** Antes de enlazar una categoría, un servicio, un box o un recurso, la acción verifica
  que sea del negocio de la sesión.
- **Por qué.** Las FKs no incluyen el negocio y su chequeo saltea RLS: como `app_rls` con el
  negocio A, insertar un turno con un cliente de B da `INSERT 0 1`
  (`$AUD/tenancy-auth/fk-cross-tenant.out`). Acciones que escriben ids del formulario sin
  verificarlos: `catalog-actions.ts:165` y `:178` (crear servicio), `:200` (editar servicio),
  `:682-695` (recursos del servicio), `:502-503` y `:517` (profesional: servicios y box),
  `createBoxBlock` (`:103`, `:116`), `setWorkingHours`, `setServiceProducts`. Medido con el
  cliente real (`$AUD/tenancy-auth/fk-app.mts`): con una categoría de B, "creado" en los dos
  regímenes; con un id inexistente, error → A puede averiguar qué ids existen en B. Con RLS
  apagado, enlazar un servicio de B a un profesional de A escribe la fila
  (`$AUD/clientes-agenda-admin/medir-caa/conexion-cruzada.ts`).
- **Criterios de aceptación.** Test de integración con `app_rls` y otro con RLS apagado: esas
  acciones con ids de B fallan con el mismo mensaje que con un id inexistente, y no queda ninguna
  fila escrita.

### ENG-015 · Las relaciones entre tablas incluyen el negocio · L · Gate 2
- **Qué.** Índice único (negocio, id) en las tablas referenciadas y FKs compuestas (negocio,
  referencia). La tabla de enlace profesional-servicio gana columna de negocio y RLS.
- **Por qué.** 43 FKs entre tablas de negocio, 0 compuestas con el negocio (consulta a
  `pg_constraint` en la base de la auditoría). `Service.categoryId` es `ON DELETE SET NULL`: si B
  borra su categoría, cambia una fila de A. `_ProfessionalServices` no tiene negocio ni RLS
  (`prisma/rls/0001_enable_rls.sql:43-46`): `app_rls` sin negocio seteado ve 6 de 6 filas.
- **Criterios de aceptación.** Consulta a `pg_constraint`: 0 FKs entre tablas de negocio sin el
  negocio (o una lista de exentas con motivo, verificada por un test); test de integración: A no
  puede referenciar una fila de B aunque la acción no lo verifique.

### ENG-016 · Test de aislamiento por endpoint · L (por tandas)
- **Qué.** La plantilla del §3: con la sesión de A y los ids de B, cada acción no lee, no escribe
  y responde igual que ante un id inexistente. Y un trinquete que impide que el número baje.
- **Por qué.** 0 de 205 Server Actions y 0 de 16 rutas tienen un test que las ejecute así
  (`$AUD/tenancy-auth/actions-guards.tsv`; ningún `*.test.ts` importa y ejecuta un módulo
  `"use server"`). `authz.ts`, `require-app.ts`, `auth-actions.ts` y `change-password-actions.ts`
  no los carga ningún test (`$AUD/tenancy-auth/full.lcov`). Las suites de `prisma/rls/` no corren
  en `npm test` ni en CI (`gates.yml:77-88` sólo corre el chequeo estático). Los caminos de
  ENG-012 y ENG-014 no los detecta ningún test.
- **Criterios de aceptación.**
  1. Plantilla sobre ENG-000 y primera tanda: las 7 escrituras públicas, crear/editar servicio y sus recursos, `procesarFacturacionPendiente`, las 12 acciones de `order-actions.ts` y las 3 de `caja-actions.ts`.
  2. HEALTH.md publica "endpoints con test de aislamiento / total".
  3. Trinquete: una lista versionada de endpoints pendientes que sólo puede achicarse; una acción nueva sin test hace fallar `npm test`.

### ENG-017 · Mercado Pago por negocio → **planificado en R5-F4** (y R1-F1) · S (lo que agrega)
- **Por qué.** `src/lib/pagos-dispatch.ts:64-71` usa el token global `MP_ACCESS_TOKEN` para
  cualquier negocio; `mercadopago-cobros-dispatch.ts:62-63` también ignora el negocio;
  `mercadopago-actions.ts:44-59` trae el historial de la cuenta de Mercado Pago al negocio de la
  sesión sin chequear el módulo; `cobros-actions.ts:58-63` genera links de cobro sin el candado de
  módulo que sí tiene `:146-154`; `plugins/mercadopago/signature.ts:53-69` no controla la
  antigüedad del aviso, así que uno capturado se puede reenviar; la ruta resuelve el negocio por
  host (`route.ts:85`) sin atar la firma al negocio.
- **Lo que el estándar agrega a R5-F4.**
  1. La ruta actual rechaza avisos con más de 5 minutos de antigüedad (test), sin esperar al pipeline de R1-F1.
  2. Sincronizar y generar cobro rechazan a un negocio sin el módulo de Mercado Pago (test).
  3. Test de aislamiento: un aviso de un pago de la cuenta de A que llega al host de B deja 0 filas en los movimientos y facturas de B.

### ENG-018 · La tienda pública respeta la unidad de venta · S
- **Qué.** El servidor rechaza cantidades fraccionarias en productos que se venden por unidad y
  pone tope a la cantidad de líneas.
- **Por qué.** El paso de a 1 unidad existe sólo en el navegador (`Storefront.tsx:162`,
  `MagraFront.tsx:115`, `SiteReplica.tsx:86`). El servidor acepta cualquier cantidad mayor que 0:
  `order-actions.ts:163-166` → `order-core.ts:309-311` → `:265-287`, en `placeOnlineOrder`, que no
  pide sesión. Medido (`node --import tsx scripts/aud/media-unidad.mts` en `$AUD/copia`): pedido
  online de 0,5 pala a $250.000 → línea de $125.000 y el stock pasa de 1 a 0,5. Tampoco hay tope
  de líneas (`order-actions.ts:642-645`).
- **Criterios de aceptación.** Test de dominio: una línea por unidad con cantidad no entera se
  rechaza. Test de integración: ese pedido no se crea y el stock no se mueve; un pedido de 101
  líneas se rechaza sin tocar la base.

---

## 3. ALTA: fiscal

### ENG-019 · Envíos a ARCA sin doble emisión ni bloqueo entre negocios → **planificado en R7-F1** (pide OK del dueño) · M (lo que agrega)
- **Por qué.** `arca-dispatch.ts:197-201` toma pendientes sin reservarlos (sin `FOR UPDATE SKIP
  LOCKED`); `soap.ts:622-624` numera con "último autorizado + 1" sin serializar;
  `invoice-core.ts:214-218` descarta un CAE (el número de autorización de ARCA) sin log si la
  factura ya no está pendiente. Hay 7 disparadores que pueden correr a la vez. Medido con ARCA
  simulado y el código real (`AUD_N=50 npx tsx $AUD/aud-arca-concurrencia.ts` →
  `$AUD/arca-concurrencia-out-n50.txt`): el mismo envío procesado dos veces a la vez da 15 de 50
  con 2 CAE para 1 factura y 5 de 50 marcadas rechazadas en la base con CAE en ARCA; dos ventas
  simultáneas dan 41 de 50 con un número autorizado en ARCA que no está en la base. Bloqueo en
  cabeza de cola (`$AUD/hol-out.txt`, con el procesador sobre el rol dueño, que es cuando ve
  varios negocios): 20 envíos trabados de un negocio → 5 corridas con 0
  procesados y la factura de otro negocio queda pendiente; reintento infinito sin tope
  (`arca-dispatch.ts:239-252`); el cron corre una vez por día (`vercel.json:13-16`).
- **Lo que el estándar agrega a R7-F1.**
  1. El test de concurrencia corre en `npm test` contra la base efímera: 50 de 50 iteraciones con 0 CAE de más, 0 rechazadas con CAE y los números de ARCA iguales a los de la base.
  2. Test de cabeza de cola: 20 envíos fallando de X + 1 de Y → Y autorizada en la primera corrida.
  3. Un pendiente se reintenta en 15 minutos o menos (DECISIONS.md P5).

### ENG-020 · Si se pierde la respuesta de ARCA, no se emite otro comprobante · M
- **Qué.** Timeout en la llamada a ARCA y, antes de reintentar, consultar si el comprobante ya
  quedó autorizado.
- **Por qué.** `src/plugins/arca/afip/soap.ts:491-508` llama sin límite de tiempo;
  `arca-dispatch.ts:239-252` deja para reintento cualquier error no clasificado;
  `plugins/arca/handler.ts:59-60` pide autorización sin consultar antes; `FECompConsultar`
  aparece 0 veces en `src`. Medido (`$AUD/arca-concurrencia-out.txt`, escenario S3): ARCA
  autoriza y la respuesta se pierde → 2 CAE (números 1 y 2) para una sola factura; la base guarda
  el 2 y el 1 queda autorizado en ARCA sin factura en el sistema.
- **Criterios de aceptación.** Test de contrato con un transporte que autoriza y corta la
  respuesta: el reintento registra el número 1 y no pide un 2. Test de que el transporte corta a
  los 15 s (DECISIONS.md P5).
- **Relación.** El simulador de ARCA de R1-F3 sirve para estos tests.

### ENG-021 · Distinguir un rechazo de ARCA de un error pasajero · M
- **Qué.** Una tabla de códigos de ARCA que separa rechazos definitivos de errores pasajeros, y
  una forma de reintentar una factura rechazada.
- **Por qué.** `soap.ts:474-484` convierte todo error de ARCA en rechazo (`soap.test.ts:179-194`
  lo fija con el código 600, "token inválido", que es pasajero); `arca-dispatch.ts:221-238` marca
  la factura rechazada y da el envío por terminado; `invoice-core.ts:132-138` devuelve la factura
  existente cualquiera sea su estado, así que esa venta no se puede volver a facturar. Medido
  (escenario S4): error 600 → rechazada, y un nuevo intento devuelve la misma factura con 0
  envíos pendientes.
- **Criterios de aceptación.** Un test por código (600, 10016 y errores 5xx dejan el envío
  pendiente). Test de integración: una venta con factura rechazada se reintenta y termina
  autorizada sin violar los índices únicos.

### ENG-022 · Un comprobante autorizado no se puede editar ni borrar en la base · M · Gate 2
- **Qué.** Trigger (o policy) que rechaza borrar una factura autorizada o cambiarle montos, CAE,
  número, tipo, fecha o documento.
- **Por qué.** `prisma/rls/0002_app_role.sql:58` da a `app_rls` permiso de UPDATE y DELETE sobre
  todas las tablas; hay 0 triggers en las migraciones. Como `app_rls`, sobre una factura
  autorizada de su propio negocio: UPDATE 1 (total 1,00 y CAE "EDITADO") y DELETE 1
  (`$AUD/inmutabilidad-out.txt`). La única protección está en el código (`invoice-core.ts:202`,
  `:232`).
- **Criterios de aceptación.** Test de integración como `app_rls`: el UPDATE de esas columnas y el
  DELETE de una factura autorizada fallan; el paso normal de pendiente a autorizada sigue
  funcionando. Migración con reversa probada.

### ENG-023 · Anular una venta facturada no deja la factura viva · S (+ criterios para R4-F2)
- **Qué.** Mientras no exista la nota de crédito, anular una venta con factura autorizada se
  rechaza con un motivo claro. Cuando R4-F2 (nota de crédito asociada, **ya planificada**) cierre,
  anular encola la nota de crédito en la misma transacción.
- **Por qué.** `planAnulacionVenta` (`src/lib/order-anulacion.ts:223-243`) y `anularVentaInTx`
  (`:339-400`) no miran comprobantes: `grep -ciE 'invoice|factura' src/lib/order-anulacion.ts` = 0.
  Medido (`node --import tsx scripts/aud/anular-facturada.mts` en `$AUD/copia`): la anulación pasa,
  el pedido queda anulado, el libro registra la venta y su devolución por $121.000, y la factura
  sigue autorizada con su CAE; notas de crédito emitidas: 0. La nota de crédito no existe
  (`plugins/arca/domain/catalogos.ts:111-126` sólo emite 1, 6 y 11; `libros/libro-iva.ts:405-408`
  lo reconoce) y `plugins/arca/module.ts:36` le promete al cliente "Anular y nota de crédito".
- **Criterios de aceptación.**
  1. Test de dominio y de integración: con factura autorizada, la anulación se rechaza y el pedido no queda anulado; lo mismo en `turnos/anulacion.ts`.
  2. (A R4-F2) Anular encola la nota de crédito de la letra que corresponde en la misma transacción, y el neto del período en el libro IVA para esa venta da 0.

### ENG-024 · Receptor y umbral de identificación en todos los caminos de emisión → **planificado en R0-F4 + R1-F5 + R2-F2** · S (lo que agrega)
- **Por qué.** `src/lib/invoice-from-order.ts:79` fija "consumidor final sin identificar" para
  todo pedido; lo mismo en las 5 llamadas a `createInvoice` (`invoice-from-appointment.ts:99`,
  `invoice-from-mp.ts:57`, `invoice-from-order.ts:79`, `facturita-actions.ts:94`,
  `bancos-glue.ts:696`). No hay control del umbral legal de identificación en `invoice-core.ts`,
  `fiscal.ts` ni `plugins/arca/domain/validacion.ts`; sólo en bancos (`reglas.ts:27-31`) y en
  `mercadopago-auto.ts:223`. La regla "un responsable inscripto no factura con 21 % plano" vive en
  la pantalla (`ventas/factura.ts:94`) y 5 de 6 caminos la saltean (`external-orders.ts:241`,
  `facturita-actions.ts:85`, `bancos-glue.ts:685`, `invoice-from-appointment.ts:83`,
  `invoice-from-mp.ts:46`). `validacion.ts:36-107` no controla la fecha del comprobante contra hoy.
- **Lo que el estándar agrega.**
  1. Las reglas viven en el plugin fiscal, no en una pantalla: un test por cada uno de los 6 caminos (pedido, turno, Mercado Pago, facturita, bancos, API externa) → consumidor final sin identificar por encima del umbral no emite y devuelve el motivo; emisor inscripto sin alícuota por producto no emite.
  2. Una fecha de comprobante fuera de la ventana permitida se rechaza antes de llamar a ARCA.
  3. El umbral sale de un solo lugar (la tabla de vigencias de R0-F4).

### ENG-025 · La factura de un pago de Mercado Pago sale por lo cobrado · M
- **Qué.** El monto facturado es el del pago, no el precio del turno; una devolución deja la nota
  de crédito encolada o el caso en revisión.
- **Por qué.** `plugins/mercadopago/core-contract.ts:21-24`: la facturación recibe sólo el turno
  y el negocio; `handler.ts:93` no pasa el monto; `invoice-from-appointment.ts:77-84` factura
  `payment.amount ?? priceAtBooking ?? service.price` y en `:116-118` marca aprobado sin comparar.
  `cobros-actions.ts:63-64` deja monto y referencia libres: un link de $10.000 con referencia a un
  turno de $50.000 factura $50.000. Devoluciones: `http.ts:178-180` las reconoce y
  `handler.ts:61-65` sólo devuelve un motivo; la factura queda vigente.
- **Criterios de aceptación.** Test de contrato con avisos grabados: pago de $10.000 contra un
  turno de $50.000 → factura por lo cobrado o revisión, nunca $50.000; aviso de devolución de un
  pago facturado → nota de crédito encolada (con R4-F2) o caso en revisión, y la conciliación se
  revierte.

### ENG-027 · Si falta la conexión del operador, el procesador de ARCA lo dice en vez de no hacer nada · S
- **Qué.** El procesador de envíos a ARCA y el cron verifican, antes de leer, que el cliente del
  operador puede ver los pendientes de todos los negocios (rol dueño o con BYPASSRLS). Si no, fallan
  con un error de configuración que queda en el log y en `/api/ready`, en vez de devolver "0
  procesados".
- **Por qué.** `src/lib/operator-db.ts:21`: si falta `OPERATOR_DATABASE_URL`, `operatorPrisma` usa
  `DATABASE_URL`, que en producción es `app_rls`. Sin negocio seteado, RLS le esconde todas las
  filas de `OutboxEvent`. `.env.vercel.template:37-40` lo advierte ("Si falta, cae a DATABASE_URL
  (app_rls) y el operador queda bloqueado por RLS"), pero el código no lo detecta. Medido con el
  `processArcaOutbox` real sobre una base propia con un pendiente en cada uno de dos negocios
  (`$AUD/correccion/drain-sin-operator-url.mts` → `drain-sin-operator-url.out`): sin la variable,
  `{procesados: 0, fallidos: 0}` y los dos pendientes quedan con `attempts=0`; con el rol dueño, el
  procesador toma los 2. Los 6 lugares de facturación que lo llaman y el cron diario pasan por ese
  procesador (ver ENG-012): sin la variable **no se autoriza ninguna factura** y nada avisa; quedan
  pendientes para siempre. Si hoy falta en Vercel: sin medir (ENG-204).
- **Criterios de aceptación.**
  1. Test de integración como `app_rls` sin `OPERATOR_DATABASE_URL`: `processArcaOutbox` lanza un error de configuración (no devuelve 0) y el cron responde error.
  2. Con el rol dueño, el mismo test procesa los pendientes de los dos negocios.
  3. `/api/ready` responde 503 con el motivo "procesador de ARCA sin acceso" en el caso del criterio 1.
- **Relación.** ENG-012 cambia qué procesan las acciones del negocio; este slice cubre el cron y la
  configuración. R7-F1 rehace el procesador: los criterios pasan a sus tests.

---

## 4. ALTA: resto (plata)

### ENG-026 · Reportes de ingresos por cobro, con su fecha y su medio · M
- **Qué.** Reportes y números del Inicio leen cada cobro (Collection) con su fecha y su medio.
- **Por qué.** `src/lib/turnos/cobro-turno-repo.ts:259-264`: el pago del turno se sobrescribe
  con la suma de cobros y el medio del último, y conserva la fecha del primero. `getReportData`
  agrupa por esa fecha (`actions.ts:1431-1444`, `:1452`), `report-ingresos.ts:72` arma el día con
  ella y `report-kpis.ts:137` usa ese medio. Ejemplo: seña de $5.000 en efectivo el 28/08 y saldo
  de $15.000 por transferencia el 03/09 → agosto muestra $20.000 por transferencia y septiembre
  $0. El libro de caja registra cada cobro con su fecha (`cobro-turno-repo.ts:268-276`): Reportes
  y Caja no concilian.
- **Criterios de aceptación.** Test de integración con ese ejemplo: el reporte del 28/08 da la
  seña en efectivo, el del 03/09 el saldo por transferencia, y la suma del período es igual al
  libro de caja del período.

---

## 5. MEDIA

Formato corto: qué · evidencia · criterio · tamaño. Van después de las ALTA, en este orden.

**Aislamiento y seguridad**
- **ENG-102 · RLS y el rol `app_rls` dentro de las migraciones · M · Gate 2.** Una base vacía con `prisma migrate deploy` queda con 1 de 44 tablas protegidas (sólo LeadCampania); recién después de correr a mano `prisma/rls/0001_enable_rls.sql` queda 44 de 44 (`prisma/rls/README.md` lo advierte). QA, previews y una restauración desde migraciones dependen de ese paso manual. *Criterio:* test de integración: base vacía + `migrate deploy` → 44/44 con RLS y 44 policies, sin scripts aparte. Relación: R0-F1 actualiza `0001_enable_rls.sql` pero no lo lleva a migraciones.
- **ENG-103 · La tabla de negocios (Tenant) bajo RLS · M · Gate 2.** Queda fuera de RLS y del candado (`tenant-scope.ts:45`, `0001_enable_rls.sql:41-43`); `app_rls` sin negocio seteado ve 9/9 filas (4 con CUIT) y tiene permiso de UPDATE. *Criterio:* con el negocio A seteado, SELECT de Tenant devuelve 1 fila y UPDATE de la fila de B afecta 0 (test de integración).
- **ENG-104 · Cambio forzado de contraseña en migraciones y cerrado ante error · S · Gate 2.** La columna sólo existe en `prisma/pending-gate2/MustChangePassword.sql`; `must-change-password.ts:100` devuelve "no hace falta" ante cualquier error; `owner-password-reset.ts:52-63`. *Criterio:* test de integración: después de un reset, la contraseña temporal sólo deja entrar a `/admin/cambiar-password`.
- **ENG-115 · Límite de intentos compartido entre instancias · M.** Hoy en memoria por proceso (`rate-limit.ts:8-11`, `:35`); 5 de 205 acciones lo usan; 0 de 5 de emisión fiscal; 1 de 7 escrituras públicas; 0 en el webhook de Mercado Pago. *Criterio:* test: el 6.º login fallido desde una IP queda bloqueado aunque venga por otra instancia (mismo almacén); N+1 emisiones por minuto y negocio se rechazan sin llamar a ARCA; N+1 reservas públicas desde una IP no crean ficha ni turno. Relación: R1-F1 trae freno por IP para el pipeline nuevo de webhooks. Puede implicar un servicio pago (decisión de costo del dueño).
- **ENG-116 · Validación con esquema en el borde · L (por tandas).** 0 librerías de esquema; 329 lecturas de `formData.get` a mano en 31 de los 47 archivos `"use server"` (345 en 34 archivos de todo `src` sin tests, más 24 `fd.get` en 5; comandos en HEALTH §3.3). Casos medidos: `createReview` acepta calificación NaN o 3,5 (`client-actions.ts:33-36`); compra con cantidad y costo de 20 dígitos graba un egreso de 1e+41 (`pos-peso.ts:229-241`, `$AUD/stock-compras/borde-stock.out`); facturita con total en texto factura $0 (`$AUD/borde-out.txt`); comisión sin rango 0-100 (`catalog-actions.ts:504`); `String(null)` da el id "null" en 49 lecturas. *Criterio:* esquema tipado en las acciones públicas y en las que mueven plata primero; test de entrada inválida por acción sin llamar a la base; HEALTH publica acciones con esquema / total.
- **ENG-117 · Los errores internos no llegan a la pantalla · S.** `errorDeAccion` (`order-actions.ts:194-196`), `toActionError` (`caja-actions.ts:55-58`, `libro-caja-actions.ts:83-86`), `cierre-diario-actions.ts:517-519`, `cobros-actions.ts:96`, `compras/actions.ts:161` y 3 más devuelven el mensaje crudo de Prisma, con ruta del servidor y código fuente (`$AUD/correlativo-mensaje.out`). La API pública clasifica rechazos con una expresión regular sobre el texto (`api/public/v1/orders/route.ts:35`): "sin stock" sale como error 500. *Criterio:* test que provoca un error de Prisma en cada acción y verifica que el mensaje no contiene "Invalid `", rutas ni nombres de modelo; la API responde 409/422 por tipo de error.
- **ENG-118 · Sin datos personales ni fiscales en los logs · S.** `notifications.ts:77` loguea teléfono y texto de cada recordatorio (cron diario); `:52` email y cuerpo; `arca-pruebas-actions.ts:105` y `facturita-actions.ts:114` el CUIT; `logger.ts:30-31` serializa el mensaje de error completo (un error de Prisma trae nombre, teléfono y email); `audit-core.ts:97` usa el teléfono como actor. *Criterio:* test del logger con un error de Prisma que contiene teléfono y email: la línea no los incluye; `grep console.log src` fuera de logger = 0.
- **ENG-119 · Logs con request_id y negocio · S.** Request id en 5 de 16 rutas y 0 de 205 acciones; 39 de 77 llamadas al logger sin ninguna clave de negocio (`$AUD/tenancy-auth/logs.cjs`). *Criterio:* test: un error logueado dentro de una acción sale en JSON con requestId y tenantId.
- **ENG-120 · Dependencias y secretos en verify · M.** `npm audit` no corre en verify ni en CI (`gates.yml`, `verify-gates.mjs`): 5 altas en dependencias de producción, todas en la cadena de la herramienta de Prisma salvo `fast-uri`; el arreglo que propone npm es bajar Prisma a 6.19.3 (cambio mayor). 0 hooks de pre-commit y 0 escaneo de secretos en CI; el árbol y los 139 commits disponibles no tienen credenciales reales (`$AUD/secretos-arbol.tsv`, `secretos-historia300.tsv`), pero `docs/seguridad/RUNBOOK-ROTACION-SECRETOS.md:48` publica el host de Neon de producción. `xlsx` viene de un tarball de CDN sin integridad fijada y `node-forge` y `xlsx` no tienen ADR. *Criterio:* `npm audit --omit=dev --audit-level=high` bloqueante con excepciones por paquete en un ADR (ver decisión D3); hook de pre-commit con escáner de secretos y paso en CI; historia completa escaneada (`git fetch --unshallow`); el host fuera de los docs; ADR para `node-forge` y `xlsx` (R0-F1 ya pasa `xlsx` a `vendor/`).
- **ENG-121 · Denegar por defecto en las acciones del negocio · S.** Hay trinquete para las acciones del operador (`operador/guardia-negocio.test.ts:6-10`) y para páginas (`apps/guardia-paginas.test.ts:9-10`), no para las 184 del negocio. `libro-caja-actions.ts:115` publica una función pura como endpoint. `/facturita/app` no pasa por el portón del proxy (`proxy.ts:93-97`). *Criterio:* test AST que falla si una acción exportada no empieza con una guardia o no figura en una lista de públicas con motivo; `GET /facturita/app` sin sesión → redirección al login.
- **ENG-122 · Una sola política de contraseñas · S.** Alta y reset aceptan 8 caracteres sin más (`src/app/admin/(dashboard)/usuarios/alta-usuario.ts:15`, `:33`); el cambio pide 10 con letras y números (`password-policy.ts:12`, `:20-25`). *Criterio:* `createUser` y `resetUserPassword` rechazan "12345678" (test).
- **ENG-135 · Lista blanca de accesos que saltan el candado · S.** `basePrisma` se importa en 15 archivos y `operatorPrisma` en 16 (`grep -rlE "import[^;]*\b<cliente>\b[^;]*from" src | grep -v '\.test\.ts$' | wc -l`; otros 11 archivos sólo nombran `operatorPrisma` en comentarios, `$AUD/correccion/operatorprisma-uso.txt`). `operatorPrisma` salta RLS sólo si `OPERATOR_DATABASE_URL` apunta al rol dueño (`operator-db.ts:21`). *Criterio:* lista versionada; un test falla si aparece un importador nuevo.
- **ENG-112 · La bitácora es de sólo agregar · M · Gate 2.** `app_rls` puede modificar y borrar AuditLog (`0002_app_role.sql:58`; probado: UPDATE 1, DELETE 1). AuditLog es además el estado de cierres, consentimientos e interruptores (`audit-retention.ts:23`): borrar una fila de CierreDiario reabre un día cerrado. *Criterio:* REVOKE de UPDATE y DELETE para `app_rls` (la purga con otro rol) y test de permiso denegado; consentimiento y cierres en tablas propias.

**Datos, dinero y fechas**
- **ENG-101 · Reversa probada de las migraciones · M.** 7 de 45 migraciones traen reversa, 0 probadas en el repo. Prueba propia (`$AUD/rollback-prueba.txt`): 7/7 reversas corren, 5/7 permiten volver a subir, 2 fallan (`rb-4.err`, `rb-6.err`: el valor de enum ya existe); la de Collection falla en la versión actual por una FK posterior; las de stock borran proveedores y deudas sin avisar. Colisión de fecha: dos migraciones `20260711140000`. *Criterio:* script en verify que sube, baja y vuelve a subir cada migración nueva contra una base efímera con seed, y la reversa aborta si la tabla que borra tiene filas.
- **ENG-105 · Número de pedido sin choques · S.** Se calcula como máximo + 1 con 5 reintentos (`order-core.ts:668-673`, `:186`, `:866-868`). Medido (`N=10 RONDAS=5 node --import tsx scripts/aud/correlativo.mts`): 10 altas simultáneas → 28 % fallan; 20 → 45 %; el cajero ve "no pudimos confirmar si la venta se grabó". *Criterio:* 20 altas simultáneas → 20 pedidos con números únicos y consecutivos (test de integración).
- **ENG-106 · Tests de concurrencia contra la base, dentro de la suite · M.** Hoy 0 tests con escrituras simultáneas contra Postgres. Las guardas funcionan cuando se las mide: último ítem 1 de 10, cupón de un uso 1 de 10, reserva del mismo horario 1 de 50 (`$AUD/concurrencia-ventas.out`, `$AUD/stock-compras/aud-stock.out`, `medir-caa/doble-reserva.ts`), pero una regresión no la detecta nada. *Criterio:* esos casos más el correlativo de compras y dos recuentos del mismo producto, en `npm test`; cada test falla si se saca su guarda (p. ej. el filtro de stock de `stock/ledger.ts:152`); la reserva rechazada muestra "ese horario ya no está disponible", no el error interno.
- **ENG-107 · La fecha fiscal de Mercado Pago es el día del negocio · S.** `plugins/mercadopago/http.ts:206-211` toma el día del texto que manda Mercado Pago; `mercadopago-auto.ts:52-55` usa el reloj del servidor (UTC). *Criterio:* test: un pago del 31/07 a las 23:30 de Argentina cae el 31/07.
- **ENG-108 · Convención de fechas y fecha contable de los cobros · M.** 101 fechas sin zona horaria y 0 `timestamptz`; los cobros (Collection) sólo tienen fecha de carga (`schema.prisma:1584`); el cheque acreditado usa "ahora" (`payable-service.ts:210`); tres cálculos de "últimos N días" distintos en Reportes (`actions.ts:1430`, `:1473-1474`, `:1530`). *Criterio:* ADR con la convención; fecha contable propia en Collection; test con reloj en 23:30 de Argentina: los tres reportes dan el mismo período.
- **ENG-109 · Una sola regla de redondeo y de lectura de importes, correcta · M.** `round2` (`round.ts:18-20`) redondea hacia abajo 587.189 de 10.000.000 casos x,xx5 en [0; 100.000) (5,87 %; `npx tsx $AUD/aud-round.ts`) y 4.697.605 de 100.000.000 en [0; 1.000.000), el rango de este criterio (4,70 %; desde `$AUD/base-gen`, `HASTA_CENTAVOS=100000000 npx tsx $AUD/correccion/aud-round-rango.ts`); 11 copias locales de redondeo (`$AUD/stock-compras/redondeo-copias.txt`); el descuento de un cupón se calcula en 3 lugares con 2 redondeos distintos (`actions.ts:342`, `coupon-actions.ts:144`, `venta-reglas.ts:455`); el formulario de compras muestra $1,51 y se graba $1,50; las vidrieras suman sin redondear por línea; los cobros de turno leen "12.500" como 12,5 (`actions.ts:738`, `:1058`). *Criterio:* test que barre todos los x,xx5 de [0, 1e6) sin ninguno hacia abajo; `grep` de redondeos locales = 0; mismo cupón y precio dan el mismo descuento en los 3 caminos. Relación: C1-F2 (catálogo) usa `round2`: corregirlo antes.
- **ENG-110 · Operaciones de varias tablas en una transacción · M.** Producto y costo en dos transacciones y el error del costo se silencia (`catalog-actions.ts:344-362`, `product-extras.ts:84-88`); dar de baja a dos dueños a la vez deja 0 dueños (`user-actions.ts:101-108`); la reserva pública crea la ficha fuera de la transacción (`actions.ts:441-449`); `deleteBox` en dos escrituras (`catalog-actions.ts:95-96`); entregar cobra y marca en dos pasos (`order-actions.ts:858-866`); el recordatorio se envía dentro de una transacción de base sin clave de idempotencia (`cron/reminder-sweep.ts:67-97`). *Criterio:* un test de integración por caso con la falla inyectada en la segunda escritura → no cambia nada.
- **ENG-111 · Auditoría en la misma transacción y en toda escritura de negocio · L.** 101 llamadas a auditoría fuera de la transacción y 23 adentro; 28 de 45 modelos auditados; sin auditoría: 16 de 24 acciones de configuración de agenda, 17 de 47 escrituras de stock, 0 en toda la emisión fiscal (10 archivos). *Criterio:* test que recorre las escrituras de negocio y verifica una fila con actor, entidad y antes/después; las que mueven plata la escriben con el mismo `tx`.
- **ENG-113 · Una sola puerta al libro de caja · M · Gate 2.** 11 archivos escriben CashMovement, 5 de otros contextos (compras, devoluciones, anulaciones, comisiones); 12 prefijos usan `createdBy` como tipo de asiento; el egreso de una compra no tiene clave única (`purchase-core.ts:490-501`). *Criterio:* `grep cashMovement.create` fuera de `src/lib/caja` = 0; clave única del egreso (test: dos llamadas con la misma compra dejan 1).
- **ENG-124 · El reproceso de un extracto no borra movimientos ya facturados · S.** Cuenta los facturados fuera de la transacción (`bancos-actions.ts:320-323`) y borra todo en otra (`:211-213`). Sin medir. *Criterio:* test de integración con reproceso y emisión en paralelo → 0 movimientos facturados borrados.
- **ENG-134 · Compras con los datos del comprobante del proveedor → planificado en R0-F1 (d) y R5-F2.** Hoy StockPurchase sólo tiene fecha de carga y el CUIT va en un texto libre (`schema.prisma:1399-1423`, `formal-order.ts:10-24`). Lo que agrega el estándar: el CUIT se valida con dígito verificador (`suppliers/supplier.ts:9-15`) y una compra del 30/09 cargada el 02/10 cae en septiembre (test).

**Fiscal**
- **ENG-123 · El modo simulado de ARCA no se confunde con el real · S.** `afip/factory.ts:104` crea un simulador nuevo por llamada y cada factura sale con número 1: la 2.ª queda pendiente para siempre; la 1.ª se muestra como "Factura C" con un CAE falso. No hay guarda contra simulado con facturación encendida en producción. *Criterio:* test de 2 facturas seguidas con números 1 y 2; el arranque se niega con `VERCEL_ENV=production`, facturación encendida y modo simulado.
- **ENG-125 · Tests de contrato con ARCA y casos fiscales mínimos · M.** Respuestas de ARCA escritas a mano (`soap.test.ts:23-194`), 0 grabadas; 0 tests del procesador de envíos; percepciones (`ImpTrib` fijo en 0, `soap.ts:365`), nota de crédito parcial y multimoneda: 0 tests. *Criterio:* carpeta de respuestas grabadas y anonimizadas de homologación (aprobado A/B/C, observaciones, errores 600 y 10016, falla 500, timeout) con un test cada una. Relación: R1-F3 (simulador) y R4-F2 (nota de crédito).

**Performance**
- **ENG-126 · Menos viajes a la base por pantalla · M.** Con RLS, cada lectura suelta abre su transacción de 4 sentencias (`rls.ts:84-88`). El Inicio de MAGRA hace 269 sentencias (58 transacciones) y tarda 4,4 s a 30 ms por viaje (`$AUD/../perf/res-rtt30.json`). *Criterio:* el Inicio ≤ 60 sentencias y las pantallas comunes ≤ 30, contadas por el arnés; presupuestos P1 y P4 de DECISIONS.md. Relación: **R6-F2** (Inicio rápido) ya lo planifica para el Inicio; `Factory-GSG/30-LANZAMIENTO/performance-informe.md` tiene los cambios probados.
- **ENG-127 · Listados paginados en el servidor · L.** 220 de 254 `findMany` sin límite, como cota superior: 211 pasan un objeto literal sin `take` y 9 reciben los argumentos armados en otra función (por ejemplo `consultaFilasDeVentas`, `consultaAuditoriaCierre`), donde el script no ve si traen `take` (`node $AUD/correccion/findmany-args.mjs 1`); Clientes manda 10.000 fichas y 2,4 MB al navegador (`actions.ts:1785-1794`); cuentas a cobrar y a pagar, bandeja de pedidos, cupones, catálogo, movimientos de stock (corta en 200 sin página siguiente), facturas (corta en 100). 0 tablas virtualizadas. *Criterio:* paginado por cursor en esas pantallas; test: con 10.000 filas la página trae ≤ 51. Relación: **R6-F2** planifica Clientes.
- **ENG-128 · Índices para lo que la pantalla filtra y ordena · M · Gate 2.** Order sin índice por fecha: ventas del día recorre las 50.000 filas del negocio en 14,2 ms y con el índice 0,165 ms (`$AUD/explain-ventas*.out`); StockMovement por tipo y por compra, StockPurchaseItem por producto (recorridos completos de 13,8 a 19,7 ms, `$AUD/stock-compras/explain*.out`); Appointment por cliente; Payment por estado y fecha; Invoice por fecha. *Criterio:* migración aditiva; EXPLAIN con el seed de ENG-201 muestra índice y < 2 ms en cada consulta.
- **ENG-129 · Consultas que crecen con las líneas o con la historia · M.** Venta de 10 líneas = 62 sentencias (+4 por línea, `stock/ledger.ts:150-201`); compra de 50 líneas = 171; la clave del ticket se busca 3 veces; el "último costo" trae todo el historial: la consulta no lleva LIMIT y Prisma recorta el `take: 1` en memoria (24.626 filas, 15.063 movimientos + 9.563 líneas de compra, para 1.974 productos; `stock/costo.ts:81-94`, `$AUD/correccion/filas-ultimo-costo.sql` y `lecturas-sql-completo.out`); el cierre diario sin cierre previo lee el libro entero (50.000 filas, p95 581 ms, `cierre-diario-actions.ts:205-219`). *Criterio:* test que cuenta sentencias: venta de 10 líneas ≤ 20, compra de 50 ≤ 15; el cierre con 50.000 movimientos < 300 ms.

**Tests y arquitectura**
- **ENG-130 · Cobertura de dominio ≥ 90 % · L.** Todo sobre `$AUD/cov.lcov` (suite completa) y la lista de `$AUD/correccion/lista-dominio.mjs`: funciones 81,9 % (3.182 / 3.884) sobre 272 de 304 módulos de dominio; 32 módulos que ningún test carga; por contexto, bancos 69,2 %, fiscal 77,1 %, negocios y sesión 80,5 % (`$AUD/correccion/cobertura-por-contexto.mjs`). Peores módulos por líneas: `blueprints/servicios.ts` 23,8 % (15 / 63), `plugins/mercadopago/ingest.ts` 39,7 % (58 / 146, funciones 1 / 9), `plugins/arca/handler.ts` 52,1 %. *Criterio:* versionar `lista-dominio.mjs` y el resumen de cobertura (con ENG-203) y umbral de funciones ≥ 90 % en verify (DECISIONS.md, definición de cobertura).
- **ENG-131 · Suite E2E de los flujos críticos · L.** 0 de 10 flujos con Playwright contra la app corriendo; lo existente renderiza 5 rutas sin mirar la consola (`scripts/qa/visual-smoke.mjs:57-99`). *Criterio:* los 10 flujos de DECISIONS.md a 1440 y 390 px, fallando ante error de consola; HEALTH publica flujos cubiertos / total.
- **ENG-114 · Módulos por contexto y trinquete de arquitectura · L (incremental).** 133 archivos de producción sueltos en `src/lib` (215 con los 82 tests; `find src/lib -maxdepth 1 -type f ! -name "*.test.ts" | wc -l`); 26 archivos tocan 5 o más modelos; `actions.ts` con 2.108 líneas; reglas de venta y la decisión de facturar en carpetas de pantallas (`order-actions.ts:49`, `:57`, `:87`); ventas escribe directo cuentas a cobrar y facturas (`order-core.ts:1248-1265`, `order-actions.ts:1169`, `:1203`); desde `src/app`, 45 llamadas a métodos de modelo de Prisma (29 con `prisma`, 15 con `operatorPrisma`, 1 con `basePrisma`) y 2 `$queryRaw`, más 9 sentencias dentro de transacciones abiertas en `operador/(console)/tenants/[id]/negocio.server.ts` (comandos exactos en `$AUD/correccion/comandos.txt`, bloque "Prisma desde src/app"). *Criterio:* test de arquitectura que falla si `src/lib` importa de `src/app` o si `src/app` llama a Prisma directo; ningún archivo nuevo > 600 líneas.
- **ENG-132 · Errores que se tragan · S.** 8 `.catch(() => null|undefined)` en código (`order-actions.ts:668`, `must-change-password.ts:74`, `facturacion-actions.ts:102`, …; `$AUD/correccion/catch-null.txt`; una novena coincidencia está en un comentario, `facturacion-actions.ts:72`) y 15 catch del servidor sin log (`$AUD/clientes-agenda-admin/catches.txt`); la pantalla de Facturación muestra "sin facturas" ante cualquier error (`facturacion-actions.ts:123-129`). *Criterio:* `grep` de catch sin logger = 0; test: un error de conexión en el cockpit muestra "no se pudo leer", no "vacío".
- **ENG-133 · Reglas de negocio duplicadas · S.** "Turno vivo" en 6 lugares; la cancelación pública usa otra regla que la página (`reserva/turno/[id]/page.tsx:37` vs `client-actions.ts:79-87`); las reglas del cierre reescritas en el cliente (`src/app/admin/(dashboard)/caja/cierre/revisar-cierre.ts:15-18`). *Criterio:* un solo predicado por regla, usado por la página y por las acciones (test de igualdad).

---

## 6. Slices que habilitan mediciones ("sin medir" en HEALTH.md)

- **ENG-201 · Seed realista y p95 en modo producción · M.** Juntar los seeds de la auditoría (`$AUD/seed-perf.sql`, `$AUD/stock-compras/seed-volumen.sql`, `$AUD/clientes-agenda-admin/seed.sql`) en un seed del tamaño de DECISIONS.md P7, y medir p95 de las pantallas y acciones de P1 a P4 con `next build` + `next start` (harness `perf/medir.mjs` o `scripts/load-test.mjs`). Habilita: p95 de los 5 endpoints más usados.
- **ENG-202 · LCP y bundle inicial · S.** `next build` (tamaño de JS por ruta) y Playwright sobre `next start` a 390 px con 4G y CPU ×4 midiendo LCP en `/admin` y `/admin/vender`. Habilita: LCP y bundle.
- **ENG-203 · Los números de HEALTH se miden con scripts del repo · S · va inmediatamente después de ENG-000 (DEC-010).** Toda la evidencia de HEALTH y de este backlog vive en `$AUD`, dentro de `/tmp`: si la carpeta se limpia, ningún número se puede volver a verificar. Llevar a `scripts/health/` los scripts de la auditoría (clasificar tests, lista de dominio y resumen de cobertura, cobertura por contexto, parser del schema, conteo de `findMany`, escáner de secretos, conteo de guardias) y un `npm run health` que regenere las tablas. *Criterio:* `npm run health` reproduce, sin `$AUD`, las cifras de HEALTH §2.2, §2.3, §3.1 (guardias e importadores), §4.2 (`findMany`) y §5. Habilita: tendencia comparable entre cierres.
- **ENG-204 · Medición de producción de sólo lectura · S · pide autorización del dueño.** `npm run medir:neon` y `prisma/rls/check-rls-live.mjs` con rol directo; lectura de variables de Vercel (`RLS_ENFORCEMENT`, `ARCA_MODO`, `ARCA_INVOICING_ENABLED`, `MP_*`, `DB_CONNECTION_LIMIT`, **`OPERATOR_DATABASE_URL`**: si existe y con qué rol se conecta); con qué rol se conectan `DATABASE_URL` y `MIGRATE_DATABASE_URL` (`SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user` por cada una, sin leer contraseñas); región del proyecto de Neon; latencia real Vercel-Neon; filas cruzadas existentes por FK; envíos a ARCA pendientes por negocio y su antigüedad. Habilita: estado real de RLS, si ENG-012 o ENG-027 está activo hoy (depende de `OPERATOR_DATABASE_URL`) y qué hallazgos de Mercado Pago y ARCA están activos.
- **ENG-205 · Backup y prueba de restauración · S · puede tener costo.** Documentar la retención de Neon, restaurar a una rama en una fecha dada y verificar conteos por negocio; repetirlo con fecha (§4). Habilita: "backups probados".

---

## 7. BAJA

- **ENG-301 · Lint bloqueante y formatter.** 11 errores (todos en `celula-negocios-digitales/`) y 31 warnings; lint no bloquea (`gates.yml:42`, `verify-gates.mjs:48`); sin formatter; Node 20 en CI y 22 en local sin `engines`. *Criterio:* `npx eslint . --max-warnings 0` en verde y bloqueante; formatter en modo check.
- **ENG-302 · El login del negocio no revela qué emails existen.** Sólo calcula el hash si el usuario existe (`auth-actions.ts:35`; hash ≈ 41,6 ms). *Criterio:* diferencia de mediana < 5 ms entre email existente e inexistente (n=50).
- **ENG-303 · La API pública no revela qué negocios existen.** Tres respuestas distintas antes de validar la clave (`public-api-auth.ts:132-148`). *Criterio:* misma respuesta 401 para toda combinación inválida.
- **ENG-304 · Segundo factor opcional para el dueño.** Exigido por `docs/adr/AMENDMENTS-revision-critica.md:21`; 0 implementación. *Criterio:* TOTP opcional con test, o ADR que lo difiere con fecha.
- **ENG-305 · Comentarios que contradicen el estado de RLS.** `rls.ts:18-21`, `tenant-context.ts:6-11`, `operator-db.ts:9-12`, `0001_enable_rls.sql:48-49`, `docs/adr/INDEX.md:112`; `docs/adr/INDEX.md:12` cita un EXCLUDE que no existe en la base. *Criterio:* un único lugar declara el estado (salida versionada de ENG-204).
- **ENG-306 · La ingesta externa sin referencia duplica pedidos.** `external-orders.ts:207`; devuelve el subtotal como total (`:252`). *Criterio:* el mismo POST dos veces deja 1 pedido; total = `Order.total`.
- **ENG-307 · La nota de crédito del proveedor no es una transferencia.** `stock/supplier-return.ts:281-288`. *Criterio:* medio propio; el reporte por medio no la cuenta como transferencia.
- **ENG-308 · Código muerto.** 13 exports sin uso (`$AUD/clientes-agenda-admin/muertos.txt`), entre ellos `seniaRetenida` marcado "provisional a confirmar" (`turnos/cobros.ts:205-212`). *Criterio:* 0 exports muertos o un slice que los conecte con la decisión de la dueña.
- **ENG-309 · El cobro de un turno acepta centavos.** `src/app/admin/(dashboard)/turnos/AppointmentRow.tsx:130-135` y `NewAppointmentForm.tsx:440` proponen el saldo redondeado a peso y el servidor lo rechaza. *Criterio:* saldo 1.234,50 → se propone y se acepta 1.234,50.
- **ENG-310 · TODO sin ticket.** `src/lib/business-config.ts:3`. *Criterio:* 0 TODO sin id de este backlog.
