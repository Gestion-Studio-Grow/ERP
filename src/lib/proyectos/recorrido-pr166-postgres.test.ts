// ============================================================================
// Recorrido del PR #166 (MIA, 14/11) contra Postgres real (base efímera migrada, app_rls + RLS) y con las Server Actions
// reales (sesión de la dueña):
//  2. Anticipo a proveedor de 50 % a 20 % con una parte pagada: la cuota quedaba «Pendiente · Falta $ 0» y «Marcar pagado»
//     la rechazaba. Ahora la que sus partes cubren queda saldada (al regenerar el plan, o con «Marcar pagado» si quedó
//     así de antes), sin asentar otro pago: caja, gasto y banco no se mueven.
//  3. Un ítem con pagos asentados al proveedor no cambia de moneda (regla del dueño, 14/11): se anula y se registra bien.
// Deterministas: fechas fijas, sin azar, carreras con barrera en el candado de la base.
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
type Res = { ok: boolean; error?: string; listo?: string };
const r2 = (n: number) => Math.round(n * 100) / 100;

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
  await duenio.proyectoTipoCambio.upsert({ where: { tenantId_moneda: { tenantId: a.id, moneda: "USD" } }, create: { tenantId: a.id, moneda: "USD", porUnidad: 1000 }, update: { porUnidad: 1000 } });
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const datos = await import("./datos.server");
  let numero = (await duenio.proyecto.count()) + 6600;
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
  /** Un proveedor propio (con su anticipo %) y un proyecto con un ítem de costo 10.000.000 a ese proveedor, plan generado. */
  const proyectoConPlan = async (anticipoPct: number, estado: "APROBADO" | "BORRADOR" = "APROBADO") => {
    const proveedor = (await duenio.supplier.create({ data: { tenantId: a.id, name: `Proveedor ${numero + 1}` }, select: { id: true } })).id;
    await duenio.proyectoProveedorFicha.create({ data: { tenantId: a.id, supplierId: proveedor, anticipoPct } });
    const evento = new Date(AHORA + 40 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda: "ARS", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado, token: `tok-${p.id}`, ivaPct: 21 }, select: { id: true } });
    const item = await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "Carpintería", descripcion: "Stand", cantidad: 1, precio: 15_000_000, costo: 10_000_000, supplierId: proveedor }, select: { id: true } });
    await enSesion(() => gestion.regenerarCuotas(a.id, p.id));
    return { id: p.id, item: item.id, proveedor };
  };
  const cuotasPago = async (proyectoId: string) =>
    Object.fromEntries(
      (await duenio.proyectoCuota.findMany({ where: { proyectoId, tipo: "PAGO", anuladoEl: null }, select: { id: true, clave: true, monto: true, pagadoEl: true, pagadoPor: true } })).map((c) => [c.clave!.split(":").pop(), c]),
    );
  const marcar = (id: string, extra: Record<string, string> = {}) => () => enSesion(() => ficha.marcarCuota(form({ envio: crypto.randomUUID(), id, medio: "TRANSFERENCIA", ...extra })) as Promise<Res>);
  /** Gastos vivos del proyecto y su caja (egresos − reingresos). */
  const plata = async (proyectoId: string) => {
    const gastos = await duenio.proyectoGasto.findMany({ where: { proyectoId, anuladoEl: null }, select: { id: true, neto: true, iva: true } });
    const movs = await duenio.cashMovement.findMany({ where: { proyectoGastoId: { in: gastos.map((g) => g.id) } }, select: { type: true, amount: true } });
    return { gastos: gastos.length, pagado: r2(gastos.reduce((s, g) => s + g.neto + g.iva, 0)), caja: r2(movs.reduce((s, m) => s + (m.type === "EGRESO" ? m.amount : -m.amount), 0)) };
  };
  const rentabilidad = async (proyectoId: string) => (await enSesion(() => datos.reporteProyectos())).find((f) => f.id === proyectoId)!.real;
  const moneda = (item: string, valor: string) => () => enSesion(() => ficha.guardarCampoItem({ id: item, campo: "moneda", valor }));
  const clave = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, ficha, gestion, form, enSesion, proyectoConPlan, cuotasPago, marcar, plata, rentabilidad, moneda, clave };
}

test("2: anticipo de 50 % a 20 % con $ 2.000.000 pagados en parte → la cuota queda saldada, sin otro pago; anular la parte la reabre", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id, proveedor } = await p.proyectoConPlan(50);
  let q = await p.cuotasPago(id);
  assert.deepEqual([q.anticipo.monto, q.saldo.monto], [5_000_000, 5_000_000]);
  assert.equal((await p.marcar(q.anticipo.id, { monto: "2.000.000", visto: "5000000" })()).ok, true);
  assert.deepEqual(await p.plata(id), { gastos: 1, pagado: 2_000_000, caja: 2_000_000 });

  await p.duenio.proyectoProveedorFicha.update({ where: { supplierId: proveedor }, data: { anticipoPct: 20 } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  q = await p.cuotasPago(id);
  assert.equal(q.anticipo.monto, 2_000_000);
  assert.ok(q.anticipo.pagadoEl, "cubierta por su parte: saldada, no «Pendiente · Falta $ 0»");
  assert.equal(q.anticipo.pagadoPor, "Saldada con sus partes");
  assert.equal(q.saldo.monto, 8_000_000);
  assert.equal(q.saldo.pagadoEl, null);
  assert.deepEqual(await p.plata(id), { gastos: 1, pagado: 2_000_000, caja: 2_000_000 }, "saldar no asienta otro pago");
  const real = await p.rentabilidad(id);
  assert.deepEqual({ costoReal: real.costoReal, porPagar: real.porPagar }, { costoReal: 10_000_000, porPagar: 8_000_000 });

  // Otra vuelta del plan no la toca ni la duplica.
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  assert.deepEqual(Object.keys(await p.cuotasPago(id)).sort(), ["anticipo", "saldo"]);

  // Se anula la parte: la cuota vuelve a pedir lo suyo.
  const enlace = await p.duenio.proyectoCambio.findFirstOrThrow({ where: { entidad: "ProyectoCuota", campo: "Asiento", entidadId: q.anticipo.id }, select: { despues: true } });
  assert.equal(((await p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: enlace.despues! })))) as Res).ok, true);
  q = await p.cuotasPago(id);
  assert.equal(q.anticipo.pagadoEl, null);
  assert.equal((await p.rentabilidad(id)).porPagar, 10_000_000);
});

test("2: una cuota que quedó «Falta $ 0» de antes se salda con «Marcar pagado» — sin otro gasto, ni caja, ni banco", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan(50);
  const q = (await p.cuotasPago(id)).anticipo;
  assert.equal((await p.marcar(q.id, { monto: "2000000" })()).ok, true);
  // Como quedaba antes de este arreglo: el plan bajó el monto a lo pagado y la dejó sin marcar.
  await p.duenio.proyectoCuota.update({ where: { id: q.id }, data: { monto: 2_000_000 } });
  const banco = (await p.duenio.proyectoCuentaBanco.create({ data: { tenantId: p.a.id, nombre: "Banco QA", moneda: "ARS", saldo: 1_000 }, select: { id: true } })).id;

  const r = await p.marcar(q.id, { cuenta: banco, visto: "0" })();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.match(String(r.listo), /ya cubría esta cuota/);
  assert.ok((await p.cuotasPago(id)).anticipo.pagadoEl);
  assert.deepEqual(await p.plata(id), { gastos: 1, pagado: 2_000_000, caja: 2_000_000 });
  assert.equal((await p.duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: banco }, select: { saldo: true } })).saldo, 1_000, "el banco no se mueve");

  const otra = await p.marcar(q.id, { visto: "0" })();
  assert.equal(otra.ok, false);
  assert.match(String(otra.error), /ya estaba marcada/);
});

test("2 carrera: saldar y anular la parte a la vez, en fila → si la anulación pasa primero, no se salda (le vuelve a faltar)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan(50);
  const q = (await p.cuotasPago(id)).anticipo;
  assert.equal((await p.marcar(q.id, { monto: "2000000" })()).ok, true);
  await p.duenio.proyectoCuota.update({ where: { id: q.id }, data: { monto: 2_000_000 } });
  const enlace = await p.duenio.proyectoCambio.findFirstOrThrow({ where: { entidad: "ProyectoCuota", campo: "Asiento", entidadId: q.id }, select: { despues: true } });
  const anular = () => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: enlace.despues! }))) as Promise<Res>;
  const [anulo, salda] = await enFila(p.base, p.clave(id), [anular, p.marcar(q.id, { visto: "0" })]);
  assert.equal(anulo.ok, true, JSON.stringify(anulo));
  assert.equal(salda.ok, false, "la parte ya no está: no hay con qué saldarla");
  const ahora = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q.id }, select: { pagadoEl: true } });
  assert.equal(ahora.pagadoEl, null);
  assert.deepEqual(await p.plata(id), { gastos: 0, pagado: 0, caja: 0 });
});

test("3: con una parte pagada al proveedor, la moneda del ítem no cambia (y el mensaje dice qué hacer); sin pagos, sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const conPago = await p.proyectoConPlan(50, "BORRADOR");
  const q = (await p.cuotasPago(conPago.id)).anticipo;
  assert.equal((await p.marcar(q.id, { monto: "1000" })()).ok, true);
  const r = (await p.moneda(conPago.item, "USD")()) as Res;
  assert.equal(r.ok, false);
  assert.match(String(r.error), /no se puede cambiar.*anulá esos pagos/);
  assert.equal((await p.duenio.proyectoItem.findUniqueOrThrow({ where: { id: conPago.item }, select: { moneda: true } })).moneda, "ARS");
  const antes = await p.rentabilidad(conPago.id);
  await p.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: p.a.id, moneda: "USD" } }, data: { porUnidad: 1500 } });
  assert.equal((await p.rentabilidad(conPago.id)).porPagar, antes.porPagar, "otro cambio no inventa deuda");
  await p.duenio.proyectoTipoCambio.update({ where: { tenantId_moneda: { tenantId: p.a.id, moneda: "USD" } }, data: { porUnidad: 1000 } });

  // Con la cuota marcada entera, tampoco.
  const marcada = await p.proyectoConPlan(50, "BORRADOR");
  assert.equal((await p.marcar((await p.cuotasPago(marcada.id)).anticipo.id)()).ok, true);
  assert.equal(((await p.moneda(marcada.item, "USD")()) as Res).ok, false);

  const sinPago = await p.proyectoConPlan(50, "BORRADOR");
  assert.equal(((await p.moneda(sinPago.item, "USD")()) as Res).ok, true);
  assert.equal((await p.duenio.proyectoItem.findUniqueOrThrow({ where: { id: sinPago.item }, select: { moneda: true } })).moneda, "USD");
});

test("3 carrera: una parte y el cambio de moneda a la vez, en fila → la parte entra y la moneda no cambia", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id, item } = await p.proyectoConPlan(50, "BORRADOR");
  const q = (await p.cuotasPago(id)).anticipo;
  const [parte, cambio] = (await enFila(p.base, p.clave(id), [p.marcar(q.id, { monto: "1000" }), p.moneda(item, "USD")])) as Res[];
  assert.equal(parte.ok, true, JSON.stringify(parte));
  assert.equal(cambio.ok, false, JSON.stringify(cambio));
  assert.equal((await p.duenio.proyectoItem.findUniqueOrThrow({ where: { id: item }, select: { moneda: true } })).moneda, "ARS");
});

test("2 (certificación): saldar una cuota cuyas partes pasan su monto no pierde el excedente — el saldo no vuelve a pedirlo", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyectoConPlan(50);
  const q = (await p.cuotasPago(id)).anticipo;
  assert.equal((await p.marcar(q.id, { monto: "3000000" })()).ok, true);
  // Dato viejo: el plan dejó la cuota en 2.000.000 con 3.000.000 pagados en partes, sin marcar.
  await p.duenio.proyectoCuota.update({ where: { id: q.id }, data: { monto: 2_000_000 } });
  const r = await p.marcar(q.id, { visto: "0" })();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await p.cuotasPago(id)).anticipo.monto, 3_000_000, "la cuota saldada vale lo que se pagó por ella");
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  assert.deepEqual(await p.plata(id), { gastos: 1, pagado: 3_000_000, caja: 3_000_000 });
  assert.equal((await p.rentabilidad(id)).porPagar, 7_000_000, "pagados 3M de 10M: faltan 7M");
});
