// ============================================================================
// QA de saldos MIA (GSG-UAT-007, 14/11): DOS defectos, contra Postgres real (base efímera migrada, app_rls + RLS) y con
// las Server Actions reales (sesión de la dueña).
//
//  1. Una cuota no se podía cobrar en parte. «Marcar cobrado» con `monto` menor que lo que falta cobra ESA parte: la
//     cuota sigue pendiente con su saldo (no se lo lleva la más vieja), y por cobrar, caja y banco dan al centavo.
//     Parcial + parcial = total (la cuota queda cobrada); anular un parcial devuelve caja y banco; nunca se cobra de
//     más; el mismo envío dos veces y N parciales a la vez asientan lo que entra, nada más.
//  2. «Guardar textos» cambiaba el cambio de venta sin recalcular los ítems (guardados en pesos): el cliente aprobó
//     US$ 3.889,28 en vez de US$ 4.033,33. Ahora manda lo tipeado en dólares, y con cobros o una versión aprobada el
//     cambio no se toca.
//
// Deterministas: fechas fijas, sin azar (el `envio` es un texto fijo), carreras con barrera en el candado de la base.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const AHORA = Date.parse("2026-11-10T12:00:00Z");

/** Cuántos pedidos esperan el candado consultivo `clave` (ver cobranza-carrera-postgres.test.ts). */
async function trabados(c: pg.Client, clave: string): Promise<number> {
  const r = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted AND objsubid = 1
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND objid = ((hashtext($1)::bigint & 4294967295)::text)::oid
        AND classid = ((hashtext($1)::bigint >> 32) & 4294967295)::text::oid`,
    [clave],
  );
  return r.rows[0].n;
}

/** Corre `pedidos` a la vez, en fila detrás del candado `clave`; devuelve los resultados en el orden en que pasan. */
async function enFila<T>(base: BaseEfimera, clave: string, pedidos: readonly (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    assert.equal(await trabados(c, clave), 0, "no queda nadie trabado de antes");
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    const enCurso: Promise<T>[] = [];
    const terminados = new Set<number>();
    try {
      for (let i = 0; i < pedidos.length; i++) {
        const p = pedidos[i]();
        p.then(
          () => terminados.add(i),
          () => terminados.add(i),
        );
        enCurso.push(p);
        const hasta = performance.now() + PLAZO_MS;
        while ((await trabados(c, clave)) < i + 1) {
          if (terminados.has(i)) {
            const r = await p.catch((e: unknown) => e);
            assert.fail(`el pedido ${i + 1} terminó sin trabarse en «${clave}»: ${JSON.stringify(r instanceof Error ? r.message : r)}`);
          }
          if (performance.now() > hasta) assert.fail(`el pedido ${i + 1} no llegó al candado «${clave}» en ${PLAZO_MS} ms`);
          await new Promise((r) => setImmediate(r));
        }
      }
    } finally {
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [clave]);
    }
    return await Promise.all(enCurso);
  } finally {
    await c.end();
  }
}

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  if (!(await duenio.proyectoTipoCambio.findFirst({ where: { tenantId: a.id, moneda: "USD" } }))) await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1000 } });

  const ficha = await import("./acciones-ficha");
  const { cobranzaConCuotas, tiposDeCambio } = await import("./cobranza.server");
  const { pendientesDeCobro } = await import("./cobranza-core");
  const { configProyectos } = await import("./datos.server");

  let numero = (await duenio.proyecto.count()) + 700;
  /** Proyecto aprobado: en pesos $ 1.210 (1.000 + IVA 21 %); en USD, 121 USD vendidos a 1.000. */
  const proyecto = async (moneda = "ARS", estado = "APROBADO") => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda, fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado, token: `tok-${p.id}`, ivaPct: 21, tcVenta: moneda === "ARS" ? null : 1000 }, select: { id: true } });
    const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 * (moneda === "ARS" ? 1 : 100) }, select: { id: true } });
    return { id: p.id, presupuestoId: pres.id, itemId: item.id };
  };
  const cuota = async (proyectoId: string, monto: number, dias: number, moneda = "ARS") =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo: "COBRO", concepto: `Cuota ${dias}`, monto, moneda, venceEl: new Date(AHORA + dias * DIA), auto: false }, select: { id: true } })).id;
  const cuenta = async () => (await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco", moneda: "ARS" }, select: { id: true } })).id;
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const cobrar = (id: string, extra: Record<string, string> = {}) => () => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA", ...extra })));
  /** Por cobrar del proyecto y lo que le falta a cada cuota (en su moneda), por la fuente única de la ficha y Administración. */
  const estado = (proyectoId: string) =>
    enSesion(async () => {
      const [config, tc] = await Promise.all([configProyectos(a.id), tiposDeCambio(a.id)]);
      const { prisma } = await import("@/lib/prisma");
      const { cuotas, cob } = await cobranzaConCuotas(prisma, a.id, proyectoId, tc, config.margenPct);
      const pend = pendientesDeCobro(cuotas, tc, cob);
      return { cob, falta: Object.fromEntries(cuotas.map((q, i) => [q.id, pend[i]])), marcada: Object.fromEntries(cuotas.map((q) => [q.id, !!q.pagadoEl])) };
    });
  /** Caja (ventas − anulaciones) y cobros vivos del proyecto; saldo de la cuenta. */
  const caja = async (proyectoId: string) => {
    const pagos = await duenio.proyectoPago.findMany({ where: { proyectoId }, select: { id: true, monto: true, anuladoEl: true } });
    const movs = await duenio.cashMovement.findMany({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } }, select: { type: true, amount: true } });
    const neto = movs.reduce((s, m) => s + (m.type === "VENTA" ? m.amount : -m.amount), 0);
    const vivos = pagos.filter((x) => !x.anuladoEl);
    return { cobros: vivos.length, cobrado: Math.round(vivos.reduce((s, x) => s + x.monto, 0) * 100) / 100, caja: Math.round(neto * 100) / 100 };
  };
  const saldoCuenta = async (id: string) => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id }, select: { saldo: true } })).saldo;
  const clave = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, ficha, proyecto, cuota, cuenta, form, enSesion, cobrar, estado, caja, saldoCuenta, clave };
}

test("parcial: cobra ESA cuota (no la más vieja), caja y banco al centavo; parcial + parcial = total y la cuota queda cobrada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto();
  const vieja = await p.cuota(id, 605, 5);
  const nueva = await p.cuota(id, 605, 15);
  const banco = await p.cuenta();

  const r1 = await p.cobrar(nueva, { monto: "200,50", cuenta: banco, envio: "envio-1" })();
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.match(String((r1 as { listo?: string }).listo), /faltan \$\s?404,50/);
  let e = await p.estado(id);
  assert.equal(e.falta[nueva], 404.5, "a la cuota cobrada en parte le queda su saldo");
  assert.equal(e.falta[vieja], 605, "la más vieja no se toca");
  assert.equal(e.marcada[nueva], false, "una parte no marca la cuota");
  assert.equal(e.cob.porCobrar, 1009.5);
  assert.deepEqual(await p.caja(id), { cobros: 1, cobrado: 200.5, caja: 200.5 });
  assert.equal(await p.saldoCuenta(banco), 200.5);

  // El resto exacto (escrito igual que lo que falta): es todo, la cuota queda cobrada.
  const r2 = await p.cobrar(nueva, { monto: "404,50", cuenta: banco, envio: "envio-2" })();
  assert.equal(r2.ok, true, JSON.stringify(r2));
  e = await p.estado(id);
  assert.equal(e.marcada[nueva], true);
  assert.equal(e.cob.porCobrar, 605);
  assert.equal(e.falta[vieja], 605);
  assert.deepEqual(await p.caja(id), { cobros: 2, cobrado: 605, caja: 605 });
  assert.equal(await p.saldoCuenta(banco), 605);
});

test("sobrecobro: una parte por más de lo que falta se rechaza y no se graba nada; tampoco sobre una cuota ya cubierta", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto();
  const q = await p.cuota(id, 1210, 5);
  assert.equal((await p.cobrar(q, { monto: "1000" })()).ok, true);
  const mas = await p.cobrar(q, { monto: "210,01" })();
  assert.equal(mas.ok, false);
  assert.match(String((mas as { error: string }).error), /más de lo que le falta.*\$\s?210/);
  for (const malo of ["0", "-5", "abc"]) assert.equal((await p.cobrar(q, { monto: malo })()).ok, false, `monto «${malo}» rechazado`);
  assert.deepEqual(await p.caja(id), { cobros: 1, cobrado: 1000, caja: 1000 });
  assert.equal((await p.estado(id)).falta[q], 210);
});

test("anular: con el plan de cuotas real, un parcial anulado devuelve caja y banco y la cuota recupera su saldo; anulado después de saldada, se reabre", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto();
  // El plan automático del proyecto (anticipo y saldo), como en MIA: anular regenera el plan y no tiene que pisar la parte.
  assert.equal((await p.enSesion(() => p.ficha.recalcularCuotas(p.form({ proyectoId: id })))).ok, true);
  const plan = await p.duenio.proyectoCuota.findMany({ where: { proyectoId: id, tipo: "COBRO", anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, monto: true, auto: true } });
  assert.ok(plan.length >= 2 && plan.every((c) => c.auto), JSON.stringify(plan));
  const [q, siguiente] = plan;
  const banco = await p.cuenta();
  await p.cobrar(q.id, { monto: "300", cuenta: banco })();
  const [parte] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id }, select: { id: true } });
  await p.cobrar(q.id, { cuenta: banco })(); // el resto: la cuota queda cobrada
  assert.equal((await p.estado(id)).marcada[q.id], true);
  assert.equal(await p.saldoCuenta(banco), q.monto);

  // Anula la PRIMERA parte con la cuota ya saldada: se reabre, el banco baja sólo 300 y le faltan 300.
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: parte.id })))).ok, true);
  let e = await p.estado(id);
  assert.equal(e.marcada[q.id], false);
  assert.equal(e.falta[q.id], 300);
  assert.equal(e.falta[siguiente.id], siguiente.monto, "la siguiente no se toca");
  assert.equal(e.cob.porCobrar, 1210 - (q.monto - 300));
  assert.equal(await p.saldoCuenta(banco), q.monto - 300);
  assert.deepEqual(await p.caja(id), { cobros: 1, cobrado: q.monto - 300, caja: q.monto - 300 });

  // Anula el otro: todo vuelve a cero, caja y banco netean.
  const [otro] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { id: true } });
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: otro.id })))).ok, true);
  e = await p.estado(id);
  assert.equal(e.falta[q.id], q.monto);
  assert.equal(e.cob.porCobrar, 1210);
  assert.equal(await p.saldoCuenta(banco), 0);
  assert.deepEqual(await p.caja(id), { cobros: 0, cobrado: 0, caja: 0 });
});

test("doble envío y N a la vez: el mismo envío asienta una vez; tres partes de 300 sobre 605 → entran dos, nunca de más", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto();
  const q = await p.cuota(id, 605, 5);
  const [r1, r2] = await enFila(p.base, p.clave(id), [p.cobrar(q, { monto: "100", envio: "mismo" }), p.cobrar(q, { monto: "100", envio: "mismo" })]);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true, "el reintento no es un error…");
  assert.deepEqual(await p.caja(id), { cobros: 1, cobrado: 100, caja: 100 }, "…pero no asienta dos veces");

  const rs = await enFila(p.base, p.clave(id), [p.cobrar(q, { monto: "300" }), p.cobrar(q, { monto: "300" }), p.cobrar(q, { monto: "300" })]);
  assert.deepEqual(rs.map((r) => r.ok), [true, false, false], "con 505 de saldo entra una de 300; las otras ven que ya no entran");
  assert.deepEqual(await p.caja(id), { cobros: 2, cobrado: 400, caja: 400 });
  const e = await p.estado(id);
  assert.equal(e.falta[q], 205);
  assert.equal(e.cob.porCobrar, 810);
});

test("USD: una parte de una cuota en dólares deja el saldo exacto en dólares; el resto la salda al centavo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto("USD");
  const q1 = await p.cuota(id, 60, 5, "USD");
  const q2 = await p.cuota(id, 61, 15, "USD");
  assert.equal((await p.cobrar(q2, { monto: "20,25" })()).ok, true);
  let e = await p.estado(id);
  assert.equal(e.falta[q2], 40.75);
  assert.equal(e.falta[q1], 60);
  assert.equal(e.cob.enMoneda?.saldo, 100.75);
  assert.deepEqual(await p.caja(id), { cobros: 1, cobrado: 20250, caja: 20250 });
  assert.equal((await p.cobrar(q2)()).ok, true);
  e = await p.estado(id);
  assert.equal(e.marcada[q2], true);
  assert.equal(e.cob.enMoneda?.saldo, 60);
  assert.equal(e.falta[q1], 60);
});

test("defecto 2: cambiar el cambio en «Guardar textos» mantiene los US$ 4.033,33 tipeados; con un cobro vivo, no se cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const gestion = await import("./gestion-core");
  await p.duenio.proyectoTipoCambio.updateMany({ where: { tenantId: p.a.id, moneda: "USD" }, data: { porUnidad: 1350 } });
  const { id, presupuestoId, itemId } = await p.proyecto("USD", "BORRADOR");
  await p.duenio.proyectoPresupuesto.update({ where: { id: presupuestoId }, data: { tcVenta: null } });
  await p.duenio.proyectoItem.update({ where: { id: itemId }, data: { precio: 0 } });

  // Se tipea el precio en dólares al cambio del día (1.350): queda fijado.
  assert.deepEqual(await p.enSesion(() => p.ficha.guardarCampoItem({ id: itemId, campo: "precio", valor: "4.033,33" })), { ok: true });
  const usd = async () => {
    const pr = await p.duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: presupuestoId }, select: { tcVenta: true, items: { select: { precio: true, cantidad: true } } } });
    return { tcVenta: pr.tcVenta, usd: gestion.enMonedaDeVenta(pr.items.reduce((s, i) => s + i.precio * i.cantidad, 0), pr.tcVenta ?? 0) };
  };
  assert.deepEqual(await usd(), { tcVenta: 1350, usd: 4033.33 });

  // «Guardar textos» con el cambio en 1.400: el cliente sigue viendo US$ 4.033,33 (antes, US$ 3.889,28).
  const textos = (tcVenta: string) => p.enSesion(() => p.ficha.guardarTextos(p.form({ id: presupuestoId, ivaPct: "21", tcVenta, presentacion: "", condiciones: "" })));
  assert.equal((await textos("1400")).ok, true);
  assert.deepEqual(await usd(), { tcVenta: 1400, usd: 4033.33 });
  assert.equal((await p.duenio.proyectoItem.findUniqueOrThrow({ where: { id: itemId }, select: { precio: true } })).precio, 5646662);

  // Con un cobro vivo del proyecto, el cambio ya contabilizó: no se cambia, y nada se mueve.
  await p.duenio.proyectoPago.create({ data: { tenantId: p.a.id, proyectoId: id, medio: "TRANSFERENCIA", monto: 1000 } });
  const r = await textos("1500");
  assert.equal(r.ok, false);
  assert.match(String((r as { error: string }).error), /anulá y registrá/);
  assert.deepEqual(await usd(), { tcVenta: 1400, usd: 4033.33 });
  // Los textos sí se guardan si no se toca el cambio.
  assert.equal((await textos("1400")).ok, true);
});

test("cert. F1: parte SIN cuenta y resto CON cuenta; anular la parte no toca el banco, anular el resto lo deja en 0", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto();
  const q = await p.cuota(id, 1210, 5);
  const banco = await p.cuenta();
  assert.equal((await p.cobrar(q, { monto: "300", cuenta: "ninguna" })()).ok, true);
  const [parte] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id }, select: { id: true } });
  assert.equal((await p.cobrar(q, { cuenta: banco })()).ok, true);
  assert.equal(await p.saldoCuenta(banco), 910);
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: parte.id })))).ok, true);
  assert.equal(await p.saldoCuenta(banco), 910, "la parte no movió el banco: anularla tampoco");
  const [resto] = await p.duenio.proyectoPago.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { id: true } });
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: resto.id })))).ok, true);
  assert.equal(await p.saldoCuenta(banco), 0);
});

test("cert. F2: precio tipeado y «Guardar textos» con otro cambio a la vez, en los dos órdenes: lo tipeado en USD nunca cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const gestion = await import("./gestion-core");
  await p.duenio.proyectoTipoCambio.updateMany({ where: { tenantId: p.a.id, moneda: "USD" }, data: { porUnidad: 1350 } });
  const armar = async () => {
    const { presupuestoId, itemId } = await p.proyecto("USD", "BORRADOR");
    await p.duenio.proyectoPresupuesto.update({ where: { id: presupuestoId }, data: { tcVenta: 1350 } });
    await p.duenio.proyectoItem.update({ where: { id: itemId }, data: { precio: 5_444_995.5 } }); // US$ 4.033,33 a 1.350
    const x = await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId, rubro: "General", descripcion: "Extra", cantidad: 1, precio: 0 }, select: { id: true } });
    return { presupuestoId, itemId, x: x.id };
  };
  const enUsd = async (presupuestoId: string, itemId: string, x: string) => {
    const pr = await p.duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: presupuestoId }, select: { tcVenta: true, proyectoId: true } });
    const precio = async (id: string) => (await p.duenio.proyectoItem.findUniqueOrThrow({ where: { id }, select: { precio: true } })).precio;
    return { clave: p.clave(pr.proyectoId), tc: pr.tcVenta, y: gestion.enMonedaDeVenta(await precio(itemId), pr.tcVenta ?? 0), x: gestion.enMonedaDeVenta(await precio(x), pr.tcVenta ?? 0) };
  };
  const precio = (x: string) => () => p.enSesion(() => p.ficha.guardarCampoItem({ id: x, campo: "precio", valor: "100" }));
  const textos = (presupuestoId: string) => () => p.enSesion(() => p.ficha.guardarTextos(p.form({ id: presupuestoId, ivaPct: "21", tcVenta: "1400", presentacion: "", condiciones: "" })));

  // Primero el precio (a 1.350), después el cambio a 1.400: los dos entran y el cambio reescala los dos ítems.
  const a = await armar();
  const [r1, r2] = await enFila(p.base, (await enUsd(a.presupuestoId, a.itemId, a.x)).clave, [precio(a.x), textos(a.presupuestoId)]);
  assert.deepEqual([r1.ok, r2.ok], [true, true], JSON.stringify([r1, r2]));
  const ea = await enUsd(a.presupuestoId, a.itemId, a.x);
  assert.deepEqual({ tc: ea.tc, y: ea.y, x: ea.x }, { tc: 1400, y: 4033.33, x: 100 });

  // Primero el cambio a 1.400, después el precio que se pasó a pesos con 1.350: el precio no se graba (pide recargar).
  const b = await armar();
  const [s1, s2] = await enFila(p.base, (await enUsd(b.presupuestoId, b.itemId, b.x)).clave, [textos(b.presupuestoId), precio(b.x)]);
  assert.equal(s1.ok, true, JSON.stringify(s1));
  assert.equal(s2.ok, false, "el precio leído con el cambio viejo no se graba");
  assert.match(String((s2 as { error: string }).error), /Recargá/);
  const eb = await enUsd(b.presupuestoId, b.itemId, b.x);
  assert.deepEqual({ tc: eb.tc, y: eb.y, x: eb.x }, { tc: 1400, y: 4033.33, x: 0 });
});
