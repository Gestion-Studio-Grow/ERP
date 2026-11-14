# Liquidación de comisiones a profesionales — spec de producto (CH, Caro)

Pedido: «armar módulo de liquidación de comisión de profesionales». Esto NO arranca de cero: hay una
liquidación viva, probada y en producción. El módulo la completa, no la reemplaza. Spec reversible (doc);
todo lo que toca plata, DB o roles se eleva (§C / Gate 2). Calibración: ADR-017 (RBAC), 040 (Gate), 055 (variante).

## 1. Qué hay hoy y qué falta
**Hay (y queda):**
- Modelo `CommissionPayout` (`prisma/schema.prisma:818`): congela monto, estampa turnos (`Appointment.commissionPayoutId`), período = min/max real de turnos. Override % por servicio: `ProfessionalServiceCommission` (`:946`); % general en `Professional.commissionPercent` (`:554`).
- Acción `settleCommissions` (`src/lib/commission-actions.ts:144`): `tenantTransaction` Serializable, idempotente (`updateMany … commissionPayoutId: null`, `:223`), egreso de caja en la misma tx (`:251`) con fecha contable respetando cierres, audit. Fórmula única `calcularLiquidacion` (`src/lib/comision-liquidacion.ts:99`). Pendiente = COMPLETED + pago APPROVED + saldado (`src/lib/reports/comisiones.ts:26`, `comision-liquidable.ts`).
- Pantalla `/admin/comisiones` (`page.tsx`, `ComisionesPendientes.tsx:65`): un renglón por profesional, medio de pago, nota, «Marcar pagada»; historial. Aviso de cobro anulado después de liquidar (`ComisionesConCobroAnulado.tsx`, sólo informa).
- Reglas escritas sin cablear: `baseComision` (bruto, `src/lib/turnos/cobros.ts:240`) y `seniaRetenida` (`:249`).
- Clics hoy: Finanzas → Comisiones → elegir medio → nota → «Marcar pagada» = 3–4 clics **por profesional**, sin ver el detalle de qué turnos entran.

**Falta para liquidar «de punta a punta»:**
1. Período elegido (hoy liquida «todo lo pendiente hasta hoy»; no hay corte semanal/quincenal/mensual).
2. Vista previa con detalle por turno (servicio, cobrado, %, comisión) antes de apretar.
3. Separar **liquidar** (cerrar el período) de **pagar** (sacar la plata): hoy es un solo paso.
4. Ajustes: cobro anulado después de liquidar → hoy sólo avisa, no descuenta. Adelantos/vales: no existen.
5. Comprobante por WhatsApp a la profesional. 6. La profesional viendo **su** liquidación (rol PROFESSIONAL hoy sólo ve agenda, `capabilities.ts:204`).
7. Productos vendidos por profesional: la venta de mostrador no guarda quién vendió → no comisiona hoy. 8. Reportes por período para Caro.
9. Centavos: `amount` es `Float` con `round2`; los campos nuevos van en centavos enteros.

## 2. Flujo propuesto
- **Período** configurable por negocio (`BusinessSettings.commissionPeriod`: SEMANA | QUINCENA | MES; default MES *provisional a confirmar*). Corte en zona del negocio. El período se elige en pantalla («Octubre 2026», «1–15 nov»); entran los turnos **COMPLETED, saldados y sin liquidar** con `startsAt` dentro del período. Lo saldado tarde entra al período en que se liquide (misma regla de hoy), no se pierde.
- **Vista previa por profesional** (renglón expandible): turnos × % (servicio o general) → bruto; menos **ajustes** pendientes (anulaciones/devoluciones de turnos ya liquidados, adelantos/vales cargados por Caro) → **neto a pagar**. Productos: sólo si el dueño decide (§6) y con vendedor registrado en la venta; fuera de alcance de estas tandas. Seña retenida de «no vino»: no comisiona (regla ya escrita, `cobros.ts:245`), se muestra como línea informativa.
- **«Liquidar»** (capability `commissions:manage`, OWNER): cierra el período para esa profesional → `CommissionPayout` estado LIQUIDADA, inmutable, idempotente (doble clic = un solo payout, ya resuelto). Estampa turnos y ajustes aplicados.
- **«Pagar»**: elige medio (efectivo = egreso de caja como hoy, `egresoDeLiquidacion`; transferencia/MP = egreso en ese medio) → estado PAGADA + `paidAt`. Un payout se paga una sola vez.
- **Comprobante WhatsApp**: botón «Mandar comprobante» → `wa.me` al `Professional.phone` vía `leerWhatsApp` (`src/lib/whatsapp-cta.ts`), texto criollo: período, turnos, bruto, ajustes, neto, medio, fecha. Sin número cargado → se pide ahí mismo (patrón existente). Nada se manda solo.
- **«Mi liquidación»** (`/admin/mis-comisiones`, capability nueva `commissions:read-own` para PROFESSIONAL): sólo la suya, scoped por `User.professionalId` (`schema.prisma:486`); ve pendiente estimado, liquidaciones e historial. Sin botones de plata.
- **Reportes para Caro** (`reports:read`): por período y profesional: ingresos base, comisión, % efectivo, ajustes, pagado/sin pagar; CSV (patrón `src/lib/caja/libro-csv.ts`).

## 3. Reglas duras
- Centavos enteros en todo campo nuevo (`amountCents Int`); `amount Float` se sigue escribiendo igual para no romper historial ni pantallas. Suma por renglón redondeado, nunca redondeo del total solo.
- Toda escritura dentro de `tenantTransaction`; `tenantId` en cada fila; RLS vigente. Un turno se liquida **una vez** (guarda `commissionPayoutId: null` en el `updateMany`, no se toca).
- Payout LIQUIDADA/PAGADA **no se edita ni se borra**. Error → ajuste con signo en el período siguiente, con motivo y quién lo cargó.
- Cobro anulado después de liquidar → ajuste negativo automático (reusa la detección de `reports/comision-ya-pagada.ts:85`), aplicado en la próxima liquidación de esa profesional; la pantalla lo muestra antes de liquidar.
- Roles: liquidar/pagar/ajustes = OWNER (`commissions:manage`); ver todo = `reports:read`; profesional = sólo lo propio. Egreso de caja no borrable desde el libro (ya: `esEgresoDeComision`).

## 4. Migración (propuesta aditiva, SIN aplicar → Gate 2)
- `CommissionPayout`: `status` enum (LIQUIDADA | PAGADA) default PAGADA (lo histórico ya se pagó), `paidAt DateTime?`, `paidMethod CashMethod?`, `amountCents Int?`, `periodKey String?` («2026-10», «2026-W44», «2026-11-Q1»).
- Nuevo `CommissionAdjustment`: `tenantId, professionalId, appointmentId?, amountCents Int` (con signo), `kind` (ANULACION | ADELANTO | MANUAL), `reason`, `createdBy`, `payoutId?` (null = pendiente de aplicar). Índices por tenant/profesional.
- `BusinessSettings.commissionPeriod String?` (null = MES).
- **Sin migración se puede hacer**: período + vista previa (filtro por `startsAt` en memoria sobre lo pendiente), comprobante WA del payout ya existente, portal «Mi liquidación» de sólo lectura, reportes. Liquidar≠pagar y ajustes requieren la migración; el código la tolera ausente (si no hay columna, el botón «Pagar» no se muestra y liquidar sigue pagando en un paso, como hoy).

## 5. Tandas (chicas, archivos propios)
**T1 — Período, vista previa, comprobante, «Mi liquidación» (sin migración).** Archivos: `src/lib/comisiones/periodo.ts` (+test), `src/lib/comisiones/comprobante-wa.ts` (+test), `src/app/admin/(dashboard)/comisiones/VistaPrevia.tsx`, `src/app/admin/(dashboard)/mis-comisiones/page.tsx`, `src/lib/capabilities.ts` (+`commissions:read-own`). Aceptación: total de la vista previa == monto que congela `settleCommissions` (test); turno a las 23:59 del último día del período entra y 00:00 del siguiente no (TZ negocio); profesional A no ve nada de B ni de otro negocio (test postgres con dos tenants, dos profesionales); comprobante WA sin número no abre chat. Riesgo: plata (cálculo) → certificación adversarial sobre el diff. QA clic por clic: Caro elige período → abre renglón → ve turnos → liquida → manda comprobante; profesional entra y ve sólo lo suyo.
**T2 — Liquidar≠pagar y ajustes (con migración, Gate 2).** Archivos: `prisma/migrations/<ts>_comisiones_estado_ajustes/` (sin aplicar), `schema.prisma`, `src/lib/comisiones/ajustes.ts` (+test), `commission-actions.ts` (`payCommission`, `cargarAjuste`), `ComisionesRenglon.tsx`, `ComisionesConCobroAnulado.tsx` (pasa de aviso a ajuste). Aceptación: anular cobro de turno liquidado crea ajuste negativo exacto que descuenta en el período siguiente; doble clic en «Pagar» = un egreso; sin la migración aplicada, tsc/tests/pantalla siguen verdes con el flujo de hoy. Riesgo alto (plata + concurrencia + datos) → certificación adversarial; tests postgres con dos negocios.
**T3 — Reportes y CSV para Caro.** Archivos: `src/lib/comisiones/reporte.ts` (+test), `src/app/admin/(dashboard)/comisiones/reporte/page.tsx`. Aceptación: suma del reporte == suma de payouts del período; CSV abre en Excel con coma decimal AR. Riesgo bajo → revisión liviana + QA clic por clic.

## 6. Qué decide el dueño (todo «provisional a confirmar» hasta su OK)
1. Período por defecto para CH: MES (asumido). 2. % general por profesional por defecto: el cargado hoy en catálogo; no se cambia nada.
3. Base bruto vs. neto cobrado (pregunta abierta de siempre, `cobros.ts:233`): se mantiene **neto cobrado**. 4. ¿Los productos vendidos comisionan? Asumido NO (no hay vendedor en la venta). 5. ¿Adelantos/vales se descuentan de la comisión? Asumido SÍ, sólo con carga manual de Caro. 6. ¿La profesional ve su pendiente estimado o sólo lo liquidado? Asumido ambos. 7. Aplicar la migración de T2 (Gate 2).

## 7. Deuda anotada (D5, 14/11/2026)
- **«Esperan saldo» no coincide entre pantallas.** La vista previa y «Mi liquidación» (`armarVistaPrevia`,
  `src/lib/comisiones/vista-previa.ts`) cuentan sólo turnos del corte con pago `APPROVED` (el `where` de la
  liquidación); el aviso de Comisiones (`leerTurnosEsperandoSaldo`, `src/lib/reports/comisiones-lectura.ts`)
  cuenta todos los terminados sin liquidar, también los sin cobro, sin corte de período ni filtro por profesional.
  Reusarlo exige una segunda consulta acotada por profesional y período: se deja para una tanda propia.
- **Comprobante WhatsApp:** la línea pasó de «Cobrado» a «Cobrado sin voucher» y usa `baseDeComision`, la
  misma base que la comisión congelada, para que el «%» se pueda verificar a mano.
