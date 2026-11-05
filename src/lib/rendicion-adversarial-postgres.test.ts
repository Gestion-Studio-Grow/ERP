// Adversariales del certificador GSG — Tanda 2 del box «Nail Artist» (rendición recibida), vuelta 1.
// Base efímera en el Postgres local (src/test/base-efimera.ts); sin base, se saltean.
//
// Ajustes a las expectativas originales (por qué, contra la regla de NAIL-ARTIST.md §4-§5 y el brief):
//   · Período: la rendición ahora se registra sólo sobre un mes TERMINADO (MEDIA 6). Los turnos se
//     siembran en el mes anterior y se rinde ese mes; el mes en curso se prueba aparte (rechazo).
//   · Mica tiene además un alquiler de $5.000: con su único cobro en la caja de CH (VENTA), su 10 %
//     da $0 y sin alquiler no habría rendición que registrar (A1) ni fila que mirar (A2).
//   · C1: `pendienteDelTurno` recibe `cobradoPorLaProfesional` (lo lee `facturarAppointment` por el
//     destino del cobro); la función pura no puede adivinarlo de `Payment.amount`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { leerConfigDeRendicion, mesAnterior, periodoMensual } from "@/lib/reports/rendiciones";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;
type S = { base: BaseEfimera; mes: string; ana: string; mica: string; servMarcado: string };
let s: S | null = null;

async function preparar(t: import("node:test").TestContext): Promise<S | null> {
  if (s) return s;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const d = await prismaComoDuenio(base);
  const ahora = Date.now();
  const mes = mesAnterior(dateStrInBusinessTz(new Date(ahora)).slice(0, 7));
  const inicioDelMes = periodoMensual(mes)!.desde.getTime();
  const tenantId = base.a.id;
  const box = await d.box.create({ data: { tenantId, name: "Nail" } });
  const serv = await d.service.create({ data: { tenantId, name: "Kapping", durationMin: 10, price: 10000, depositToProfessional: true } });
  // Ana: comisión 40 % Y rinde 33 %.
  const ana = await d.professional.create({ data: { tenantId, name: "Ana", commissionPercent: 40, rentPercent: 33, services: { connect: [{ id: serv.id }] } } });
  const mica = await d.professional.create({ data: { tenantId, name: "Mica", rentPercent: 10, boxRentAmount: 5000 } });
  let n = 0;
  const turno = async (professionalId: string, monto: number, conAsientoEnCH: boolean) => {
    const clientId = (await d.client.create({ data: { tenantId, name: `C${n}`, phone: `11400099${n}` } })).id;
    const startsAt = new Date(inicioDelMes + 2 * 24 * 60 * MIN + (20 + n++) * MIN);
    const a = await d.appointment.create({ data: { tenantId, clientId, professionalId, serviceId: serv.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 10 * MIN), status: "COMPLETED", priceAtBooking: monto } });
    const c = await d.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: monto, method: "EFECTIVO", collectedBy: "test" } });
    await d.payment.create({ data: { tenantId, appointmentId: a.id, amount: monto, status: "APPROVED", method: "EFECTIVO" } as never }).catch(() => undefined);
    if (conAsientoEnCH) {
      // Cobro que ENTRÓ a la caja de CH (p. ej. antes de marcar el servicio): VENTA en el libro.
      await d.cashMovement.create({ data: { tenantId, type: "VENTA", method: "EFECTIVO", amount: monto, collectionId: c.id, occurredAt: new Date(), createdBy: "test" } as never });
    }
  };
  await turno(ana.id, 10000, false);
  await turno(mica.id, 10000, true); // la plata la tiene CH
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  s = { base, mes, ana: ana.id, mica: mica.id, servMarcado: serv.id };
  return s;
}

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
async function como<R>(x: S, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: x.base.a, usuario: x.base.a.duenia }, fn);
  if (r.tipo !== "respuesta") throw new Error(`sin respuesta: ${JSON.stringify(r)}`);
  return r.valor;
}

test("A1 borrar el INGRESO de la rendición desde el libro deja el settlement «recibido» sin asiento y bloquea re-registrar", async (t) => {
  const x = await preparar(t); if (!x) return;
  const { registrarRendicion } = await import("@/lib/rendicion-actions");
  const r = await como(x, () => registrarRendicion(fd({ professionalId: x.mica, mes: x.mes, method: "EFECTIVO" })));
  assert.ok(r.ok, JSON.stringify(r));
  const d = await prismaComoDuenio(x.base);
  const st = await d.professionalSettlement.findFirstOrThrow({ where: { tenantId: x.base.a.id, professionalId: x.mica } });
  const { deleteLibroEntry } = await import("@/lib/libro-caja-actions");
  const del = await como(x, () => deleteLibroEntry({ ok: false } as never, fd({ id: st.cashMovementId! })));
  const sigue = await d.cashMovement.findUnique({ where: { id: st.cashMovementId! } });
  const otra = await como(x, () => registrarRendicion(fd({ professionalId: x.mica, mes: x.mes, method: "EFECTIVO" })));
  assert.ok(sigue, `FALLA: el libro borró el asiento de la rendición (${JSON.stringify(del)}); settlement ${st.id} queda recibido sin plata; re-registrar: ${JSON.stringify(otra)}`);
});

test("A2 la rendición cuenta un cobro que entró a la caja de CH (servicio marcado por la marca ACTUAL, no por el destino del cobro)", async (t) => {
  const x = await preparar(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const st = await d.professionalSettlement.findFirst({ where: { tenantId: x.base.a.id, professionalId: x.mica } });
  assert.ok(st);
  assert.equal(st.collectedTotal.toNumber(), 0, `FALLA: collectedTotal=${st.collectedTotal} incluye $10.000 que ya tiene la caja de CH (VENTA en el libro); CH le cobra 10 % sobre plata propia`);
});

test("B1 KPI «a liquidar» y doble cobro: la que rinde aparece en el KPI de comisiones", async (t) => {
  const x = await preparar(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const { comisiones } = await import("@/apps/kpis/finanzas.server");
  const k = await comisiones({ db: d as never, tenantId: x.base.a.id } as never);
  assert.match(JSON.stringify(k), /nada para liquidar/, `FALLA: KPI muestra comisión a pagar a Ana, que rinde: ${JSON.stringify(k)}`);
});

test("B2 rinde, se le saca la config y sus turnos YA rendidos vuelven a «comisión pendiente» (doble cobro)", async (t) => {
  const x = await preparar(t); if (!x) return;
  const { registrarRendicion, guardarConfigDeRendicion } = await import("@/lib/rendicion-actions");
  const r = await como(x, () => registrarRendicion(fd({ professionalId: x.ana, mes: x.mes, method: "EFECTIVO" })));
  assert.ok(r.ok, JSON.stringify(r));
  const g = await como(x, () => guardarConfigDeRendicion(fd({ professionalId: x.ana, boxRentAmount: "", rentPercent: "" })));
  assert.ok(g.ok, JSON.stringify(g));
  const { getCommissionsOverview } = await import("@/lib/commission-actions");
  const o = await como(x, () => getCommissionsOverview());
  const ana = o.pending.find((p) => p.professionalId === x.ana);
  assert.equal(ana, undefined, `FALLA: tras rendir 33 %, Ana aparece con comisión pendiente ${JSON.stringify(ana)} sobre los mismos turnos`);
});

test("A3 alquiler criollo «1.500» se guarda como $1,50", () => {
  const r = leerConfigDeRendicion({ boxRentAmount: "150.000", rentPercent: "" });
  assert.ok(r.ok);
  assert.equal(r.config.boxRentAmount, 150000, `FALLA: «150.000» → ${r.config.boxRentAmount}`);
  const c = leerConfigDeRendicion({ boxRentAmount: "150000,50", rentPercent: "12,5" });
  assert.ok(c.ok);
  assert.equal(c.config.boxRentAmount, 150000.5);
  assert.equal(c.config.rentPercent, 12.5);
  assert.ok(!leerConfigDeRendicion({ boxRentAmount: "-5", rentPercent: "" }).ok);
});

test("A4 período: turno del 31/10 23:30 AR cae en octubre", () => {
  const oct = periodoMensual("2026-10")!;
  const t = new Date("2026-11-01T02:30:00Z"); // 31/10 23:30 AR
  assert.ok(t >= oct.desde && t < oct.hasta);
});

test("C1 factura del turno: se emitiría por lo que cobró la profesional", async () => {
  const { pendienteDelTurno } = await import("@/lib/facturacion/cobros-facturados");
  const p = pendienteDelTurno({ cobrado: 10000, precio: 10000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorLaProfesional: 10000 });
  assert.equal(p.pendiente, 0, `FALLA: el turno marcado (Payment.amount=$10.000 cobrado por ella) factura $${p.pendiente} a nombre de CH`);
  const parte = pendienteDelTurno({ cobrado: 10000, precio: 10000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorLaProfesional: 3000 });
  assert.equal(parte.pendiente, 7000, "sólo lo que entró a la caja de CH se factura");
});

test("C2 lo cobrado por la profesional se lee por el destino del cobro (sin asiento), no por la marca", async (t) => {
  const x = await preparar(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const { leerCobradoPorLaProfesional } = await import("@/lib/reports/rendiciones-lectura");
  const turnoDe = async (professionalId: string) => (await d.appointment.findFirstOrThrow({ where: { tenantId: x.base.a.id, professionalId }, select: { id: true } })).id;
  assert.equal(await leerCobradoPorLaProfesional(d as never, x.base.a.id, await turnoDe(x.ana)), 10000);
  assert.equal(await leerCobradoPorLaProfesional(d as never, x.base.a.id, await turnoDe(x.mica)), 0, "el cobro con VENTA en el libro es de CH");
});

test("D1 el mes en curso no se registra (todavía suma turnos)", async (t) => {
  const x = await preparar(t); if (!x) return;
  const { registrarRendicion } = await import("@/lib/rendicion-actions");
  const enCurso = dateStrInBusinessTz(new Date()).slice(0, 7);
  const r = await como(x, () => registrarRendicion(fd({ professionalId: x.mica, mes: enCurso, method: "EFECTIVO" })));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /no terminó/);
});

// ── Recertificación vuelta 1 (R1-R5): pago legado de CH, turno rendido con el interruptor apagado,
// profesional normal, migración y turno mixto. Estado propio (`st`), misma base efímera.
let st: { base: BaseEfimera; mes: string; inicio: number; serv: string; servNormal: string; box: string } | null = null;
let n = 0;

async function prep(t: import("node:test").TestContext) {
  if (st) return st;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const d = await prismaComoDuenio(base);
  const mes = mesAnterior(dateStrInBusinessTz(new Date()).slice(0, 7));
  const inicio = periodoMensual(mes)!.desde.getTime();
  const tenantId = base.a.id;
  const box = await d.box.create({ data: { tenantId, name: "Nail" } });
  const serv = await d.service.create({ data: { tenantId, name: "Kapping", durationMin: 10, price: 10000, depositToProfessional: true } });
  const servNormal = await d.service.create({ data: { tenantId, name: "Corte", durationMin: 10, price: 10000 } });
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  st = { base, mes, inicio, serv: serv.id, servNormal: servNormal.id, box: box.id };
  return st;
}

async function turno(x: NonNullable<typeof st>, professionalId: string, serviceId: string, status: "COMPLETED" | "CONFIRMED" = "COMPLETED") {
  const d = await prismaComoDuenio(x.base);
  const tenantId = x.base.a.id;
  const clientId = (await d.client.create({ data: { tenantId, name: `R${n}`, phone: `11500099${n}` } })).id;
  const startsAt = new Date(x.inicio + 3 * 24 * 60 * MIN + (30 + n++) * MIN);
  return d.appointment.create({ data: { tenantId, clientId, professionalId, serviceId, boxId: x.box, startsAt, endsAt: new Date(startsAt.getTime() + 10 * MIN), status, priceAtBooking: 10000 } });
}

async function comoR<R>(x: NonNullable<typeof st>, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio: x.base.a, usuario: x.base.a.duenia }, fn);
  if (r.tipo !== "respuesta") throw new Error(`sin respuesta: ${JSON.stringify(r)}`);
  return r.valor;
}

test("R1 pago legado de CH (MP, asiento por paymentId) en servicio marcado: al cobrar el saldo se materializa SIN asiento y se le atribuye a ella", async (t) => {
  const x = await prep(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const tenantId = x.base.a.id;
  const pro = await d.professional.create({ data: { tenantId, name: "Lola", rentPercent: 10 } });
  const a = await turno(x, pro.id, x.serv);
  const pay = await d.payment.create({ data: { tenantId, appointmentId: a.id, amount: 4000, status: "APPROVED", method: "MERCADOPAGO" } as never });
  await d.cashMovement.create({ data: { tenantId, type: "VENTA", method: "MP", amount: 4000, paymentId: (pay as { id: string }).id, occurredAt: new Date(), createdBy: "test" } as never });
  const { tenantTransaction } = await import("@/lib/rls");
  const { aplicarCobroTurnoInTx } = await import("@/lib/turnos/cobro-turno-repo");
  await tenantTransaction((tx) => aplicarCobroTurnoInTx(tx as never, tenantId, {
    appointmentId: a.id, status: "COMPLETED", precio: 10000, monto: 6000, method: "EFECTIVO", note: "Saldo", actor: "user:x",
    detail: "Turno · Kapping", idempotencyKey: `saldo:${a.id}`, withSchema: true, cerradoHasta: null, camino: "completar", nailArtist: true,
  } as never), { tenantId });
  const { leerCobradoPorLaProfesional } = await import("@/lib/reports/rendiciones-lectura");
  const deElla = await tenantTransaction((tx) => leerCobradoPorLaProfesional(tx as never, tenantId, a.id), { tenantId });
  assert.equal(deElla, 6000, `FALLA: se le atribuyen $${deElla} a la profesional; $4.000 son el pago MP legado que entró a CH (VENTA por paymentId). CH deja de facturarlos y se los cobra en la rendición.`);
});

test("R2 apagar el interruptor tras rendir: los turnos YA rendidos vuelven a comisión pendiente", async (t) => {
  const x = await prep(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const tenantId = x.base.a.id;
  const pro = await d.professional.create({ data: { tenantId, name: "Sol", commissionPercent: 40, rentPercent: 33 } });
  const a = await turno(x, pro.id, x.serv);
  await d.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 10000, method: "EFECTIVO", collectedBy: "test" } });
  await d.payment.create({ data: { tenantId, appointmentId: a.id, amount: 10000, status: "APPROVED", method: "EFECTIVO" } as never });
  const { registrarRendicion } = await import("@/lib/rendicion-actions");
  const r = await comoR(x, () => registrarRendicion(fd({ professionalId: pro.id, mes: x.mes, method: "EFECTIVO" })));
  assert.ok(r.ok, JSON.stringify(r));
  const marcado = await d.appointment.findUniqueOrThrow({ where: { id: a.id }, select: { settlementId: true } });
  assert.ok(marcado.settlementId, "el turno rendido queda marcado");
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerComisionesPendientes } = await import("@/lib/reports/comisiones-lectura");
  const conOn = await tenantTransaction((tx) => leerComisionesPendientes(tx as never, tenantId), { tenantId });
  assert.equal(conOn.find((p) => p.professionalId === pro.id), undefined, "prendido: no aparece");
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await new Promise((res) => setTimeout(res, 20));
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor: NAIL_ARTIST, accion: "apagar", operador: "test" }) });
  const conOff = await tenantTransaction((tx) => leerComisionesPendientes(tx as never, tenantId), { tenantId });
  const sol = conOff.find((p) => p.professionalId === pro.id);
  // re-prender para los demás tests
  await new Promise((res) => setTimeout(res, 20));
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  assert.equal(sol, undefined, `FALLA: con el interruptor apagado el turno rendido (settlementId=${marcado.settlementId}) vuelve a comisión pendiente: ${JSON.stringify(sol)}`);
});

test("R3 profesional normal (sin rendición) conserva su comisión con el interruptor prendido", async (t) => {
  const x = await prep(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const tenantId = x.base.a.id;
  const pro = await d.professional.create({ data: { tenantId, name: "Normal", commissionPercent: 50 } });
  const pro0 = await d.professional.create({ data: { tenantId, name: "Cero", commissionPercent: 50, boxRentAmount: 0, rentPercent: 0 } });
  for (const p of [pro, pro0]) {
    const a = await turno(x, p.id, x.servNormal);
    await d.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 10000, method: "EFECTIVO", collectedBy: "test" } });
    await d.payment.create({ data: { tenantId, appointmentId: a.id, amount: 10000, status: "APPROVED", method: "EFECTIVO" } as never });
  }
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerComisionesPendientes } = await import("@/lib/reports/comisiones-lectura");
  const l = await tenantTransaction((tx) => leerComisionesPendientes(tx as never, tenantId), { tenantId });
  assert.ok(l.find((p) => p.professionalId === pro.id), "FALLA: perdió la comisión la profesional sin config");
  assert.ok(l.find((p) => p.professionalId === pro0.id), "FALLA: perdió la comisión la profesional con config en 0");
  const { getCommissionsOverview } = await import("@/lib/commission-actions");
  const o = await comoR(x, () => getCommissionsOverview());
  const { comisiones } = await import("@/apps/kpis/finanzas.server");
  const k = await comisiones({ db: d as never, tenantId } as never);
  const total = o.pending.reduce((s, p) => s + (p as { total?: number; amount?: number }).total! || 0, 0);
  t.diagnostic(`pantalla: ${JSON.stringify(o.pending.map((p) => p.professionalId === pro.id || p.professionalId === pro0.id))} kpi: ${JSON.stringify(k)} total:${total}`);
});

test("R4 faltaLaMigracion con la migración aplicada: no bloquea (sin falso positivo) y sí bloquea interruptor sin requisito → null", async (t) => {
  const x = await prep(t); if (!x) return;
  const { depsDeCambioReales } = await import("@/lib/operador/interruptores-escritura.server");
  const { NAIL_ARTIST, INICIO_POR_APPS } = await import("@/cambios/interruptores") as unknown as Record<string, string>;
  const deps = depsDeCambioReales();
  assert.equal(await deps.faltaLaMigracion!(NAIL_ARTIST as never), null, "FALLA: falso positivo con la migración aplicada");
  if (INICIO_POR_APPS) assert.equal(await deps.faltaLaMigracion!(INICIO_POR_APPS as never), null);
});

test("R5 turno mixto: seña a ella (nota, sin asiento) + saldo a CH (asiento) → CH factura sólo el saldo", async (t) => {
  const x = await prep(t); if (!x) return;
  const d = await prismaComoDuenio(x.base);
  const tenantId = x.base.a.id;
  const pro = await d.professional.create({ data: { tenantId, name: "Mix", rentPercent: 10 } });
  const a = await turno(x, pro.id, x.servNormal);
  const { notaDeCobroProfesional } = await import("@/lib/turnos/senia-profesional");
  const nota = notaDeCobroProfesional({ aliasCbu: "mix.alias", titularCuenta: "Mix", cuitTitular: null, reasignada: false } as never);
  await d.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 3000, method: "TRANSFERENCIA", note: nota, collectedBy: "test" } });
  const c2 = await d.collection.create({ data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: 7000, method: "EFECTIVO", collectedBy: "test" } });
  await d.cashMovement.create({ data: { tenantId, type: "VENTA", method: "EFECTIVO", amount: 7000, collectionId: c2.id, occurredAt: new Date(), createdBy: "test" } as never });
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerCobradoPorLaProfesional } = await import("@/lib/reports/rendiciones-lectura");
  const deElla = await tenantTransaction((tx) => leerCobradoPorLaProfesional(tx as never, tenantId, a.id), { tenantId });
  const { pendienteDelTurno } = await import("@/lib/facturacion/cobros-facturados");
  const p = pendienteDelTurno({ cobrado: 10000, precio: 10000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorLaProfesional: deElla });
  assert.equal(deElla, 3000);
  assert.equal(p.pendiente, 7000, `FALLA: CH facturaría $${p.pendiente}`);
  // Saldo de CH por MP ya facturado por MP: no hay otra factura.
  const q = pendienteDelTurno({ cobrado: 10000, precio: 10000, cobradoPorMP: 7000, facturadoPorMP: 7000, cobradoPorLaProfesional: 3000 });
  assert.equal(q.pendiente, 0, `FALLA: doble factura MP: $${q.pendiente}`);
  // Seña anulada de ella: vuelve a la base de CH sólo lo que queda.
  const r = pendienteDelTurno({ cobrado: 7000, precio: 10000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorLaProfesional: 0 });
  assert.equal(r.pendiente, 7000);
});
