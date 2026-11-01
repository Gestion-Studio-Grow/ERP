/**
 * El aviso de comisión ya pagada con el cobro anulado después (cert ronda 2, F2, orden del dueño),
 * EJECUTADO contra Postgres con RLS y las acciones reales: lo ve quien anula y la pantalla de
 * comisiones, y NO cambia un importe: el pago, su egreso y el libro quedan como la anulación los deja.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla), como los demás `*-postgres.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("comisión pagada y cobro anulado después: avisa cuánto, a quien anula y en la pantalla, sin tocar plata", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });
  const { a } = base;
  const duenio = await prismaComoDuenio(base);
  const { settleCommissions, getCommissionsOverview } = await import("@/lib/commission-actions");
  const { anularCobroTurno, autorizarAnulacionCobro, registrarCobroTurno } = await import("@/lib/actions");

  const box = await duenio.box.create({ data: { tenantId: a.id, name: "Box" } });
  const servicio = await duenio.service.create({ data: { tenantId: a.id, name: "Masaje", durationMin: 60, price: 15_000 } });
  const profesional = (nombre: string) =>
    duenio.professional.create({ data: { tenantId: a.id, name: nombre, boxId: box.id, commissionPercent: 40, services: { connect: [{ id: servicio.id }] } } });
  let n = 0;
  /** Un turno terminado de $15.000, cobrado con su asiento. */
  const turnoCobrado = async (professionalId: string) => {
    n += 1;
    const clienta = await duenio.client.create({ data: { tenantId: a.id, name: `Cliente ${n}`, phone: `11700${String(n).padStart(5, "0")}` } });
    const inicio = new Date(Date.now() - (2 + n) * 3_600_000);
    const turno = await duenio.appointment.create({
      data: { tenantId: a.id, clientId: clienta.id, professionalId, serviceId: servicio.id, boxId: box.id, startsAt: inicio, endsAt: new Date(inicio.getTime() + 3_600_000), status: "COMPLETED", priceAtBooking: 15_000 },
    });
    await duenio.payment.create({ data: { tenantId: a.id, appointmentId: turno.id, amount: 15_000, method: "EFECTIVO", status: "APPROVED" } });
    const cobro = await duenio.collection.create({
      data: { tenantId: a.id, originType: "APPOINTMENT", originId: turno.id, appointmentId: turno.id, amount: 15_000, method: "EFECTIVO", collectedBy: "test" },
    });
    await duenio.cashMovement.create({
      data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 15_000, reason: "Turno", occurredAt: new Date(), collectionId: cobro.id, createdBy: "test" },
    });
    return { turnoId: turno.id, cobroId: cobro.id };
  };
  const pagar = async (professionalId: string) => {
    const f = new FormData();
    f.set("professionalId", professionalId);
    f.set("method", "EFECTIVO");
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, () => settleCommissions(f));
    assert.equal(r.tipo, "redireccion", JSON.stringify(r));
  };
  const accion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: a.duenia }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const anular = (turno: { turnoId: string; cobroId: string }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ collectionId: turno.cobroId, appointmentId: turno.turnoId, motivo: "Se cargó mal el cobro" })) f.set(k, v);
    return accion(() => anularCobroTurno(f));
  };
  const pantalla = () => accion(() => getCommissionsOverview());
  const payouts = () => duenio.commissionPayout.findMany({ where: { tenantId: a.id }, orderBy: { id: "asc" }, select: { id: true, amount: true, appointmentCount: true } });
  const libro = async () =>
    (await duenio.cashMovement.findMany({ where: { tenantId: a.id }, orderBy: { createdAt: "asc" }, select: { type: true, method: true, amount: true, createdBy: true } })).map(
      (m) => `${m.type} ${m.method} ${Number(m.amount)} ${m.createdBy.split(":")[0]}`,
    );

  // Sin comisión pagada no hay aviso: la anulación contesta como siempre.
  const sinPagar = await turnoCobrado((await profesional("Sin Pagar")).id);
  assert.deepEqual(await anular(sinPagar), { ok: true });
  assert.deepEqual((await pantalla()).conCobroAnulado, []);

  // Comisión pagada: 40 % de $15.000 = $6.000. Se anula el cobro.
  const macarena = await profesional("Macarena");
  const turno = await turnoCobrado(macarena.id);
  await pagar(macarena.id);
  const payoutsAntes = await payouts();
  const libroAntes = await libro();
  const anulada = await anular(turno);
  assert.equal(anulada.ok, true, JSON.stringify(anulada));
  const aviso = anulada.ok ? anulada.aviso ?? "" : "";
  assert.match(aviso, /ya se pagó/);
  assert.match(aviso, /Macarena cobró \$6\.000/);
  assert.match(aviso, /sigue como está/);
  assert.doesNotMatch(aviso, /seña|clienta|dueña|estética/i, "el texto vale para todos los rubros");

  // No cambia un importe: el pago y su egreso quedan; lo único nuevo es el egreso de la anulación.
  assert.deepEqual(await payouts(), payoutsAntes);
  assert.deepEqual(await libro(), [...libroAntes, "EGRESO EFECTIVO 15000 anulacion-turno"]);
  assert.equal((await duenio.appointment.findUniqueOrThrow({ where: { id: turno.turnoId }, select: { commissionPayoutId: true } })).commissionPayoutId, payoutsAntes[0].id);
  const rastro = await duenio.auditLog.findFirst({ where: { entityId: turno.turnoId, action: "void_collection" }, select: { changes: true } });
  assert.equal((rastro?.changes as { comisionYaPagada?: { monto?: number } } | null)?.comisionYaPagada?.monto, 6_000);

  // La pantalla lo dice y sólo lo dice: lo pendiente no cambió.
  const vista = await pantalla();
  assert.equal(vista.conCobroAnulado.length, 1);
  assert.equal(vista.conCobroAnulado[0].turnoId, turno.turnoId);
  assert.equal(vista.conCobroAnulado[0].monto, 6_000);
  assert.equal(vista.conCobroAnulado[0].anulado, 15_000);
  assert.equal(vista.conCobroAnulado[0].profesional, "Macarena");
  assert.deepEqual(vista.history.map((h) => h.amount).sort(), [6_000]);
  assert.equal(vista.pending.some((p) => p.professionalId === macarena.id), false, "no vuelve a pendientes");

  // Vuelve a entrar la plata: ya no hay nada que avisar. El pago sigue igual.
  const f = new FormData();
  for (const [k, v] of Object.entries({ appointmentId: turno.turnoId, amount: "15000", method: "EFECTIVO", idempotencyKey: "form-1" })) f.set(k, v);
  assert.deepEqual(await accion(() => registrarCobroTurno(f)), { ok: true });
  assert.deepEqual((await pantalla()).conCobroAnulado, []);
  assert.deepEqual(await payouts(), payoutsAntes);

  // Liquidación de varios turnos: se dice el total y por cuántos, sin inventar lo de cada uno.
  const romina = await profesional("Romina");
  const uno = await turnoCobrado(romina.id);
  await turnoCobrado(romina.id);
  await pagar(romina.id);
  const deVarios = await anular(uno);
  assert.match(deVarios.ok ? deVarios.aviso ?? "" : "", /Romina cobró \$12\.000 .* por 2 turnos, este entre ellos\./);

  // Anulado ANTES de pagar y vuelto a cobrar: esa comisión ya se calculó sobre lo que quedó.
  const lucia = await profesional("Lucía");
  const previo = await turnoCobrado(lucia.id);
  await anular(previo);
  const g = new FormData();
  for (const [k, v] of Object.entries({ appointmentId: previo.turnoId, amount: "15000", method: "EFECTIVO", idempotencyKey: "form-2" })) g.set(k, v);
  assert.deepEqual(await accion(() => registrarCobroTurno(g)), { ok: true });
  await pagar(lucia.id);
  assert.equal((await pantalla()).conCobroAnulado.some((c) => c.turnoId === previo.turnoId), false);

  // Quién ve qué (cert ronda 2, V2-1). Recepción anula con el código de la dueña y `reports:read` no es
  // suyo: se entera de que hay que avisar, sin el nombre ni el monto de lo que cobró una compañera. La
  // misma liquidación, anulada por la dueña, sigue con todo el detalle. El rastro no cambia.
  const sofia = await profesional("Sofía");
  const paraRecepcion = await turnoCobrado(sofia.id);
  const paraLaDuenia = await turnoCobrado(sofia.id);
  await pagar(sofia.id);
  const pagosAntesDeRecepcion = await payouts();
  const fa = new FormData();
  fa.set("collectionId", paraRecepcion.cobroId);
  fa.set("appointmentId", paraRecepcion.turnoId);
  const autorizacion = await accion(() => autorizarAnulacionCobro(fa));
  assert.equal(autorizacion.ok, true, JSON.stringify(autorizacion));
  const fr = new FormData();
  for (const [k, v] of Object.entries({
    collectionId: paraRecepcion.cobroId,
    appointmentId: paraRecepcion.turnoId,
    motivo: "Se cargó mal el cobro",
    codigo: autorizacion.ok ? autorizacion.codigo : "",
  }))
    fr.set(k, v);
  const deRecepcion = await ejecutarAccion({ negocio: a, usuario: a.recepcion }, () => anularCobroTurno(fr));
  assert.equal(deRecepcion.tipo, "respuesta", JSON.stringify(deRecepcion));
  const respuesta = (deRecepcion as { valor: Awaited<ReturnType<typeof anularCobroTurno>> }).valor;
  assert.equal(respuesta.ok, true, JSON.stringify(respuesta));
  const avisoRecepcion = respuesta.ok ? respuesta.aviso ?? "" : "";
  assert.match(avisoRecepcion, /ya entró en una liquidación de comisión pagada/);
  assert.match(avisoRecepcion, /Avisale a la dueña/);
  assert.doesNotMatch(avisoRecepcion, /Sofía|cobró|\$|\d/, "recepción no ve quién cobró, cuánto, cuándo ni por cuántos turnos");
  assert.deepEqual(await payouts(), pagosAntesDeRecepcion, "el aviso no cambia un importe");
  const rastroRecepcion = await duenio.auditLog.findFirst({ where: { entityId: paraRecepcion.turnoId, action: "void_collection" }, select: { changes: true } });
  assert.equal((rastroRecepcion?.changes as { comisionYaPagada?: { monto?: number } } | null)?.comisionYaPagada?.monto, 12_000, "la dueña lo encuentra en la auditoría");

  const deLaDuenia = await anular(paraLaDuenia);
  assert.match(deLaDuenia.ok ? deLaDuenia.aviso ?? "" : "", /Sofía cobró \$12\.000 .* por 2 turnos, este entre ellos\./);
  assert.deepEqual(await payouts(), pagosAntesDeRecepcion);
});

test("las pantallas muestran el aviso: al anular (agenda y lista) y en comisiones (las tres)", () => {
  const raiz = "src/app/admin/(dashboard)";
  for (const archivo of ["turnos/_agenda/TurnoCajon.tsx", "turnos/AppointmentRow.tsx"]) {
    const s = readFileSync(`${raiz}/${archivo}`, "utf8");
    assert.match(s, /if \(r\.ok && r\.aviso\) setAviso/, archivo);
    assert.match(s, /\{avisoDeComision\}/, archivo);
  }
  for (const archivo of ["comisiones/ComisionesPendientes.tsx", "comisiones/ComisionesRenglon.tsx", "reportes/page.tsx"]) {
    assert.match(readFileSync(`${raiz}/${archivo}`, "utf8"), /<ComisionesConCobroAnulado filas=\{overview\.conCobroAnulado\} \/>/, archivo);
  }
});
