// ============================================================================
// MIA-211 · S1, la carrera: «Anular» una cuota de empresa enlazada a un comprobante, al mismo tiempo que su orden de pago
// se paga o se anula. Contra Postgres real (base efímera, rol app_rls, Server Actions con sesión). Esperado a mano, en
// pesos: banco 500.000; la orden paga 100.000 → 400.000 y el libro −100.000; anulada la orden, 500.000 y libro 0.
// Gane quien gane, la cuota nunca queda pendiente con su orden PAGADA ni la plata afuera sin contraasiento.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const VUELTAS = 4;

test("MIA-211 S1 · anular la cuota mientras su orden se paga o se anula", async (t) => {
  const base = await laBase(t);
  assert.ok(base, "sin Postgres este test no prueba nada: levantá ERP_TEST_PG_URL");
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { b } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: b.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: b.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.proyectoPersona.create({ data: { tenantId: b.id, userId: b.recepcion.id, nombre: "Administración B", rol: "ADMINISTRACION" } });
  const empresa = await import("./acciones-empresa");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const json = (r: unknown) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  const como = async <R>(usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: b, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", json(r));
    return (r as { valor: R }).valor;
  };
  const direccion = <R>(fn: () => Promise<R>) => como(b.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(b.recepcion.id, fn);
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, json(r));
  const s = (await duenio.supplier.create({ data: { tenantId: b.id, name: "Alquiler (de prueba)" }, select: { id: true } })).id;

  /** Banco de 500.000, cuota de 100.000 enlazada a su comprobante y una orden pendiente que la paga. */
  const preparar = async (v: number) => {
    ok(await direccion(() => empresa.crearCuenta(form({ nombre: `Banco ${v}`, moneda: "ARS", saldo: "500000" }))));
    const banco = (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: b.id, nombre: `Banco ${v}` }, select: { id: true } })).id;
    const cuota = (await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: null, tipo: "PAGO", concepto: `Alquiler ${v}`, monto: 100_000, moneda: "ARS", venceEl: new Date("2026-12-30T12:00:00-03:00"), auto: false, supplierId: s }, select: { id: true } })).id;
    const r = await admin(() => comp.cargarComprobante(form({ supplierId: s, fecha: "2026-11-20", tipo: "C", numero: `0001-000001${String(v).padStart(2, "0")}`, neto: "100000", iva: "", total: "100000", destino: "ADMINISTRACION", categoria: "Alquiler" })));
    ok(r);
    const c = (r as unknown as { id: string }).id;
    ok(await admin(() => comp.enlazarCuota(form({ comprobanteId: c, cuotaId: cuota }))));
    const o = await admin(() => ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: cuota, importeCentavos: 10_000_000 }] }));
    ok(o);
    return { banco, cuota, oid: (o as { id: string }).id };
  };
  const foto = async ({ banco, cuota, oid }: { banco: string; cuota: string; oid: string }) => {
    const q = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota }, select: { pagadoEl: true, anuladoEl: true } });
    const orden = await duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${b.id}, true)`;
      return tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: oid }, select: { estado: true } });
    });
    const libro = (await duenio.cashMovement.findMany({ where: { tenantId: b.id, proyectoOrdenPagoId: oid }, select: { type: true, amount: true } })).reduce((x, m) => x + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
    const saldo = (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: banco }, select: { saldo: true } })).saldo;
    return { cuota: q.anuladoEl ? "anulada" : q.pagadoEl ? "pagada" : "pendiente", orden: orden.estado, banco: Number(saldo), libro };
  };

  await t.test("pagar la orden y anular la cuota a la vez: la cuota queda pagada por la orden, o la orden no se paga", async () => {
    for (let v = 0; v < VUELTAS; v++) {
      const p = await preparar(v);
      const [pago, anula] = await Promise.all([
        direccion(() => ordenes.aprobarYPagarOrden(form({ id: p.oid, cuentaId: p.banco }))),
        direccion(() => empresa.anularCuotaEmpresa(form({ id: p.cuota, visto: "PAGADA" }))),
      ]);
      const f = await foto(p);
      const todo = json({ v, pago, anula, f });
      // La cuota estaba pendiente y la pantalla mostraba «PAGADA»: anular nunca la toca.
      assert.equal((anula as { ok: boolean }).ok, false, todo);
      if ((pago as { ok: boolean }).ok) assert.deepEqual(f, { cuota: "pagada", orden: "PAGADA", banco: 400_000, libro: -100_000 }, todo);
      else assert.deepEqual(f, { cuota: "pendiente", orden: "PENDIENTE", banco: 500_000, libro: 0 }, todo);
    }
  });

  await t.test("anular la orden pagada y anular la cuota a la vez: la plata vuelve una sola vez, por la orden", async () => {
    for (let v = VUELTAS; v < 2 * VUELTAS; v++) {
      const p = await preparar(v);
      ok(await direccion(() => ordenes.aprobarYPagarOrden(form({ id: p.oid, cuentaId: p.banco }))));
      const [anulaOrden, anulaCuota] = await Promise.all([
        direccion(() => ordenes.anularOrden(form({ id: p.oid }))),
        direccion(() => empresa.anularCuotaEmpresa(form({ id: p.cuota, visto: "PAGADA" }))),
      ]);
      const f = await foto(p);
      const todo = json({ v, anulaOrden, anulaCuota, f });
      ok(anulaOrden);
      assert.equal((anulaCuota as { ok: boolean }).ok, false, todo);
      assert.deepEqual(f, { cuota: "pendiente", orden: "ANULADA", banco: 500_000, libro: 0 }, todo);
    }
  });
});
