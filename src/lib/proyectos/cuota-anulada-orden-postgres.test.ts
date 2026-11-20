// ============================================================================
// MIA-216 · C2 de MIA-214 (P5, estado terminal operable): una cuota anulada no se paga con una orden, y una cuota con
// una orden viva (PENDIENTE o PAGADA) no se anula. Antes: anular la cuota con su orden PENDIENTE y después pagar la
// orden dejaba la cuota anulada Y pagada, la orden PAGADA y el banco −100.000.
// Contra Postgres real (base efímera, rol app_rls, Server Actions con sesión). Esperado a mano, en pesos: banco 500.000;
// si la orden se paga, 400.000 y libro −100.000; si no, 500.000 y libro 0. Nunca «anulada y pagada».
// Las vías que anulan una cuota: `anularCuotaEmpresa` (empresa), `quitarMovimiento` (manual de proyecto) y
// `regenerarCuotas` (las automáticas que sobran; ésa ya deja fijas las enlazadas). La que paga: `aprobarYPagarOrden`.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const VUELTAS = 4;

test("MIA-216 C2 · cuota anulada contra su orden de pago", async (t) => {
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
  const ficha = await import("./acciones-ficha");
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
  const okDe = (r: unknown) => (r as { ok: boolean }).ok;
  const s = (await duenio.supplier.create({ data: { tenantId: b.id, name: "Proveedor (de prueba)" }, select: { id: true } })).id;
  const proyecto = (await duenio.proyecto.create({ data: { tenantId: b.id, numero: 9216, clientId: b.clientes[0], nombre: "C2 (de prueba)", servicio: "EVENTOS", etapa: "CONFIRMADO", fechaEvento: new Date("2026-12-20T12:00:00-03:00") }, select: { id: true } })).id;

  /** Banco de 500.000 y una cuota de 100.000 (de empresa o manual del proyecto) enlazada a su comprobante; con `orden`, una orden PENDIENTE que la paga. */
  const preparar = async (v: number, { deProyecto = false, orden = true } = {}) => {
    ok(await direccion(() => empresa.crearCuenta(form({ nombre: `Banco ${v}`, moneda: "ARS", saldo: "500000" }))));
    const banco = (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: b.id, nombre: `Banco ${v}` }, select: { id: true } })).id;
    const cuota = (await duenio.proyectoCuota.create({ data: { tenantId: b.id, proyectoId: deProyecto ? proyecto : null, tipo: "PAGO", concepto: `Servicio ${v}`, monto: 100_000, moneda: "ARS", venceEl: new Date("2026-12-30T12:00:00-03:00"), auto: false, supplierId: s }, select: { id: true } })).id;
    const r = await admin(() => comp.cargarComprobante(form({ supplierId: s, fecha: "2026-11-20", tipo: "C", numero: `0002-000001${String(v).padStart(2, "0")}`, neto: "100000", iva: "", total: "100000", destino: "ADMINISTRACION", categoria: "Alquiler" })));
    ok(r);
    const comprobante = (r as unknown as { id: string }).id;
    ok(await admin(() => comp.enlazarCuota(form({ comprobanteId: comprobante, cuotaId: cuota }))));
    let oid = "";
    if (orden) {
      const o = await admin(() => ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: comprobante, cuotaId: cuota, importeCentavos: 10_000_000 }] }));
      ok(o);
      oid = (o as { id: string }).id;
    }
    return { banco, cuota, comprobante, oid };
  };
  const foto = async ({ banco, cuota, oid }: { banco: string; cuota: string; oid: string }) => {
    const q = await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota }, select: { pagadoEl: true, anuladoEl: true } });
    const orden = await duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${b.id}, true)`;
      return tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: oid }, select: { estado: true } });
    });
    const libro = (await duenio.cashMovement.findMany({ where: { tenantId: b.id, proyectoOrdenPagoId: oid }, select: { type: true, amount: true } })).reduce((x, m) => x + (m.type === "EGRESO" ? -m.amount : m.amount), 0);
    const saldo = (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: banco }, select: { saldo: true } })).saldo;
    return { anulada: !!q.anuladoEl, pagada: !!q.pagadoEl, orden: orden.estado, banco: Number(saldo), libro };
  };
  const pagar = (p: { oid: string; banco: string }) => direccion(() => ordenes.aprobarYPagarOrden(form({ id: p.oid, cuentaId: p.banco })));
  /** Gane quien gane: o la orden pagó la cuota (y no se anuló), o nada salió. */
  const coherente = (f: Awaited<ReturnType<typeof foto>>, anulo: boolean, pago: boolean, todo: string) => {
    assert.ok(!(f.anulada && f.pagada), `cuota anulada y pagada a la vez · ${todo}`);
    assert.ok(!(anulo && pago), `se anuló la cuota y se pagó su orden · ${todo}`);
    if (pago) assert.deepEqual(f, { anulada: false, pagada: true, orden: "PAGADA", banco: 400_000, libro: -100_000 }, todo);
    else assert.deepEqual({ orden: f.orden, banco: f.banco, libro: f.libro, pagada: f.pagada }, { orden: "PENDIENTE", banco: 500_000, libro: 0, pagada: false }, todo);
  };

  await t.test("en serie: anular la cuota de empresa con su orden PENDIENTE se rechaza y la orden se paga bien", async () => {
    const p = await preparar(0);
    const anula = await direccion(() => empresa.anularCuotaEmpresa(form({ id: p.cuota })));
    const pago = await pagar(p);
    const f = await foto(p);
    const todo = json({ anula, pago, f });
    assert.equal(okDe(anula), false, todo);
    assert.match((anula as { error: string }).error, /orden/i, todo);
    coherente(f, okDe(anula), okDe(pago), todo);
    ok(pago);
  });

  await t.test("en serie: quitar el movimiento del proyecto con su orden PENDIENTE se rechaza", async () => {
    const p = await preparar(1, { deProyecto: true });
    const quita = await direccion(() => ficha.quitarMovimiento(form({ id: p.cuota, proyectoId: proyecto })));
    const pago = await pagar(p);
    const f = await foto(p);
    const todo = json({ quita, pago, f });
    assert.equal(okDe(quita), false, todo);
    coherente(f, okDe(quita), okDe(pago), todo);
    ok(pago);
  });

  await t.test("una cuota ya anulada no entra en una orden nueva, y si estaba en una, la orden no se paga", async () => {
    const p = await preparar(2, { orden: false });
    ok(await direccion(() => empresa.anularCuotaEmpresa(form({ id: p.cuota }))));
    const o = await admin(() => ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: p.comprobante, cuotaId: p.cuota, importeCentavos: 10_000_000 }] }));
    assert.equal(okDe(o), false, json(o));
    assert.match((o as { error: string }).error, /anulada/i, json(o));
    // La orden que ya existía cuando una vía vieja (o la base) anuló la cuota: pagar se rechaza con un mensaje claro.
    const q = await preparar(3);
    await duenio.proyectoCuota.update({ where: { id: q.cuota }, data: { anuladoEl: new Date() } });
    const pago = await pagar(q);
    const f = await foto(q);
    const todo = json({ pago, f });
    assert.equal(okDe(pago), false, todo);
    assert.match((pago as { error: string }).error, /anulada/i, todo);
    assert.deepEqual(f, { anulada: true, pagada: false, orden: "PENDIENTE", banco: 500_000, libro: 0 }, todo);
  });

  await t.test("carrera: anular la cuota de empresa (sin «visto») y pagar su orden a la vez", async () => {
    for (let v = 10; v < 10 + VUELTAS; v++) {
      const p = await preparar(v);
      const [anula, pago] = await Promise.all([direccion(() => empresa.anularCuotaEmpresa(form({ id: p.cuota }))), pagar(p)]);
      const f = await foto(p);
      coherente(f, okDe(anula), okDe(pago), json({ v, anula, pago, f }));
    }
  });

  await t.test("carrera: quitar el movimiento del proyecto y pagar su orden a la vez", async () => {
    for (let v = 20; v < 20 + VUELTAS; v++) {
      const p = await preparar(v, { deProyecto: true });
      const [quita, pago] = await Promise.all([direccion(() => ficha.quitarMovimiento(form({ id: p.cuota, proyectoId: proyecto }))), pagar(p)]);
      const f = await foto(p);
      coherente(f, okDe(quita), okDe(pago), json({ v, quita, pago, f }));
    }
  });
});
