# Agenda: practicidad e interacción — spec (04/11/2026, rama `claude/agenda-interaccion`)

Pedido del dueño: «mejorá la practicidad y la interacción de la agenda». Recepción de CH (estética); sirve igual a canchas (columna = cancha). Medido hoy en la app (demo CH, `agenda-practica` + `venta-agenda-simple` prendidos), capturas en el scratchpad de la sesión. Complementa `PLAN.md` (cobro/alta): acá se toca **cómo se mueve la recepcionista por la grilla**, no la plata.

## 1. Clics HOY por tarea (escritorio 1366 / celular 375)
| Tarea | 1366 | 375 | Qué duele |
|---|---|---|---|
| Dar turno | 5 | 6 | en 375 no hay huecos tocables: es lista |
| Mover | 4 (2 arrastrando + confirmar) | 4 | arrastre sólo con mouse, sin teclado ni táctil |
| Alargar / acortar | no existe | no existe | el cajón no deja cambiar la duración |
| No vino | 3 | 3 | hoja de confirmación; sólo si ya empezó |
| Llegó | no existe | no existe | «vino» = cobrar; no hay «está en el salón» |
| Cobrar efectivo | 2 | 2 | bien |
| WhatsApp | 2 | 2 | abrir cajón y después el link |
| Día de un profesional | 0 (columnas) | no existe | 375 = lista plana de todas |
Además: sin vista semana; sin atajos; turnos cortos recortan servicio/estado; solapados angostos («Se pisa con otro turno» ilegible); la raya de «ahora» tapa texto. El Deshacer de «No vino» falló con hora pasada: `deshacerCierre` (`src/lib/turnos/cobro-actions.ts:661`) re-valida el solape y los turnos demo de las 16:00 se pisan entre sí; la regla es correcta, el mensaje no dice con quién se pisa (a confirmar en QA de T1).

## 2. Interacción nueva (por frecuencia de uso, de más a menos)
1. **Tocar un hueco para crear** (ya existe en 1366, `grilla.ts:315`): en 375 la pestaña Calendario pasa a ser **grilla vertical de UNA profesional** con selector de chips arriba (Carla · Laura · Marina); tocar el hueco abre «Dar turno» con hora y profesional cargados: queda servicio → clienta → Dar turno.
2. **Arrastrar para mover, sin hoja**: soltar = mover sin avisar al instante; aviso de 8 s «Movido a 17:00 con Caro · [Avisar por WhatsApp] [Deshacer]». Táctil: mantener apretado 300 ms levanta el turno, el dedo lo lleva, soltar mueve. Teclado: Tab/flechas enfocan un turno; `M` lo «levanta»; ↑↓ corren 30' (`PASO_MIN`), ←→ cambian de columna; Enter suelta; Esc cancela. El veredicto («Se pisa con…», «no hace ese servicio», «ya pasó») sigue siendo `veredictoDelDestino` (`mover-core.ts:50`), leído por `aria-live`.
3. **Estirar el borde de abajo cambia la duración** en pasos de 15' (mínimo 15'; máximo = cierre del día). Teclado: con el turno enfocado, Shift+↑↓. Servidor nuevo `cambiarDuracionDelTurno` (misma validación de solape, misma tx). Sin aviso WA (no cambia la hora).
4. **Acciones en un toque sobre el turno** (al pasar el mouse o al enfocar en 1366; al tocar en 375 aparece debajo): `Llegó` · `No vino` · `Cobrar` · `WhatsApp`. `Cobrar` abre el cajón ya en «Terminar» (medio = 2.º toque, `TerminarTurno.tsx`). `No vino` sin hoja: marca y deja [Deshacer] 8 s (misma regla «sólo si ya empezó», `cobros.ts:192`). `WhatsApp` abre `wa.me` directo con el saludo (`mensajeSaludo`). Mismas capabilities que hoy (`agenda:manage` / `agenda:complete` / `agenda:collect`), nada nuevo en RBAC.
5. **Llegó** = chip «En el salón» (texto + punto): marca liviana en `auditLog` (`arrived`) leída en la proyección del día; sin columna nueva (si el dueño quiere persistirlo como estado, es migración → Gate 2).
6. **Vista Día / Semana** (botones junto a «Por profesional / Por box»): semana = una profesional, 7 columnas (lun–dom), mismas celdas y mismo arrastre (mover a otro día). En 375 la semana es la lista agrupada por día de la profesional elegida.
7. **Estados con color + texto siempre**: Reservado ○ · Confirmado ● · En el salón ◐ · Sin cerrar ⚠ · No vino ✕ (tokens `--success/--warning/--danger`, `DESIGN.md:28`); en turnos de 30' o menos una sola línea «16:00 Ana · Peeling ●» y el resto en `title`/cajón; solapados: carriles de ancho mínimo 9 rem con desborde horizontal, y si no entran «+1» que abre el cajón; raya de «ahora» 1 px por detrás de los turnos, la hora sólo en la canaleta izquierda.
8. **Deshacer** unificado (`Deshacer.tsx`, `que`: `mover` | `duracion` | `no-vino`), 8 s, un solo aviso vivo por vez; deshacer «mover» vuelve con `rescheduleAppointment` al origen (re-validado), «duración» vuelve al `endsAt` anterior.

## 3. Clics ANTES → DESPUÉS (meta, con el interruptor prendido)
| Tarea | 1366 antes → meta | 375 antes → meta |
|---|---|---|
| Dar turno | 5 → **≤ 4** (hueco, servicio, clienta, Dar turno; 3 con «Los de siempre») | 6 → **≤ 4** |
| Mover | 4 / 2 → **1** (+ Deshacer) | 4 → **1** (mantener y soltar) |
| Alargar | — → **1** (estirar) | — → **1** |
| No vino | 3 → **1** (+ Deshacer) | 3 → **1** |
| Llegó | — → **1** | — → **1** |
| Cobrar efectivo | 2 → **2** | 2 → **2** |
| WhatsApp | 2 → **1** | 2 → **1** |
| Día de un profesional | 0 → 0 | — → **1** (chip) |

## 4. Reglas duras
- **Nunca dos turnos en el mismo recurso** (profesional, box o cancha): el cliente sólo anticipa (`veredictoDelDestino`); la verdad es `assertSlotAvailable` (`src/lib/booking-core.ts:52`) dentro de `bookingTransaction` SERIALIZABLE, como hoy en `reprogramarTurno` (`src/lib/actions.ts:1009`). Estirar usa exactamente la misma función con `excludeAppointmentId`.
- Mover **no se reescribe**: la grilla nueva llama a `useMoverTurno` (`MoverTurno.tsx:38`) y `rescheduleAppointment`; «alargar» es una action nueva en `src/lib/turnos/duracion-actions.ts`, no se toca `actions.ts`.
- Interruptor nuevo `agenda-interaccion` **al final** de `INTERRUPTORES` (`src/cambios/interruptores.ts:148`), después de `venta-agenda-simple`; apagado = agenda de hoy sin cambio de un byte. `cambiaLasApps: false`.
- Sin migraciones: `endsAt` ya existe (`schema.prisma:772`); «Llegó» va por `auditLog`. Si una tanda cree necesitar una, se escribe sin aplicar y se eleva.
- Rol PROFESSIONAL sólo ve/mueve lo suyo (regla que ya existe); nada se anima más de 200 ms y sólo `transform/opacity` (`.claude/rules/movimiento.md`); `prefers-reduced-motion` = sin animación de arrastre, el resultado se ve igual.

## 5. Tandas (chicas, 1–2 ingenieros, cada una detrás del interruptor)
**T1 · Grilla táctil en 375 + barra de un toque + legibilidad + No vino sin hoja** (1 ingeniero). Propios: `src/cambios/interruptores.ts` (sólo al final), `turnos/_agenda/PorProfesional.tsx`, `turnos/grilla.ts` (una columna por profesional elegida, carriles mínimos, raya de ahora), `turnos/_agenda/MesaDeTurnos.tsx` (selector de profesional), `_agenda/BarraDelTurno.tsx` (nuevo), `_agenda/Deshacer.tsx` (tipo `que` ampliado), `TurnoCajon.tsx` (abrir en «Terminar»). No tocar: `MoverTurno.tsx`, `actions.ts`, cobros, Fantasma. Aceptación: en 375 tocar un hueco abre el alta con hora y profesional cargados (≤ 4 toques hasta «Dar turno» medido); Llegó/No vino/Cobrar/WA en 1 toque desde la grilla; No vino deja [Deshacer] 8 s y deshecho vuelve a Reservado; turnos de 30' legibles sin corte; apagado, nada cambia. Riesgo: **visual** (revisión liviana) + a11y (foco visible, `aria-live`). Tests: `grilla.test.ts` (carriles, columna única), `renglon-celular.test.ts`; dos negocios: el prendido ve la barra, el apagado no. QA: 1) prender en negocio de QA, 2) 375: elegir Laura, tocar 11:00, dar turno, 3) tocar el turno → Llegó, 4) No vino en uno pasado → Deshacer, 5) Cobrar → efectivo, 6) apagar: lista de siempre.

**T2 · Arrastrar sin hoja + estirar + teclado/táctil + Deshacer de mover y duración** (1–2 ingenieros; el segundo hace tests/certificación). Propios: `_agenda/MoverTurno.tsx` (drop directo + toast), `_agenda/mover-core.ts` (+ `veredictoDeDuracion`, `destinoPorTeclado`), `src/lib/turnos/duracion-actions.ts` (nuevo, `cambiarDuracionDelTurno` con `assertSlotAvailable` en `bookingTransaction`, audita `resize`), `_agenda/Deshacer.tsx`, `PorProfesional.tsx` (manija inferior, pointer events, teclas). No tocar: `actions.ts`, `booking-core.ts`, cobros. Aceptación: soltar = 1 toque y mueve; Deshacer vuelve al origen; estirar 15' sobre un hueco libre guarda `endsAt`; estirar sobre otro turno se rechaza con «Se pisa con X a las 17:00» y queda como estaba; todo lo anterior también con teclado (M, flechas, Enter, Shift+flechas) y con el dedo; apagado = arrastre con hoja de hoy. Riesgo: **concurrencia** (certificación adversarial sobre el diff: dos recepcionistas sueltan en el mismo hueco → una recibe el rechazo; doble drop no mueve dos veces; estirar y mover a la vez no dejan solape; POST a mano con `endsAt` menor al inicio se rechaza). Tests: `mover-core.test.ts`, `duracion-core.test.ts`, postgres con dos negocios (el de A no pisa al de B). QA: arrastrar a hueco libre, a hueco ocupado, al pasado, a otra profesional que no hace el servicio; estirar y deshacer; todo con teclado.

**T3 · Semana + «Llegó» persistido en auditoría** (1 ingeniero). Propios: `_agenda/Semana.tsx` (nuevo), `turnos/grilla.ts` (columnas por día), `turnos/agenda.server.ts` (proyección de 7 días + `arrived`), `src/lib/turnos/llego-actions.ts` (nuevo). Aceptación: Semana muestra 7 columnas de una profesional y el arrastre entre días mueve con la misma validación; en 375 lista por día; «En el salón» sobrevive a recargar la página; la semana carga en < 1 s con 150 turnos (una sola consulta). Riesgo: **visual + rendimiento** (una consulta por semana, no por día). Tests: `agenda-core.test.ts` (estado derivado de `arrived`), proyección de semana con dos negocios. QA: Semana → mover un turno de mar a jue → Deshacer; Llegó → F5 → sigue.

Orden: T1 → T2 → T3; cada una con `tsc` + suites + merge de prueba contra `origin/claude/fantasma-agenda` y `claude/venta-agenda-simple` (resumen `n/n`) y Gate de Excelencia antes de integrar.

## Estado (04/11, rama `claude/agenda-interaccion`)
T1 y T2 hechas detrás de `agenda-interaccion`: tsc 0 · 589/589 · e2e CH 47/47 · certificación T2 con observaciones, M-1/B-1/B-2/B-3 cerrados. Medido en e2e (prendido, 1366/375): mover 4 → 1 gesto · estirar no existía → 1 · no vino 3 → 1 (+ Deshacer) / 2 en 375 · WhatsApp 2 → 1 / 2 · cobrar 2 → 2 / 3 · día de una profesional en 375 no existía → 1 chip · dar turno 5/6 → 5/5 (no llegó a la meta ≤ 4: elegir clienta son 2 toques, buscar y elegir).
Deuda: O-1 (baja, sin plata ni solape) `src/lib/turnos/duracion-actions.ts:67-75` acepta volver a «un fin que tuvo» aunque el turno se haya movido sin conservar; arreglo: exigir que el último audit del turno sea el estiramiento. El dueño descartó los rótulos de media hora (04/11). Falta T3 (Semana + «Llegó»).

## 6. Qué decide el dueño
1. Prender `agenda-interaccion` en CH y en los negocios de canchas (y cuándo). 2. Soltar mueve **sin preguntar** (con Deshacer 8 s) en vez de la hoja de hoy: confirmar que es lo que quiere la recepción. 3. «Llegó» como marca de auditoría (sin migración) o como estado propio (migración → Gate 2). 4. Paso de duración 15' y tope al cierre del día. 5. Push a `main` de cada tanda (= deploy).
