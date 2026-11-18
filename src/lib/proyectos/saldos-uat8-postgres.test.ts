// ============================================================================
// Segunda prueba de saldos MIA (GSG-UAT-008, 14/11): defectos que no son regresión, contra Postgres real (base efímera
// migrada, app_rls + RLS) y con las Server Actions reales (sesión de la dueña).
//
//  D2. No existía el pago parcial a proveedor. Ahora «Marcar pagado» con `monto` paga ESA parte: la cuota sigue
//      pendiente con su saldo en su moneda (la misma regla de reparto que el cobro parcial), y caja, banco y gasto dan
//      al centavo. Parte + resto = la cuota queda pagada; anular una parte la reabre con lo que le falta.
//  D4. «Todo» con la pantalla vieja asentaba otro importe sin preguntar (vio $ 15.730.000, asentó $ 5.730.000). Ahora
//      la pantalla manda lo que vio (`visto`) y, si el saldo cambió desde entonces, el servidor no asienta nada.
//  D6. Rentabilidad «Por pagar» ignoraba las cuotas a proveedor y la ganancia real quedaba inflada.
//
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

type Res = { ok: boolean; error?: string; listo?: string };

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
  const empresa = await import("./empresa.server");
  const datos = await import("./datos.server");
  const proveedor = (await duenio.supplier.create({ data: { tenantId: a.id, name: "Carpintería QA" }, select: { id: true } })).id;

  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto aprobado: $ 1.210 (1.000 + IVA 21 %) con un ítem de costo $ 600. */
  const proyecto = async (moneda = "ARS") => {
    const evento = new Date(AHORA + 20 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", moneda, fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: moneda === "ARS" ? null : 1000 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000, costo: 600 } });
    return p.id;
  };
  const cuota = async (proyectoId: string, tipo: "COBRO" | "PAGO", monto: number, dias: number, moneda = "ARS") =>
    (await duenio.proyectoCuota.create({ data: { tenantId: a.id, proyectoId, tipo, concepto: `${tipo} ${dias}`, monto, moneda, venceEl: new Date(AHORA + dias * DIA), auto: false, supplierId: tipo === "PAGO" ? proveedor : null }, select: { id: true } })).id;
  const cuenta = async (saldo = 0) => (await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: "Banco", moneda: "ARS", saldo }, select: { id: true } })).id;
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
  const marcar = (id: string, extra: Record<string, string> = {}) => () => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA", ...extra })) as Promise<Res>);
  /** Lo que le falta a cada cuota y si está marcada, como lo ve Administración (la misma fuente que la ficha). */
  const administracion = () =>
    enSesion(async () => {
      const r = await empresa.recuadrosDeCuotas(a.id);
      return Object.fromEntries(r.cuotas.map((c) => [c.id, { falta: c.pendiente, marcada: !!c.pagadoEl }]));
    });
  /** Gastos vivos del proyecto, su caja (egresos − reingresos) y cuántos hay. */
  const pagos = async (proyectoId: string) => {
    const gastos = await duenio.proyectoGasto.findMany({ where: { proyectoId }, select: { id: true, neto: true, iva: true, anuladoEl: true, pagadoEl: true } });
    const movs = await duenio.cashMovement.findMany({ where: { proyectoGastoId: { in: gastos.map((g) => g.id) } }, select: { type: true, amount: true } });
    const vivos = gastos.filter((g) => !g.anuladoEl);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return { gastos: vivos.length, pagado: r2(vivos.reduce((s, g) => s + g.neto + g.iva, 0)), caja: r2(movs.reduce((s, m) => s + (m.type === "EGRESO" ? m.amount : -m.amount), 0)) };
  };
  const saldoCuenta = async (id: string) => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id }, select: { saldo: true } })).saldo;
  const clave = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, ficha, datos, proyecto, cuota, cuenta, form, enSesion, marcar, administracion, pagos, saldoCuenta, clave };
}

test("D2: pago parcial a proveedor — ESA cuota queda con su saldo, caja y banco al centavo; parte + resto = pagada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "PAGO", 600, 5);
  const otra = await p.cuota(id, "PAGO", 400, 3);
  const banco = await p.cuenta(10_000);

  const r1 = await p.marcar(q, { monto: "250,40", cuenta: banco, envio: "pago-1", visto: "600" })();
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.match(String(r1.listo), /pagó una parte.*faltan \$\s?349,60/);
  let adm = await p.administracion();
  assert.deepEqual(adm[q], { falta: 349.6, marcada: false }, "una parte no marca la cuota; le queda su saldo");
  assert.deepEqual(adm[otra], { falta: 400, marcada: false }, "la otra no se toca");
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 250.4, caja: 250.4 });
  assert.equal(await p.saldoCuenta(banco), 10_000 - 250.4);

  // El mismo envío otra vez (doble clic): no paga dos veces.
  const rep = await p.marcar(q, { monto: "250,40", cuenta: banco, envio: "pago-1" })();
  assert.equal(rep.ok, true);
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 250.4, caja: 250.4 });

  // El resto, con «todo» y la pantalla al día: la cuota queda pagada.
  const r2 = await p.marcar(q, { cuenta: banco, visto: "349.6" })();
  assert.equal(r2.ok, true, JSON.stringify(r2));
  adm = await p.administracion();
  assert.equal(adm[q].marcada, true);
  assert.deepEqual(await p.pagos(id), { gastos: 2, pagado: 600, caja: 600 });
  assert.equal(await p.saldoCuenta(banco), 9_400);
});

test("D2: nunca se paga de más; anular una parte reabre la cuota con lo que le falta y devuelve banco y caja", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "PAGO", 600, 5);
  const banco = await p.cuenta(1_000);
  assert.equal((await p.marcar(q, { monto: "200", cuenta: banco })()).ok, true);
  const mas = await p.marcar(q, { monto: "400,01" })();
  assert.equal(mas.ok, false);
  assert.match(String(mas.error), /más de lo que le falta.*\$\s?400/);
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 200, caja: 200 });

  const [parte] = await p.duenio.proyectoGasto.findMany({ where: { proyectoId: id }, select: { id: true } });
  assert.equal((await p.marcar(q, { cuenta: banco })()).ok, true, "el resto: la cuota queda pagada");
  assert.equal((await p.administracion())[q].marcada, true);
  // Anula la PRIMERA parte con la cuota ya pagada: se reabre, le faltan 200 y el banco recupera sólo esos 200.
  assert.equal((await p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: parte.id })))).ok, true);
  assert.deepEqual((await p.administracion())[q], { falta: 200, marcada: false });
  assert.equal(await p.saldoCuenta(banco), 600);
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 400, caja: 400 });
});

test("D2 carrera: tres partes de 400 sobre 1.000 a la vez → entran dos, nunca de más; anular y pagar en fila no se pisan", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "PAGO", 1000, 5);
  const rs = await enFila(p.base, p.clave(id), [p.marcar(q, { monto: "400" }), p.marcar(q, { monto: "400" }), p.marcar(q, { monto: "400" })]);
  // Cuáles dos entran no es fijo: marcarCuota corre en Serializable (transaccionQueAsienta) y la foto de la transacción
  // sale antes de esperar el candado. El que espera lee viejo, Postgres lo aborta (40001) y el reintento, con espera al
  // azar, vuelve a la fila en otro lugar. Lo fijo es el conjunto: entran dos, el tercero no asienta nada y lo dice.
  assert.equal(rs.filter((r) => r.ok).length, 2, JSON.stringify(rs));
  const rechazos = rs.filter((r) => !r.ok);
  assert.equal(rechazos.length, 1, JSON.stringify(rs));
  assert.match(String(rechazos[0].error), /No se asentó nada.*ahora le faltan \$\s?200/, JSON.stringify(rs));
  assert.deepEqual(await p.pagos(id), { gastos: 2, pagado: 800, caja: 800 });
  assert.deepEqual((await p.administracion())[q], { falta: 200, marcada: false });

  // Anular una parte y «todo» (pantalla que vio 200) a la vez: si pasa primero la anulación, el todo no asienta 600.
  const [g] = await p.duenio.proyectoGasto.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { id: true } });
  const [anulada, todo] = await enFila(p.base, p.clave(id), [() => p.enSesion(() => p.ficha.anularGastoFicha(p.form({ id: g.id }))) as Promise<Res>, p.marcar(q, { visto: "200" })]);
  assert.equal(anulada.ok, true);
  assert.equal(todo.ok, false, "la pantalla vio 200: no se pagan 600 sin preguntar");
  assert.match(String(todo.error), /se anuló/);
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 400, caja: 400 });
  assert.deepEqual((await p.administracion())[q], { falta: 600, marcada: false });
});

test("D2 USD: una parte de una cuota a proveedor en dólares deja el saldo exacto en dólares", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "PAGO", 61, 5, "USD");
  assert.equal((await p.marcar(q, { monto: "20,25" })()).ok, true);
  assert.deepEqual((await p.administracion())[q], { falta: 40.75, marcada: false });
  assert.deepEqual(await p.pagos(id), { gastos: 1, pagado: 20250, caja: 20250 });
  assert.equal((await p.marcar(q, { visto: "40.75" })()).ok, true);
  assert.equal((await p.administracion())[q].marcada, true);
  assert.deepEqual(await p.pagos(id), { gastos: 2, pagado: 61000, caja: 61000 });
});

test("D4: «todo» con la pantalla vieja no asienta otro importe; con el monto escrito, sí (es la confirmación)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "COBRO", 1210, 5);
  // La pantalla se cargó viendo $ 1.210; mientras tanto, otra persona cobró $ 1.000.
  assert.equal((await p.marcar(q, { monto: "1000" })()).ok, true);
  const vieja = await p.marcar(q, { visto: "1210" })();
  assert.equal(vieja.ok, false);
  assert.match(String(vieja.error), /faltaban \$\s?1\.210.*ahora le faltan \$\s?210.*entró otro cobro/);
  const cobros = await p.duenio.proyectoPago.count({ where: { proyectoId: id, anuladoEl: null } });
  assert.equal(cobros, 1, "no se asentó nada");
  // Escribir el monto es confirmar: entra.
  assert.equal((await p.marcar(q, { monto: "210", visto: "1210" })()).ok, true);
  assert.equal((await p.administracion())[q].marcada, true);

  // Con la pantalla al día, «todo» entra como siempre.
  const q2 = await p.cuota(id, "PAGO", 300, 6);
  assert.equal((await p.marcar(q2, { visto: "300" })()).ok, true);
  // Y un pago con la pantalla vieja tampoco: vio 500, la cuota ahora es de 300 (cambió el plan).
  const q3 = await p.cuota(id, "PAGO", 300, 7);
  const r = await p.marcar(q3, { visto: "500" })();
  assert.equal(r.ok, false);
  assert.match(String(r.error), /faltaban \$\s?500.*ahora le faltan \$\s?300/);
});

test("D6: Rentabilidad cuenta las cuotas a proveedor por pagar (menos lo pagado en parte) y la ganancia real no queda inflada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const q = await p.cuota(id, "PAGO", 600, 5);
  // Una prevista no es deuda todavía (la misma regla que Administración).
  await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "PAGO", concepto: "Prevista", monto: 999, moneda: "ARS", venceEl: new Date(AHORA), prevista: true } });
  let fila = (await p.enSesion(() => p.datos.reporteProyectos())).find((f) => f.id === id)!;
  assert.equal(fila.real.porPagar, 600);
  assert.equal(fila.real.gananciaReal, 400, "neto 1.000 − costo comprometido 600");
  assert.equal((await p.marcar(q, { monto: "250" })()).ok, true);
  fila = (await p.enSesion(() => p.datos.reporteProyectos())).find((f) => f.id === id)!;
  assert.equal(fila.real.porPagar, 350);
  assert.equal(fila.real.costoReal, 600, "lo pagado (250) más lo que falta (350)");
  assert.equal(fila.real.gananciaReal, 400);
});

test("callejón: el tipo de cambio no se redondea en silencio — con más de 2 decimales se pide escribirlo con 2", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const empresa = await import("./acciones-empresa");
  const guardar = (valor: string) => p.enSesion(() => empresa.guardarTipoCambio(p.form({ porUnidad: valor })));
  const usd = async () => (await p.duenio.proyectoTipoCambio.findFirstOrThrow({ where: { tenantId: p.a.id, moneda: "USD" }, select: { porUnidad: true } })).porUnidad;
  const antes = await usd();
  for (const largo of ["1452,375", "1.452,375"]) {
    const r = await guardar(largo);
    assert.equal(r.ok, false, largo);
    assert.match(String((r as { error?: string }).error), /hasta 2 decimales.*1452,38/);
  }
  assert.equal(await usd(), antes, "no se guardó nada");
  assert.equal((await guardar("1452,38")).ok, true);
  assert.equal(await usd(), 1452.38);
});
