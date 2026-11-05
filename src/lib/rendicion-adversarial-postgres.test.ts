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
