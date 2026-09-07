# Corte inicial de caja — arrancar de la realidad, no de un número heredado

**Estado:** lógica pura + script entregados (`src/lib/caja/corte-inicial.ts`, 21 tests; `scripts/corte-inicial.ts`). Congelamiento en las acciones del libro, pantalla y modelo `CashDayClose`: pendientes de integración (§7).
**Tenant que lo pide:** `beauty-spa` (CH Estética). Histórico consolidado: 1.069 movimientos; julio no encadena; 18 días sin datos (29/07 → 15/08).
**Fuente de verdad:** el código, con archivo y línea. Donde este doc y el código difieran, gana el código.
**Documento hermano:** `docs/producto/diseno-cierre-diario-caja.md` — el corte inicial **es** su primer cierre (§2).

---

## 0. En una frase

El día de corte se **cuenta** la plata que hay de verdad por medio (efectivo, MP, tarjeta), el sistema **asienta como movimiento visible** la diferencia contra lo que el histórico decía, y desde el día siguiente el libro dice **lo que se contó**. El histórico queda cargado, consultable y sin tocar — como registro, no como origen del saldo.

## 1. Por qué existe (los hechos que lo fundan)

De la auditoría de la planilla de CH Estética (`Factory-GSG/20-MEMORIA/reference_auditoria_planilla_caja_ch.md`):

- Ningún saldo estuvo nunca atado a un conteo físico. El primer mes abre con 100.000 / 100.000 redondos.
- Marzo: faltante de **$154.500** anotado al margen (`MARZO!M3 = D6 − 154500`) y **nunca asentado**; abril abrió como si la plata estuviera.
- El saldo encadenado de MP se va **negativo** en abril (−$8.933,99). Un saldo de plata no puede ser negativo: es la prueba de que la cadena estaba rota.
- Julio sin cargar entero, medio agosto tampoco. Julio no encadena: faltan ~$1,8M de egresos (comisiones y alquiler).
- Los primeros arqueos físicos aparecen en agosto, al margen, con diferencias reales de $69.190 y $16.723 — tampoco asentadas.

**Decisión del dueño, ya tomada:** el histórico se importa como REGISTRO (`scripts/import-caja-historica.ts`, runbook `docs/runbooks/import-caja-historica.md`), pero el saldo operativo **no** se deriva de él. Nace de un arqueo en una fecha de corte.

**El problema de diseño concreto:** el libro deriva el saldo inicial de cada mes de todo lo anterior — `openingFromHistory` (`src/lib/caja/libro-caja.ts:115`), que la acción alimenta con un `groupBy(type, method)` de todo lo fechado antes del mes (`src/lib/libro-caja-actions.ts:125-128`). Si se carga el histórico Y se arranca de un arqueo sin más, el primer mes operativo sumaría las dos cosas. Hace falta que, desde el corte, la derivación dé lo contado **sin borrar ni falsear** lo anterior.

## 2. El mecanismo: el corte inicial ES el primer cierre diario

No hay un segundo mecanismo. El cierre diario (`src/lib/caja/cierre-diario.ts:198` `buildCierreDiario`) ya hace exactamente lo que el corte necesita: toma "todo lo anterior", compara lo que el libro dice contra lo que la persona **declara**, y emite la diferencia como movimientos INGRESO/EGRESO del libro con el signo de `movementSign` (`src/lib/caja/cash-register.ts:43`, la única tabla de signos del sistema). Su propiedad central, probada en su test "el arrastre entre días cierra":

```
openingFromHistory(previous + movements + ajustes) === openingAfterCierre(cierre)
```

Con `lastClosedDay = null`, el "período" del cierre es **todo el histórico** y esa propiedad se lee: *desde el día de corte, el saldo que el libro deriva es el declarado*. Eso es el corte. `buildCorteInicial` (`src/lib/caja/corte-inicial.ts:149`) es `partitionForCierre(all, {lastClosedDay: null})` + `buildCierreDiario` + re-etiquetado de los ajustes. No recalcula nada.

**Cómo queda el ledger** (una sola tabla, `CashMovement`, tres tramos por fecha contable — `tramoDe`, `corte-inicial.ts:289`):

```
 ──── HISTÓRICO (registro) ────────────────┐ CORTE │──── OPERATIVO ────────▶
 feb  mar  abr  may  jun  jul  ago …  D   │ D 23:59│ D+1  D+2  …
 lo que la planilla decía, tal cual        │ ajustes│ lo que pasa de verdad
 saldo derivado ≠ saldo real (y se sabe)   │ ±desvío│ saldo derivado = contado
                                            └────────┘
 openingFromHistory(≤ D) === lo contado en D      ← INVARIANTE DEL CORTE
```

Lo que el corte **agrega** sobre el cierre común, y nada más:

1. **Validación más estricta** (`validateCorteInicial`, `corte-inicial.ts:228`). Se declaran **los tres medios**, tarjeta en 0 incluida: en el cierre común "no declarado" significa "arrastra lo que decía el libro", y acá nada operativo puede venir de la planilla. Nota **siempre** obligatoria (cómo se contó, a qué hora, de dónde salió el saldo de MP). **No puede existir un cierre anterior**: si existe, lo que corresponde es un cierre diario, no un segundo corte.
2. **Un rótulo propio en el ajuste, con los números a la vista** (`detalleAjusteCorte`): `Corte inicial 06/09/2026 — Efectivo: el histórico decía $652.534,00, se contaron $498.034,00 (faltante $154.500,00)`. La fila se lee sola. Para CH ese desvío va a ser grande y es **información**, no vergüenza: es la medida de cuánto se había desviado la planilla.
3. **La regla para movimientos retroactivos** (§4): congelamiento + par movimiento/contra-asiento + verificación del invariante.

Todo lo demás es del cierre: la frontera de congelamiento es el día de corte (`isFrozenDay`, `cierre-diario.ts:77`), el mensaje a la persona es `frozenDayMessage` (`:82`), los ajustes van fechados al **final del día de corte** para ser la última fila del histórico (`corteAsMovements`, `corte-inicial.ts:206`, ids `corte-<día>-<n>`).

**Por qué D es el último día del histórico y no el primero operativo.** El arqueo se hace al cerrar el local el día D, después de cargar lo último del día. D+1 es el primer día en que todo entra al sistema. Fechar los ajustes a las 23:59 de D (hora del negocio) hace que el mes de D los muestre como su última fila y que el mes de D+1 abra con lo contado, sin ninguna fila especial.

## 3. Representación elegida y el trade-off

| Opción | Qué es | Migración | Veredicto |
|---|---|---|---|
| **A. Ajuste como movimiento del libro** (INGRESO/EGRESO), `reason` con prefijo `Corte inicial`, `createdBy = corte-inicial:<día>` | Lo mismo que hace el cierre diario y lo mismo que hace el importador con su marca (`import-caja.ts:290`) | **Ninguna** | **Elegida.** Es el mecanismo que ya existe; el libro lo pinta hoy sin tocar una línea de UI; `openingFromHistory` lo absorbe sin saber que es especial. |
| B. Modelo propio `CorteInicial` (día, declarado por medio, nota) + ajustes con FK | Más explícito y consultable | Sí | Descartada: sería un **segundo** mecanismo al lado de `CashDayClose` (cierre diario §5), con dos frentes de congelamiento y dos tablas que decir "cuánto se declaró". El corte es un cierre; su fila va en la tabla del cierre. |
| C. Columna `Tenant.corteInicialDay` + `openingFromHistory` que ignore lo anterior | Parece simple | Sí | Descartada: **falsea**. El saldo operativo dejaría de ser derivable del ledger, el desvío quedaría invisible (justo lo que la planilla hacía al margen) y los meses históricos perderían el arrastre. |

**Lo que se pierde con A hasta que exista `CashDayClose`:** la nota del corte y los seis números declarados viven en el `AuditLog` (`caja.corte-inicial`, escrito por el script) y en el `reason` de cada ajuste, no en una fila propia consultable. Y la frontera de congelamiento no está en una columna: se deriva de la marca (`MAX(día)` de `createdBy LIKE 'corte-inicial:%'`). Es exactamente el mismo trade-off que aceptó el importador (marca en `createdBy`, sin schema) y se resuelve solo cuando aterrice el cierre diario.

**Cuando exista `CashDayClose`:** el corte es la fila con `since = NULL` (la única que abarca desde el origen), sus ajustes llevan `dayCloseId`, la frontera es `MAX(day)`, y el script queda obsoleto: el corte se hace desde `/admin/caja/cierre` como cualquier cierre, con `validateCorteInicial` en lugar de `validateCierre` cuando no hay cierre previo. **No hace falta ninguna migración propia del corte.**

### 3.1 La migración que el corte NO necesita pero el cierre sí (escrita, sin aplicar)

Es la del §5 del diseño del cierre diario, en SQL, para que el integrador la deje en `prisma/migrations/<timestamp>_add_cash_day_close/migration.sql` y refleje el modelo en `prisma/schema.prisma`. **No se creó el archivo** en `prisma/migrations` porque está fuera de los archivos de esta entrega. Aditiva, sin downtime, sin reinterpretar filas vivas. **Aplicar a Neon requiere autorización explícita del dueño y `prisma migrate deploy`, nunca `migrate dev`.** La tabla nueva lleva `tenantId`: antes de aplicar, correr `npm run gate:rls` para confirmar que queda cubierta por la policy.

```sql
-- CIERRE DIARIO de caja (docs/producto/diseno-cierre-diario-caja.md §5). El CORTE INICIAL
-- es la primera fila de esta tabla (since IS NULL): no tiene modelo propio.
--
-- ⚠️ NO APLICADA a Neon (gate del dueño). El código del corte NO la requiere: hasta que
--    exista, los ajustes se reconocen por reason/createdBy (docs/producto/corte-inicial-caja.md §3).

CREATE TABLE "CashDayClose" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "day"          TEXT NOT NULL,            -- "YYYY-MM-DD" en la zona del negocio
    "since"        TEXT,                     -- primer día que abarca; NULL = desde el origen (corte inicial)
    "expectedCash" DOUBLE PRECISION NOT NULL,
    "expectedMp"   DOUBLE PRECISION NOT NULL,
    "expectedCard" DOUBLE PRECISION NOT NULL,
    "declaredCash" DOUBLE PRECISION NOT NULL,
    "declaredMp"   DOUBLE PRECISION,         -- NULL = no conciliado ese día (nunca NULL en el corte)
    "declaredCard" DOUBLE PRECISION,
    "diffCash"     DOUBLE PRECISION NOT NULL,
    "diffMp"       DOUBLE PRECISION,
    "diffCard"     DOUBLE PRECISION,
    "note"         TEXT,
    "closedBy"     TEXT NOT NULL,
    "closedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashDayClose_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CashDayClose_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CashDayClose_tenantId_day_key" ON "CashDayClose"("tenantId", "day");
CREATE INDEX "CashDayClose_tenantId_closedAt_idx" ON "CashDayClose"("tenantId", "closedAt");

-- Rastro del ajuste a su cierre (no nulo = no se borra desde el libro) y del ingreso a su
-- cobro de cartera (idempotencia, mismo patrón que orderId / A-5).
ALTER TABLE "CashMovement" ADD COLUMN "dayCloseId" TEXT,
                           ADD COLUMN "collectionId" TEXT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_dayCloseId_fkey"
    FOREIGN KEY ("dayCloseId") REFERENCES "CashDayClose"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_tenantId_collectionId_key" ON "CashMovement"("tenantId", "collectionId");
CREATE INDEX "CashMovement_dayCloseId_idx" ON "CashMovement"("dayCloseId");

-- Backfill del corte hecho por script (si se corrió antes de esta migración): una fila
-- CashDayClose por marca 'corte-inicial:<día>' con los valores del AuditLog
-- caja.corte-inicial, y UPDATE CashMovement SET dayCloseId WHERE createdBy = marca.
-- Se hace a mano, con el AuditLog a la vista: son 1 fila y ≤ 3 ajustes por tenant.
```

## 4. Movimientos retroactivos: qué pasa y qué se decidió

**Definición.** Retroactivo = movimiento fechado (`occurredAt`) en o antes del día de corte, cargado después del corte.

**El hecho que manda:** todo lo que pasó antes del corte **ya está en el conteo**. Si el alquiler de julio se pagó, esa plata ya no estaba en el cajón cuando se contó; el desvío del corte ya la incluye. Cargar ese egreso suelto con fecha de julio **lo cuenta dos veces** y mueve el saldo operativo en `movementSign(type) × amount` — exactamente lo que el test "un movimiento cargado con fecha anterior al corte ROMPE el invariante" muestra: con un EGRESO retroactivo de 1.800.000, `openingFromHistory(≤ D)` pasa de lo contado a lo contado − 1.800.000.

**Decisión: lo contado en el corte es la verdad, y el retroactivo suelto es una violación, no una corrección.** Tres capas:

1. **Preventiva (persistencia, pendiente de integración):** `addLibroEntry` y `deleteLibroEntry` (`src/lib/libro-caja-actions.ts:167`, `:300`) consultan `isFrozenDay(fecha, díaDeCorte)` y devuelven `frozenDayMessage`, que ya le dice a la persona qué hacer: *"cargalo con la fecha de hoy y aclarás en el detalle a qué día corresponde"*. Es la regla del cierre diario; el corte sólo fija la frontera en D.
2. **Detectiva (pura, `verificarInvarianteCorte`, `corte-inicial.ts:316`):** recomputa `openingFromHistory(≤ D)` y lo compara con lo declarado, por medio. Si difiere, devuelve el desvío y, cuando las filas traen `createdAt`, señala las tipeadas después del corte (`sospechosos`). El script la corre **obligatoriamente** después de escribir (exit 3 si no cierra) y sirve para cualquier auditoría posterior.
3. **Correctiva (para completar el histórico a conciencia, `contraAsientoRetroactivo`, `corte-inicial.ts:357`):** si de verdad hay que dejar el registro histórico completo (los ~$1,8M de julio), cada fila retroactiva entra **en par** con un contra-asiento fechado en el día de corte, tipo contrario, mismo medio y monto, rótulo `Corte inicial D — reclasificación del desvío en Efectivo por movimiento retroactivo del 10/07/2026: Comisiones y alquiler julio ($1.800.000,00)`. Los dos se escriben en la **misma transacción** o ninguno. Resultado (test "un retroactivo con su contra-asiento"): el saldo operativo no se mueve, julio muestra el egreso que le faltaba, y en el mes del corte se ve el ajuste original **y** la reclasificación — el desvío pasa de "sin explicar" a "explicado por los egresos de julio". Es contabilidad normal: no se borra, se contra-asienta.

Un retroactivo fechado **después** de D no es retroactivo: es operativo y entra normal. Un movimiento posterior a D que ya estaba cargado cuando se hizo el corte no entra al cálculo y el script lo avisa (`posterioresAlCorte`): lo normal es cortar **antes** de cargar lo operativo.

## 5. Procedimiento operativo — el día del corte, paso a paso

**Quién hace qué.** La dueña **cuenta y declara**; Gestión Studio Grow (GSG) **ejecuta y verifica**. Ninguno de los dos tipea un saldo inicial a mano en ningún lado.

**Antes (GSG, días previos):**

- Histórico importado a producción con el runbook `docs/runbooks/import-caja-historica.md`, reconciliación OK, reporte JSON guardado. Cerrar con la dueña qué se hizo con las filas `dudoso`.
- Elegir **D** con la dueña: el **último día en que se usa la planilla**. Ojo: la hoja "agosto" de la planilla corre del 16/08 al **06/09** (el fixture del libro lo tiene así); D no es "fin de mes", es "el último día con datos en la planilla". Idealmente un día de atención, al cerrar el local, con el compromiso de que al día siguiente **todo** se carga en el sistema.
- Dry-run del script contra producción con números de prueba para ver cuánto histórico absorbe y confirmar que no hay filas posteriores a D ni un corte previo.

**El día D, al cerrar el local (la dueña, en este orden):**

1. Cargar en la planilla **todo** lo del día D. Es la última vez que se toca.
2. **Efectivo:** contar todo el efectivo del negocio (cajón, caja fuerte, sobre de cambio). Anotar el total y la hora. Si hay efectivo apartado que no es del negocio (una seña que se devuelve mañana, plata personal), no se cuenta y se anota por qué.
3. **MP / Transferencia:** abrir la app de Mercado Pago y el home banking de cada cuenta que recibe cobros del negocio. Anotar por cuenta: **dinero disponible + dinero a liberar** (el libro registra el cobro el día que se cobra, no el día que MP lo libera; si se declara sólo lo disponible, lo pendiente aparecería como faltante). Sumar. Anotar la hora. *Provisional a confirmar con la dueña: si en su planilla la columna MP se anotaba al liberarse, se declara sólo lo disponible.*
4. **Tarjeta:** **0**. La columna TARJETA está en cero en toda la serie de la planilla y no hay un saldo "en poder de la terminal" que el negocio siga. Si hubiera liquidaciones pendientes de tarjeta, se anotan en la nota y se cargan como INGRESO en TARJETA el día que se acreditan. *Provisional a confirmar.*
5. Pasarle a GSG los tres números, la hora de cada conteo y la nota (dos renglones: cómo se contó y qué se dejó afuera).

**Ese mismo día o a la mañana siguiente antes de abrir (GSG):**

6. **Dry-run** con los números reales:
   ```bash
   DATABASE_URL=<neon> npx tsx scripts/corte-inicial.ts --tenant beauty-spa --dia 2026-09-06 \
     --efectivo 498034 --mp 1414230 --tarjeta 0 --actor "user:<id de la dueña>" \
     --nota "Cajón + caja fuerte contados 20:10. MP disponible 1.100.000 + a liberar 314.230 según app 20:15."
   ```
   Leer la tabla **histórico decía / se contó / desvío**. Un desvío grande es lo esperado (§1). Chequear: signos con sentido (histórico de MP negativo → sobrante), tarjeta 0/0, `posteriores al corte: 0`, `validación OK`.
7. **`--write`.** Leer hasta el final: `OK: el saldo operativo desde el 2026-09-07 es exactamente lo contado`. Si dice `EL INVARIANTE NO CIERRA`, no se sigue (§6).
8. Abrir `/admin/caja/libro` en el mes de D: los ajustes son las últimas filas del día D, con su rótulo; el SALDO ACTUAL por medio es lo contado. Navegar al mes de D+1: el Saldo inicial es lo contado. Mostrárselo a la dueña.
9. Guardar en el AuditLog ya está (`caja.corte-inicial` con los seis números y la nota). Archivar la planilla en solo lectura.

**Desde D+1 (la dueña):** todo entra al sistema con la fecha del día. **Nada con fecha ≤ D.** Si aparece algo de antes del corte (un gasto que se olvidó), se carga con la fecha de hoy y en el detalle se aclara a qué día correspondía — hasta que las acciones congelen, esto es una regla acordada, no un candado (§7). Cada noche: arqueo del efectivo contra el saldo del libro; cuando exista el cierre diario, es un botón.

## 6. Si el corte salió mal

La regla que ordena todo: **¿ya se cargó algo operativo (fechado > D)?**

| Situación | Qué se hace | Por qué |
|---|---|---|
| Número mal declarado / nota mal / D equivocado, **antes** de cargar nada operativo | `--rollback` (dry-run), `--rollback --write`, corregir, volver a correr. El AuditLog conserva el corte fallido y su rollback. | Nada descansa todavía sobre el saldo declarado. El rollback borra sólo las filas con la marca del día (`createdBy = corte-inicial:<D>`, sin pedido ni turno) y avisa si hay filas operativas. |
| Se descubre el error **después** de operar | **Nunca rollback.** Corrección hacia adelante: el día que se detecta, se asienta la diferencia (con el cierre diario cuando exista; hasta entonces, INGRESO/EGRESO en el libro con la fecha de hoy y detalle `Corrección del corte inicial D: …`). El ajuste original del corte **no se toca**. | Lo operativo ya arrancó de ese saldo; cambiarlo retroactivamente lo desencadena todo. Es la misma regla del cierre diario: no se reabre, se contra-asienta. |
| El histórico estaba incompleto (julio) y se quiere completar | Par retroactivo + contra-asiento (§4.3), en una transacción. Hoy: a mano por GSG (SQL con `contraAsientoRetroactivo` como guía, o esperar la acción del cierre). Verificar con `verificarInvarianteCorte`. | Completa el registro sin mover el saldo operativo; el desvío queda explicado. |
| Alguien cargó algo con fecha ≤ D (sin congelamiento todavía) | Detectar con el script en dry-run (la tabla ya no da "histórico decía = contado", o correr `verificarInvarianteCorte`). Si fue un error: borrarlo desde el libro. Si es un hecho real: convertirlo en par con contra-asiento. | El invariante es verificable en cualquier momento; el `createdAt` señala qué se tipeó después del corte. |
| El script cortó con exit 3 (invariante no cierra tras escribir) | No operar. Leer el desvío impreso: casi seguro una carga concurrente entre la lectura y la escritura (el lock consultivo serializa corridas del script, no altas del libro). Rollback y repetir con el libro quieto. | El invariante es la promesa del corte; sin él no hay corte. |

## 7. Qué falta para ejecutarlo de verdad

**Del dueño (owner-level):**

1. Autorizar la **importación del histórico a Neon** (escritura sobre datos de un cliente real; runbook del importador, paso "Antes de correrlo contra producción").
2. Acordar con la dueña la **fecha D** y que desde D+1 nada se carga en la planilla.
3. Recibir los **tres números contados**, la hora y la nota; confirmar los dos *provisionales* del §5 (MP: disponible + a liberar; tarjeta: 0).
4. Autorizar el **`--write` del corte en producción**.
5. Más adelante, autorizar la migración `CashDayClose` (§3.1) con `prisma migrate deploy`.

**De integración (fuera de los archivos de esta entrega, para quien integre):**

- **Congelamiento** en `addLibroEntry` / `deleteLibroEntry` (`src/lib/libro-caja-actions.ts:167`, `:300`): `isFrozenDay(dateStr, lastClosedDay)` → `frozenDayMessage`. `lastClosedDay` hoy se deriva de la marca (`MAX` del sufijo de `createdBy LIKE 'corte-inicial:%'`); con `CashDayClose`, `MAX(day)`. Hasta que esto esté, el corte depende de una regla acordada, no de un candado — hay que decirlo así.
- **Pantalla del libro:** marcar cada fila con `tramoDe` (HISTÓRICO / CORTE / OPERATIVO) y, en los meses ≤ D, un aviso: *"Histórico importado de la planilla. Este saldo no es el saldo del negocio: el saldo real arranca en el corte del D."* El corte se ve; el histórico se consulta; nadie los confunde.
- **Acción `closeDay`** (cierre diario §5): cuando no haya cierre previo, usar `buildCorteInicial` + `validateCorteInicial` en vez de `buildCierreDiario` + `validateCierre`. Es la única bifurcación.
- El bug de `closeCashSession` sin `method` (cierre diario §8) sigue abierto; no afecta al corte (no usa turnos) pero sí a cualquier tenant que los use.

## 8. Verificación

```bash
node --import tsx --test src/lib/caja/corte-inicial.test.ts     # 21 tests
node --import tsx --test "src/lib/caja/*.test.ts"               # suite completa de caja: 125
npx tsc --noEmit && npx eslint src/lib/caja/corte-inicial.ts src/lib/caja/corte-inicial.test.ts scripts/corte-inicial.ts
```

Lo que los tests prueban, agrupado:

- **Caso real:** el agosto 2026 de la planilla como histórico, corte en su último día (06/09), contado = RESUMEN + los sobrantes reales de la dueña (69.190 / 16.723) → dos INGRESO asentados, ninguno en tarjeta, y el 07/09 abre con lo contado. Marzo: 652.534 → 498.034 produce el EGRESO de 154.500 que la planilla dejó al margen.
- **Saldo operativo = declarado** contra cinco históricos distintos (vacío, con MP negativo, real, absurdo, sólo APERTURA).
- **La diferencia se asienta y es visible:** signo verificado contra `movementSign`, monto = |desvío|, rótulo con los tres números, última fila del día en `buildLibro`, saldo del mes = declarado.
- **Meses históricos intactos:** el libro de marzo antes y después del corte es `deepEqual`; el mes del corte separa tramos.
- **Retroactivos:** suelto rompe el invariante (detectado, señalado por `createdAt`, día congelado); en par con contra-asiento no mueve el saldo y julio muestra el egreso; cubre VENTA/RETIRO; APERTURA y montos no usables no tienen contra-asiento.
- **Tres medios:** tarjeta 0 con histórico 0 (declarada, sin ajuste); tarjeta 0 con histórico 55.000 (EGRESO que la lleva a 0, a diferencia del cierre común que arrastraría); NaN rechazado por validación.
- **Validación:** nota siempre; sin cierre previo; hereda fecha futura / negativo / efectivo del cierre y devuelve todo junto.
- **Redondeo y resumen.**

Script probado end-to-end contra la base local `erp_corte` (tenant `beauty-spa`, 5 movimientos): dry-run → `--write` (2 ajustes, AuditLog, invariante OK) → segundo corte rechazado (exit 2) → `--rollback --write` → base como estaba.
