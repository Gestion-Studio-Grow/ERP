/**
 * Box «Nail Artist» — QA de Tanda 2, EJECUTADO contra Postgres con RLS y las Server Actions reales:
 *
 *   · el saldo de un servicio marcado (A prendido) lo cobra la profesional: nota dirigida, clave
 *     `saldo:<turno>…`, sin asiento, y el aviso «Cobrado por Mica — no entra a la caja de <negocio>»;
 *     el doble envío del mismo formulario no cobra dos veces;
 *   · Inicio («Ingresos 7 días»): no suma lo cobrado por la profesional; lo de CH, sí;
 *   · B (apagado): el mismo servicio marcado sigue como siempre (asiento, nota y clave de siempre).
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;

type Negocio = { turno: (servicio: "unias" | "piernas") => Promise<string> };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  let n = 0;
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Nail Artist" } });
    const unias = await duenio.service.create({ data: { tenantId, name: "Kapping", durationMin: 10, price: 20000, depositToProfessional: true } });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 10, price: 18000 } });
    const mica = await duenio.professional.create({
      data: { tenantId, name: "Mica", boxId: box.id, aliasCbu: "mica.nails", titularCuenta: "Micaela Pérez", services: { connect: [{ id: unias.id }, { id: piernas.id }] } },
    });
    return {
      turno: async (servicio) => {
        const clientId = (await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `114000800${n}` } })).id;
        // Hoy, un rato antes (para poder terminarlo), uno distinto por turno.
        const startsAt = new Date(Date.now() - (90 - n++) * MIN);
        const svc = servicio === "unias" ? unias : piernas;
        const a = await duenio.appointment.create({
          data: { tenantId, clientId, professionalId: mica.id, serviceId: svc.id, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 10 * MIN), status: "CONFIRMED", priceAtBooking: svc.price },
        });
        return a.id;
      },
    };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id) };
  const { filaDeInterruptor } = await import("@/cambios/interruptores-core");
  const { NAIL_ARTIST } = await import("@/cambios/interruptores");
  await duenio.auditLog.create({ data: filaDeInterruptor({ tenantId: base.a.id, interruptor: NAIL_ARTIST, accion: "encender", operador: "test" }) });
  return sembrado;
}

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function como<R>(negocio: NegocioDePrueba, fn: () => Promise<R>): Promise<R> {
  const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, fn);
  assert.equal(r.tipo, "respuesta", `la acción no respondió (¿tiró crudo?): ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

async function cobrar(negocio: NegocioDePrueba, appointmentId: string, amount: number, clave: string) {
  const { registrarCobroTurno } = await import("@/lib/actions");
  return como(negocio, () => registrarCobroTurno(fd({ appointmentId, amount: String(amount), method: "TRANSFERENCIA", idempotencyKey: clave })));
}

async function terminar(negocio: NegocioDePrueba, appointmentId: string) {
  const { completeAppointment } = await import("@/lib/actions");
  return como(negocio, () => completeAppointment(fd({ appointmentId, method: "EFECTIVO", facturar: "false" })));
}

async function foto(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const cobros = await duenio.collection.findMany({ where: { appointmentId }, select: { id: true, amount: true, note: true, idempotencyKey: true }, orderBy: { createdAt: "asc" } });
  const asientos = await duenio.cashMovement.count({ where: { collectionId: { in: cobros.map((c) => c.id) } } });
  return { cobros: cobros.map((c) => ({ monto: c.amount.toNumber(), nota: c.note, clave: c.idempotencyKey })), asientos };
}

test("A prendido · saldo de uñas: nota dirigida, clave saldo:<turno>…, sin asiento, aviso y sin doble cobro", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.a.turno("unias");
  const r1 = await cobrar(s.base.a, turno, 5000, "form-1");
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.ok(r1.ok && /^Cobrado por Mica — no entra a la caja de .+\.$/.test(r1.cobradoPor ?? ""), JSON.stringify(r1));
  const r2 = await cobrar(s.base.a, turno, 5000, "form-1"); // el mismo formulario, dos veces
  assert.equal(r2.ok, true);
  const fin = await terminar(s.base.a, turno);
  assert.equal(fin.ok, true, JSON.stringify(fin));
  assert.ok(fin.ok && /^Cobrado por Mica/.test(fin.cobradoPor ?? ""), JSON.stringify(fin));
  const f = await foto(s, turno);
  assert.deepEqual(f.cobros.map((c) => c.monto), [5000, 15000], "un solo cobro por formulario");
  assert.deepEqual(f.cobros.map((c) => c.clave), [`saldo:${turno}:form-1`, `saldo:${turno}`]);
  for (const c of f.cobros) assert.match(c.nota ?? "", /^a Mica — no entra a la caja del negocio( · |$)/);
  assert.equal(f.asientos, 0, "lo de ella no entra a la caja del negocio");
});

test("A prendido · un servicio de CH sigue con su asiento, sin aviso", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.a.turno("piernas");
  const fin = await terminar(s.base.a, turno);
  assert.ok(fin.ok && !fin.cobradoPor, JSON.stringify(fin));
  const f = await foto(s, turno);
  assert.equal(f.asientos, 1);
  assert.equal(f.cobros[0].nota, "Saldo al completar");
});

test("Inicio · «Ingresos 7 días» no suma lo cobrado por la profesional (A); B apagado suma todo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const { getDashboardData } = await import("@/lib/actions");
  const a = await como(s.base.a, () => getDashboardData());
  // A: Kapping 20.000 de ella (no suma) + Piernas 18.000 de CH.
  assert.equal(a.weekRevenue, 18000);
  const turnoB = await s.b.turno("unias");
  assert.equal((await terminar(s.base.b, turnoB)).ok, true);
  const b = await como(s.base.b, () => getDashboardData());
  assert.equal(b.weekRevenue, 20000, "apagado: como hoy");
  const f = await foto(s, turnoB);
  assert.equal(f.asientos, 1, "apagado: el asiento de siempre");
  assert.equal(f.cobros[0].clave, `saldo:${turnoB}`);
  assert.equal(f.cobros[0].nota, "Saldo al completar");
});
