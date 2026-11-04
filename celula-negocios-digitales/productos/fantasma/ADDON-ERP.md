# Fantasma Agenda · add-on del ERP (diseño de la tanda 1 — 04/11/2026)

> Decisión del orquestador del frente, bajo el ciclo `../../CICLO-2026-11-04.md` (Fantasma suelto murió; vive como
> add-on que **reserva en la agenda del ERP**). Fuentes de mercado: `INVESTIGACION-2026-11-04.md` (lectura en Opus por
> `gsg-investigador`; Meta y Cronista bloquearon la lectura entera: lo marcado [A VALIDAR] sigue abierto).

## 1. ¿Hace falta? — Veredicto: **SIGUE, como add-on y por uso**, con una condición
- **Lo gratis de Meta (Business AI, en Argentina):** responde preguntas, recomienda del catálogo, «anota turnos» de
  forma básica y deriva a humano. Corre sólo sobre Cloud API, en early access, y se integra por webhook «standby» +
  conector REST. **No hay fuente de Meta** de que escriba en una agenda externa con disponibilidad real ni de que
  cobre seña con Mercado Pago. Eso es exactamente lo que vende Fantasma Agenda. [A VALIDAR: si Business AI pasa a
  cobrar por token desde 08/2026.]
- **Competencia:** AgendaPro desde ARS 7.900/mes; XIAgenda USD 15 por profesional; Turnito y Gendu cobran seña con MP;
  Whaticket USD 49–109, Cliengo USD 45–259, Kommo USD 20–30 por usuario. **Nadie lo vende como add-on de un ERP que
  ya tiene la agenda, los precios, las profesionales y la caja del negocio:** ahí está el hueco, no en «otro bot».
- **Costo real por charla:** respuestas dentro de la ventana de 24 h = **gratis** en Meta (plantillas fuera de
  ventana: utility USD 0,027–0,031, marketing USD 0,065–0,074). IA: **la tanda 1 no usa IA** (el orquestador
  determinista `src/lib/wa-dispatch.ts` ya existe y está testeado) → COGS ≈ 0. Si después se suma Haiku 4.5 para texto
  libre: USD 0,04–0,09 por charla de 12 turnos (Sonnet 4.5: 0,11–0,27). Con ≥ $900 por charla el margen sobra.
- **Condición que lo confirma (sin construir más):** el Paso 0 del kit `../../preventa/fantasma-piloto-ch.md` da
  **≥ 10 pedidos de turno fuera de horario por semana** en CH, y **1 de 4 negocios** (CH + 3 referidos) paga la seña de
  $60.000. Si ninguno paga, NO SIGUE: se apaga el interruptor y queda el código como módulo dormido.

## 2. Qué es (tanda 1)
Un bot de WhatsApp **por negocio, detrás de un interruptor** de la consola de GSG, que:
1. contesta **la lista de precios real** del negocio (sus `Service` activos);
2. ofrece **horarios reales** de la agenda (profesionales del servicio, horarios, choques, recursos: el mismo motor
   que el alta manual, `getAvailableSlotsRange`);
3. deja el turno **PENDIENTE de confirmar** (`Appointment.status = PENDING`, cliente por teléfono, precio congelado,
   nota «Reservado por WhatsApp, pendiente de confirmar»), **sin seña automática**: si piden pagar, contesta que la
   seña se la pide el local al confirmar y deriva;
4. **cobra por uso**: cada charla nueva (primer mensaje tras 24 h de silencio) queda asentada en `AuditLog`
   (`entity = FantasmaCharla`) para facturar; **tope mensual** por negocio y **kill-switch**: interruptor apagado =
   silencio total; tope superado o charla de más de 12 mensajes = un aviso y silencio.

## 3. Cómo se arma (sin migración: Gate 2 no se toca)
| Pieza | Dónde | Reusa |
|---|---|---|
| Interruptor `fantasma-agenda` | `src/cambios/interruptores.ts` (catálogo `INTERRUPTORES`) | consola del operador, auditoría |
| Estado de la charla + idempotencia por `wamid` | `ConversacionWhatsapp` / `MensajeWhatsapp` (`prisma/schema.prisma:2170`) | tablas del contador, `estado = agenda:*` |
| Orquestación | `src/lib/wa-dispatch.ts` (`dispatch`, `WaPorts`) + `wa-intent.ts` | tal cual; `createPaymentLink` pasa a opcional |
| Puertos reales | `src/lib/fantasma-agenda/puertos.server.ts` (nuevo) | `prisma.service`, `getAvailableSlotsRange`, `bookingTransaction` + `assertSlotAvailable` |
| Medición y topes | `src/lib/fantasma-agenda/uso.ts` (puro) + lectura por `AuditLog` | `AuditLog` |
| Entrada | `src/app/api/webhooks/whatsapp/route.ts`: firma → ¿interruptor prendido? → Fantasma; si no, el camino del pádel | firma, `parseInboundMeta`, `notificadorCloud` |

Reglas: toda consulta con `tenantId`; el turno se escribe dentro de `bookingTransaction` (Serializable, DB-4);
credenciales de Meta por variables de entorno del proyecto del negocio (como el pádel), nunca en el repo.

## 4. Qué falta (numerado, para después de la tanda 1)
1. **Seña con Mercado Pago** (tanda 2, certificación de plata): link de preferencia por turno, webhook de MP → `CONFIRMED`.
2. **Bandeja «turnos por WhatsApp sin confirmar»** en la agenda del negocio y aviso al dueño (hoy sólo aparece PENDING).
3. **Tope por negocio configurable** desde la consola (hoy constante `TOPE_CHARLAS_MES` + variable de entorno).
4. **Credenciales de Meta por negocio** en config del tenant (hoy por proyecto, 1 número = 1 deploy).
5. **IA para texto libre** (Haiku 4.5 con guion cacheado) sólo donde el router determinista no entiende; con su COGS medido.
6. **Cancelar / mover por WhatsApp** (el router ya lo reconoce; falta el puerto «mi próximo turno» por teléfono).
7. **Plantillas fuera de ventana** (recordatorio 24 h antes) con su costo por mensaje en la factura del negocio.
8. **Factura mensual al negocio** (abono + charlas): `planes.ts` del MVP viejo sirve de base, en pesos y por uso.
9. **Validar con Meta** lo marcado [A VALIDAR] antes de prometerlo en una venta.
