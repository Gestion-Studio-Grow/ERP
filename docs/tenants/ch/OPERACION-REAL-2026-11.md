# CH Estética: prueba de operación real (2026-11). Un sábado y el cierre de octubre

**Quién:** agente de producto GSG (método `gsg-producto`, Factory-GSG). **Rama:** `claude/operacion-real-ch`. **Fecha:** 08/11/2026.
**Guion:** `Factory-GSG/00-ESTADO/reingenieria-2026-10/operacion-real/OPERACION-REAL-CH-2026-11.md` (88ca6a7), cruzado con
`UAT-2026-11.md` (rama `claude/especialista-uat-2026-11`), `UAT-PRODUCCION.md` y `src/tenants/ch/e2e/semilla-ch.ts`.
**Arnés:** `src/tenants/ch/e2e/operacion-real/` (semilla del sábado y de octubre, reloj simulado, recorrido Playwright y chequeos visuales).
Para volver a correrlo: `node --import tsx src/tenants/ch/e2e/operacion-real/recorrido-sabado.mjs`. Las salidas van a `$SALIDA_OPERACION_REAL`
(por defecto `<tmp>/operacion-real-ch/recorrido`), fuera del repo.

## Veredicto: ¿puede trabajar un día entero?

**Sí, con 5 salvedades que hoy se resuelven a mano** (ninguna rompe la plata):

1. **D6 · la profesional que cobra aparte:** lo que cobra Belén entra al libro del local como VENTA/EFECTIVO. El cierre espera en el cajón plata que está en el bolsillo de ella, y no hay dónde registrar que la rinde (pasos 16 y 25).
2. **No-show sin hueco:** marcar «No vino» no libera la celda, así que no se puede dar un turno rápido en ese horario desde la agenda (pasos 08 y 09).
3. **Sin apertura de caja ni medio Tarjeta:** el fondo se carga como ingreso y la tarjeta como Mercado Pago (pasos 01 y 18). DEBITO/CREDITO esperan el Gate 2.
4. **D5 · la profesional no ve su comisión** (paso 24).
5. **Sesión:** la cookie dura 8 h, así que una recepcionista que entra a las 08:55 queda afuera cerca de las 17:00. En cambio, el token no vence en el servidor: es una falla de seguridad (paso 15).

Lo que más importaba salió bien. El doble cobro simultáneo (05) dejó un solo saldo, gracias a la clave idempotente de `cobros.ts:283`. La anulación pide el código de la dueña y queda auditada (14). El cierre con $3.000 de menos se muestra, exige una nota y se asienta (20 y 21). El reporte de octubre cuadra con la semilla (22).

## Desvíos del método (anotados)

- **`next dev` en lugar de `next build` + `next start`.** El build de producción no compila en este entorno de nube:
  - con Turbopack, `next/font/google queries have exactly one entry` en las 8 fuentes de Google (Kumbh Sans en `src/app/tienda/vidriera/fuentes.ts:4` y en `src/app/tienda/shine/fuentes.ts:11`);
  - con `--webpack`, «Selector "body" is not pure» en `src/components/inmobiliaria/recibo.module.css`.

  Lo primero parece del entorno: el CSS de Google llega, pero falla el reemplazo del archivo de fuente. Lo segundo es real, aunque sólo afecta a webpack. Las dos cosas quedan como pendiente, *a verificar en Vercel*.
- **Sin verificador visual con modelo** (orden del dueño, vía orquestadora): ningún modelo abrió las capturas. En su lugar corrieron chequeos automáticos en cada captura (desborde, textos cortados, botones tapados, contraste con axe-core, imágenes rotas y consola). La galería la valida el dueño a ojo.
- **El reloj de Postgres (`now()`) no se adelanta.** El de Node y el de los navegadores sí.

## Callejones del guion, reverificados en el código

| Id | Qué | Estado | archivo:línea |
|---|---|---|---|
| D1 | La transferencia es un rótulo: no pide número de operación ni comprobante, y nadie verifica que llegó | Confirmado (FALLA 07) | `src/lib/turnos/cobros.ts:286` |
| D3 | La reserva web muestra el monto de la seña, pero no el alias ni el vencimiento | Confirmado (FALLA 10) | `src/app/(site)/_ch/BookingModal.tsx:888` |
| D5 | La profesional no tiene ninguna capability de comisiones | Confirmado (CALLEJÓN 24) | `src/lib/capabilities.ts:234` |
| D6 | El cobro aparte entra al libro del local y no existe la rendición | Confirmado (FALLA 16, CALLEJÓN 25) | `src/lib/turnos/cobro-mostrador.ts:14-16` (la regla) · pantalla de comisiones sin rendición |
| D8 | No hay medio Tarjeta | Confirmado (CALLEJÓN 18) | `prisma/schema.prisma:51-53` (detrás del Gate 2) |
| Sesión 8 h | El guion citaba `auth-actions.ts:63`, pero está en otro lado. La cookie dura `maxAge: 60*60*8` (`src/lib/ingreso.server.ts:25`). El token es `userId.firma`, sin fecha (`src/lib/auth.ts:61-63`): fuera del navegador no vence nunca | Confirmado (FALLA 15), **de seguridad** | `src/lib/ingreso.server.ts:25` · `src/lib/auth.ts:61-63` |

**Totales:** 12 OK · 8 FALLA · 5 CALLEJÓN, de 25 pasos.

Semilla (`semilla-sabado-ch.mts`):
- Octubre: 324 turnos, 18 no-show (5.6 %) y $6.259.000 facturados.
- Medios de octubre: EF 37 % · TR 42 % · MP/tarjeta 21 %. La tarjeta se cargó como MERCADOPAGO porque DEBITO/CREDITO no existen en una base sin Gate 2.
- Comisiones pendientes de 4 profesionales, al 40 %.
- Sábado: 18 turnos. Laura (A, cobra en mostrador) tiene 11 y Belén (B, `cobraEnMostrador=false`) tiene 7. 9 de los 18 tienen seña de $5.000.
- Usuarios: dueña, R1, R2, prof A y prof B.
- Supuestos provisionales a confirmar: horario 09-20, fondo de $20.000, nombres, precios y política de seña.
- Se borraron los 4 turnos «de ahora» que trae la semilla base.

## Pasos

| paso | hora | quién | estado | qué se vio | archivo:línea |
|---|---|---|---|---|---|
| 01 ★ | 08:50 | Dueña 1440 | CALLEJÓN | sin «Abrir caja» (0); fondo cargado como INGRESO/EFECTIVO; fila Efectivo: «Efectivo según el libro del día $0,00 $20.000,00 $0,00 $20.000,00»; Inicio: «18 turnos hoy · 100% de los que faltan confirmados» | src/app/admin/(dashboard)/caja/page.tsx:43-46,90 (turno de cajero sólo con cajón físico/retail) |
| 02 ★ | 08:55 | R1 1440 | FALLA | 18 turnos, 1 pares superpuestos 10:00, Lucía Ferreyra ↔ 10:45, Paula Romero (32 px); columnas: Belén Ortiz, Carla Díaz, Laura Gómez, Marina Suárez (el guion pedía 2: también salen Carla y Marina sin turnos) | src/app/admin/(dashboard)/turnos/page.tsx |
| 03 ★ | 09:00 | Prof A 390 | OK | 11 turnos, 0 ajenos, desborde no, cortados 7 |  |
| 04 | 09:05 | R1 1440 | OK | cajón: «Cobrar $10.000 y terminar, con» (masaje $15.000 − seña $5.000) |  |
| 05 ★ | 09:40 | R1 1440 + Prof A 390 | OK | 2 cobros en la base, total $15.000 (esperado $15.000); aviso a Prof A: «Ese turno ya está cerrado.» | src/lib/turnos/cobros.ts:283 (clave idempotente saldo:<turno>) |
| 06 ★ | 10:15 | R1 1440 | OK | EFECTIVO $10.000 + TRANSFERENCIA $12.000; «Pagado ✓» sí |  |
| 07 | 10:30 | R1 1440 | FALLA | cobró $22.000 por transferencia con un toque; 1 campos de texto en el cajón: no pide nº de operación ni comprobante (D1); el turno de las 14:00 queda CONFIRMED | src/lib/turnos/cobros.ts:286 (TRANSFERENCIA es sólo un valor del medio) |
| 08 ★ | 11:00 | R1 1440 | FALLA | estado NO_SHOW; seña $5.000 retenida; pregunta «Ya pagó $5.000. ¿Qué pasa con esa plata?»; huecos de Laura 10-11 h: 0 | hueco NO liberado: src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx:543 (filtra sólo CANCELLED) |
| 09 | 11:05 | R1 1440 | CALLEJÓN | la grilla no ofrece «Dar un turno» en el hueco de Paula (el NO_SHOW sigue ocupando la celda); no se puede dar el turno rápido desde la agenda | src/app/admin/(dashboard)/turnos/_agenda/PorProfesional.tsx:543 (sólo libera CANCELLED) |
| 10 ★ | 11:30 | Clienta 390 | FALLA | turno PENDING; muestra monto sí, alias no, vencimiento no (D3): «Recordá que para confirmar el turno hay una seña de $5.000 — te escribimos para coordinarla. Ver mi turno Agregar a mi c» | src/app/(site)/_ch/BookingModal.tsx:888 |
| 11 | 12:00 | R1 1440 | OK | link https://wa.me/5491130999888?text=%C2%A1H; mensaje: «¡Hola Valentina! Te anotamos *Limpieza facial profunda* *el sábado 14 a las 17:00* con Marina Suárez. Para reservar te pedimos una seña de $»; alias en el mensaje: no |  |
| 12 ★ | 12:30 | R1 1440 | FALLA | stock crema 10→9; venta aparte $12.500; turno cobrado $20.000 con «Cobrar $20.000 y terminar, con»: NO suma al ticket (dos cobros); clienta en el mostrador: sí | src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx:664-668 («Es otro cobro, aparte del turno») |
| 13 | 13:00 | R1 1440 | OK | tras recargar: 0 cobros (nada a medias), cajón reabierto por ?turno=, lo tipeado se perdió; después un cobro MERCADOPAGO $15.000 |  |
| 14 ★ | 13:30 | R1 1440 + Dueña 1440 | OK | pide código sí; sin código el botón está deshabilitado; código visto; tras anular neto $0 (2 renglones); auditoría 2; recobrado: neto $15.000 | src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx:368-378 |
| 15 ★ | 14:00 | R1 → R2 1440 | FALLA | cookie «admin_session» con vencimiento del navegador 2026-11-08T11:30:22.632Z (8 h reales); el token sigue entrando: 17:00: /admin/turnos; 23:30: /admin/turnos — el servidor no lo vence | src/lib/ingreso.server.ts:25 · src/lib/auth.ts:61-63 |
| 16 ★ | 15:00 | Prof B 390 | FALLA | sugería ?; cobro EFECTIVO $4.000; turno COMPLETED; en el libro del local: VENTA/EFECTIVO $4.000 (D6: la plata está en el bolsillo de Belén, pero el libro la cuenta como del cajón) | src/app/admin/(dashboard)/turnos/_agenda/TurnoCajon.tsx (cobraEnMostrador) · prisma/schema.prisma:608 |
| 17 | 16:00 | R2 1440 | FALLA | estado CANCELLED; seña $5.000; la hoja NO menciona una política por horas de aviso (lo decide la recepción a mano) | src/app/admin/(dashboard)/turnos/_agenda/CancelarONoVino.tsx:126-146 |
| 18 ★ | 17:00 | R2 1440 | CALLEJÓN | medios: Efectivo / Mercado Pago / Transferencia; la tarjeta se cargó como Mercado Pago ($15.000 en total con la seña) | src/lib/turnos/cobros.ts:286 · prisma/schema.prisma:51-53 (DEBITO/CREDITO tras Gate 2) |
| 19 ★ | 19:30 | R2 1440 | OK | 5 turnos cerrados con 9 toques; quedan sin cerrar 6 (Belén 09:00, Belén 10:00, Belén 11:00, Belén 13:00, Belén 16:30, Belén 18:00; recepción no los puede cerrar: Belén cobra aparte); pantalla: «Cerrar lo pendiente ← Volver a la agenda 6 sin cerrar $100.000 por cobrar 3 con seña 6 de Belén Ortiz (cobra aparte) Profesional Todas (6) Belén Ortiz (6) · cob» |  |
| 20 ★ | 20:00 | Dueña 1440 | OK | efectivo esperado $161.500; diferencia mostrada «DIFERENCIA DEL DÍA Faltan $3.000,00. Queda asentado en el libro como ajuste, con tu nombre»; deslizar bloqueado antes de la nota; asiento EGRESO $3.000 «Diferencia de caja 14/11/2026: faltante en Efectivo»; registro CierreDiario/caja.cierre-diario; pantalla «Cierre del día Sábado 14 de noviembre cerrado ‹ 13/11 Hoy Cerrado el sábado, 14 de noviembre de 2026» |  |
| 21 ★ | 20:05 | Dueña 390 | OK | menciona $3.000: sí; desborde no; «Cierre del día Sábado 14 de noviembre cerrado ‹ 13/11 Hoy Cerrado el sábado, 14 de noviembre de 2026, 20:00 por Duenia A · 16 movimientos · » |  |
| 22 ★ | 20:10 | Dueña 1440 | OK | semilla: $6.259.000, 324 turnos, 18 no-show, medios EF $2.307.000 / TR $2.655.000 / MP $1.297.000; pantalla: ingresos cuadra, ausencias «18 ausencias sobre 324», medios EF✓ TR✓ ME✓ |  |
| 23 ★ | 20:15 | Dueña 1440 | OK | 4 liquidaciones con la UI; payouts 4 por $2.580.800 (octubre a 40 %: $2.503.600, más lo saldado del sábado); egresos en el libro: 6 ($2.598.800); lista antes: «Comisiones $2.580.800 a liquidar a 4 profesionales A liquidar 4 Carla Díaz 73 turnos · sobre $1.723.000 · 01/10/2026 a 31/10/2026 $689.200 Pagar Marina Suárez 8» |  |
| 24 ★ | 20:20 | Prof A 390 | CALLEJÓN | /admin/no-disponible?app=comisiones: «CH CH Estética sábado 14 de noviembre Comisiones no está disponible Tu usuario no tiene acceso a esta app. Si la necesit» | src/lib/capabilities.ts:234 (PROFESSIONAL sin commissions:*) |
| 25 | 20:25 | Dueña 1440 | CALLEJÓN | pantalla de comisiones no tiene rendición de lo cobrado aparte: «Comisiones $0 a liquidar A liquidar Nadie tiene comisiones pendientes. Ya pagadas 4 14/11/2026 Belén Ortiz 01/10/2026 a » | src/app/admin/(dashboard)/comisiones/page.tsx (sin flujo de rendición, D6) |

Notas de criterio:
- 02 queda en FALLA por la superposición medida. Que haya 4 columnas (2 sin turnos) es un dato, no una falla.
- 12 queda en FALLA porque el guion pide que la crema «sume al ticket». El producto la cobra aparte, por decisión de diseño: «Es otro cobro, aparte del turno», en `TurnoCajon.tsx:664-668`.
- 17 queda en FALLA porque no hay una política de seña por horas de aviso: la recepción elige a mano si la seña se queda o se devuelve.
- 19 queda OK porque los 6 turnos que quedan son de Belén, que cobra aparte, y la pantalla lo explica.
- 23 queda OK, con una observación de plata. Las 4 liquidaciones salen como EGRESO en **Efectivo**, que es el medio por defecto del combo. Suman $2.580.800, contra un cajón con unos $158.500. Quedan fechadas el 15/11 a las 12:00 AR (2026-11-15T15:00:00.000Z) porque el 14/11 ya estaba cerrado. Nada advierte que no hay efectivo para pagarlas.
- 15 queda en FALLA de seguridad: el token `userId.firma` no vence en el servidor. La cookie dura 8 h, pero sólo en el navegador.

## Verificación en la base (después del paso 25)

- Cobros duplicados (mismo turno, medio y monto): ninguno. En el paso 05 quedaron 2 cobros: la seña y un único saldo.
- Saldos (turnos terminados con pagado ≠ precio, o sobrepagos): ninguno.
- Libro de caja del 14/11, por tipo y medio: VENTA/EFECTIVO $141.500 (10) · VENTA/MP $25.000 (2) · VENTA/TRANSFERENCIA $34.000 (2) · INGRESO/EFECTIVO $20.000 (1) · EGRESO/EFECTIVO $3.000 (1) · EGRESO/MP $15.000 (1).
- Efectivo esperado en el cierre: $161.500. Se contaron $3.000 menos.
- El cobro aparte de Belén ($4.000 en efectivo) entra al libro como VENTA/EFECTIVO del local (D6).
- Stock de la crema: 10 → 9 (1 movimiento de stock).
- Auditoría del día: Appointment/authorize_void_collection ×1 · Appointment/cancel ×1 · Appointment/collect_payment ×2 · Appointment/complete ×11 · Appointment/create ×1 · Appointment/deposit_requested ×1 · Appointment/no_show ×1 · Appointment/void_collection ×1 · CashMovement/libro.add ×1 · CierreDiario/caja.cierre-diario ×1 · CommissionPayout/settle ×4 · Order/create ×1.

## Chequeos visuales automáticos (sin modelo)

El detalle está en `visual.json`. Hay falsos positivos conocidos:
- Los «cortados» incluyen elementos `sr-only`, como «Saltar al contenido» y algunas leyendas.
- Los «tapados» por `nextjs-portal` son el overlay de `next dev`.
- Con un cajón abierto, sólo se miran los botones de adentro del cajón.

| paso | ancho | desborde | cortados | tapados | contraste | img rotas | consola |
|---|---|---|---|---|---|---|---|
| 01c | 1440 | no | 1 | 1 | 0 | 0 | 0 |
| 01 | 1440 | no | 1 | 0 | 0 | 0 | 0 |
| 02 | 1440 | no | 4 | 0 | 0 | 0 | 0 |
| 03 | 390 | no | 7 | 1 | 0 | 0 | 0 |
| 04 | 1440 | no | 5 | 0 | 0 | 0 | 0 |
| 05 | 1440 | no | 4 | 3 | 0 | 0 | 0 |
| 05 | 390 | no | 7 | 0 | 0 | 0 | 0 |
| 06 | 1440 | no | 7 | 0 | 0 | 0 | 0 |
| 07 | 1440 | no | 6 | 0 | 0 | 0 | 0 |
| 08b | 1440 | no | 6 | 0 | 0 | 0 | 0 |
| 08 | 1440 | no | 4 | 0 | 0 | 0 | 0 |
| 09 | 1440 | no | 4 | 0 | 0 | 0 | 0 |
| 10 | 390 | no | 3 | 1 | 8 | 0 | 0 |
| 11 | 1440 | no | 6 | 0 | 0 | 0 | 0 |
| 12b | 1440 | no | 3 | 1 | 0 | 0 | 0 |
| 12 | 1440 | no | 5 | 3 | 0 | 0 | 0 |
| 13 | 1440 | no | 5 | 0 | 0 | 0 | 0 |
| 14b | 1440 | no | 6 | 0 | 0 | 0 | 0 |
| 14c | 1440 | no | 7 | 0 | 0 | 0 | 0 |
| 14 | 1440 | no | 5 | 0 | 0 | 0 | 0 |
| 15 | 1440 | no | 5 | 0 | 0 | 0 | 0 |
| 16 | 390 | no | 3 | 1 | 0 | 0 | 0 |
| 17 | 1440 | no | 8 | 0 | 0 | 0 | 0 |
| 18 | 1440 | no | 5 | 0 | 0 | 0 | 0 |
| 19b | 1440 | no | 2 | 0 | 0 | 0 | 0 |
| 19 | 1440 | no | 1 | 0 | 0 | 0 | 0 |
| 20 | 1440 | no | 2 | 0 | 0 | 0 | 0 |
| 20b | 1440 | no | 1 | 0 | 0 | 0 | 0 |
| 21 | 390 | no | 1 | 1 | 0 | 0 | 0 |
| 22 | 1440 | no | 10 | 1 | 0 | 0 | 0 |
| 23b | 1440 | no | 1 | 0 | 0 | 0 | 0 |
| 23 | 1440 | no | 1 | 0 | 0 | 0 | 0 |
| 24 | 390 | no | 0 | 0 | 0 | 0 | 0 |
| 25 | 1440 | no | 1 | 0 | 0 | 0 | 0 |

Hallazgos visuales reales:
- En los bloques de la agenda, los nombres de servicio salen cortados con «…»: «· Masaje descontracturante» ×25 y «· Limpieza facial profunda» ×21.
- En el 03 (390), el bloque de las 13:00 de Laura queda tapado por un link de hueco.
- En el 10, el contraste de los huecos de foto de la vidriera es de 4,32:1 (blanco sobre #4a8…), en 8 nodos.
- En el 12b, la fila de la crema del mostrador queda debajo del header fijo.

## Observación de plata (paso 23)

Las 4 liquidaciones de comisiones ($2.580.800) salen como EGRESO en **Efectivo**, que es el medio por defecto del combo, contra un cajón con unos $158.500. Además quedan fechadas el 15/11, porque el 14/11 ya estaba cerrado. Hay que decidir si el medio por defecto de una liquidación es transferencia: es una decisión del dueño.

## Costo

Medido sobre los transcripts de esta sesión. `medir-consumo.mjs` vive en Factory-GSG y no se trajo, para no sumar contexto. Precio de lista Opus (US$ 5 entrada, US$ 25 salida, US$ 6,25 escritura de caché y US$ 0,50 lectura por millón). El precio de Opus 5.5 es *provisional a confirmar*.

| Parte | Salida | Escritura de caché | Lectura de caché | US$ |
|---|---|---|---|---|
| Guion (sesión anterior) | — | — | — | 0,82 |
| Orquestación, cruce y documento (esta sesión) | 24 k | 124 k | 8,5 M | 5,64 |
| Recorrido (subagente Opus, 100 herramientas, 43 min) | 100 k | 494 k | 10,2 M | 10,66 |
| Verificación visual | — | — | — | 0 (sin modelo, por orden del dueño) |
| **Total** | | | | **≈ 17,12** |

El 90 % es relectura de contexto. El recorrido se alargó porque hubo que destrabar el build y descubrir los selectores actuales.
