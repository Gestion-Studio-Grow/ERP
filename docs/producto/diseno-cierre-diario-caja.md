# Cierre diario de caja y su conexión con cuentas a cobrar

**Estado:** diseño + lógica pura entregada (`src/lib/caja/cierre-diario.ts`, 26 tests). Persistencia, pantalla y migración: pendientes de integración (ver §7).
**Tenant que lo pide:** `beauty-spa` (CH Estética). ~280 movimientos/mes, tres medios, señas por todos lados.
**Fuente de verdad:** el código, con archivo y línea. Donde este doc y el código difieran, gana el código.

---

> **Decidido el 2026-09-08.** En un negocio de SERVICIOS el arqueo del cajón
> (`/admin/caja`, modelo `CashSession`) no se ofrece: su formulario sólo registra
> EFECTIVO, y en CH Estética el efectivo es el 28,6% de la plata. El único arqueo es el
> CIERRE DEL DÍA, que cuenta los tres medios y asienta la diferencia en el libro. El ítem
> pasó a `retailOnly` y la pantalla redirige al cierre si el tenant no es retail.
>
> Dos consecuencias que hay que tener presentes:
> * `retailOnly` es más angosto que "tiene mostrador": **gastronomía y `generico` también
>   pierden el arqueo**. Hoy no hay ningún tenant así; el día que entre uno, revisar el eje.
> * El hueco de `closingDiff` **sigue abierto para los tenants retail**: al cerrar el turno
>   la diferencia se congela en la `CashSession` y no la asienta nadie, mientras el cierre
>   diario escribe sus ajustes con `sessionId: null`. Para CH deja de importar (no usa la
>   pantalla); para magra/adosmanos hay que resolverlo ANTES de que operen caja de verdad.
>   Ése es el deadline real, no la publicación de CH.

## 0. En una frase

Cerrar el día es **declarar cuánta plata hay de verdad, por medio, y dejar que el sistema asiente la diferencia contra lo que el libro decía**. Después de cerrar, el libro dice lo que se contó — no lo que se tipeó — y nada fechado hasta ese día se puede volver a tocar.

La auditoría de la planilla (`Factory-GSG/20-MEMORIA/reference_auditoria_planilla_caja_ch.md`) lo resume: *"ningún saldo de la planilla estuvo nunca atado a un conteo físico"*. El faltante de $154.500 de marzo quedó en `MARZO!M3 = D6 − 154500` y abril abrió en 652.534 como si la plata estuviera. El cierre diario existe para que eso sea **estructuralmente imposible**: no hay "anotar al margen"; la diferencia **es** un movimiento del libro o el día no cierra.

---

## 1. Lo que ya existe (leído, no supuesto)

| Pieza | Dónde | Qué hace | Qué le falta para un cierre diario |
|---|---|---|---|
| Tabla de signos única | `src/lib/caja/cash-register.ts:46-59` `movementSign` | +1 VENTA/INGRESO, −1 EGRESO/RETIRO, 0 APERTURA | Nada. El cierre la importa; no hay segunda tabla. |
| Arqueo de turno | `cash-register.ts:145-157` `reconcileCash`; `caja-actions.ts:205-262` `closeCashSession` | Efectivo esperado vs contado de UN turno, congela `closingExpected/Counted/Diff` en `CashSession` (`schema.prisma:1224`) | Es efectivo puro (`isCash`, `cash-register.ts:36-38`), es por turno, y **la diferencia no se asienta en el ledger** (§3). CH no usa turnos: base local `beauty-spa` = 62 `CashMovement`, **0 `CashSession`**. |
| Libro de caja | `src/lib/caja/libro-caja.ts:127-149` `buildLibro`; `:105-114` `openingFromHistory` | Saldo corrido, arrastre derivado por medio, resumen por medio. Probado al peso contra agosto 2026 real. | Ninguna noción de "contado". Sabe lo que se tipeó, no lo que hay. |
| Persistencia del libro | `src/lib/libro-caja-actions.ts:91-148` loader; `:163-283` alta; `:295-339` borrado | Alta con guardas de fuera-de-mes y duplicado; borrado sólo de INGRESO/EGRESO manuales | No sabe qué días están cerrados: hoy se puede borrar una fila de marzo. |
| Ledger | `prisma/schema.prisma:1241-1290` `CashMovement` | `method`, `occurredAt` (fecha contable), `sessionId` **nullable**, `orderId` débil con `@@unique(tenantId, orderId, type)` (`:1283`) | Un rastro equivalente al cobro de cartera (`collectionId`) y al cierre que lo generó (`dayCloseId`). |
| Cuentas a cobrar | `schema.prisma:1589-1615` `AccountReceivable`; `src/lib/debts/receivable-service.ts:25-70`; `src/lib/settlement/collection-repo.ts:82-142` | `amount` congelado; saldo = `amount − Σ Collection(RECEIVABLE)`; cobro parcial atómico y Serializable | **`applyCollectionInTx` no escribe `CashMovement`** (`collection-repo.ts:82-121`): un cobro de fiado no llega al libro. **`createReceivable` no tiene ningún caller en `src/app`**: no hay alta de fiado desde la UI. |
| Pantalla AR | `src/app/admin/(dashboard)/cuentas-a-cobrar/actions.ts:19-33` | Registra cobro con `PaymentMethod` (EFECTIVO/TRANSFERENCIA/MERCADOPAGO) | No tiene TARJETA (`schema.prisma:24-28`). No toca la caja. |
| Otros cobros | `src/lib/actions.ts:695-733` `confirmPayment` (turnos, `Payment` 1:1); `src/lib/caja/cash-sale.ts:100-140` (POS) | `Payment` no toca el libro. VENTA del POS llega al libro **sólo si es EFECTIVO y hay turno abierto** | Para CH, que no abre turnos, ninguna venta del POS ni cobro de turno llega al libro. Hoy todo se tipea a mano en el libro. |
| Seña | `schema.prisma:474` `Service.depositAmount`; `BookingModal.tsx:612` | Monto exigido para confirmar, coordinado por WhatsApp | No hay entidad "seña". Es una fila del libro tipeada a mano. Correcto (§4). |

**Consecuencia:** hoy no hay doble conteo entre caja y cartera porque **no hay ningún vínculo**: hay sub-conteo en caja (lo cobrado por cartera no aparece) y la persona tipea dos veces. El diseño tiene que crear el vínculo sin crear el doble conteo.

---

## 2. Qué es "cerrar el día" (definición operativa)

**Qué mira.** Una pantalla de lectura (`/admin/caja/cierre?dia=YYYY-MM-DD`), por defecto hoy. Muestra, por medio (Efectivo · MP/Transf. · Tarjeta) y total:

- *Saldo al arrancar*: lo que quedó del cierre anterior (derivado, `openingFromHistory`; no se tipea).
- *Ingresos / Egresos del período*: desde el día siguiente al último cierre hasta el día que se cierra. Si el sábado no se cerró, el lunes cierra sábado + lunes (`since`), y la pantalla lo dice.
- *Esperado*: lo que el libro dice que tiene que haber (`buildLibro(...).summary.saldo`, la misma aritmética del libro, `cierre-diario.ts` `buildCierreDiario`).
- *De eso, cobros de cuentas a cobrar*: cuántos ingresos vinieron de la cartera (informativo; §4).
- La lista de movimientos del período, tal como el libro los pinta.

**Qué declara.** Tres números y una nota:

- **Efectivo contado** — obligatorio, aunque sea 0. Contar el cajón es el acto mínimo del cierre (`validateCierre`).
- **MP / Transferencia según extracto** — lo que dice "dinero disponible" en la app de MP / el home banking. Opcional el primer tiempo; recomendado diario (la dueña ya lo hacía en `K255`/`K290` de la planilla).
- **Tarjeta** — opcional y normalmente vacío: se liquida a T+N y la columna TARJETA vale 0 en las seis hojas de la planilla. Vacío = "no se concilia hoy", el saldo se arrastra sin diferencia.
- **Nota** — obligatoria si hay diferencia en cualquier medio. Puede ser *"sin explicación por ahora"*: la diferencia se asienta igual, pero tiene que quedar dicho.

**Qué queda congelado.** Un registro `CashDayClose` (§5) con `day`, `since`, esperado/declarado/diferencia por medio, nota, quién y cuándo. Inmutable. Y **los movimientos de ajuste** que el cierre escribe en el libro, uno por medio con diferencia: INGRESO si sobra, EGRESO si falta, detalle `"Diferencia de caja 31/03/2026: faltante en Efectivo"`, fechados al final del día cerrado para que sean la última fila de ese día.

**Qué no puede volver a tocarse.** Todo `CashMovement` con `occurredAt` ≤ último día cerrado (`isFrozenDay`). `addLibroEntry` y `deleteLibroEntry` tienen que consultar esa frontera y devolver `frozenDayMessage` (que ya dice qué hacer: cargar con la fecha de hoy y aclarar en el detalle a qué día corresponde). El ajuste del cierre tampoco se borra desde el libro (`dayCloseId` no nulo → misma regla que hoy protege VENTA/APERTURA, `libro-caja-actions.ts:316-321`). **No hay "reabrir"**: una corrección es un movimiento nuevo con fecha de hoy. Es la regla contable de siempre (no se borra, se contra-asienta) y es lo que hace que el esperado congelado sea reproducible para siempre.

**La propiedad que lo resume** (probada en `cierre-diario.test.ts`, "el arrastre entre días cierra"): `openingFromHistory(previous + movements + ajustes) === openingAfterCierre(cierre)`. Después de cerrar, el día siguiente abre con lo que se contó. Es exactamente lo que ABRIL!D3 no hizo.

---

## 3. El arqueo por medio — y por qué `closingDiff` no alcanza

**Efectivo se cuenta, MP y tarjeta se concilian contra el extracto.** La diferencia se registra igual en los tres: `diff = declarado − esperado`, por medio, y cada `diff ≠ 0` produce un movimiento de ajuste del libro. La aritmética no distingue "contar" de "conciliar"; lo que cambia es la fuente del número declarado y si es obligatorio.

`CashSession.closingDiff` (`schema.prisma:1224`, escrito en `caja-actions.ts:238-248`) **no sirve como cierre diario** por cuatro razones, todas del código:

1. **Es sólo efectivo.** `reconcileCash` filtra por `isCash` (`cash-register.ts:36-38`). MP y tarjeta no tienen dónde diferenciarse.
2. **Es por turno, no por día.** CH no abre turnos (0 `CashSession` en la base) y la planilla es continua. Forzar a abrir/cerrar turno para cerrar el día sería obligar a un ritual que el negocio no tiene.
3. **La diferencia queda congelada pero no asentada.** `closeCashSession` guarda `closingDiff` en la sesión y no escribe ningún `CashMovement`. `openingFromHistory` (`libro-caja.ts:105-114`) suma movimientos, así que el arrastre del libro **ignora** la diferencia del turno. El siguiente turno "absorbe" la diferencia redeclarando `openingFloat` a mano (`caja-actions.ts:98`): es el mismo antipatrón de "saldo inicial copiado a mano" de la planilla, con otro nombre.
4. ~~**Bug abierto:** `closeCashSession` selecciona `{ type, amount }` sin `method`.~~ **CORREGIDO** (commit `3955b9b`): el `select` incluye `method` y el map lo pasa a `reconcileCash`; lo mismo en la pantalla `/admin/caja`, que lo descartaba al mapear. Verificado en recorrido: con un turno abierto, un cobro por MP de $50.000 cargado desde el libro **no movió** el efectivo esperado. Se deja el renglón tachado, y no borrado, porque el argumento de los puntos 1-3 sigue en pie sin él.

**Decisión:** el cierre diario es una entidad propia (`CashDayClose`), del libro, multi-medio, y **asienta**. No reemplaza a `CashSession` (que sigue sirviendo al retail con turnos, `magra`/`adosmanos`), pero la recomendación para coherencia es que `closeCashSession` también asiente su `closingDiff` como movimiento del turno — misma regla, un solo criterio. Queda como mejora, no como bloqueo.

---

## 4. La conexión con cuentas a cobrar (el punto difícil)

### 4.1 Las dos preguntas que no se pueden mezclar

- **Caja responde:** ¿cuánta plata **entró y salió**, por qué medio, qué día? → `CashMovement`.
- **Cartera responde:** ¿cuánta plata **se debe** y todavía no entró? → `AccountReceivable` − `Collection`.

Son conjuntos disjuntos por definición: lo que entró ya no se debe; lo que se debe todavía no entró. El doble conteo aparece sólo cuando un hecho se registra en las dos tablas **sin que una sepa de la otra**. La regla de diseño es una: **cada cobro se registra en un solo lugar, y ese lugar escribe en el otro si corresponde**.

### 4.2 La seña

Una seña es un **anticipo**: plata que entra antes del servicio. Se registra en el libro como INGRESO el día que entra, por el medio que entra (`"Seña — tratamiento facial"`). Es lo que la planilla ya hace y está bien.

**Una seña NO genera `AccountReceivable` por el saldo.** Argumento contra el modelo, no en abstracto:

- `AccountReceivable.amount` es *"total fiado (congelado)"* (`schema.prisma:1601`) y la pantalla lo titula *"Adeudado por clientes"*. El saldo de un servicio que todavía no se hizo **no es deuda**: si la clienta no viene, la seña se retiene y no hay nada que cobrar. Un AR por el saldo inflaría "adeudado por clientes" con plata que nadie debe, y habría que anular (`voidReceivable`) en cada no-show. Ruido para nada.
- Contablemente la seña es un pasivo (le debemos el servicio), no un activo. A 280 movimientos por mes **no vale la pena** modelar ese pasivo: la fila del libro con el detalle "seña" alcanza para saber a quién le corresponde, y `Service.depositAmount` ya dice cuánto se exige.

**La deuda nace cuando el servicio se hizo (o el producto se entregó) y no se pagó completo.** Ahí sí: `createReceivable` por el **saldo impago** (`precio − seña − lo pagado hoy`), `concept` = `"Saldo tratamiento facial (seña 20.000 el 05/09)"`, con `clientId` (obligatorio en el modelo: un anónimo sin `Client` no puede quedar debiendo — correcto). Lo pagado ese día va al libro como INGRESO; lo que falta va a la cartera. **Nunca el mismo peso en los dos lados.**

Hoy eso es un acto manual en `/cuentas-a-cobrar` — y la pantalla **no tiene alta de fiado** (`createReceivable` sin callers en `src/app`). Es la pieza que falta construir. Engancharlo al "completar turno" con un campo "quedó debiendo" es una mejora posterior, no un requisito del cierre.

### 4.3 El cobro de una cuenta a cobrar

Cuando la clienta paga los 10.000 que debía, la plata **entró**: tiene que estar en el libro (si no, el cierre de ese día da faltante en el medio que entró). Y la deuda **bajó**: tiene que estar en la cartera.

**Dirección única: cartera → caja.** `registerReceivableCollection` (`cuentas-a-cobrar/actions.ts:19-33`) → `collectReceivable` → `applyCollectionInTx` escribe la `Collection` **y en la misma transacción** un `CashMovement` INGRESO con:

- `method = cashMethodFromPaymentMethod(collection.method)` (`cierre-diario.ts`: EFECTIVO→EFECTIVO, MERCADOPAGO/TRANSFERENCIA→MP; única traducción entre los dos vocabularios; `null` frena),
- `reason = "Cobro cuenta a cobrar — <cliente>: <concept>"`,
- `occurredAt` = hoy al mediodía del negocio (como el libro),
- `collectionId` = el id de la `Collection` (columna nueva, §5).

**El libro nunca escribe en la cartera.** `addLibroEntry` no sabe de clientes (`CashMovement` no tiene `clientId`) y no debe saber: agregarle un selector de cliente + cuenta a cobrar sería duplicar la pantalla de cartera dentro del libro, y meter lookups interactivos en la pantalla que hoy sufre el bug del Server Action. La regla para la persona es una frase: **"Si te debía (está en cuentas a cobrar), cobrale desde ahí; el libro lo recibe solo. Si no te debía nada, va al libro directo."**

### 4.4 Cómo se evita el doble conteo, en capas

1. **Estructural:** `CashMovement.collectionId` nullable con `@@unique([tenantId, collectionId])` — mismo patrón de idempotencia que `orderId` en `schema.prisma:1283` (A-5). Una `Collection` no puede producir dos filas de caja ni con doble click.
2. **Misma transacción:** la fila de caja nace dentro de `applyCollectionInTx` (que ya corre Serializable, `collection-repo.ts:128-142`). No existe el estado "cobro registrado, caja sin actualizar".
3. **Heurística existente:** si la persona igual tipea a mano el cobro en el libro, la guarda de duplicado de `addLibroEntry` (`libro-caja-actions.ts:240-250`: mismo día, detalle, medio y monto) avisa. No es infalible (el detalle difiere), por eso están 1 y 4.
4. **Visible en el cierre:** `porMedio[k].cobrosCartera` y `cobrosCarteraCount` muestran cuántos ingresos del período vinieron de la cartera. Si el libro tiene "Cobro Fulana 10.000" dos veces y la cartera una, el sobrante del cierre lo delata ese mismo día — no en la auditoría del año siguiente.
5. **Sin resumar:** `buildCierreDiario` cuenta el ingreso una vez (está en `ingresos`) y lo **reporta** aparte; nunca lo suma dos veces (test "entra al esperado UNA vez").

### 4.5 Lo que el cierre NO hace con la cartera

No congela la cartera. Una deuda se cobra cualquier día; el cierre congela **el día de caja**, no la deuda. Lo único que congela es la fila de caja que ese cobro produjo: un cobro registrado hoy produce una fila de hoy. Si más adelante la pantalla de AR agrega "fecha del cobro", tiene que respetar `isFrozenDay` igual que el libro.

### 4.6 Los otros cobros del sistema (fuera del pedido, pero es el mismo problema)

`confirmPayment` (turnos) y `setOrderPaid` con MP/transferencia o sin turno abierto **tampoco llegaban al libro**. Para CH hoy no importa: tipea todo en el libro. Pero **si se activa el puente para turnos/POS, hay que sacarle a la vez la necesidad de tipear**, o durante la transición cada cobro entra dos veces (uno automático, uno a mano) y la guarda de duplicado sólo avisa. Recomendación: mismo patrón que 4.3 (`orderId`/`appointmentId` ya existen como rastro; falta que la escritura no dependa de un turno abierto, ahora que `sessionId` es nullable).

> **✅ Implementado (2026-09-07) — puente turnos/POS → libro.** Fuente de verdad: el código.
>
> - **Mostrador, cualquier medio:** `src/lib/caja/cash-sale.ts` asienta VENTA para EFECTIVO, MERCADOPAGO y TRANSFERENCIA (`cashMethodFromPaymentMethod` es la única traducción; MP agrupa Mercado Pago y transferencia) y **ya no exige turno abierto** (`sessionId` NULL si no hay). Idempotente por `orderId` (`@@unique(tenantId, orderId, type)`, A-5). El arqueo no cambia: `summarizeMovements` cuenta sólo EFECTIVO.
> - **Turnos:** `src/lib/caja/cobro-turno.ts` + `confirmPayment` (`src/lib/actions.ts`). Payment + turno CONFIRMED + VENTA en el libro en **una sola tx**. Idempotente por `paymentId` — columna nueva en `CashMovement` con `@@unique(tenantId, paymentId, type)`, migración `20260907120000_add_cash_movement_payment_id` **escrita y SIN aplicar** (gate del dueño). Mientras no esté aplicada, `settleAppointmentPaymentGuarded` detecta el P2022 y reintenta el cobro **sin** asiento: el turno se cobra como siempre y no llega al libro (comportamiento previo, nada se rompe ni se duplica). Hallazgo colateral corregido: `isColumnMissing(e, col)` nunca matcheaba con driver adapters (Prisma 7 no manda `meta.column`); ahora también mira el mensaje.
> - **Actualización (cobros parciales, `src/lib/turnos`):** `confirmPayment` fue reemplazado por `registrarCobroTurno` / `confirmarTurno` / `completeAppointment` con cobro del saldo. Un turno tiene VARIOS cobros (`Collection.appointmentId`: seña al reservar, saldo al completar); `Payment` pasa a ser el **agregado** de esos cobros. El puente asienta **una VENTA por cobro**, keyeada por `collectionId` (`@@unique(tenantId, collectionId, type)`, migración `20260907180000_add_appointment_partial_collections`, SIN aplicar); `paymentId` queda como clave de los asientos previos. Misma degradación mientras no se aplique.
> - **Transición sin doble conteo** (`src/lib/libro-caja-actions.ts`, `src/lib/caja/libro-caja.ts`): (1) las filas del sistema son `type = VENTA` — el libro no las deja tipear ni borrar, y se pintan con su origen ("Turno cobrado" / "Venta del mostrador", `libroOrigin`); (2) al cargar un INGRESO a mano, si ese día ya hay una VENTA del sistema por el mismo medio y monto, la acción **frena y avisa** con el detalle de la fila del sistema ("Guardar igual" sigue disponible: una seña igual al precio es legítima); (3) al revés —se tipeó primero y el sistema asentó después—, `flagPossibleDuplicates` marca la fila manual en pantalla como "¿Duplicado?" para borrarla; (4) el formulario dice explícitamente que turnos y ventas entran solos. El sistema nunca borra ni resta una fila manual por su cuenta.
> - **Reportes vs libro:** Reportes suma `Payment` APPROVED (facturación de turnos, rotulado "Ingresos por turnos"); el libro suma `CashMovement` (toda la caja, por medio). Cada `Payment` produce **exactamente una** VENTA con `paymentId` → `Σ Payment(APPROVED) = Σ CashMovement(paymentId ≠ null)` para todo cobro posterior a la migración. Los cobros hechos con la columna sin migrar quedan en Reportes y no en el libro (auditoría `libroCaja: "sin-migrar"`): se backfillean una vez, con autorización, cuando se aplique la migración.
> - **Fuera de alcance, a propósito:** cartera → caja (§4.3, `collectionId`), TARJETA en `PaymentMethod`, REFUNDED → EGRESO, y sumar ventas del mostrador a Reportes.

---

## 5. Persistencia propuesta (aditiva; migración requiere autorización del dueño)

```prisma
// Cierre diario del libro de caja. UNA fila por (tenant, día). Inmutable.
model CashDayClose {
  id        String   @id @default(cuid())
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  tenantId  String
  day       String   // "YYYY-MM-DD" en la zona del negocio (DayKey)
  since     String?  // primer día que abarca (null = desde el origen)

  // Congelado al cerrar, por medio (mismo criterio que CashSession.closing*):
  expectedCash Float
  expectedMp   Float
  expectedCard Float
  declaredCash Float
  declaredMp   Float?  // null = no conciliado ese día
  declaredCard Float?
  diffCash     Float
  diffMp       Float?
  diffCard     Float?

  note      String?
  closedBy  String   // "user:<id>"
  closedAt  DateTime @default(now())
  adjustments CashMovement[]

  @@unique([tenantId, day])
  @@index([tenantId, closedAt])
}

// En CashMovement (dos columnas nullables, sin reinterpretar ninguna fila viva):
  dayClose     CashDayClose? @relation(fields: [dayCloseId], references: [id], onDelete: Restrict)
  dayCloseId   String?       // no nulo = es el ajuste de un cierre: no se borra desde el libro
  collectionId String?       // rastro al cobro de cartera que lo originó
  @@unique([tenantId, collectionId])
```

Columnas planas por medio en vez de JSON: se consultan (`SUM(diffCash)` del mes = "cuánto se perdió en efectivo") y siguen el estilo de `CashSession`. Tres medios fijos (`CASH_METHODS`) hacen que no haga falta una tabla hija.

**Frontera de congelamiento:** `MAX(day)` de `CashDayClose` por tenant. Una consulta; no se desnormaliza en `Tenant`.

**Server action `closeDay(formData)`** — una sola escritura, una sola transacción Serializable, guarda `orders:manage` (la misma de caja y libro, `caja-actions.ts:11-16`):

1. Parsear `day`, declarados y nota. `isDayKey`.
2. Leer `lastClosedDay`. Leer `previous` (groupBy `type, method` con `occurredAt < inicio de since`, como `getLibroCajaData:113-117`) y `movements` (rango `[since, day]` en hora de pared, como `monthRangeUtc`).
3. `buildCierreDiario` + `validateCierre` **en el servidor**, nunca confiando en lo que calculó el navegador.
4. `create CashDayClose` + `createMany` de `ajustesAsMovements(cierre, finDelDía)` con `dayCloseId`. El `@@unique(tenantId, day)` es el árbitro contra el doble cierre.
5. `auditAdmin({ action: "caja.cierre", entity: "CashDayClose", changes: { day, diff por medio, note } })`.
6. `revalidatePath` de `/admin/caja/cierre` y `/admin/caja/libro`.

**Guardas nuevas en las acciones existentes** (dos líneas cada una): `addLibroEntry` y `deleteLibroEntry` leen `lastClosedDay` y devuelven `frozenDayMessage` si `isFrozenDay(dateStr, lastClosedDay)`. `deleteLibroEntry` además rechaza `dayCloseId != null` con el mismo mensaje que hoy protege VENTA/APERTURA.

### 5.1 La pantalla y el bug del Server Action

El bug (botón trabado en "Guardando…", lista sin refrescar, dato escrito; 100% de fallas con 298 filas) castiga las pantallas con **muchas escrituras interactivas**. El cierre se diseña para esquivarlo, no para convivir con él:

- **La pantalla es de lectura.** GET con `?dia=`. Todo el cálculo viene renderizado del servidor. Cambiar de día es un link, no un submit.
- **Una sola escritura al final.** Tres inputs + nota + un botón "Cerrar el día". La acción se invoca **directo** y se espera su promesa, con `router.refresh()` — el patrón que `LibroForms.tsx:1-25` ya adoptó porque `useActionState` se colgaba.
- **Idempotente ante el reintento.** Si la UI se traba y la persona reintenta, el `@@unique(tenantId, day)` rechaza el segundo cierre con un mensaje claro y la página re-renderizada muestra el día como cerrado. El peor caso es un aviso, no un ajuste duplicado.
- **Sin previsualización interactiva de la diferencia.** No hay `onChange` que llame al servidor para mostrar el `diff` mientras se tipea: la diferencia se puede calcular en el cliente con `buildCierreDiario` (es pura y no necesita la base — el esperado ya viene renderizado), o mostrarse después del cierre. Cero escrituras hasta el botón.

Los movimientos del período se pintan como tabla del libro (`LibroCajaPage`, reuso del componente/estilo), sin botón de borrar en días congelados.

---

## 6. Qué NO hacer (sobre-ingeniería para 280 movimientos/mes)

- **No modelar la seña como entidad ni como pasivo "anticipos de clientes".** Una fila del libro con detalle alcanza. Cuando haya que saber "cuántas señas tengo vivas", es un filtro por detalle o, a lo sumo, un `tag` en `CashMovement`. No antes.
- **No generar `AccountReceivable` automáticamente al cobrar una seña** (§4.2). Deuda sólo cuando hay servicio hecho y saldo impago, y por ahora a mano.
- **No conciliar MP línea por línea con importación de extracto.** Saldo declarado contra saldo esperado, una vez por día, es lo que la dueña ya hacía en la columna K. Un CSV de MP es un módulo posterior si el volumen lo pide; hoy sería cientos de checkboxes "conciliado" — exactamente el patrón que el bug del Server Action castiga.
- **No conciliar tarjeta por liquidación (T+N, comisiones, retenciones).** Se declara opcional; cuando se acredita, la comisión se carga como EGRESO en TARJETA y la diferencia se asienta en el cierre de ese día. El día que el negocio realmente venda con tarjeta se revisa.
- **No reabrir cierres, ni flujo de aprobación de diferencias.** Corrección = movimiento nuevo con fecha de hoy. Un dueño, una caja: el gate es `orders:manage`, no un workflow.
- **No cerrar "el mes" como entidad aparte.** El mes está cerrado cuando su último día está cerrado; el libro mensual ya deriva el resumen. `SUM(diff*)` por mes sale de `CashDayClose` con una consulta.
- **No multi-caja / multi-turno por día.** Un `CashDayClose` por día por tenant. `CashSession` sigue para el retail con turnos; no se fusionan.
- **No capability nueva.** `orders:manage`, como caja y libro (mismo argumento de `caja-actions.ts:11-16`).
- **No snapshot del libro completo en el cierre.** Se congelan seis números por medio; el detalle es reproducible porque los movimientos ≤ día cerrado son inmutables. Guardar las filas de nuevo sería duplicar el ledger.
- **No tocar `Payment` ni `Order.paid`** (ADR-060 ajuste 1: aditividad). El puente turnos/POS → libro (§4.6) es una decisión aparte con su propia transición.

---

## 7. Orden de integración sugerido

1. **Ya entregado:** `src/lib/caja/cierre-diario.ts` + `cierre-diario.test.ts` (26 tests: día vacío, tres medios, ±diff, MIXTO, señas, cobro de cartera contado una vez, arrastre entre días, día absorbido, congelamiento, validación, y los dos casos reales: marzo −154.500 y agosto +69.190/+16.723 sobre el fixture).
2. Migración aditiva §5 (`CashDayClose`, `CashMovement.dayCloseId`, `CashMovement.collectionId`). `prisma migrate deploy` a Neon **sólo con autorización del dueño**. El código debe tolerar que las columnas no existan (schema-ahead, como A-5).
3. Guardas de congelamiento en `addLibroEntry` / `deleteLibroEntry`.
4. `closeDay` + pantalla `/admin/caja/cierre` (lectura + una confirmación).
5. Puente cartera → caja en `applyCollectionInTx` (una `create` más, dentro de la tx que ya existe) + alta de fiado en `/cuentas-a-cobrar`.
6. Fix de `closeCashSession` (`method` en el select) y, opcional, que asiente su `closingDiff`.
7. QA end-to-end sobre `beauty-spa` local: cargar tres movimientos, cerrar con diferencia, verificar que el libro muestra el ajuste como última fila del día y que borrar una fila de ese día devuelve el mensaje de congelado; cobrar una AR y verificar que aparece en el libro y en `cobrosCartera` del cierre, una sola vez.

---

## 8. Hallazgos colaterales (no tocados; fuera de mi alcance de archivos)

- **Bug:** `closeCashSession` no pasa `method` a `reconcileCash` (`src/lib/caja-actions.ts:219-226`); todo movimiento del turno cuenta como efectivo. Contradice `libro-caja-actions.ts:158-162`.
- **Hueco:** no existe alta de `AccountReceivable` desde la UI (`createReceivable` sin callers en `src/app`). La pantalla de cuentas a cobrar sólo cobra lo que no se puede crear.
- **Hueco:** `PaymentMethod` no tiene TARJETA (`schema.prisma:24-28`); un cobro de fiado con tarjeta hoy no se puede registrar. Agregar el valor al enum es aditivo.
- ~~**Hueco:** `confirmPayment` y las ventas no-efectivo del POS no llegan al libro (§4.6).~~ **Cerrado 2026-09-07** (ver recuadro en §4.6; la parte de turnos queda degradada hasta aplicar la migración `paymentId`).
