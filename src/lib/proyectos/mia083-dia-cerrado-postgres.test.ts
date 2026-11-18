// ============================================================================
// GSG-MIA-083 · G1, G2 y G3 de la UAT de Administración de MIA, por el camino de la UAT: marcar una cuota en la ficha
// (`marcarCuota`, acciones-ficha.ts) con el día de caja cerrado por el `cerrarDia` REAL, contra Postgres de verdad
// (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión). Escrito ANTES de traer #185, sobre
// main + #183 + #184: tiene que dar rojo ahí (la cuota asienta 1 fila en un día cerrado) y verde con #185.
//
//  G1  día cerrado: marcar una cuota de COBRO → rechazo con el texto de periodo-cerrado-core.ts, 0 filas nuevas en
//      CashMovement / ProyectoPago / ProyectoGasto, cuota sin marcar, saldo de la cuenta igual, y el libro del día
//      sigue igual a lo que el cierre guardó como esperado.
//  G3  lo mismo con una cuota de PAGO a proveedor.
//  G2  carrera de `marcarCuota` (cobro y pago) contra `cerrarDia`, en los dos órdenes, con dos conexiones: un tercero
//      toma el candado `cierre-dia:<negocio>` (el de `cerrarDia`) y la fila se arma detrás de él. Siempre, al terminar:
//      lo que el cierre guardó como esperado es la suma del libro del día y no hay movimiento del día cerrado creado
//      después del cierre. Sin #185 la cuota no espera el candado: confirma mientras el cierre espera, y el cierre, con
//      su foto de antes, no la cuenta (la diferencia de la UAT era 1.500.000).
//
// Reloj fijado: `Date` vale AHORA (17/11/2026 15:00 en Buenos Aires), como t01-plata-postgres.test.ts.
// Esperados escritos a mano: proyecto con un ítem de $ 1.000 + un ítem de proveedor (costo $ 600, precio $ 800), IVA 21 %
// → venta (1.000 + 800) × 1,21 = $ 2.178, anticipo del cliente 50 % = $ 1.089; pagos al proveedor $ 300 + $ 300. La caja
// arranca con un ingreso de $ 5.000 en efectivo, para que el cierre cuente algo y el egreso no la deje en negativo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-17T18:00:00Z");
const HOY = "2026-11-17";
const INICIAL = 5000;
const ANTICIPO_CLIENTE = 1089;
const ANTICIPO_PROVEEDOR = 300;
const RECHAZO_DIA = /No se registró este (cobro|pago): la caja del .*17\/11\/2026 ya está cerrada.*Cierre del día/;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const { cerrarDia } = await import("@/lib/cierre-diario-actions");

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

  // La caja de A vacía, sin cierres ni turnos abiertos, con el ingreso inicial del día.
  await duenio.auditLog.deleteMany({ where: { tenantId: a.id, entity: { in: ["CierreDiario", "CierreMes"] } } });
  await duenio.cashMovement.deleteMany({ where: { tenantId: a.id } });
  await duenio.cashSession.updateMany({ where: { tenantId: a.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: new Date(AHORA) } });
  await duenio.cashMovement.create({ data: { tenantId: a.id, type: "INGRESO", method: "EFECTIVO", amount: INICIAL, reason: "Inicial MIA-083", occurredAt: new Date(AHORA - 3_600_000), createdBy: "test" } });

  // Proyecto confirmado con fecha, v1 aprobada, y su plan de cuotas regenerado por la app.
  const numero = (await duenio.proyecto.count()) + 800;
  const evento = new Date(AHORA + 30 * DIA);
  const proy = await duenio.proyecto.create({
    data: { tenantId: a.id, numero, clientId: a.clientes[0], nombre: `Stand MIA-083 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
    select: { id: true },
  });
  const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: proy.id, version: 1, estado: "APROBADO", token: `mia083-${proy.id}`, ivaPct: 21 }, select: { id: true } });
  const sup = await duenio.supplier.create({ data: { tenantId: a.id, name: `Proveedor MIA-083 ${numero}` }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Alfombra", cantidad: 1, costo: 600, precio: 800, supplierId: sup.id } });
  await enSesion(() => gestion.regenerarCuotas(a.id, proy.id));
  const cuotas = await duenio.proyectoCuota.findMany({ where: { proyectoId: proy.id, anuladoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true, tipo: true, monto: true, clave: true } });
  const cobro = cuotas.find((c) => c.tipo === "COBRO" && c.clave?.endsWith(":cliente:anticipo"));
  const pago = cuotas.find((c) => c.tipo === "PAGO" && c.clave?.endsWith(":anticipo"));
  assert.ok(cobro && pago, `el plan trae el anticipo del cliente y el del proveedor: ${JSON.stringify(cuotas)}`);
  assert.deepEqual([cobro.monto, pago.monto], [ANTICIPO_CLIENTE, ANTICIPO_PROVEEDOR], "a mano: 2.178 al 50 % y 600 al 50 %");
  const cuenta = await duenio.proyectoCuentaBanco.create({ data: { tenantId: a.id, nombre: `Banco MIA-083 ${numero}`, moneda: "ARS", saldo: 10_000 }, select: { id: true } });

  /** Lo que se mira antes y después: filas del libro, cobros, gastos, la cuota y el saldo de la cuenta. */
  const foto = async (cuotaId: string) => ({
    libro: await duenio.cashMovement.count({ where: { tenantId: a.id } }),
    pagos: await duenio.proyectoPago.count({ where: { tenantId: a.id } }),
    gastos: await duenio.proyectoGasto.count({ where: { tenantId: a.id } }),
    cuota: (await duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuotaId }, select: { pagadoEl: true } })).pagadoEl,
    saldoCuenta: (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id: cuenta.id }, select: { saldo: true } })).saldo,
  });
  const marcar = (cuotaId: string) => enSesion(() => ficha.marcarCuota(form({ id: cuotaId, medio: "EFECTIVO", cuenta: cuenta.id })));
  const cerrar = (declaradoEfectivo: number) => enSesion(() => cerrarDia(form({ day: HOY, declarado_EFECTIVO: String(declaradoEfectivo), note: "Cierre MIA-083" })));
  return { base, duenio, a, proyectoId: proy.id, cobro, pago, cuenta, foto, marcar, cerrar };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;

/** El cierre del día tal como quedó guardado, y el libro de A en ese momento, por medio. */
async function cierreYLibro(p: P) {
  const fila = await p.duenio.auditLog.findFirst({ where: { tenantId: p.a.id, action: "caja.cierre-diario", entity: "CierreDiario", entityId: HOY }, select: { createdAt: true, changes: true } });
  const changes = fila?.changes as { movimientos: number; porMedio: Record<string, { esperado: number }> } | undefined;
  const movimientos = await p.duenio.cashMovement.findMany({ where: { tenantId: p.a.id }, select: { type: true, method: true, amount: true, createdAt: true } });
  const libro: Record<string, number> = {};
  for (const m of movimientos) libro[m.method] = Math.round(((libro[m.method] ?? 0) + (m.type === "EGRESO" ? -m.amount : m.amount)) * 100) / 100;
  return { fila, changes, movimientos, libro };
}

/** La invariante de la UAT: lo que el cierre guardó como esperado es el libro del día, y nada del día entró después. */
async function libroIgualAlCierre(p: P, que: string) {
  const { fila, changes, movimientos, libro } = await cierreYLibro(p);
  assert.ok(fila && changes, `${que}: hay cierre del ${HOY}`);
  for (const [medio, { esperado }] of Object.entries(changes.porMedio)) {
    assert.equal(libro[medio] ?? 0, esperado, `${que}: ${medio}, el libro del día (${libro[medio] ?? 0}) = lo que el cierre guardó como esperado (${esperado})`);
  }
  assert.equal(movimientos.length, changes.movimientos, `${que}: el cierre contó todas las filas del libro del día`);
  const despues = movimientos.filter((m) => m.createdAt.getTime() > fila.createdAt.getTime());
  assert.deepEqual(despues, [], `${que}: ningún movimiento del día cerrado creado después del cierre`);
}

for (const tipo of ["cobro", "pago"] as const) {
  const caso = tipo === "cobro" ? "G1" : "G3";
  test(`${caso} · día cerrado con el cierre real: marcar en la ficha una cuota de ${tipo} rechaza con el texto del período cerrado; 0 filas, cuota sin marcar, cuenta igual, libro = cierre`, async (t) => {
    const p = await preparar(t);
    if (!p) return;
    const cuota = tipo === "cobro" ? p.cobro : p.pago;
    const rc = await p.cerrar(INICIAL);
    assert.equal(rc?.ok, true, `el cierre del día entra: ${JSON.stringify(rc)}`);
    const antes = await p.foto(cuota.id);
    assert.equal(antes.cuota, null);
    const r = await p.marcar(cuota.id);
    assert.equal(r.ok, false, `${tipo} en día cerrado: ${JSON.stringify(r)}`);
    assert.match(String((r as { error?: string }).error), RECHAZO_DIA, "el rechazo es el de periodo-cerrado-core.ts y dice qué hacer");
    assert.deepEqual(await p.foto(cuota.id), antes, "0 filas nuevas en el libro, cobros y gastos; la cuota sin marcar; el saldo de la cuenta igual");
    await libroIgualAlCierre(p, `${caso}`);
  });
}

/**
 * La fila del candado del cierre: un tercero (`h`) toma `cierre-dia:<negocio>` y las acciones arrancan detrás. Postgres
 * despierta a las que esperan en el orden en que llegaron. Una acción que no toma el candado (la cuota sin #185) no
 * espera: corre y confirma mientras el cierre sigue en la fila; eso es lo que la carrera tiene que poder mostrar, así
 * que acá no es un error.
 */
async function filaDelCandado(p: P, t: import("node:test").TestContext) {
  const abrir = async () => {
    const c = new pg.Client({ connectionString: p.base.urlDuenio });
    await c.connect();
    t.after(() => c.end().catch(() => {}));
    return c;
  };
  const h = await abrir();
  const espia = await abrir();
  await h.query("BEGIN");
  await h.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`cierre-dia:${p.a.id}`]);
  const esperando = async () =>
    (await espia.query(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`)).rows[0].n as number;
  /** Arranca `fn` y vuelve cuando se sumó a la fila del candado (uno más esperando que antes) o cuando terminó sin esperar. */
  const ponerEnLaFila = async <R>(que: string, fn: () => Promise<R>): Promise<{ corrida: Promise<R>; espero: boolean }> => {
    const enLaFila = (await esperando()) + 1;
    let termino = false;
    const corrida = fn().finally(() => (termino = true));
    corrida.catch(() => {});
    for (let i = 0; i < 400; i++) {
      if ((await esperando()) >= enLaFila) return { corrida, espero: true };
      if (termino) return { corrida, espero: false };
      await new Promise((r) => setTimeout(r, 25));
    }
    await h.query("ROLLBACK");
    assert.fail(`${que} ni esperó el candado ni terminó en 10 s`);
  };
  return { ponerEnLaFila, soltar: () => h.query("COMMIT") };
}

for (const tipo of ["cobro", "pago"] as const) {
  const importe = tipo === "cobro" ? ANTICIPO_CLIENTE : -ANTICIPO_PROVEEDOR;

  test(`G2 · carrera, cierre primero: el cierre real toma la fila y la cuota de ${tipo} marcada en la ficha se rechaza; el cierre = el libro del día`, async (t) => {
    const p = await preparar(t);
    if (!p) return;
    const cuota = tipo === "cobro" ? p.cobro : p.pago;
    const antes = await p.foto(cuota.id);
    const fila = await filaDelCandado(p, t);
    // Lo contado es lo que hay sin la cuota: el cierre llega primero.
    const { corrida: cierre } = await fila.ponerEnLaFila("el cierre del día", () => p.cerrar(INICIAL));
    const { corrida: marca } = await fila.ponerEnLaFila(`la cuota de ${tipo}`, () => p.marcar(cuota.id));
    await fila.soltar();
    const rc = await cierre;
    assert.equal(rc?.ok, true, JSON.stringify(rc));
    // La invariante primero: es lo que la UAT vio romperse (el cierre guardó un esperado que el libro ya no tenía).
    await libroIgualAlCierre(p, `cierre primero · ${tipo}`);
    const r = await marca;
    assert.equal(r.ok, false, `la cuota llegó después del cierre: ${JSON.stringify(r)}`);
    assert.match(String((r as { error?: string }).error), RECHAZO_DIA);
    assert.deepEqual(await p.foto(cuota.id), antes, "0 filas, la cuota sin marcar y la cuenta igual");
  });

  test(`G2 · carrera, asiento primero: la cuota de ${tipo} marcada en la ficha toma la fila, el cierre real espera y la cuenta`, async (t) => {
    const p = await preparar(t);
    if (!p) return;
    const cuota = tipo === "cobro" ? p.cobro : p.pago;
    const fila = await filaDelCandado(p, t);
    const { corrida: marca } = await fila.ponerEnLaFila(`la cuota de ${tipo}`, () => p.marcar(cuota.id));
    // Lo contado incluye la cuota: llegó primero. A mano: 5.000 + 1.089 = 6.089 (cobro) o 5.000 − 300 = 4.700 (pago).
    const { corrida: cierre } = await fila.ponerEnLaFila("el cierre del día", () => p.cerrar(INICIAL + importe));
    await fila.soltar();
    const r = await marca;
    assert.equal(r.ok, true, `la cuota llegó primero: asienta · ${JSON.stringify(r)}`);
    const rc = await cierre;
    assert.equal(rc?.ok, true, JSON.stringify(rc));
    await libroIgualAlCierre(p, `asiento primero · ${tipo}`);
    const { changes } = await cierreYLibro(p);
    assert.equal(changes?.porMedio.EFECTIVO.esperado, INICIAL + importe, "a mano: el cierre esperaba el inicial más la cuota");
    assert.equal(changes?.movimientos, 2, "el inicial y la cuota");
  });
}
