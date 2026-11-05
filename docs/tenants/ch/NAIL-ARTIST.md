# CH · Box «Nail Artist» — plan (Fable, 2026-11-05, rama `claude/ch-nail-artist`)

**Qué cambia en una frase:** la de uñas cobra ella (seña y servicio) a su propio alias, nada de eso entra a la caja de CH, y a fin de período
**ella le rinde a CH** (alquiler del box y/o un %), en vez de que CH le pague comisión. Todo atrás del interruptor `nail-artist` (ADR-058,
`src/cambios/interruptores.ts`): apagado, CH y los demás negocios siguen byte a byte igual. Datos faltantes = *provisional a confirmar por el dueño*.

## 1. Alias y titular: en la ficha de la profesional
- Columnas nuevas en `Professional` (precedente de nombre: schema `:2972-2973`): `aliasCbu String?`, `titularCuenta String?`, `cuitTitular String?` (opcional).
- Quién edita: el socio (OWNER, `users:manage`) y la propia profesional desde su User, **sólo su fila** (misma regla de dueño de fila que `puedeCobrarEsteTurno`,
  `cobro-mostrador.ts:43`). La casilla se llama `payments:own-account` (reusa el nombre del plan de permisos §7, que la dejó «próximamente»: no se pisa, se completa).
- Auditoría: `auditAdmin({ action: "professional_alias_set", entity: "Professional", entityId, changes: { antes: {alias, titular, cuit}, despues: {...} } })` (`audit-core.ts:78`).
- **Cambio de alias con turnos ya señados: la seña congela el alias.** Al pedir la seña, la fila `deposit_requested` (`senia-pedida.ts:13`) guarda en `changes`
  `{ alias, titular, monto }`; el comprobante y «llegó la seña» leen ESE snapshot, nunca la ficha. Un alias nuevo rige sólo para señas pedidas después.

## 2. Cómo sabe el servicio que la seña es de la profesional: marca en el SERVICIO
- `Service.depositToProfessional Boolean @default(false)` («la seña y el cobro van a la profesional»). En el servicio y no en el box porque la seña ya es por servicio
  (`depositAmount`, `:621`), el box es un cuarto que mañana puede usar otra, y una profesional puede atender Nail Artist en cualquier box. El box «Nail Artist» se da de alta
  como Box común (`:511`) y la profesional queda con `cobraEnMostrador = false` (hoy ya lo está): no hay regla nueva de mostrador.
- Validación (pura, `src/lib/turnos/senia-profesional.ts`, con test): servicio marcado + profesional del turno **sin** `aliasCbu` → no se ofrece seña por transferencia
  (la reserva dice «la seña se coordina con la profesional») y `marcarSeniaPedida` rechaza. Nunca cae a `ALIAS_SENIA_PROVISIONAL` ni a un alias de CH (`mensajes-whatsapp.ts:37`).
  Servicio marcado + profesional de otro turno → se usa SIEMPRE la del turno (`appointment.professionalId`), jamás una elegida a mano.

## 3. Qué ve la clienta (texto propuesto, criollo claro)
- Reserva (debajo del precio): «Seña de $X por transferencia al alias **<alias>** (titular: <titular>). La cobra <nombre>, tu nail artist, no el salón.»
- WhatsApp de pedido de seña: «Hola <clienta>, para confirmar tu turno de <servicio> el <día> a las <hora> transferí la seña de $X al alias <alias> (<titular>) y mandame el comprobante por acá. ¡Gracias!»
- Comprobante de seña recibida (wa.me, `mensajes-whatsapp.ts`): «Recibimos tu seña de $X para el turno de <servicio> el <día> <hora>. Cobrada por <titular> (alias <alias>). Te esperamos en CH.»
  Sin «CH recibió» ni CUIT del salón: el emisor es la titular. Si hay `cuitTitular`, va al pie: «CUIT <cuit>».

## 4. Caja: la plata de uñas no es ingreso de CH
- Regla única: **`Collection` sí, `CashMovement` no.** La seña se registra como `Collection` (`idempotencyKey = senia:<turno>`, método TRANSFERENCIA, `collectedBy` = quien marcó,
  `note` = «a <titular> (<alias>) — no entra a la caja de CH»), así el turno figura señado y la rendición del §5 sabe cuánto cobró ella. `cobroTurnoEligibility`
  (`cobro-turno.ts:61`) suma el skip `PROFESIONAL_COBRA` cuando el servicio tiene la marca: no nace asiento VENTA, el cierre (que suma `CashMovement`) no se infla.
- Lo mismo para el saldo del servicio: ella lo cobra (ya bloqueado para recepción por `cobraEnMostrador=false`), queda `Collection saldo:<turno>` sin asiento.
- Pantallas que suman `Collection` directo (resumen «Hoy», reportes de cobros): filtran por `service.depositToProfessional = false` o lo muestran aparte como «cobrado por la profesional».

## 5. Rendición recibida (lo inverso de la comisión)
- Config en la ficha: `Professional.boxRentAmount Decimal(14,2)?` (alquiler fijo por período) y `Professional.rentPercent Float?` (% de lo cobrado que rinde a CH).
  Uno, otro o ambos; `commissionPercent` queda en 0 y no se toca (significa lo contrario). Período: **mensual, provisional a confirmar**.
- Tabla nueva `ProfessionalSettlement` (espejo de `CommissionPayout:818`): `tenantId, professionalId, periodStart, periodEnd, collectedTotal, percentAmount, rentAmount,
  amount, appointmentCount, note, settledBy, cashMovementId String? @unique, createdAt`; `@@unique([tenantId, professionalId, periodStart, periodEnd])`.
- Cálculo puro (`src/lib/reports/rendiciones.ts`, test): `collectedTotal` = suma de `Collection` de sus turnos completados del período (`sumarAlCentavo`),
  `percentAmount = porcentajeDe(collectedTotal, rentPercent, "centavo")`, `amount = sumarAlCentavo([percentAmount, rentAmount])` (`@/lib/dinero/redondeo`).
- Registrar el pago (OWNER, `commissions:manage`, `src/lib/rendicion-actions.ts`): una transacción que crea el settlement **y** un `CashMovement` INGRESO (método elegido,
  `reason` = «Rendición Nail Artist · <nombre> · <mes>», `sessionId` = caja abierta si hay) y lo engancha en `cashMovementId`. Idempotente: el `@@unique` del período
  es el árbitro del doble clic (P2002 → «ya estaba registrada»), igual que `Collection.idempotencyKey`. Montos congelados en la fila, como el payout.
- Reporte y comprobante: en `/admin/comisiones` una pestaña «Rendiciones» (lista por período: cobrado, %, alquiler, a rendir, pagado/pendiente) y comprobante wa.me a ella:
  «Rendición <mes>: cobraste $A en N turnos; <p>% = $B + alquiler del box $C = **$D**, recibido por CH el <fecha> por <método>. ¡Gracias!»

## 6. Migración, tandas y riesgos
- Migración aditiva SIN aplicar (`prisma/migrations/<ts>_nail_artist/migration.sql`, Gate 2): ALTER `Professional` ADD `aliasCbu, titularCuenta, cuitTitular, boxRentAmount, rentPercent`;
  ALTER `Service` ADD `depositToProfessional` NOT NULL DEFAULT false; CREATE TABLE `ProfessionalSettlement`. El código tolera su ausencia como `cobraEnMostrador`
  (`cobro-mostrador.ts:32-36`): columna ausente = marca apagada; el interruptor `nail-artist` exige la migración aplicada para prenderse (como `cuentas-corrientes`).
- **Tanda 1 — ficha, seña y caja:** `schema.prisma` + migración; `interruptores.ts` (+ `nailArtistPrendido`); ficha de profesional (campos + permiso propio + auditoría);
  `senia-profesional.ts` (nuevo, puro) + `senia-pedida.ts` (snapshot) + `senia-actions.ts`; `mensajes-whatsapp.ts` (textos §3); reserva pública; `cobro-turno.ts` (skip);
  `LlegoLaSenia.tsx` (leyenda «a la profesional»). Acepta si: pedir seña sin alias falla; seña de uñas crea `Collection` y 0 `CashMovement`; cambiar alias no altera un comprobante ya emitido; otro negocio sin tocar.
- **Tanda 2 — rendición:** `rendiciones.ts` (cálculo), `rendicion-actions.ts`, pestaña en `comisiones/`, comprobante wa.me. Acepta si: doble clic = 1 settlement y 1 asiento;
  centavos exactos en casos de prueba (33 %, $0,01); período sin turnos = $0 + alquiler; la profesional ve sólo lo suyo.
- **Riesgos para el certificador (plata, datos, tenant):** (a) seña de uñas entrando a la caja de CH o la rendición NO entrando; (b) alias de otra profesional por elegir mal el turno;
  (c) alias cambiado con señas pedidas: comprobante debe mostrar el viejo; (d) `tenantId` en cada consulta/`tenantTransaction` de settlement y alias (RLS); (e) doble registro
  de la rendición (carrera del P2002); (f) la profesional editando el alias de otra o viendo rendiciones ajenas; (g) `commissionPercent` y `rentPercent` cargados a la vez.

## 7. Estado (05/11/2026, rama `claude/ch-nail-artist`, sin `main`, migración sin aplicar)
- Hecho: T1 (53b9a99), T2 (7e70d12), correcciones de certificación (c1b6c2f, 76d717c, 08cd96e) y de QA (03bf57e). Adversariales 21/21, QA local 10/10 pasos.
- Gate 2: `20261105120000_nail_artist` sin aplicar; el `omit` global (`src/lib/prisma-omitir-sin-migrar.ts`) mantiene vivo el resto del ERP sin ella. Al aplicarla, sacar las columnas del `omit`.
- Pendiente del dueño: cómo rinde la profesional (alquiler fijo, %, ambos; período mensual), textos a la clienta, nombre que se muestra («CH» vs `Tenant.name`).
- Deuda: aviso «no entra a la caja» en «Cobro con productos»; la profesional no tiene pantalla propia para editar su alias (lo hace el socio); falta la casilla `payments:own-account` de matriz-permisos; anulación de una rendición registrada (hoy sólo candado).
