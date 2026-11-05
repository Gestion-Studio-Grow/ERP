/**
 * Box «Nail Artist» (docs/tenants/ch/NAIL-ARTIST.md, Tanda 1), EJECUTADO contra Postgres con RLS y
 * las Server Actions reales, con la sesión de la dueña:
 *
 *   · A prendido · la seña de un servicio de uñas = 1 Collection y 0 CashMovement, con la nota a la titular;
 *   · A prendido · un servicio normal sigue creando su asiento (1 Collection, 1 CashMovement);
 *   · dos profesionales con alias distintos: cada seña congela el alias de la profesional DEL TURNO;
 *   · cambiar el alias después no altera la seña ya pedida (snapshot);
 *   · profesional sin alias → pedir la seña falla (nunca al alias del negocio);
 *   · B (apagado) · el mismo servicio marcado sigue por el camino de siempre: asiento y marca sin snapshot.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const HORA = 3_600_000;

type Negocio = {
  turno: (servicio: "unias" | "piernas", pro: "mica" | "sol" | "lu") => Promise<string>;
  pros: Record<"mica" | "sol" | "lu", string>;
};
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
    const unias = await duenio.service.create({
      data: { tenantId, name: "Kapping", durationMin: 60, price: 20000, depositAmount: 5000, depositToProfessional: true },
    });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 30, price: 18000, depositAmount: 4000 } });
    const conecta = { services: { connect: [{ id: unias.id }, { id: piernas.id }] } };
    const mica = await duenio.professional.create({
      data: { tenantId, name: "Mica", boxId: box.id, cobraEnMostrador: false, aliasCbu: "mica.nails", titularCuenta: "Micaela Pérez", cuitTitular: "27111111113", ...conecta },
    });
    const sol = await duenio.professional.create({
      data: { tenantId, name: "Sol", boxId: box.id, aliasCbu: "sol.unas", titularCuenta: "Sol Gómez", ...conecta },
    });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", boxId: box.id, ...conecta } });
    const pros = { mica: mica.id, sol: sol.id, lu: lu.id };
    return {
      pros,
      turno: async (servicio, pro) => {
        const clientId = (await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `114000600${n}` } })).id;
        const startsAt = new Date(Date.now() + 24 * HORA + n++ * 2 * HORA);
        const svc = servicio === "unias" ? unias : piernas;
        const a = await duenio.appointment.create({
          data: {
            tenantId,
            clientId,
            professionalId: pros[pro],
            serviceId: svc.id,
            boxId: box.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + svc.durationMin * 60000),
            status: "PENDING",
            priceAtBooking: svc.price,
          },
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

async function pedirSenia(negocio: NegocioDePrueba, appointmentId: string) {
  const { marcarSeniaPedida } = await import("./senia-actions");
  return como(negocio, () => marcarSeniaPedida(fd({ appointmentId })));
}

async function llegoLaSenia(negocio: NegocioDePrueba, appointmentId: string, amount: number) {
  const { cobrarSeniaYConfirmar } = await import("./cobro-actions");
  return como(negocio, () => cobrarSeniaYConfirmar(fd({ appointmentId, method: "TRANSFERENCIA", amount: String(amount) })));
}

async function foto(s: Sembrado, appointmentId: string) {
  const duenio = await prismaComoDuenio(s.base);
  const cobros = await duenio.collection.findMany({ where: { appointmentId }, select: { id: true, amount: true, note: true } });
  const asientos = await duenio.cashMovement.findMany({ where: { collectionId: { in: cobros.map((c) => c.id) } }, select: { amount: true } });
  const marcas = await duenio.auditLog.findMany({
    where: { entity: "Appointment", action: "deposit_requested", entityId: appointmentId },
    orderBy: { createdAt: "asc" },
    select: { changes: true },
  });
  return { cobros: cobros.map((c) => ({ monto: c.amount.toNumber(), nota: c.note })), asientos: asientos.length, marcas: marcas.map((m) => m.changes as Record<string, unknown>) };
}

test("A prendido · seña de uñas: snapshot del alias de la profesional del turno, 1 Collection y 0 CashMovement", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.a.turno("unias", "mica");
  const pedida = await pedirSenia(s.base.a, turno);
  assert.equal(pedida.ok, true, JSON.stringify(pedida));
  const cobro = await llegoLaSenia(s.base.a, turno, 5000);
  assert.equal(cobro.ok, true, JSON.stringify(cobro));
  const f = await foto(s, turno);
  assert.equal(f.cobros.length, 1, "un solo cobro");
  assert.equal(f.cobros[0].monto, 5000);
  assert.match(f.cobros[0].nota ?? "", /Micaela Pérez \(mica\.nails\) — no entra a la caja/);
  assert.equal(f.asientos, 0, "la seña de la profesional no entra a la caja del negocio");
  assert.equal(f.marcas.length, 1);
  assert.equal(f.marcas[0].alias, "mica.nails");
  assert.equal(f.marcas[0].titular, "Micaela Pérez");
  assert.equal(f.marcas[0].professionalId, s.a.pros.mica);
});

test("A prendido · un servicio normal sigue creando su asiento", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.a.turno("piernas", "mica");
  assert.equal((await pedirSenia(s.base.a, turno)).ok, true);
  assert.equal((await llegoLaSenia(s.base.a, turno, 4000)).ok, true);
  const f = await foto(s, turno);
  assert.equal(f.cobros.length, 1);
  assert.equal(f.asientos, 1, "el servicio del salón asienta la VENTA como siempre");
  assert.equal(f.marcas[0].alias, undefined, "sin snapshot: la seña es del negocio");
});

test("A prendido · dos profesionales con alias distintos y alias cambiado después: cada seña congela el suyo", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const deMica = await s.a.turno("unias", "mica");
  const deSol = await s.a.turno("unias", "sol");
  assert.equal((await pedirSenia(s.base.a, deMica)).ok, true);
  assert.equal((await pedirSenia(s.base.a, deSol)).ok, true);
  const duenio = await prismaComoDuenio(s.base);
  await duenio.professional.update({ where: { id: s.a.pros.mica }, data: { aliasCbu: "mica.nueva", titularCuenta: "Micaela P." } });
  assert.equal((await foto(s, deMica)).marcas[0].alias, "mica.nails", "el alias nuevo no pisa la seña ya pedida");
  assert.equal((await foto(s, deSol)).marcas[0].alias, "sol.unas");
  assert.equal((await llegoLaSenia(s.base.a, deMica, 5000)).ok, true);
  const f = await foto(s, deMica);
  assert.match(f.cobros[0].nota ?? "", /mica\.nails/, "el cobro lee el snapshot, no la ficha");
  assert.equal(f.asientos, 0);
  // Restituye la ficha para no contaminar otros casos.
  await duenio.professional.update({ where: { id: s.a.pros.mica }, data: { aliasCbu: "mica.nails", titularCuenta: "Micaela Pérez" } });
});

test("A prendido · profesional sin alias: pedir la seña falla y no deja marca", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.a.turno("unias", "lu");
  const r = await pedirSenia(s.base.a, turno);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /no cargó su alias/);
  assert.equal((await foto(s, turno)).marcas.length, 0);
});

test("B apagado · el mismo servicio marcado sigue por el camino de siempre (asiento, marca sin snapshot)", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const turno = await s.b.turno("unias", "mica");
  assert.equal((await pedirSenia(s.base.b, turno)).ok, true);
  assert.equal((await llegoLaSenia(s.base.b, turno, 5000)).ok, true);
  const f = await foto(s, turno);
  assert.equal(f.cobros.length, 1);
  assert.equal(f.asientos, 1, "sin el interruptor, la marca del servicio no cambia nada");
  assert.deepEqual(Object.keys(f.marcas[0]).sort(), ["canal", "monto"]);
});

test("aislamiento · A no pide ni cobra la seña de un turno de B", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const deB = await s.b.turno("unias", "sol");
  const r = await pedirSenia(s.base.a, deB);
  assert.equal(r.ok, false);
  const c = await llegoLaSenia(s.base.a, deB, 5000);
  assert.equal(c.ok, false);
  const f = await foto(s, deB);
  assert.equal(f.cobros.length, 0);
  assert.equal(f.marcas.length, 0);
});
