# Rendición de la profesional que cobra aparte (GSG-CH-006 · D6)

**Problema** (CH, sábado 08/11, 7 de 18 turnos): la profesional con `Professional.cobraEnMostrador = false`
cobra SUS turnos (`src/lib/turnos/cobro-mostrador.ts`). Ese cobro entraba al libro como plata del local
(`aplicarCobroTurnoInTx` → `recordCobroTurnoInTx`), pero el cajón no la tiene: el cierre no cerraba.

## 1. Modelo
- `CobroARendir` (1:1 con el `Collection` del cobro): profesional, turno, monto, medio, `rendicionId` (NULL = pendiente).
- `RendicionProfesional`: profesional, `cobrado` = Σ cobros cubiertos, `entregado`, `retenido`
  (CHECK `cobrado = entregado + retenido`, ninguno negativo, y **`retenido = 0`** mientras la retención esté
  apagada), medio, `idempotencyKey` única por negocio,
  `cashMovementId` (el ingreso del libro), `payoutId` (la liquidación que descontó la retención), nota, quién.
- Migración aditiva sin aplicar: `prisma/pending-gate2/CH_rendicion_profesional.sql` (RLS, reversa al pie). Sin enum
  nuevo. El código usa SQL crudo y pregunta antes si las tablas están **y** si `app_rls` tiene permisos
  (`has_table_privilege`): **sin las tablas o sin permisos, todo sigue como hoy**. Se aplica como `neondb_owner`.
- `CobroARendir.collectionId` → `Collection` con **RESTRICT**: ningún flujo normal borra cobros (se anulan con
  contrapartida); un cobro a rendir no se borra llevándose su rastro.

## 2. Reglas (`src/lib/comisiones/rendicion-core.ts`)
- **A rendir** sólo si cobra **la profesional del turno** (su usuario) **y** ella tiene `cobraEnMostrador = false`.
  Si la dueña le cobra un turno a ella, entra al cajón como siempre. Voucher: nunca (lo liquida OpenKey).
- Medios: todos menos voucher quedan a rendir — si ella cobra, la plata va a su efectivo o a su cuenta.
  **Provisional a confirmar.**
- **Quién rinde:** la profesional entrega. **Quién registra:** dueña o recepción (`cash:manage`).
- **Se rinde el total cobrado** (ni de más ni de menos). La **retención** (que la profesional se quede con su
  comisión) está **APAGADA** (decisión del 14/11): la liquidación (`settleCommissions`) le paga esa comisión igual y
  quedaría pagada dos veces. `validarRendicion` rechaza `entregado < cobrado` con «La rendición es por el total
  cobrado; la comisión se paga en la liquidación».
- Clave del formulario: doble envío idéntico = «ya registrada»; la misma clave con **otros** cobros = error
  («clave-reusada»), nunca un ok que deja cobros sin rendir. Todo o nada sobre los cobros elegidos. Un cobro anulado no se rinde.
- **Medio por defecto de la rendición: efectivo, como la liquidación de hoy. Provisional a confirmar (decisión F5 del
  dueño).**

## 3. Libro de caja y cierre
- El cobro a rendir **no** escribe en el libro. Al **rendir**, y no antes, se asienta un `INGRESO` por lo entregado,
  con la marca `rendicion:<id>` (no se borra a mano desde el libro), enganchado al turno de caja abierto si lo hay.
- Frontera del cierre obligatoria (lección DB-5): con el día ya cerrado, la rendición se rechaza y se registra al
  día siguiente. El cierre del día cuenta sólo lo que está en el cajón; lo pendiente de rendir no lo desarma.
- Concurrencia: candado del turno (el mismo de la anulación) y de los cobros, reclamo condicionado con conteo
  exacto y clave del formulario. Probado en `rendicion-postgres.test.ts` (doble envío, N concurrentes).

### Anulación (`src/lib/turnos/anulacion.ts`, `cobroRendidoInTx`)
- Cobro a rendir **todavía no rendido**: la anulación no toca el libro (la plata nunca entró) y el cobro deja de
  figurar a rendir; la rendición ya no lo toma (ve la contrapartida `ANULACION:`).
- Cobro **ya rendido**: la devolución sale del cajón **hoy**: un `EGRESO` con fecha de hoy, en el medio de la
  rendición, enganchado al turno de caja abierto, contra el `collectionId` del cobro (el `@@unique(tenantId,
  collectionId, type)` es la clave idempotente, como toda reversa) y firmado `anulacion-turno:<actor>` (no se
  borra a mano). Con el día de hoy cerrado, la anulación se rechaza (DB-5).
- Carrera rendir ‖ anular: las dos toman el mismo candado del turno; gane cuál gane, el libro neto da 0.

### Cobro con producto
- Si la profesional que cobra aparte cobra **su** turno con producto, el camino se rechaza entero con un mensaje
  claro (`MENSAJE_COBRA_APARTE_CON_PRODUCTO`): el producto entraría al libro con plata que tiene ella. El producto
  lo vende el mostrador. Lo más simple y coherente; si CH lo pide, se puede dejar el producto a rendir también.

## 4. Comisiones (la pantalla y la liquidación)
- `/admin/comisiones` muestra, por profesional que cobra aparte: lo que tiene a rendir (cobros tildables), el
  formulario «Registrar rendición» (siempre por el total) y las últimas rendiciones.
- La comisión se sigue calculando igual (sobre `Payment.amount`): el cobro a rendir es plata cobrada.

## 5. Deuda
- **Retención apagada.** Para prenderla hay que integrarla con la liquidación: al liquidar, restar del egreso la
  Σ `retenido` de sus rendiciones con `payoutId` NULL y estampar ese `payoutId`; recién ahí se borra el CHECK
  `RendicionProfesional_sin_retencion` y vuelve el campo (con `commissions:manage`). `comisionEstimada` queda lista.
- **Integración con la liquidación (PR #139, rama `claude/ch-comisiones-mi-liquidacion`):** hoy la liquidación
  paga la comisión de cobros **todavía no rendidos** (la plata la tiene la profesional y el local le paga encima).
  Al integrar: liquidar sólo cobros rendidos, o descontar lo pendiente de rendir. No se toca en este PR.
- Scripts de operador que borran `Collection` (`src/lib/reset-golive-db.ts`, `prisma/seed-magra.ts`): con la FK
  RESTRICT tienen que borrar antes `CobroARendir` / `RendicionProfesional` (y el `CashMovement` de la rendición).
- Mostrar «a rendir» en la pantalla del cierre (informativo). Confirmar medios y medio por defecto (F5).
