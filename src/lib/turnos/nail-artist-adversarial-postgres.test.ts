/**
 * Certificador GSG · adversarial Box «Nail Artist» (diff 479b247..53b9a99). Corre desde /home/user/ERP.
 * Cada test imprime HALLAZGO:<id>:<dato> para el informe; los assert expresan el comportamiento CORRECTO.
 *
 * Vuelta 1 (ingeniero): F3 se reescribió. La regla del dueño es que nota y agenda sigan el SNAPSHOT
 * de la seña pedida (la clienta ya transfirió al alias de Mica), con una advertencia si el turno
 * cambió de profesional; la expectativa original («la nota no nombra a mica.nails») la contradecía.
 * F7 suma getCatalog, horarios libres y la reserva pública, y el negocio A con el interruptor PRENDIDO.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;
let n = 0;
let ctx: { base: BaseEfimera; svcMarcado: Record<string, string>; svcNormal: Record<string, string>; pros: Record<string, Record<string, string>>; box: Record<string, string> } | null = null;

async function preparar(t: import("node:test").TestContext) {
  if (ctx) return ctx;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000" });
  const d = await prismaComoDuenio(base);
  ctx = { base, svcMarcado: {}, svcNormal: {}, pros: {}, box: {} };
  for (const [k, tenantId] of [["a", base.a.id], ["b", base.b.id]] as const) {
    const box = await d.box.create({ data: { tenantId, name: "Nail" } });
    const m = await d.service.create({ data: { tenantId, name: "Kapping", durationMin: 60, price: 20000, depositAmount: 5000, depositToProfessional: true } });
    const no = await d.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000, depositAmount: 4000 } });
    const conecta = { services: { connect: [{ id: m.id }, { id: no.id }] } };
    const mica = await d.professional.create({ data: { tenantId, name: "Mica", boxId: box.id, cobraEnMostrador: false, aliasCbu: "mica.nails", titularCuenta: "Micaela Perez", ...conecta } });
    const sol = await d.professional.create({ data: { tenantId, name: "Sol", boxId: box.id, aliasCbu: "sol.unas", titularCuenta: "Sol Gomez", ...conecta } });
    ctx.svcMarcado[k] = m.id;
    ctx.svcNormal[k] = no.id;
    ctx.pros[k] = { mica: mica.id, sol: sol.id };
    ctx.box[k] = box.id;
  }
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  return ctx;
}

async function turno(k: "a" | "b", serviceId: string, pro: string, price: number) {
  const c = ctx!;
  const d = await prismaComoDuenio(c.base);
  const tenantId = k === "a" ? c.base.a.id : c.base.b.id;
  const clientId = (await d.client.create({ data: { tenantId, name: `Adv ${n}`, phone: `11490070${String(n).padStart(2, "0")}` } })).id;
  const startsAt = new Date(Date.now() + 48 * HORA + n++ * 2 * HORA);
  const a = await d.appointment.create({
    data: { tenantId, clientId, professionalId: pro, serviceId, boxId: c.box[k], startsAt, endsAt: new Date(startsAt.getTime() + 3600000), status: "PENDING", priceAtBooking: price },
  });
  return a.id;
}

function fd(c: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(c)) f.set(k, v);
  return f;
}
async function como<R>(neg: NegocioDePrueba, fn: () => Promise<R>) {
  return ejecutarAccion({ negocio: neg, usuario: neg.duenia }, fn);
}
async function pedir(neg: NegocioDePrueba, id: string) {
  const { marcarSeniaPedida } = await import("@/lib/turnos/senia-actions");
  return como(neg, () => marcarSeniaPedida(fd({ appointmentId: id })));
}
async function llego(neg: NegocioDePrueba, id: string, amount: number, method = "TRANSFERENCIA") {
  const { cobrarSeniaYConfirmar } = await import("@/lib/turnos/cobro-actions");
  return como(neg, () => cobrarSeniaYConfirmar(fd({ appointmentId: id, method, amount: String(amount) })));
}
async function foto(id: string) {
  const d = await prismaComoDuenio(ctx!.base);
  const cobros = await d.collection.findMany({ where: { appointmentId: id }, select: { id: true, amount: true, note: true } });
  const asientos = await d.cashMovement.findMany({ where: { collectionId: { in: cobros.map((c) => c.id) } }, select: { type: true, amount: true } });
  return { cobros: cobros.map((c) => ({ id: c.id, monto: c.amount.toNumber(), nota: c.note })), asientos };
}

test("F1 · seña pedida al NEGOCIO, después se marca el servicio: la plata entró a CH → debe asentar", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  const svc = await d.service.create({ data: { tenantId: c.base.a.id, name: "Uñas late", durationMin: 60, price: 20000, depositAmount: 5000 } });
  const id = await turno("a", svc.id, c.pros.a.mica, 20000);
  const p = await pedir(c.base.a, id);
  console.log("HALLAZGO:F1:pedida", JSON.stringify(p));
  await d.service.update({ where: { id: svc.id }, data: { depositToProfessional: true } });
  const r = await llego(c.base.a, id, 5000);
  const f = await foto(id);
  console.log("HALLAZGO:F1:", JSON.stringify(r), JSON.stringify(f));
  assert.equal(f.asientos.length, 1, "la seña se pidió al alias del negocio: tiene que entrar a la caja");
});

test("F2 · seña pedida a la PROFESIONAL, después se desmarca el servicio: no debe asentar en CH", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  const svc = await d.service.create({ data: { tenantId: c.base.a.id, name: "Uñas unmark", durationMin: 60, price: 20000, depositAmount: 5000, depositToProfessional: true } });
  const id = await turno("a", svc.id, c.pros.a.mica, 20000);
  await pedir(c.base.a, id);
  await d.service.update({ where: { id: svc.id }, data: { depositToProfessional: false } });
  const r = await llego(c.base.a, id, 5000);
  const f = await foto(id);
  console.log("HALLAZGO:F2:", JSON.stringify(r), JSON.stringify(f));
  assert.equal(f.asientos.length, 0, "la clienta transfirió a Mica: no es venta de CH (y la nota dice que no entra)");
});

test("F3 · turno reasignado Mica→Sol tras pedir la seña: nota del cobro vs agenda", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  const id = await turno("a", c.svcMarcado.a, c.pros.a.mica, 20000);
  await pedir(c.base.a, id);
  await d.appointment.update({ where: { id }, data: { professionalId: c.pros.a.sol } });
  const r = await llego(c.base.a, id, 5000);
  const f = await foto(id);
  console.log("HALLAZGO:F3:", JSON.stringify(r), JSON.stringify(f));
  // Regla: manda el snapshot (la clienta transfirió a mica.nails), con advertencia en la nota y en la agenda.
  assert.match(f.cobros[0]?.nota ?? "", /mica\.nails/, "la nota nombra la cuenta a la que se pidió la seña");
  assert.match(f.cobros[0]?.nota ?? "", /ojo:/, "y avisa que el turno cambió de profesional");
  assert.equal(f.asientos.length, 0, "fue a la cuenta de Mica: sin asiento en CH");
  const { cuentaDeSeniaEnAgenda } = await import("@/lib/turnos/senia-profesional");
  const fila = await d.auditLog.findFirst({ where: { entityId: id, action: "deposit_requested" }, orderBy: { createdAt: "desc" }, select: { changes: true } });
  const enAgenda = cuentaDeSeniaEnAgenda({ ultimaPedida: fila, professionalIdDelTurno: c.pros.a.sol, actual: { nailArtist: true, depositToProfessional: true, ficha: null } });
  assert.equal(enAgenda?.cuenta?.alias, "mica.nails", "la agenda muestra la misma cuenta que la nota");
  assert.equal(enAgenda?.reasignada, true, "con la advertencia");
});

test("F4 · «Deshacer» de una seña a la profesional (dentro de los 10 s)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const id = await turno("a", c.svcMarcado.a, c.pros.a.mica, 20000);
  await pedir(c.base.a, id);
  const r = await llego(c.base.a, id, 5000);
  const cobroId = r.tipo === "respuesta" && r.valor.ok ? (r.valor.cobroId ?? "") : "";
  const { deshacerCierre } = await import("@/lib/turnos/cobro-actions");
  const u = await como(c.base.a, () => deshacerCierre(fd({ que: "senia", appointmentId: id, cobroId })));
  console.log("HALLAZGO:F4:", JSON.stringify(r), JSON.stringify(u));
  assert.equal(u.tipo === "respuesta" && u.valor.ok, true, "el Deshacer de 10 s tiene que andar igual");
});

test("F5 · la dueña registra seña EN EFECTIVO de servicio marcado (Sol, cobraEnMostrador=true)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const id = await turno("a", c.svcMarcado.a, c.pros.a.sol, 20000);
  await pedir(c.base.a, id);
  const r = await llego(c.base.a, id, 5000, "EFECTIVO");
  const f = await foto(id);
  console.log("HALLAZGO:F5:", JSON.stringify(r), JSON.stringify(f));
  assert.notEqual(f.asientos.length === 0 && r.tipo === "respuesta" && r.valor.ok, true, "efectivo en el mostrador sin asiento = arqueo con sobrante (o rechazar el medio)");
});

test("F6 · interruptor apagado DESPUÉS de pedir la seña a Mica", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  const id = await turno("a", c.svcMarcado.a, c.pros.a.mica, 20000);
  await pedir(c.base.a, id);
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: c.base.a.id, interruptor: NAIL_ARTIST, accion: "apagar", operador: "test" }) });
  const r = await llego(c.base.a, id, 5000);
  const f = await foto(id);
  console.log("HALLAZGO:F6:", JSON.stringify(r), JSON.stringify(f));
  await d.auditLog.create({ data: filaDeInterruptor({ tenantId: c.base.a.id, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  assert.equal(f.asientos.length, 0, "la plata ya fue al alias de Mica");
});

test("F7 · migración AUSENTE (columnas borradas en la base efímera) con interruptor apagado (B)", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const d = await prismaComoDuenio(c.base);
  const id = await turno("b", c.svcNormal.b, c.pros.b.sol, 18000);
  const id2 = await turno("b", c.svcNormal.b, c.pros.b.sol, 18000);
  const idA = await turno("a", c.svcMarcado.a, c.pros.a.mica, 20000); // A: interruptor PRENDIDO, servicio marcado
  const manana = new Date(Date.now() + 24 * HORA).toISOString().slice(0, 10);
  await d.$executeRawUnsafe(`ALTER TABLE "Professional" DROP COLUMN "aliasCbu", DROP COLUMN "titularCuenta", DROP COLUMN "cuitTitular", DROP COLUMN "boxRentAmount", DROP COLUMN "rentPercent"`);
  await d.$executeRawUnsafe(`ALTER TABLE "Service" DROP COLUMN "depositToProfessional"`);
  // Tanda 2 · vuelta 1: la migración también agrega `Appointment.settlementId` (FK a la tabla).
  await d.$executeRawUnsafe(`ALTER TABLE "Appointment" DROP COLUMN "settlementId"`);
  await d.$executeRawUnsafe(`DROP TABLE "ProfessionalSettlement"`);
  const res: Record<string, string> = {};
  const corre = async (nombre: string, fn: () => Promise<unknown>, neg: NegocioDePrueba = c.base.b) => {
    try {
      const r = (await como(neg, fn)) as { tipo: string; valor?: unknown; error?: unknown };
      res[nombre] = r.tipo === "respuesta" ? `ok:${JSON.stringify(r.valor).slice(0, 90)}` : `${r.tipo}:${String((r as { error?: unknown }).error ?? JSON.stringify(r)).slice(0, 160)}`;
    } catch (e) {
      res[nombre] = `THROW:${String((e as Error).message).slice(0, 200)}`;
    }
  };
  const acts = await import("@/lib/actions");
  await corre("marcarSeniaPedida", async () => (await import("@/lib/turnos/senia-actions")).marcarSeniaPedida(fd({ appointmentId: id })));
  await corre("cobrarSeniaYConfirmar", async () => (await import("@/lib/turnos/cobro-actions")).cobrarSeniaYConfirmar(fd({ appointmentId: id, method: "TRANSFERENCIA", amount: "4000" })));
  await corre("getProfessionalsWithServices", () => acts.getProfessionalsWithServices());
  await corre("getPublicBookingData", () => acts.getPublicBookingData());
  await corre("prisma.service.findMany(sin select)", async () => (await import("@/lib/prisma")).prisma.service.findMany({ where: { tenantId: c.base.b.id } }));
  await corre("prisma.professional.findMany(sin select)", async () => (await import("@/lib/prisma")).prisma.professional.findMany({ where: { tenantId: c.base.b.id } }));
  await corre("appointment include service", async () => (await import("@/lib/prisma")).prisma.appointment.findFirst({ where: { id: id2 }, include: { service: true, professional: true } }));
  await corre("getCatalog", async () => (await import("@/lib/catalog-actions")).getCatalog());
  await corre("getAvailableSlots", () => acts.getAvailableSlots(c.pros.b.sol, c.svcNormal.b, manana));
  await corre("createBookingFromModal", () =>
    acts.createBookingFromModal({ professionalId: c.pros.b.sol, serviceId: c.svcNormal.b, startsAtIso: `${manana}T13:00:00.000Z`, clientName: "Sin Migrar", clientPhone: "1149990001" }),
  );
  // A, interruptor prendido con la base sin migrar: cada lectura nueva cae al camino de siempre.
  await corre("A.getCatalog", async () => (await import("@/lib/catalog-actions")).getCatalog(), c.base.a);
  await corre("A.getPublicBookingData", () => acts.getPublicBookingData(), c.base.a);
  await corre("A.marcarSeniaPedida", async () => (await import("@/lib/turnos/senia-actions")).marcarSeniaPedida(fd({ appointmentId: idA })), c.base.a);
  await corre("A.cobrarSeniaYConfirmar", async () => (await import("@/lib/turnos/cobro-actions")).cobrarSeniaYConfirmar(fd({ appointmentId: idA, method: "TRANSFERENCIA", amount: "5000" })), c.base.a);
  console.log("HALLAZGO:F7:", JSON.stringify(res, null, 1));
  // Restaura para no dejar la base rota (el after la borra igual).
  await d.$executeRawUnsafe(`ALTER TABLE "Professional" ADD COLUMN "aliasCbu" TEXT, ADD COLUMN "titularCuenta" TEXT, ADD COLUMN "cuitTitular" TEXT, ADD COLUMN "boxRentAmount" DECIMAL(14,2), ADD COLUMN "rentPercent" DOUBLE PRECISION`);
  await d.$executeRawUnsafe(`ALTER TABLE "Service" ADD COLUMN "depositToProfessional" BOOLEAN NOT NULL DEFAULT false`);
  assert.ok(Object.values(res).every((v) => !v.startsWith("THROW") && !v.includes("P2022")), "con la migración ausente nada debe romper");
});
