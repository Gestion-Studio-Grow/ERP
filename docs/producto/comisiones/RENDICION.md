# Rendición de la profesional que cobra aparte (GSG-CH-006 · D6)

**Problema** (CH, sábado 08/11, 7 de 18 turnos): la profesional con `Professional.cobraEnMostrador = false`
cobra SUS turnos (`src/lib/turnos/cobro-mostrador.ts`). Ese cobro entraba al libro como plata del local
(`aplicarCobroTurnoInTx` → `recordCobroTurnoInTx`), pero el cajón no la tiene: el cierre no cerraba.

## 1. Modelo
- `CobroARendir` (1:1 con el `Collection` del cobro): profesional, turno, monto, medio, `rendicionId` (NULL = pendiente).
- `RendicionProfesional`: profesional, `cobrado` = Σ cobros cubiertos, `entregado`, `retenido`
  (CHECK `cobrado = entregado + retenido`, ninguno negativo), medio, `idempotencyKey` única por negocio,
  `cashMovementId` (el ingreso del libro), `payoutId` (la liquidación que descontó la retención), nota, quién.
- Migración aditiva sin aplicar: `prisma/pending-gate2/CH_rendicion_profesional.sql` (RLS, reversa al pie). Sin enum
  nuevo. El código usa SQL crudo y pregunta `to_regclass` antes: **sin las tablas, todo sigue como hoy**.

## 2. Reglas (`src/lib/comisiones/rendicion-core.ts`)
- **A rendir** sólo si cobra **la profesional del turno** (su usuario) **y** ella tiene `cobraEnMostrador = false`.
  Si la dueña le cobra un turno a ella, entra al cajón como siempre. Voucher: nunca (lo liquida OpenKey).
- Medios: todos menos voucher quedan a rendir — si ella cobra, la plata va a su efectivo o a su cuenta.
  **Provisional a confirmar.**
- **Quién rinde:** la profesional entrega. **Quién registra:** dueña o recepción (`cash:manage`). Si la profesional
  se queda una parte (su comisión o lo que se acuerde), la diferencia es la **retención** y sólo la registra quien
  liquida comisiones (`commissions:manage`, la dueña).
- Nunca de más: `entregado ≤ cobrado`. Todo o nada sobre los cobros elegidos. Un cobro anulado no se rinde.
- **Medio por defecto de la rendición: efectivo, como la liquidación de hoy. Provisional a confirmar (decisión F5 del
  dueño).**

## 3. Libro de caja y cierre
- El cobro a rendir **no** escribe en el libro. Al **rendir**, y no antes, se asienta un `INGRESO` por lo entregado,
  con la marca `rendicion:<id>` (no se borra a mano desde el libro), enganchado al turno de caja abierto si lo hay.
- Frontera del cierre obligatoria (lección DB-5): con el día ya cerrado, la rendición se rechaza y se registra al
  día siguiente. El cierre del día cuenta sólo lo que está en el cajón; lo pendiente de rendir no lo desarma.
- Concurrencia: candado del turno (el mismo de la anulación) y de los cobros, reclamo condicionado con conteo
  exacto y clave del formulario. Probado en `rendicion-postgres.test.ts` (doble envío, N concurrentes).

## 4. Comisiones (la pantalla y la liquidación)
- `/admin/comisiones` muestra, por profesional que cobra aparte: lo que tiene a rendir (cobros tildables), su
  comisión estimada, el formulario «Registrar rendición» y las últimas rendiciones.
- La comisión se sigue calculando igual (sobre `Payment.amount`): el cobro a rendir es plata cobrada.
- **Integración con la liquidación (rama `claude/ch-comisiones-mi-liquidacion`, PR aparte):** al liquidar, restar
  del egreso la Σ `retenido` de sus rendiciones con `payoutId` NULL y estampar ese `payoutId`. **Hasta que se
  integre**, la pantalla avisa «se quedó con $X: descontalo al liquidar» y la retención la registra sólo la dueña.

## 5. Pendientes
- Integrar la retención en la liquidación (§4). Mostrar «a rendir» en la pantalla del cierre (informativo).
- Anular un cobro **ya rendido**: hoy la anulación no encuentra asiento y no saca la devolución del cajón.
- Confirmar medios y medio por defecto (F5).
