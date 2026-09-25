---
id: ADR-101
nivel: dominio
dominio: [Caja, Datos]
depends_on: [ADR-100]
---

# ADR-101 — Caja: un solo esperado. El cajón debe tener lo que dice el libro; el fondo tipeado es un conteo

**Estado:** Aceptado e implementado en código (2026-09-25, recomendación «corregir la caja» aprobada por
el dueño el 25/09). Sin migración. Sin desplegar: lo que está en producción sigue con el
comportamiento anterior hasta el próximo deploy.

## Contexto (medido en el código)

El mismo cajón tenía dos "esperados":

- **Turno de cajero** (`closeCashSession`, `src/lib/caja-actions.ts`, antes `reconcileCash` sobre
  `session.openingFloat` + movimientos con `sessionId` del turno): esperado = **fondo tipeado al abrir +
  efectivo del turno**.
- **Cierre del día** (`cerrarDia`, `src/lib/cierre-diario-actions.ts:409-458` → `buildCierreDiario`):
  esperado = **saldo del libro** (todo lo anterior, `groupBy`) **+ efectivo del período**, con
  `openingFromHistory`/`splitByMethod` (`src/lib/caja/libro-caja.ts`). La fila `APERTURA` tiene signo 0
  en el libro (`movementSign`, `src/lib/caja/cash-register.ts`): el fondo tipeado no llega al libro.

Si el fondo contado al abrir no coincide con el saldo en efectivo del libro, el turno cuadra y el día
asienta la diferencia como faltante o sobrante **de ese día**, sin que nadie la haya visto al contar. En el
laboratorio de MAGRA un cierre del día asentó un faltante de $146.578,25 con el turno cuadrado
(`00-ESTADO/decisiones-rediseno.md:39`, única fuente). **Que ese faltante haya salido de este mecanismo es
una lectura del código, no algo reproducido:** no hay datos de ese laboratorio en `.qa/` ni en `docs/`, y
ningún test lo reproduce. Segunda fuente del mismo desvío: efectivo que sale del
cajón **sin** `sessionId` del turno abierto (la reversa de un cobro de un turno anterior hereda el
`sessionId` del original, `src/lib/turnos/anulacion.ts:508`; lo mismo en `src/lib/order-anulacion.ts:448`):
el turno no lo ve y el día sí.

## Lente de contador

La verdad contable del cajón es **el libro**: la suma con signo de los movimientos en efectivo. El fondo
que la cajera tipea al abrir es un **conteo físico**, igual que el conteo al cerrar. Un conteo que no
coincide con el libro no cambia el saldo en silencio: se **asienta la diferencia**, una vez, en el
momento en que se encontró y por quien la encontró. Es la misma regla que ya aplicaban el arqueo de turno
(`ajusteDeArqueoTurno`) y el cierre del día (`ajustesAsMovements`) al cerrar; faltaba al abrir.

## Decisión

1. **Un solo esperado:** el efectivo esperado en el cajón es el saldo en EFECTIVO del libro hasta el
   final del día del negocio en curso (`saldoEfectivoDelLibro`, `src/lib/caja/saldo-cajon.ts`). Misma
   cuenta (`openingFromHistory`) y mismo borde (00:00 del día siguiente, hora del negocio) que el cierre
   del día. El turno arquea contra ese número (`arqueoContraElLibro`).
2. **Diferencia de apertura:** al abrir, si `fondo contado ≠ saldo del libro`, se asienta en la misma
   transacción Serializable un INGRESO (sobra) o EGRESO (falta) en EFECTIVO, `occurredAt` = el instante
   de apertura, marca `apertura-turno:<sessionId>` (`diferenciaDeApertura`, `src/lib/caja/cierre-marca.ts`).
   Quién: `CashSession.openedBy` de ese turno. La auditoría de la apertura guarda `saldoDelLibro` y
   `diferenciaDeApertura`. La fila va con `sessionId` NULL a propósito: la diferencia ya está dentro del
   fondo contado y el esperado en vivo de la pantalla (fondo + movimientos del turno) la contaría dos veces.
3. En el libro, la marca se clasifica como «diferencia de caja» y **no se borra** (`clasificarOrigen`,
   `motivoParaNoBorrar`, `src/lib/caja/libro-caja.ts`).
4. **No se reescribe historia.** Los cierres de día ya hechos, sus ajustes y los turnos ya cerrados quedan
   como están. La apertura ya estaba bloqueada sobre un día cerrado y la diferencia lleva fecha de hoy.
5. **La pantalla muestra y hace confirmar ese mismo número.** `getCajaData` devuelve `esperadoEnElCajon`
   (con o sin turno abierto). Las dos pantallas del turno (`CajaRenglon.tsx`, `page.tsx`) lo muestran como
   «Efectivo esperado en el cajón» con `esperadoDelCajon` (`src/lib/caja/esperado-del-cajon.ts`): el
   desglose es el del turno y lo que el turno no vio va en un renglón propio («Efectivo que no pasó por el
   turno»), así el desglose suma el total. Al abrir, el formulario dice lo que el libro espera y, si el fondo
   contado no coincide, pide confirmar la diferencia que va a quedar asentada.
6. **Lo confirmado es lo asentado.** Los dos formularios mandan el esperado que mostraron
   (`esperadoConfirmado`). `openCashSession` y `closeCashSession` lo comparan, dentro de la misma
   transacción, con el saldo del libro que usan para asentar; si no coincide (entró un movimiento mientras
   se contaba) no graban y dicen el número nuevo. Sin ese campo, no graban (denegar por defecto).

## Alternativas descartadas

- **Que el día espere lo que espera el turno (fondo tipeado).** Descartada: el fondo es un conteo, no una
  verdad; haría que un tipeo borrara del libro plata sin dejar rastro, y el día dependería de qué turnos
  hubo. Además no resuelve negocios sin turnos (CH).
- **Contar la fila APERTURA en el libro (signo +).** Descartada: sumaría el fondo cada vez que se abre un
  turno (el arrastre se contaría dos veces; ya lo advierte `splitByMethod`) y rompería los saldos
  históricos de todos los negocios.
- **Sólo asentar la diferencia al abrir y dejar el turno en `fondo + efectivo del turno`.** Descartada
  como solución completa: deja el segundo desvío (efectivo sin `sessionId`, p. ej. reversas de cobros de
  otro turno). Se toma la diferencia de apertura **y** el arqueo contra el libro.
- **Recalcular los cierres ya hechos (incluido el faltante de MAGRA).** Descartada: los cierres son
  inmutables; la corrección de un cierre mal asentado es un movimiento en contra con fecha de hoy, que
  decide el negocio, no el sistema.
- **Columna nueva en `CashMovement` para marcar la diferencia de apertura.** Descartada: requiere
  migración; la marca en `createdBy` es el patrón existente (`arqueo-turno:`, `cierre-diario:`, `comision:`).

## Consecuencias

- Turno y día esperan lo mismo: un turno que cuadra no deja faltante en el día (probado contra Postgres).
- **Lo que NO cambia:** el importe. Una diferencia entre el libro y el cajón queda asentada por el mismo
  monto, con el mismo signo y el mismo saldo final que con el código viejo (que la asentaba al cerrar el
  día). Cambian cuándo (al abrir), por quién (quien contó) y que se ve y se confirma antes. Si el libro
  estaba mal (efectivo que nunca estuvo), no es un faltante de plata sino un error del libro: el sistema no
  puede distinguirlo, y lo corrige el negocio con un movimiento con fecha de hoy. Esta decisión no hace
  desaparecer ningún faltante ya asentado ni prueba que el de MAGRA fuera falso.
- La primera apertura de cada negocio con cajón después del deploy va a asentar la diferencia acumulada
  entre su libro y su cajón (si la hay). Es correcto contablemente y queda a la vista en el libro como
  «Faltante/Sobrante al abrir el turno».
- Un turno que ya esté **abierto** en el momento del deploy no tiene diferencia de apertura asentada: al
  cerrarlo, el arqueo contra el libro va a registrar esa diferencia como diferencia del arqueo. Una sola
  vez, y el día ya no la repite.
- Una pantalla que quedó abierta mientras entraba un movimiento no cierra ni abre: pide volver a
  confirmar con el número nuevo. Es una fricción buscada.
- Abrir y cerrar turno pasan a Serializable (abrir ya lo era): una venta en paralelo puede provocar un
  reintento automático (`tenantTransaction`).

## Evidencia

`.qa/rec-2509/caja/` — tests en rojo antes del cambio, en verde después; suite de caja; tsc; eslint.
Tests: `src/lib/caja/un-solo-esperado.test.ts` y `src/lib/caja/esperado-del-cajon.test.ts` (reglas
puras); `src/lib/caja/un-solo-esperado-{apertura,dias-cerrados,relevo,pantalla}-postgres.test.ts` (acciones
reales contra Postgres con RLS, dos negocios; `pantalla`: el esperado que se muestra es el
`closingExpected` asentado y una pantalla vieja no cierra); `src/app/admin/(dashboard)/caja/caja-renglon.test.ts`
(Chromium: lo que se muestra, lo que se confirma y lo que se manda). Segunda vuelta: `.qa/rec-2509/caja/v2/`,
con dos mutaciones que los tests detectan (pantalla con el esperado del turno; servidor sin la guarda).
