# CH Estética al nivel de Break Point — qué se hizo y qué falta

**Frente:** dejar CH Estética (`beauty-spa`, el único negocio vivo en producción) al nivel de Break Point para salir a
producción con confianza. **Rama:** `claude/ch-nivel-bp`, sobre `claude/sleepy-tesla-392rov` (la candidata con los
arreglos del UAT del 16/10). **Nada se publicó:** sin push a `main`, sin deploy, nada contra Neon, sin migraciones ni
dependencias nuevas, y el criterio de facturación del saldo (D4/B4) no se tocó.

«Nivel Break Point» son tres cosas, en este orden:

## 1. Prueba de que funciona

- **Guion de UAT en producción** con matriz de acceso por rol (dueña, recepción, profesional): `UAT-PRODUCCION.md`.
- **Recorrido E2E repetible** en Chromium que ejecuta ese guion clic por clic: `src/tenants/ch/e2e/uat-ch.e2e.mjs`,
  con la semilla `src/tenants/ch/e2e/semilla-ch.ts`. Se corre con `npm run build && npm run test:ch-uat`.
  - Levanta el ERP real (`next start`) sobre una base Postgres **local y efímera**, con migraciones, RLS y el rol
    `app_rls` como producción (`src/test/base-efimera.ts`). La crea, la siembra con datos de demo de CH y la borra al
    terminar. Nunca toca Neon.
  - Entra por la pantalla de ingreso con las tres usuarias.
  - Saca capturas a 1440 y 390 px y falla ante cualquier error de consola o desplazamiento horizontal.
- **Resultado del 18/10:** ver «Resultado del recorrido» al final.

### Lo que el recorrido y el relevamiento encontraron roto, y se arregló (con su test)

| # | Qué estaba mal | Arreglo | Test |
|---|---|---|---|
| R1 | **Un cobro de turno hecho después de cerrar la caja entraba fechado en el día ya cerrado.** Pasaba en los tres caminos: seña al reservar, cobro parcial y saldo al completar. | Se rechaza antes de escribir y dice qué día registrarlo. La salida existe a un clic: «Dejar saldo a cobrar». Es el mismo criterio que la venta del mostrador. | `cobro-turno-repo.test.ts` (3 tests) · E2E 10.1 |
| R2 | **«No se presentó»** tenía cuatro problemas: tiraba un error crudo (en producción, el genérico en inglés), dejaba marcar un turno que todavía no había llegado, no se cuidaba de una carrera con otra recepcionista, y un Reservado vencido no tenía botón aunque la lista pedía marcarlo. | Regla pura `puedeMarcarseNoVino`. El estado va en el `where` del update. El motivo vuelve en castellano. El Reservado vencido ahora ofrece el botón. | `cobros.test.ts` (2) · E2E 6.1 |
| R3 | **Una usuaria Profesional nueva veía la agenda vacía**: el vínculo con su ficha se hacía «desde la base». | En Usuarios, «Ficha de profesional» por fila, en el diseño de siempre y en el nuevo. Una ficha ya tomada no se pisa. | `vinculo-profesional.test.ts` (3) · E2E 12.usuarios |
| R4 | **La grilla de escritorio era fija de 9 a 19 h**: un turno de las 8 o de las 20 no aparecía. | La grilla se estira hasta cubrir los turnos del día. | `grilla.test.ts` (3) |
| R5 | **La clienta cancelaba online sin cuidarse de una carrera** (`update` sin el estado en el `where`). | `updateMany` con el estado vivo en el `where`. | E2E 12.E2 |

## 2. Matriz de eventualidades

`EVENTUALIDADES.md`: 19 casos raros, cada uno con qué hace hoy (archivo:línea), qué debería hacer y su test. Cubre:
- doble reserva;
- la clienta que no viene;
- la seña y la cancelación tardía;
- la profesional que falta;
- el corte de internet;
- la caja que no cuadra;
- ARCA caída;
- el cobro después del cierre;
- entre otros.

## 3. Practicidad sin migración (detrás del interruptor «agenda-practica»)

Los ítems vienen del plan de Factory-GSG (`30-LANZAMIENTO/practicidad/PLAN-PRACTICIDAD-RAE.md`, rama
`ccr-162a49b4-nwqhfy`), y cada uno se **verificó contra el código del 18/10** antes de hacerlo.

Todo lo que cambia cómo trabaja CH quedó detrás de un interruptor nuevo, **«Agenda práctica»** (`agenda-practica`,
`src/cambios/interruptores.ts`). Está **apagado**, y apagado CH se ve y trabaja como siempre. La lógica pura vive en
`src/lib/turnos/practica.ts` y la prueba `practica.test.ts`.

| Ítem | Qué decía el plan | Qué encontré en el código | Qué se hizo |
|---|---|---|---|
| T4 | Defaults del alta | El alta no proponía fecha. | Propone **mañana** (en el alta de siempre y en la del diseño nuevo). Con una sola profesional, viene elegida. |
| T10 | Confirmar lo irreversible con su consecuencia | «Cancelar turno» y «No se presentó» actuaban con un clic. | Primero dicen qué va a pasar («El horario queda libre…», «Queda como faltazo…») y piden «Sí, …» o «No». |
| T12 | Reglas a la vista | La reserva no decía hasta cuándo se cancela. | La regla está en `/reserva`, en la confirmación y en «Tu turno». El cierre de caja dice que un cobro tardío va al día siguiente. |
| E1 | Alta «en el orden de la llamada» | **Ya existe**, en el diseño nuevo (`_agenda/AltaDeTurno`, `alta-core.ts`). | No se duplicó en la pantalla de siempre. Se prende con «Diseño nuevo» (ver abajo). Recibió el default de T4. |
| E3 | Cancelar o «no vino» preguntan qué pasa con la seña | La seña quedaba cobrada en silencio; `seniaRetenida` no estaba cableada. | Pregunta «Se la queda el negocio» o «Se la devolvemos». Retener queda en la auditoría. Devolver anula el cobro (contrapartida + egreso) en **la misma transacción** que la cancelación: o pasan las dos cosas o ninguna. «A favor de la próxima» necesita migración y quedó afuera. |
| E5 | «Reservar el próximo» al cobrar | No existía. | En un turno completado, «Reservar el próximo» abre el alta con la misma clienta y la fecha de su ciclo, calculado sobre sus visitas con el CRM (`/admin/turnos/proximo/[id]`). |
| E6 | Al cancelar, ofrecer el hueco a la lista de espera | **Ya existía** «Huecos liberados» con WhatsApp de texto armado. | Al cancelar se avisa en el momento: «Hay N clientas anotadas para ese servicio: avisales desde Lista de espera». |
| E2 | Anticipación mínima de la clienta para cancelar online, configurable | La clienta cancelaba hasta un minuto antes, aunque la reserva de CH promete «hasta 24 hs antes». | Se aplica en el servidor al cancelar y al reprogramar online. **Default 24 h, marcado «PROVISIONAL A CONFIRMAR POR EL DUEÑO»**. Se configura por negocio en `practica.ts` (`POLITICAS_POR_NEGOCIO`), sin migración. |

### Interruptores de CH: qué se prende y cuándo (ninguno se prendió)

| Interruptor | Qué cambia en CH | Cuándo prenderlo |
|---|---|---|
| `agenda-practica` («Agenda práctica») | Todo lo de la tabla de arriba. | Cuando el dueño confirme dos cosas con Carolina: las 24 h de cancelación (E2) y qué se hace con la seña de un faltazo (E3). Se prende desde la consola del operador. Por ser CH, pide escribir el slug (`REQUIEREN_OK_DEL_DUENIO`). |
| `diseno-nuevo` («Diseño nuevo») | El panel con la piel «Renglón», incluida el alta «en el orden de la llamada» (E1). | Decisión aparte del dueño. Hoy está apagado en CH. |
| `ARCA_INVOICING_ENABLED` (variable del deploy) | La factura al completar un turno. | Gate 4: certificado + homologación. Antes, D4/B4 (facturación del saldo) con la contadora. |

## Lo que necesita decisión del dueño

1. **Publicar** esta rama (Gate 1). Un push a `main` despliega `erp-ch`, que sirve CH en vivo y también
   `wpe.gsgapp.com.ar`.
2. **E2:** ¿24 h de anticipación para que la clienta cancele o reprograme online? Es provisional; la reserva de CH ya
   lo promete.
3. **E3:** la seña de un faltazo o de una cancelación tardía: ¿se pierde siempre, se decide caso por caso (lo que hace
   hoy la agenda práctica), o queda a favor de la próxima? Esta última opción es migración.
4. **Prender «Agenda práctica» en CH** después de 2 y 3.
5. **D4/B4:** cómo se factura un saldo cobrado después de completar (con la contadora). No se tocó.
6. **ARCA en cola:** ¿avisar en gris cuando la factura queda pendiente? ¿Reintentar más de una vez por día? Esto último
   es un cron sub-diario, que en Hobby es gasto (lección PD-3).
7. **Avatares de la portada vieja de CH** desde `api.dicebear.com`: reemplazarlos por iniciales o fotos propias. Es la
   vidriera de CH, así que lo decide con Caro.
8. **Profesional que falta** (eventualidad 9): construir la lista de turnos afectados al bloquear su agenda (sin
   migración). Queda propuesto.

## Resultado del recorrido

**18/10/2026 · `npm run build && npm run test:ch-uat` · Chromium · base Postgres 16 local y efímera:**
**40/40 OK · 1 N/A · cero errores de consola · sin desplazamiento horizontal a 390 ni a 1440 px.**

| Parte | Pasos | Estado |
|---|---|---|
| 0 · Vidriera e ingreso (1440 y 390) | 0.1, 0.2 ×2 | OK |
| 1 · Matriz de acceso (dueña, recepción, profesional) | 1.matriz ×3 | OK |
| 2 · Reserva web de la clienta (390) | 2.1, 2.2 | OK |
| 3 a 7 · Alta por teléfono con seña, mover, cancelar, no vino, seña + parcial + saldo, completar | 3.1–7.4 | OK |
| 8 · La profesional: ve sólo lo suyo, completa, no cancela | 8.1–8.3 | OK |
| 9 · Caja del día y cierre que no cuadra | 9.1–9.3 | OK |
| 10 · Cobro después del cierre (R1) | 10.1 | OK (falló antes del arreglo) |
| 11 · Factura | 11.1 | N/A: `ARCA_INVOICING_ENABLED` apagado en CH (Gate 4) |
| 12 · Agenda práctica (interruptor prendido sólo en la base local) | T4, T10, E3a, E3b, E6, E5, T12, E2, usuarios | OK |
| 390 px · Agenda, Lista, Caja, Cierre, Profesional | 390.* | OK |

**Primera corrida, antes de los arreglos:** 29/31.
- **10.1** falló: el cobro entraba en el día cerrado (R1).
- La consola falló por los avatares de `api.dicebear.com`, que en este entorno no tiene salida a internet (eventualidad 19). El recorrido ahora responde esa imagen con un PNG local.

**Tests nuevos fuera del recorrido** (todos verdes):
- `cobro-turno-repo.test.ts` +3;
- `cobros.test.ts` +2;
- `practica.test.ts` 7;
- `grilla.test.ts` 3;
- `vinculo-profesional.test.ts` 3;
- `cerrar-sin-prestar-postgres.test.ts` 4: devolver y retener la seña, ejecutados contra Postgres con RLS.

Las capturas quedan en `dist/uat-ch/` (o la carpeta que se le pase al script) y no se versionan.

— Elaborado por GSG
