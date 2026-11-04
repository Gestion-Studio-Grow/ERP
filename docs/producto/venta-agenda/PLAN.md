# Venta y agenda simples — plan (04/11/2026, sobre main ee193f1, rama `claude/venta-agenda-simple`)

Hechos con `archivo:línea` relevados en el código el 04/11/2026 (no corriendo la app). Lo aprobado en `Factory-GSG/00-ESTADO/reingenieria-2026-10/nivel-2/PLAN-CH-N2.md` (C7 l.514-534 · C11 l.597-619 · C15 l.681-699 · C21 l.801-820 · D-C01) **manda**: acá sólo se ordena en tandas y se referencia. Referencia de mercado: TuTurno (`docs/sectores/agencia-digital/analisis-mercado/2026-07-06-analisis-competitivo-tuturno.md`).

## 1. Recorrido actual (contado en el código, no corriendo la app)
- **Clienta** (`/reserva`, `src/app/(site)/reserva/BookingForm.tsx:148-323`): profesional → servicio → día → hora → datos → confirmar ≈ 6 toques + tipeo, 2 pantallas. Modal CH (`_ch/BookingModal.tsx:455,907`) ≈ 9 toques con «Continuar» por paso. **No paga online**: «te contactamos por WhatsApp» (`BookingForm.tsx:134,323`; `BookingModal.tsx:850-887`). El plugin `src/plugins/mercadopago/` existe y la reserva no lo usa.
- **Recepción**: alta (`turnos/_agenda/AltaDeTurno.tsx:411-698`, `darTurno :348`) ≈ 7 toques. Cobro desde el cajón = 2 toques (`TerminarTurno.tsx:132`). Producto: «Sumar un producto» (`TurnoCajon.tsx:509-514`) **sale** a `/admin/pedidos?cobrar=1&turno=` (`cobrar-una-venta.ts:21`) ≈ 4 toques más. Total agenda→cobrado+producto ≈ **7 toques, 2 pantallas, 2 cobros**. Medios: EFECTIVO, MERCADOPAGO (etiqueta a mano), TRANSFERENCIA (`src/lib/turnos/cobros.ts:266`).
- **Dueño**: Inicio sólo alertas (`inicio/ParaAtenderHoy.tsx:54-79`); Caja → Cierre (`caja/cierre/page.tsx`) 2-3 clics; turnos del día en otra pantalla. **No hay resumen único del día.**
- `agenda-practica` (`src/cambios/interruptores.ts:86-92`) cambia alta/cancelación/próximo/espera; no toca cobro ni venta.

## 2. Mismo recorrido en TuTurno (web no accesible desde la sesión → pasos **provisionales a confirmar**)
- Clienta: servicio → profesional → fecha/hora → datos → **seña por MP** → confirmado, en una pantalla con pasos (≈ 5 toques, provisional). Recordatorios WA automáticos (§1-§2, verificado).
- Recepción: agenda con cobro; caja y stock sólo en plan Empresa ($37.742/mes); seña MP sólo desde Profesional ($28.317/prof/mes) (§6, verificado). Producto + turno en un cobro: **provisional a confirmar**.
- Dueño: panel de caja por plan (provisional). Nuestra ventaja: caja + stock + seña sin plan aparte, WhatsApp primero.

## 3. Objetivo (antes → después, todo con el interruptor prendido)
| Recorrido | Antes | Después |
|---|---|---|
| Recepción: turno + producto cobrados | 7 toques · 2 pantallas · 2 cobros | **≤ 4 toques · 1 pantalla (cajón) · 1 cobro, 1 tx** (C15) |
| Recepción: alta | ≈ 7 toques | **≤ 7** con «Los de siempre» y categorías (C7); cobro ≤ 2 |
| Clienta: reserva + seña | 6-9 toques, sin pago online | **≤ 6 toques, 1 flujo** Qué→Con quién→Cuándo→Vos→Seña→Listo (C11); seña por **transferencia con alias** o **MP** (C21) |
| Comprobante | no hay | **una tecla «Mandar comprobante por WhatsApp»** (C7/C11) |
| Dueño: día de hoy | 3 pantallas | **1 resumen del día** (turnos, cobrado por medio, señas pendientes) |

## 4. Qué se saca · se junta · se agrega
- **Se saca** (prendido): el salto a `/admin/pedidos?cobrar=1&turno=` desde el cajón; el «te contactamos por WhatsApp» como único cierre de reserva; la etiqueta MERCADOPAGO «a mano» para señas que entran por MP.
- **Se junta**: cobro del turno + productos en un pie único del cajón (C15); los pasos de reserva en un flujo (C11); turnos + caja del día en un resumen.
- **Se agrega**: interruptor `venta-agenda-simple` (ADR-058, al **final** del array de `src/cambios/interruptores.ts`); bloque de seña con alias + vencimiento (C11/C21); comprobante WA; seña MP atada al turno (C21).
- **No se toca**: `order-core.ts` (C15), Débito/Crédito siguen separados (D-C01), todo lo de Fantasma Agenda (§6).

## 5. Tandas (cada una detrás de `venta-agenda-simple`; apagado = byte a byte lo de siempre; sin migración obligatoria)
**T1 · Cobro único turno + producto en el cajón + resumen del día** (mayor valor; sin migraciones ni credenciales; C15 CH-077).
Archivos propios: `src/cambios/interruptores.ts` (sólo agregar al final), `turnos/_agenda/TerminarTurno.tsx`, `TurnoCajon.tsx:509-514`, `src/lib/turnos/cobros.ts` (nueva función que arma Order + cobro turno + stock en **una** `tenantTransaction`), `inicio/` (tarjeta «Hoy»). No tocar: `order-core.ts`, `cobrar-una-venta.ts`, `wa-dispatch.ts`, webhooks WA, `src/lib/fantasma-agenda/*`.
Aceptación: con interruptor prendido «+ Producto» abre un buscador dentro del cajón y el cobro final genera 1 Order + 1 cobro de turno + descuento de stock en 1 tx (≤ 4 toques medidos en QA); apagado, el botón sigue yendo a `/admin/pedidos?cobrar=1&turno=` sin cambio; el resumen del dueño muestra turnos de hoy, cobrado por medio y señas pendientes. Riesgo: **plata + concurrencia** (certificación adversarial sobre el diff: doble clic no duplica cobro, stock no queda negativo, rollback total si falla una pata). Tests con dos negocios: tenant A prendido cobra 1 tx; tenant B apagado no ve nada ni se le toca stock; cobro de A no aparece en caja de B. QA: 1) prender en negocio de QA, 2) abrir cajón de un turno, 3) «+ Producto», elegir uno, 4) cobrar efectivo con vuelto, 5) ver 1 movimiento en caja y stock -1, 6) apagar y repetir: va al pedido como siempre.

**T2 · Alta ≤ 7 toques, vuelto, Listo ✓, comprobante por WhatsApp** (C7). Propios: `AltaDeTurno.tsx` (categorías + «Los de siempre»), `TerminarTurno.tsx` (vuelto, Listo ✓, «¿Le damos el próximo?»), texto del comprobante en `src/lib/turnos/` (link `wa.me`, sin despachar por `wa-dispatch.ts`). No tocar: `agenda-practica` y su lógica de próximo/espera (se reutiliza, no se duplica), Fantasma. Aceptación: alta con «Los de siempre» ≤ 5 toques, alta común ≤ 7, cobro ≤ 2, comprobante abre WhatsApp con monto/medio/fecha. Riesgo: **visual** (revisión liviana) + plata en el vuelto (test unitario). Tests: dos negocios con «los de siempre» distintos no se mezclan; apagado, el alta es la de siempre. QA: alta de clienta frecuente → cobrar con billete grande → Listo ✓ → tecla WA → «¿el próximo?».

**T3 · Reserva en un flujo con seña por transferencia (alias + vence)** (C11; MP excluido). Propios: `reserva/BookingForm.tsx`, `_ch/BookingModal.tsx`, bloque de seña (alias y horas de vencimiento leídos de config del negocio; si falta, «provisional a confirmar» y el bloque no aparece), `src/lib/turnos/` (seña pendiente + vencimiento con un toque desde el cajón). No tocar: cancelación online de `agenda-practica`, Fantasma. Aceptación: ≤ 6 toques desde el servicio hasta Listo; seña muestra alias, monto y vence; recepción marca «seña recibida» o «venció» con 1 toque; apagado, el flujo actual intacto. Riesgo: **plata** (seña recibida = cobro TRANSFERENCIA atado al turno, nunca sola) + visual. Tests: dos negocios con alias distintos muestran cada uno el suyo; negocio sin alias no muestra seña. QA: reservar desde el celular, ver bloque de seña, marcar recibida en el cajón, cobrar el saldo.

**T4 · Seña por Mercado Pago atada al turno** (C21; **depende de la conexión MP del negocio**; local con simulador). Propios: `src/plugins/mercadopago/` (preferencia con `external_reference` = turno), webhook propio del plugin (NO el de WhatsApp), `aplicarCobroTurnoInTx`. No tocar: `src/app/api/webhooks/whatsapp/route.ts`, `wa-dispatch.ts`, Fantasma. Aceptación: sin conexión MP la tecla no aparece; doble aviso del webhook = 1 cobro (idempotente por `external_reference`); transferencia sigue siendo el camino principal. Riesgo: **plata + concurrencia + seguridad** (firma del webhook; certificación adversarial). Tests: dos negocios, cada uno con su credencial simulada; aviso del negocio A no cobra en B; aviso repetido no duplica. QA: reservar con seña MP en simulador, aviso llega, turno queda señado, saldo se cobra en el cajón.

## 6. No romper Fantasma Agenda
`origin/claude/fantasma-agenda` agrega su interruptor justo después de `agenda-practica` y toca `src/lib/wa-dispatch.ts`, `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/fantasma-agenda/*`. Regla: `venta-agenda-simple` va **al final** del array; ninguna tanda edita esos tres lugares; el comprobante WA de T2 es un link `wa.me` abierto por la recepción, no un despacho. Antes de integrar: merge de prueba contra esa rama y `tsc` + suites, resumen `n/n`.

## 7. Qué decide el dueño (irreversible)
1. Prender `venta-agenda-simple` en CH y en qué otros negocios (y cuándo). 2. Push a `main` de cada tanda (= deploy). 3. Si T3/T4 piden migración (seña pendiente con vencimiento): se escribe sin aplicar; `migrate deploy` a Neon es Gate 2. 4. Conectar MP real del negocio para T4 (credenciales las pega el dueño). 5. Confirmar alias y horas de vencimiento de seña por negocio (placeholders «provisional a confirmar» hasta entonces). 6. Validar los pasos de TuTurno marcados provisionales antes de usarlos en material de venta.
