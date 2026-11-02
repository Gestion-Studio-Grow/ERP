/**
 * Facturación prendida y un negocio con el perfil fiscal incompleto (CH: sin punto de venta, sin
 * condición de IVA y sin credencial): cada turno terminado avisaba «la factura no se pudo emitir»,
 * aunque ese negocio todavía no factura. Con las Server Actions reales, contra Postgres con RLS:
 *   · perfil incompleto → turno terminado, sin aviso, sin factura, con un log; el cobro, igual que
 *     con la facturación apagada;
 *   · perfil completo y un error de verdad → sigue el aviso;
 *   · perfil completo sin error → la factura sale.
 * En los dos caminos: `completeAppointment` y `terminarYCobrarDividido`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const PRECIO = 18_000;
const SE_AVISA = /^El turno quedó terminado, pero la factura no se pudo emitir\./;

test("perfil fiscal incompleto: turno terminado, sin aviso ni factura, el cobro igual; otro error sigue avisando", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { DB_CONNECTION_LIMIT: "3", DB_CONNECT_TIMEOUT_MS: "5000" });
  delete env.ARCA_MODO; // stub: nada sale a la red
  const duenio = await prismaComoDuenio(base);
  const { completeAppointment } = await import("@/lib/actions");
  const { terminarYCobrarDividido } = await import("./cobro-actions");

  const tenantId = base.a.id;
  const box = await duenio.box.create({ data: { tenantId, name: "Box 1" } });
  const pro = await duenio.professional.create({ data: { tenantId, name: "Carla", boxId: box.id } });
  const service = await duenio.service.create({ data: { tenantId, name: "Limpieza", durationMin: 60, price: PRECIO } });

  let horas = 0;
  const turno = async () => {
    const startsAt = new Date(Date.now() - (++horas + 2) * 3_600_000);
    const ap = await duenio.appointment.create({
      data: {
        tenantId,
        clientId: base.a.clientes[0],
        professionalId: pro.id,
        serviceId: service.id,
        boxId: box.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        status: "CONFIRMED",
        priceAtBooking: PRECIO,
      },
    });
    return ap.id;
  };
  const como = { negocio: base.a, usuario: base.a.duenia };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const caminos = {
    completeAppointment: (id: string) => ejecutarAccion(como, () => completeAppointment(form({ appointmentId: id, method: "EFECTIVO", vino: "on" }))),
    terminarYCobrarDividido: (id: string) =>
      ejecutarAccion(como, () => terminarYCobrarDividido(form({ appointmentId: id, vino: "on", pagos: JSON.stringify([{ metodo: "EFECTIVO", monto: 10_000 }, { metodo: "MERCADOPAGO", monto: PRECIO - 10_000 }]) }))),
  };
  const terminar = async (camino: keyof typeof caminos, id: string) => {
    const r = await caminos[camino](id);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    const v = (r as { valor: { ok: boolean; aviso?: string; error?: string } }).valor;
    assert.equal(v.ok, true, `${camino}: ${JSON.stringify(v)}`);
    return v;
  };
  /** Lo que el cobro dejó en la base, sin ids ni horas. */
  const elCobro = async (id: string) => {
    const a = await duenio.appointment.findUniqueOrThrow({ where: { id }, select: { status: true } });
    const pago = await duenio.payment.findUnique({ where: { appointmentId: id }, select: { amount: true, method: true, status: true } });
    const cobros = await duenio.collection.findMany({ where: { tenantId, appointmentId: id }, select: { amount: true, method: true } });
    const ids = cobros.length ? (await duenio.collection.findMany({ where: { tenantId, appointmentId: id }, select: { id: true } })).map((c) => c.id) : [];
    const libro = await duenio.cashMovement.findMany({ where: { tenantId, collectionId: { in: ids } }, select: { type: true, method: true, amount: true } });
    return JSON.parse(JSON.stringify({ status: a.status, pago, cobros, libro }));
  };
  const facturas = (id: string) => duenio.invoice.count({ where: { tenantId, appointmentId: id } });
  const perfilIncompleto = { arcaCuit: "20111111112", arcaPuntoVenta: null, arcaCondicionIva: null, arcaHomologacion: false };
  const perfilCompleto = { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaCondicionIva: "MONOTRIBUTO", arcaHomologacion: true };
  await duenio.tenant.update({ where: { id: tenantId }, data: perfilIncompleto });
  assert.equal(await duenio.tenantFiscalCredential.count({ where: { tenantId } }), 0);

  for (const camino of Object.keys(caminos) as (keyof typeof caminos)[]) {
    // El cobro de referencia: el mismo turno con la facturación apagada.
    delete env.ARCA_INVOICING_ENABLED;
    const conLaLlaveApagada = await turno();
    assert.deepEqual(await terminar(camino, conLaLlaveApagada), { ok: true });
    const cobroDeReferencia = await elCobro(conLaLlaveApagada);
    assert.equal(cobroDeReferencia.status, "COMPLETED");

    // 1 · PERFIL INCOMPLETO con la llave prendida.
    env.ARCA_INVOICING_ENABLED = "true";
    const lineas: string[] = [];
    const espia = t.mock.method(console, "error", (...a: unknown[]) => void lineas.push(a.map(String).join(" ")));
    const incompleto = await turno();
    const r = await terminar(camino, incompleto).finally(() => espia.mock.restore());
    assert.deepEqual(r, { ok: true }, `${camino}: sin aviso en pantalla`);
    assert.equal(await facturas(incompleto), 0, `${camino}: sin factura`);
    assert.deepEqual(await elCobro(incompleto), cobroDeReferencia, `${camino}: el cobro no cambia`);
    assert.ok(lineas.some((l) => /perfil fiscal incompleto/i.test(l) && l.includes(tenantId)), `${camino}: queda en el log`);

    // 2 · PERFIL COMPLETO y sin error: la factura sale y no hay nada que avisar.
    await duenio.tenant.update({ where: { id: tenantId }, data: perfilCompleto });
    const bien = await turno();
    assert.deepEqual(await terminar(camino, bien), { ok: true });
    assert.equal(await facturas(bien), 1, `${camino}: con el perfil completo, factura`);

    // 3 · PERFIL COMPLETO y OTRO error (la base corta el alta de la factura): sigue el aviso.
    await duenio.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION factura_cortada() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'corte simulado al grabar la factura'; END $$ LANGUAGE plpgsql`);
    await duenio.$executeRawUnsafe(`CREATE TRIGGER factura_cortada BEFORE INSERT ON "Invoice" FOR EACH ROW EXECUTE FUNCTION factura_cortada()`);
    try {
      const falla = await turno();
      const conAviso = await terminar(camino, falla);
      assert.match(conAviso.aviso ?? "", SE_AVISA, `${camino}: otro error sigue avisando`);
      assert.equal(await facturas(falla), 0);
      assert.deepEqual(await elCobro(falla), cobroDeReferencia, `${camino}: el turno y el cobro quedaron igual`);
    } finally {
      await duenio.$executeRawUnsafe(`DROP TRIGGER factura_cortada ON "Invoice"`);
    }
    await duenio.tenant.update({ where: { id: tenantId }, data: perfilIncompleto });
  }
});
