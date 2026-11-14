// T1 de la liquidación (docs/producto/comisiones/LIQUIDACION.md §5) contra la base, con la sesión
// real y RLS: dos negocios, dos profesionales en A y una en B.
//   · La vista previa del período == el monto que congela `settleCommissions` con ese período, y
//     el turno de las 00:00 del día siguiente queda afuera (sigue pendiente).
//   · «Mi liquidación»: cada profesional ve SÓLO lo suyo; nada de la otra ni del otro negocio, y su
//     usuario no abre sesión en el otro negocio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { businessWallTimeToUtc } from "@/lib/datetime";

test("contra la base: vista previa == lo congelado, y cada profesional ve sólo lo suyo", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  apuntarLaAppA(laBase);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: process.env.ERP_TEST_DB_CONNECTION_LIMIT ?? "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  const duenio = await prismaComoDuenio(laBase);
  const { a, b } = laBase;
  const { settleCommissions } = await import("@/lib/commission-actions");
  const { getMiLiquidacion, getVistaPreviaDeComisiones, getComprobantesRecientes } = await import("@/lib/comisiones/lectura");

  /** Un negocio con su box y su servicio de $15.000. */
  const armarNegocio = async (tenantId: string) => {
    const box = await duenio.box.create({ data: { tenantId, name: "Box" } });
    const servicio = await duenio.service.create({ data: { tenantId, name: "Masaje", durationMin: 60, price: 15_000 } });
    return { tenantId, box, servicio };
  };
  type Negocio = Awaited<ReturnType<typeof armarNegocio>>;
  /** Una profesional con su usuario PROFESSIONAL asociado. */
  const profesional = async (n: Negocio, nombre: string, pct: number, phone: string | null) => {
    const p = await duenio.professional.create({ data: { tenantId: n.tenantId, name: nombre, phone, boxId: n.box.id, commissionPercent: pct, services: { connect: [{ id: n.servicio.id }] } } });
    const u = await duenio.user.create({
      data: { tenantId: n.tenantId, name: nombre, email: `${nombre.toLowerCase()}@${n.tenantId}.test`, passwordHash: "x", role: "PROFESSIONAL", professionalId: p.id },
    });
    return { ...p, usuario: { id: u.id } };
  };
  /** Un turno realizado y cobrado entero (monto con centavos para que el redondeo importe). */
  const turno = async (n: Negocio, profesionalId: string, dia: string, hora: string, monto: number) => {
    const clienta = await duenio.client.create({ data: { tenantId: n.tenantId, name: `Clienta ${dia} ${hora}`, phone: `11${Math.floor(Math.random() * 1e8)}` } });
    const inicio = businessWallTimeToUtc(dia, hora);
    const tu = await duenio.appointment.create({
      data: { tenantId: n.tenantId, clientId: clienta.id, professionalId: profesionalId, serviceId: n.servicio.id, boxId: n.box.id, startsAt: inicio, endsAt: new Date(inicio.getTime() + 3_600_000), status: "COMPLETED", priceAtBooking: monto },
    });
    await duenio.payment.create({ data: { tenantId: n.tenantId, appointmentId: tu.id, amount: monto, method: "EFECTIVO", status: "APPROVED" } });
    await duenio.collection.create({ data: { tenantId: n.tenantId, originType: "APPOINTMENT", originId: tu.id, appointmentId: tu.id, amount: monto, method: "EFECTIVO", collectedBy: "test" } });
    return tu.id;
  };

  const nA = await armarNegocio(a.id);
  const nB = await armarNegocio(b.id);
  const ana = await profesional(nA, "Ana", 37.5, "11 5555-1234");
  const bea = await profesional(nA, "Bea", 30, null);
  const caro = await profesional(nB, "Carolina", 50, "11 4444-0000");

  const deAna = [
    await turno(nA, ana.id, "2026-10-03", "10:00", 12_345.67),
    await turno(nA, ana.id, "2026-10-31", "23:59", 9_999.99),
    await turno(nA, ana.id, "2026-09-28", "18:00", 7_777.77), // de antes, saldado tarde: entra
  ];
  const anaNoviembre = await turno(nA, ana.id, "2026-11-01", "00:00", 15_000);
  const deBea = [await turno(nA, bea.id, "2026-10-15", "12:00", 15_000)];
  const deCaro = [await turno(nB, caro.id, "2026-10-20", "09:00", 20_000)];

  // ── «Mi liquidación»: sólo lo suyo ─────────────────────────────────────────
  const mia = async (negocio: typeof a, usuario: { id: string }) => {
    const r = await ejecutarAccion({ negocio, usuario }, () => getMiLiquidacion());
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const v = (r as { valor: Awaited<ReturnType<typeof getMiLiquidacion>> }).valor;
    assert.equal(v.tipo, "profesional");
    return v as Extract<typeof v, { tipo: "profesional" }>;
  };
  const idsDe = (m: Awaited<ReturnType<typeof mia>>) => new Set(m.pendiente?.lineas.map((l) => l.id) ?? []);

  const ve = idsDe(await mia(a, ana.usuario));
  assert.deepEqual([...ve].sort(), [...deAna, anaNoviembre].sort(), "Ana ve sus cuatro turnos pendientes");
  for (const id of [...deBea, ...deCaro]) assert.ok(!ve.has(id), "Ana no ve turnos de Bea ni del otro negocio");
  assert.deepEqual([...idsDe(await mia(a, bea.usuario))], deBea);
  assert.deepEqual([...idsDe(await mia(b, caro.usuario))], deCaro);

  // El usuario de Ana no existe en el negocio B: no hay sesión, no ve nada.
  const cruzada = await ejecutarAccion({ negocio: b, usuario: ana.usuario }, () => getMiLiquidacion());
  assert.equal(cruzada.tipo, "redireccion", "un usuario de A no abre «Mi liquidación» en B");
  // La recepción no tiene `commissions:read-own`.
  assert.equal((await ejecutarAccion({ negocio: a, usuario: a.recepcion }, () => getMiLiquidacion())).tipo, "redireccion");
  // La profesional tampoco abre la vista previa de todas.
  assert.equal((await ejecutarAccion({ negocio: a, usuario: ana.usuario }, () => getVistaPreviaDeComisiones("2026-10"))).tipo, "redireccion");

  // ── Vista previa de octubre == lo congelado ─────────────────────────────────
  const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getVistaPreviaDeComisiones("2026-10"));
  assert.equal(r.tipo, "respuesta");
  const vista = (r as { valor: Awaited<ReturnType<typeof getVistaPreviaDeComisiones>> }).valor;
  assert.deepEqual(vista.profesionales.map((p) => p.professionalId).sort(), [ana.id, bea.id].sort(), "la dueña de A no ve a la de B");
  const previaAna = vista.profesionales.find((p) => p.professionalId === ana.id)!;
  assert.deepEqual(previaAna.lineas.map((l) => l.id).sort(), [...deAna].sort(), "el turno de las 00:00 del 1/11 no entra en octubre");
  assert.equal(vista.despuesDelCorte, 1);

  const f = new FormData();
  f.set("professionalId", ana.id);
  f.set("method", "EFECTIVO");
  f.set("volver", "/admin/comisiones");
  f.set("periodo", "2026-10");
  const liq = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => settleCommissions(f));
  assert.equal(liq.tipo, "redireccion");
  assert.match(String((liq as { destino?: string }).destino), /status=ok_settled&periodo=2026-10/);

  const payout = await duenio.commissionPayout.findFirstOrThrow({ where: { tenantId: a.id, professionalId: ana.id } });
  assert.equal(Math.round(payout.amount * 100), previaAna.totalCents, "lo congelado es lo que mostró la vista previa");
  assert.equal(payout.appointmentCount, previaAna.lineas.length);
  const estampados = await duenio.appointment.findMany({ where: { commissionPayoutId: payout.id }, select: { id: true } });
  assert.deepEqual(estampados.map((x) => x.id).sort(), [...deAna].sort());
  const nov = await duenio.appointment.findUniqueOrThrow({ where: { id: anaNoviembre }, select: { commissionPayoutId: true } });
  assert.equal(nov.commissionPayoutId, null, "noviembre sigue pendiente");

  // Un período ilegible no liquida nada.
  const g = new FormData();
  g.set("professionalId", bea.id);
  g.set("volver", "/admin/comisiones");
  g.set("periodo", "2026-13");
  const mal = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => settleCommissions(g));
  assert.match(String((mal as { destino?: string }).destino), /status=error_periodo/);
  assert.equal(await duenio.commissionPayout.count({ where: { professionalId: bea.id } }), 0);

  // ── Después de liquidar: Ana ve su liquidación; Bea y Carolina, ninguna ─────
  const anaDespues = await mia(a, ana.usuario);
  assert.equal(anaDespues.liquidaciones.length, 1);
  assert.equal(anaDespues.liquidaciones[0].amountCents, previaAna.totalCents);
  assert.equal(anaDespues.liquidaciones[0].link, null, "la profesional no tiene botón de comprobante");
  assert.deepEqual([...idsDe(anaDespues)], [anaNoviembre]);
  assert.equal((await mia(a, bea.usuario)).liquidaciones.length, 0);
  assert.equal((await mia(b, caro.usuario)).liquidaciones.length, 0);

  // ── Comprobante: con celular, link; la dueña de B no ve el de A ────────────
  const comp = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => getComprobantesRecientes());
  const lista = (comp as { valor: Awaited<ReturnType<typeof getComprobantesRecientes>> }).valor;
  assert.equal(lista.length, 1);
  assert.ok(lista[0].link?.startsWith("https://wa.me/5491155551234?text="));
  assert.equal(lista[0].datos.medio, "Efectivo");
  assert.equal(lista[0].datos.baseCents, Math.round((12_345.67 + 9_999.99 + 7_777.77) * 100));
  const compB = await ejecutarAccion({ negocio: b, usuario: b.duenia }, () => getComprobantesRecientes());
  assert.equal((compB as { valor: unknown[] }).valor.length, 0);
});
