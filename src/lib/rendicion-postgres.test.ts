/**
 * Rendición recibida (docs/tenants/ch/NAIL-ARTIST.md §5, Tanda 2), EJECUTADA contra Postgres con RLS y
 * las Server Actions reales, con la sesión de la dueña:
 *
 *   · doble registro concurrente del mismo período = 1 settlement y 1 INGRESO, el otro «ya estaba»;
 *   · el ingreso en caja lleva el monto exacto al centavo (33 % de $15.000,01 + alquiler) y queda enganchado;
 *   · anulaciones restan; turnos no completados y servicios sin la marca no cuentan;
 *   · profesional sin servicios marcados no rinde (nada que rendir) y sin config no rinde;
 *   · otro negocio: su profesional no se alcanza desde A, y con el interruptor apagado no se registra nada.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera, type NegocioDePrueba } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";

const laBase = baseEfimeraDelArchivo();
const MIN = 60_000;

type Negocio = { pros: Record<"mica" | "sol" | "lu", string> };
type Sembrado = { base: BaseEfimera; a: Negocio; b: Negocio; mes: string };
let sembrado: Sembrado | null = null;

async function preparar(t: import("node:test").TestContext): Promise<Sembrado | null> {
  if (sembrado) return sembrado;
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(base);
  // Turnos de HOY, unos minutos antes de ahora: siempre dentro del mes en curso del negocio.
  const ahora = Date.now();
  const mes = dateStrInBusinessTz(new Date(ahora - 30 * MIN)).slice(0, 7);
  let n = 0;
  const negocio = async (tenantId: string): Promise<Negocio> => {
    const box = await duenio.box.create({ data: { tenantId, name: "Nail Artist" } });
    const unias = await duenio.service.create({ data: { tenantId, name: "Kapping", durationMin: 10, price: 20000, depositToProfessional: true } });
    const piernas = await duenio.service.create({ data: { tenantId, name: "Piernas", durationMin: 10, price: 18000 } });
    const mica = await duenio.professional.create({ data: { tenantId, name: "Mica", rentPercent: 33, boxRentAmount: 1000 } });
    const sol = await duenio.professional.create({ data: { tenantId, name: "Sol", rentPercent: 30 } });
    const lu = await duenio.professional.create({ data: { tenantId, name: "Lu", commissionPercent: 40 } });
    const turno = async (professionalId: string, serviceId: string, status: "COMPLETED" | "CONFIRMED", cobros: { amount: number; note?: string }[]) => {
      const clientId = (await duenio.client.create({ data: { tenantId, name: `Clienta ${n}`, phone: `114000700${n}` } })).id;
      const startsAt = new Date(ahora - (20 + n++) * MIN);
      const a = await duenio.appointment.create({
        data: { tenantId, clientId, professionalId, serviceId, boxId: box.id, startsAt, endsAt: new Date(startsAt.getTime() + 10 * MIN), status },
      });
      for (const c of cobros) {
        await duenio.collection.create({
          data: { tenantId, originType: "APPOINTMENT", originId: a.id, appointmentId: a.id, amount: c.amount, method: "TRANSFERENCIA", note: c.note ?? null, collectedBy: "test" },
        });
      }
    };
    await turno(mica.id, unias.id, "COMPLETED", [{ amount: 10000 }]);
    await turno(mica.id, unias.id, "COMPLETED", [{ amount: 5000.01 }, { amount: 2000 }, { amount: -2000, note: "ANULACION:x — mal cargado" }]);
    await turno(mica.id, unias.id, "CONFIRMED", [{ amount: 7000 }]); // no completado: no cuenta
    await turno(mica.id, piernas.id, "COMPLETED", [{ amount: 18000 }]); // servicio de CH: no cuenta
    await turno(sol.id, piernas.id, "COMPLETED", [{ amount: 18000 }]); // Sol no tiene servicios marcados
    await turno(lu.id, unias.id, "COMPLETED", [{ amount: 20000 }]);
    return { pros: { mica: mica.id, sol: sol.id, lu: lu.id } };
  };
  sembrado = { base, a: await negocio(base.a.id), b: await negocio(base.b.id), mes };
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

async function registrar(negocio: NegocioDePrueba, professionalId: string, mes: string) {
  const { registrarRendicion } = await import("./rendicion-actions");
  const r = await ejecutarAccion({ negocio, usuario: negocio.duenia }, () => // `amount` de más: el servidor lo ignora y calcula el suyo (el test de abajo exige 5.950).
    registrarRendicion(fd({ professionalId, mes, method: "TRANSFERENCIA", amount: "1" })));
  assert.equal(r.tipo, "respuesta", `la acción no respondió: ${JSON.stringify(r)}`);
  if (r.tipo !== "respuesta") throw new Error("sin respuesta");
  return r.valor;
}

async function contar(s: Sembrado, tenantId: string, professionalId?: string) {
  const duenio = await prismaComoDuenio(s.base);
  const settlements = await duenio.professionalSettlement.findMany({ where: { tenantId, ...(professionalId ? { professionalId } : {}) } });
  const asientos = await duenio.cashMovement.findMany({ where: { tenantId, createdBy: { startsWith: "rendicion:" } } });
  return { settlements, asientos };
}

test("doble registro concurrente = 1 settlement + 1 INGRESO con el monto exacto, enganchados", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const [r1, r2] = await Promise.all([registrar(s.base.a, s.a.pros.mica, s.mes), registrar(s.base.a, s.a.pros.mica, s.mes)]);
  const oks = [r1, r2].filter((r) => r.ok);
  assert.equal(oks.length, 1, `una sola pasa: ${JSON.stringify([r1, r2])}`);
  const otra = [r1, r2].find((r) => !r.ok);
  assert.ok(otra && !otra.ok && /ya estaba registrada/.test(otra.error), JSON.stringify(otra));

  // Un tercer clic, ya en frío, tampoco duplica.
  const r3 = await registrar(s.base.a, s.a.pros.mica, s.mes);
  assert.equal(r3.ok, false);

  const { settlements, asientos } = await contar(s, s.base.a.id, s.a.pros.mica);
  assert.equal(settlements.length, 1);
  assert.equal(asientos.length, 1);
  const st = settlements[0];
  // 10.000 + 5.000,01 (+2.000 − 2.000 anulado) = 15.000,01; 33 % = 4.950,0033 → 4.950,00; + 1.000 = 5.950.
  assert.equal(st.collectedTotal.toNumber(), 15000.01);
  assert.equal(st.percentAmount.toNumber(), 4950);
  assert.equal(st.rentAmount.toNumber(), 1000);
  assert.equal(st.amount.toNumber(), 5950);
  assert.equal(st.appointmentCount, 2);
  const asiento = asientos[0];
  assert.equal(asiento.type, "INGRESO");
  assert.equal(asiento.amount, 5950);
  assert.equal(asiento.method, "TRANSFERENCIA");
  assert.equal(st.cashMovementId, asiento.id);
  assert.equal(asiento.createdBy, `rendicion:${st.id}`);
  assert.match(asiento.reason ?? "", /^Rendición Nail Artist · Mica · /);
});

test("profesional sin servicios marcados no rinde; sin config tampoco", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const sol = await registrar(s.base.a, s.a.pros.sol, s.mes);
  assert.ok(!sol.ok && /nada para rendir/.test(sol.error), JSON.stringify(sol));
  const lu = await registrar(s.base.a, s.a.pros.lu, s.mes);
  assert.ok(!lu.ok && /no rinde/.test(lu.error), JSON.stringify(lu));
  assert.equal((await contar(s, s.base.a.id, s.a.pros.sol)).settlements.length, 0);
  assert.equal((await contar(s, s.base.a.id, s.a.pros.lu)).settlements.length, 0);
});

test("otro negocio aislado: desde A no se alcanza su profesional y con el interruptor apagado no registra", async (t) => {
  const s = await preparar(t);
  if (!s) return;
  const cruzado = await registrar(s.base.a, s.b.pros.mica, s.mes);
  assert.ok(!cruzado.ok && /ya no existe/.test(cruzado.error), JSON.stringify(cruzado));
  const enB = await registrar(s.base.b, s.b.pros.mica, s.mes);
  assert.ok(!enB.ok && /no están activas/.test(enB.error), JSON.stringify(enB));
  const b = await contar(s, s.base.b.id);
  assert.equal(b.settlements.length, 0);
  assert.equal(b.asientos.length, 0);
});
