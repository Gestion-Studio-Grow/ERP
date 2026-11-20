// ============================================================================
// MIA-50 · tanda T08 (moneda, bancos y a cobrar), contra Postgres real: base efímera con TODAS las migraciones (M6 y M8
// incluidas), rol app_rls sin BYPASSRLS y las Server Actions reales con sesión. Esperados escritos a mano ANTES de
// correr (R7). Importes en pesos salvo donde dice centavos.
//
//  RLS    las 5 tablas de M6/M8 con política tenant_isolation y FORCE.
//  B/A    B no ve lo de A: historial del cambio, movimientos de cuenta, retenciones y enlaces (acciones, lecturas y SQL
//         directo como app_rls); B no concilia contra un cobro de A ni enlaza una factura de A.
//  CARRERA  el mismo extracto 2 veces a la vez → 3 movimientos (no 6); 5 movimientos a la vez contra el mismo cobro →
//         1; anular 5 veces a la vez un cobro con cuenta → el saldo vuelve 1 vez; el mismo cambio 5 veces a la vez → 1 fila.
//  C-O39  US$ 1 cobrado el 12/11 con el cambio del 10/11 ($ 1.000) → $ 1.000; se carga $ 2.000 el 15/11 → el cobro viejo
//         sigue en $ 1.000 y uno del 16/11 da $ 2.000; uno del 05/11 (sin cambio cargado antes) se rechaza y lo dice.
//  C-O38  cuenta con $ 10.000: cobro +500, pago de gasto −200 y cuota cobrada +100 → $ 10.400; los 3 movimientos del
//         extracto se concilian (cuota, cobro y pago); en sentido opuesto no; importar dos veces no duplica; anular el
//         cobro → $ 9.900 y su movimiento vuelve a estar libre.
//  C-O36  cuota de $ 100: entran 93 + 7 retenidos («Retención sufrida (sin clasificar)», el único tipo del catálogo) → cuota cobrada, caja +93, retenido 7, cobrado del proyecto
//         100; 95 + 7 sobre 100 se rechaza; anular el cobro anula también la retención y la cuota vuelve.
//  C-O35  cuota de $ 1.000 enlazada a la factura de $ 1.210 (tramo anticipo): facturado 1.210; cobro parcial de 400 →
//         cobrado 400 y le faltan 600; una segunda factura a la misma cuota no; la factura de otro negocio no existe.
//  C-O31  por defecto el cambio del costo es «el de la fecha del comprobante» y la cotización se carga a mano, con fecha:
//         comprobante del 10/11 de US$ 1.000 con el cambio de ese día ($ 1.000) imputado a P → real $ 1.000.000; uno del
//         05/11 (sin cambio cargado) se rechaza diciéndolo; la orden se paga con el cambio
//         de hoy $ 1.100 → caja −$ 1.100.000, diferencia de cambio $ 100.000 en Administración, real de P sigue igual.
//
// La base es una por archivo y los tests corren en orden: C-O39 va primero (antes de que otro cargue un cambio de USD).
// Reloj fijado: `Date` vale AHORA (19/11/2026 15:00 en Buenos Aires) en todo el archivo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";
import { CATALOGO } from "@/lib/proyectos/parametros/catalogo";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const AHORA = Date.parse("2026-11-19T18:00:00Z");
const TABLAS = ["ProyectoCambioDia", "ProyectoMovMoneda", "ProyectoMovCuenta", "ProyectoCobroRetencion", "ProyectoCuotaFactura"];
const RET = "Retención sufrida (sin clasificar)";

let serie = 0;
const sig = () => ++serie;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  mock.timers.enable({ apis: ["Date"], now: AHORA });
  t.after(() => mock.timers.reset());
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "12", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  if (!(await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, userId: a.recepcion.id } }))) {
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Administración T08", rol: "ADMINISTRACION" } });
  }

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const mb = await import("./moneda-bancos.server");
  const datos = await import("./datos.server");

  let numero = (await duenio.proyecto.count()) + 800;
  /** Proyecto confirmado, v1 APROBADA: 1 ítem de `precio` + IVA 21 %. */
  const proyecto = async (precio = 1_000_000, n: NegocioDePrueba = a) => {
    const evento = new Date(AHORA + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `Stand T08 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t08-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio } });
    return p.id;
  };
  const cuota = async (proyectoId: string, monto: number, n: NegocioDePrueba = a) =>
    (await duenio.proyectoCuota.create({ data: { tenantId: n.id, proyectoId, tipo: "COBRO", concepto: `Cuota T08 ${sig()}`, monto, moneda: "ARS", venceEl: new Date(AHORA + 5 * DIA), auto: false }, select: { id: true } })).id;
  const factura = async (total: number, n: NegocioDePrueba = a) =>
    (await duenio.invoice.create({ data: { tenantId: n.id, puntoVenta: 3, tipoComprobante: 6, concepto: 2, docTipo: 99, docNro: "0", fecha: "20261118", neto: total / 1.21, iva: total - total / 1.21, total, numero: sig() }, select: { id: true } })).id;
  const form = (campos: Record<string, string | string[]>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) for (const x of v) fd.append(k, x);
      else fd.set(k, v);
    }
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>, negocio: NegocioDePrueba = a): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(a.recepcion.id, fn);
  const enB = <R>(fn: () => Promise<R>) => como(b.duenia.id, fn, b);
  /** Las tablas nuevas tienen FORCE: el dueño de la base también lee con el negocio fijado. */
  const leer = <R>(fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>, tenantId: string = a.id) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  const ok = (r: unknown) => assert.equal((r as { ok: boolean }).ok, true, JSON.stringify(r));
  const cuenta = async (saldo: number, n: NegocioDePrueba = a) => {
    const nombre = `Banco T08 ${sig()}`;
    ok(await como(n.duenia.id, () => empresa.crearCuenta(form({ nombre, moneda: "ARS", saldo: String(saldo) })), n));
    return (await duenio.proyectoCuentaBanco.findFirstOrThrow({ where: { tenantId: n.id, nombre }, select: { id: true } })).id;
  };
  const saldo = async (id: string) => (await duenio.proyectoCuentaBanco.findUniqueOrThrow({ where: { id }, select: { saldo: true } })).saldo;
  const cambio = (moneda: string, fecha: string, porUnidad: string) => enSesion(() => empresa.guardarTipoCambio(form({ moneda, fecha, porUnidad })));
  /** Un cobro suelto: devuelve el id del cobro nuevo. */
  const cobrar = async (proyectoId: string, campos: Record<string, string>) => {
    const antes = new Set((await duenio.proyectoPago.findMany({ where: { proyectoId }, select: { id: true } })).map((x) => x.id));
    const r = await enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", ...campos })));
    ok(r);
    return (await duenio.proyectoPago.findMany({ where: { proyectoId }, select: { id: true } })).map((x) => x.id).find((id) => !antes.has(id))!;
  };
  return { base, duenio, a, b, acciones, ficha, empresa, comp, ordenes, mb, datos, proyecto, cuota, factura, form, como, enSesion, admin, enB, leer, ok, cuenta, saldo, cambio, cobrar };
}

test("RLS · las 5 tablas de M6/M8 tienen tenant_isolation y FORCE ROW LEVEL SECURITY", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const cli = new pg.Client({ connectionString: p.base.urlDuenio });
  await cli.connect();
  t.after(() => cli.end().catch(() => {}));
  const { rows } = await cli.query(
    `SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS force, (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS pol
     FROM pg_class c WHERE c.relname = ANY($1) AND c.relkind = 'r' ORDER BY 1`,
    [TABLAS],
  );
  assert.equal(rows.length, 5);
  for (const r of rows) assert.deepEqual([r.rls, r.force, r.pol], [true, true, 1], r.tabla);
});

test("C-O39 · el cobro viejo guarda su cambio; uno nuevo usa el nuevo; sin cambio para la fecha, rechazo que lo dice", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  p.ok(await p.cambio("USD", "2026-11-10", "1000"));
  const viejo = await p.cobrar(pr, { monto: "1", moneda: "USD", fecha: "2026-11-12" });
  const fotoViejo = await p.leer((tx) => tx.proyectoMovMoneda.findFirstOrThrow({ where: { origenTipo: "COBRO", origenId: viejo } }));
  assert.deepEqual([fotoViejo.moneda, Number(fotoViejo.originalCentavos), Number(fotoViejo.cambioCentavos), Number(fotoViejo.pesosCentavos), fotoViejo.cambioDia], ["USD", 100, 100000, 100000, "2026-11-10"]);
  assert.equal((await p.duenio.proyectoPago.findUniqueOrThrow({ where: { id: viejo }, select: { monto: true } })).monto, 1000);
  // Cambio nuevo el 15/11: el viejo no se mueve; uno del 16/11 sale a 2.000.
  p.ok(await p.cambio("USD", "2026-11-15", "2000"));
  const otraVez = await p.leer((tx) => tx.proyectoMovMoneda.findFirstOrThrow({ where: { origenTipo: "COBRO", origenId: viejo } }));
  assert.equal(Number(otraVez.pesosCentavos), 100000, "idéntico");
  assert.equal((await p.duenio.proyectoPago.findUniqueOrThrow({ where: { id: viejo }, select: { monto: true } })).monto, 1000);
  const nuevo = await p.cobrar(pr, { monto: "1", moneda: "USD", fecha: "2026-11-16" });
  assert.equal((await p.duenio.proyectoPago.findUniqueOrThrow({ where: { id: nuevo }, select: { monto: true } })).monto, 2000);
  // Del 05/11: no hay cambio ese día ni antes.
  const sin = await p.enSesion(() => p.acciones.registrarCobro(p.form({ proyectoId: pr, medio: "TRANSFERENCIA", monto: "1", moneda: "USD", fecha: "2026-11-05" })));
  assert.equal(sin.ok, false);
  assert.match((sin as { error: string }).error, /No hay cambio de USD cargado para el 05\/11\/2026/);
  // Un cambio para mañana no se carga.
  assert.equal((await p.cambio("USD", "2026-11-20", "2100")).ok, false);
  // El historial: 2 días, del más nuevo al más viejo; el «de hoy» es el último (2.000).
  const h = await p.enSesion(() => p.mb.historialDelCambio(p.a.id, "USD"));
  assert.deepEqual(h.map((x) => [x.dia, x.centavosPorUnidad]), [["2026-11-15", 200000], ["2026-11-10", 100000]]);
  assert.equal((await p.duenio.proyectoTipoCambio.findFirstOrThrow({ where: { tenantId: p.a.id, moneda: "USD" }, select: { porUnidad: true } })).porUnidad, 2000);
  // Corregir un día viejo no pisa el «de hoy».
  p.ok(await p.cambio("USD", "2026-11-10", "1010"));
  assert.equal((await p.duenio.proyectoTipoCambio.findFirstOrThrow({ where: { tenantId: p.a.id, moneda: "USD" }, select: { porUnidad: true } })).porUnidad, 2000);
});

test("B no ve lo de A · cambio, cuenta, retenciones y enlaces (acciones, lecturas y SQL como app_rls)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  p.ok(await p.cambio("USD", "2026-11-18", "1000"));
  const pr = await p.proyecto();
  const cta = await p.cuenta(0);
  // La cuota primero: un cobro suelto anterior la cubriría (cobranza-core reparte lo cobrado aparte por vencimiento).
  const q = await p.cuota(pr, 100);
  p.ok(await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", retTipo: RET, retImporte: "7" }))));
  const cobro = await p.cobrar(pr, { monto: "500", cuentaId: cta });
  const q2 = await p.cuota(pr, 1000);
  const fa = await p.factura(1210);
  p.ok(await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q2, facturaId: fa, tramo: "ANTICIPO" }))));
  // A sí lo ve (si no, el resto del test no prueba nada).
  assert.ok((await p.enSesion(() => p.mb.historialDelCambio(p.a.id, "USD"))).some((h) => h.dia === "2026-11-18"));
  for (const tabla of TABLAS) {
    const n = await p.leer((tx) => tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "tenantId" = $1`, p.a.id));
    assert.ok(n[0].n > 0, `${tabla}: A tiene filas`);
  }
  // B, con el id de A: nada.
  assert.equal((await p.enB(() => p.mb.historialDelCambio(p.a.id, "USD"))).length, 0);
  assert.equal((await p.enB(() => p.mb.movimientosParaConciliar(p.a.id))).length, 0);
  assert.equal((await p.enB(() => p.mb.aCobrarPorCuota(p.a.id, [q, q2]))).get(q2)?.facturado ?? 0, 0);
  // B no concilia contra el cobro de A ni enlaza la factura de A.
  const ctaB = await p.cuenta(0, p.b);
  p.ok(await p.enB(() => p.empresa.importarExtracto(p.form({ cuentaId: ctaB, csv: "fecha;descripcion;importe\n18/11/2026;Deposito;500" }))));
  const movB = await p.duenio.proyectoMovBanco.findFirstOrThrow({ where: { cuentaId: ctaB }, select: { id: true } });
  assert.deepEqual(await p.enB(() => p.empresa.conciliarMovimiento(p.form({ id: movB.id, origenTipo: "COBRO", origenId: cobro }))), { ok: false, error: "Ese cobro no existe o está anulado." });
  const prB = await p.proyecto(1000, p.b);
  const qB = await p.cuota(prB, 100, p.b);
  assert.deepEqual(await p.enB(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: qB, facturaId: fa, tramo: "SALDO" }))), { ok: false, error: "Esa factura no existe." });
  // SQL directo como app_rls con el negocio B: 0 filas de A en las 5 tablas; sin negocio fijado, tampoco.
  const cli = new pg.Client({ connectionString: p.base.urlApp });
  await cli.connect();
  t.after(() => cli.end().catch(() => {}));
  await cli.query("BEGIN");
  await cli.query("SELECT set_config('app.current_tenant_id', $1, true)", [p.b.id]);
  for (const tabla of TABLAS) {
    const { rows }: { rows: { n: number }[] } = await cli.query(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "tenantId" = $1`, [p.a.id]);
    assert.equal(rows[0].n, 0, `${tabla}: B no ve filas de A`);
  }
  await cli.query("ROLLBACK");
  for (const tabla of TABLAS) {
    const { rows }: { rows: { n: number }[] } = await cli.query(`SELECT count(*)::int AS n FROM "${tabla}"`);
    assert.equal(rows[0].n, 0, `${tabla}: sin negocio fijado, 0 filas`);
  }
});

test("CARRERAS · extracto doble a la vez, 5 conciliaciones al mismo cobro, 5 anulaciones, el mismo cambio 5 veces", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const cta = await p.cuenta(1000);
  // 3 líneas, dos iguales (son dos depósitos distintos del mismo día): a la vez dos veces → 3 movimientos.
  const csv = "fecha;descripcion;importe\n18/11/2026;Deposito cliente;500\n18/11/2026;Deposito cliente;500\n18/11/2026;Comision;-15,50";
  const dos = await Promise.all([1, 2].map(() => p.enSesion(() => p.empresa.importarExtracto(p.form({ cuentaId: cta, csv })))));
  dos.forEach(p.ok);
  assert.equal(await p.duenio.proyectoMovBanco.count({ where: { cuentaId: cta } }), 3, "3, no 6");
  assert.equal(dos.reduce((s, r) => s + (r as { importadas: number }).importadas, 0), 3, "lo que dice cada respuesta suma 3");
  // Una tercera vez, sola: 0 nuevas.
  const tercera = await p.enSesion(() => p.empresa.importarExtracto(p.form({ cuentaId: cta, csv })));
  assert.deepEqual(tercera, { ok: true, importadas: 0, repetidas: 3, ilegibles: 0 });
  // 5 movimientos (+500) a la vez contra el mismo cobro de 500: entra 1.
  const pr = await p.proyecto();
  const cobro = await p.cobrar(pr, { monto: "500", cuentaId: cta });
  assert.equal(await p.saldo(cta), 1500, "a mano: 1.000 + 500");
  const csv5 = ["fecha;descripcion;importe", ...Array.from({ length: 5 }, (_, i) => `19/11/2026;Transferencia ${i};500`)].join("\n");
  p.ok(await p.enSesion(() => p.empresa.importarExtracto(p.form({ cuentaId: cta, csv: csv5 }))));
  const cinco = await p.duenio.proyectoMovBanco.findMany({ where: { cuentaId: cta, descripcion: { startsWith: "Transferencia" } }, select: { id: true } });
  assert.equal(cinco.length, 5);
  const r5 = await Promise.all(cinco.map((m) => p.admin(() => p.empresa.conciliarMovimiento(p.form({ id: m.id, origenTipo: "COBRO", origenId: cobro })))));
  assert.equal(r5.filter((r) => r.ok).length, 1, JSON.stringify(r5));
  assert.equal(await p.duenio.proyectoMovBanco.count({ where: { origenTipo: "COBRO", origenId: cobro } }), 1);
  // Anular el cobro 5 veces a la vez: el saldo vuelve una sola vez (1.500 → 1.000), no cinco.
  const an = await Promise.all(Array.from({ length: 5 }, () => p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: cobro })))));
  assert.ok(an.some((r) => r.ok), JSON.stringify(an));
  assert.equal(await p.saldo(cta), 1000);
  const mc = await p.leer((tx) => tx.proyectoMovCuenta.findMany({ where: { origenTipo: "COBRO", origenId: cobro }, select: { importeCentavos: true, anuladoEl: true } }));
  assert.equal(mc.length, 1);
  assert.equal(Number(mc[0].importeCentavos), 50000);
  assert.ok(mc[0].anuladoEl);
  // El mismo cambio, el mismo día, 5 veces a la vez: 1 fila.
  const c5 = await Promise.all(Array.from({ length: 5 }, () => p.cambio("USD", "2026-11-17", "1050")));
  c5.forEach(p.ok);
  assert.equal(await p.leer((tx) => tx.proyectoCambioDia.count({ where: { tenantId: p.a.id, moneda: "USD", dia: "2026-11-17" } })), 1);
});

test("C-O38 · cuenta en todo movimiento; saldo a mano; conciliar contra cuota, cobro y pago; anular devuelve; extracto doble", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const cta = await p.cuenta(10000);
  const pr = await p.proyecto();
  const q = await p.cuota(pr, 100);
  p.ok(await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", cuenta: cta }))));
  const cobro = await p.cobrar(pr, { monto: "500", cuentaId: cta });
  const gasto = await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: pr, descripcion: "Flete T08", neto: 200, iva: 0 }, select: { id: true } });
  p.ok(await p.enSesion(() => p.acciones.pagarGasto(p.form({ id: gasto.id, medio: "TRANSFERENCIA", cuentaId: cta }))));
  assert.equal(await p.saldo(cta), 10400, "a mano: 10.000 + 500 − 200 + 100");
  const movs = await p.leer((tx) => tx.proyectoMovCuenta.findMany({ where: { cuentaId: cta }, select: { origenTipo: true, importeCentavos: true } }));
  assert.deepEqual(movs.map((m) => [m.origenTipo, Number(m.importeCentavos)]).sort(), [["COBRO", 50000], ["PAGO", -20000]]);
  // El extracto de prueba: los 3 movimientos.
  const csv = "fecha;descripcion;importe\n19/11/2026;Deposito;500\n19/11/2026;Transferencia flete;-200\n19/11/2026;Cuota cliente;100";
  p.ok(await p.enSesion(() => p.empresa.importarExtracto(p.form({ cuentaId: cta, csv }))));
  assert.deepEqual(await p.enSesion(() => p.empresa.importarExtracto(p.form({ cuentaId: cta, csv }))), { ok: true, importadas: 0, repetidas: 3, ilegibles: 0 }, "dos veces no duplica");
  const ext = await p.duenio.proyectoMovBanco.findMany({ where: { cuentaId: cta }, select: { id: true, importe: true } });
  const de = (importe: number) => ext.find((m) => m.importe === importe)!.id;
  // Sentido opuesto: el −200 contra el cobro, no.
  assert.equal((await p.admin(() => p.empresa.conciliarMovimiento(p.form({ id: de(-200), origenTipo: "COBRO", origenId: cobro })))).ok, false);
  p.ok(await p.admin(() => p.empresa.conciliarMovimiento(p.form({ id: de(500), origenTipo: "COBRO", origenId: cobro }))));
  p.ok(await p.admin(() => p.empresa.conciliarMovimiento(p.form({ id: de(-200), origenTipo: "PAGO", origenId: gasto.id }))));
  p.ok(await p.admin(() => p.empresa.conciliarMovimiento(p.form({ id: de(100), cuotaId: q }))));
  const origenes = await p.enSesion(() => p.mb.origenesDeMovimientos(p.a.id, ext.map((m) => m.id)));
  assert.equal(origenes.size, 2, "cobro y pago; la cuota va por su columna");
  assert.equal(await p.duenio.proyectoMovBanco.count({ where: { cuentaId: cta, cuotaId: null, origenTipo: null } }), 0, "los 3 conciliados");
  // Anular el cobro → el saldo vuelve a 9.900 y el movimiento de la cuenta queda anulado.
  p.ok(await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: cobro }))));
  assert.equal(await p.saldo(cta), 9900, "a mano: 10.400 − 500");
  // Un cobro anulado ya no es candidato, y desconciliar suelta el movimiento.
  assert.equal((await p.enSesion(() => p.mb.movimientosParaConciliar(p.a.id))).some((m) => m.origenId === cobro), false);
  p.ok(await p.admin(() => p.empresa.desconciliarMovimiento(p.form({ id: de(500) }))));
  assert.equal(await p.duenio.proyectoMovBanco.count({ where: { id: de(500), origenTipo: null } }), 1);
});

test("C-O36 · 93 al banco + 7 retenidos: cuota cobrada, caja +93, retenido 7, cobrado 100; pasarse se rechaza", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const q = await p.cuota(pr, 100);
  // 95 + 7 > 100: no.
  const pasa = await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", monto: "95", retTipo: RET, retImporte: "7" })));
  assert.equal(pasa.ok, false);
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: pr } }), 0);
  // Un tipo fuera del catálogo: no.
  assert.equal((await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", retTipo: "Otra", retImporte: "7" })))).ok, false);
  p.ok(await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", retTipo: [RET, ""], retImporte: ["7", ""], retCertificado: ["CERT-T08", ""] }))));
  assert.ok((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } })).pagadoEl, "cuota cobrada");
  const pagos = await p.duenio.proyectoPago.findMany({ where: { proyectoId: pr, anuladoEl: null }, select: { id: true, monto: true, medio: true } });
  assert.deepEqual(pagos.map((x) => [x.medio, x.monto]).sort(), [["RETENCION", 7], ["TRANSFERENCIA", 93]]);
  const banco = pagos.find((x) => x.medio === "TRANSFERENCIA")!;
  const caja = await p.duenio.cashMovement.findMany({ where: { proyectoPagoId: { in: pagos.map((x) => x.id) } }, select: { amount: true, proyectoPagoId: true } });
  assert.deepEqual(caja.map((c) => [c.proyectoPagoId, Number(c.amount)]), [[banco.id, 93]], "a la caja entran 93; la retención no");
  // La ficha muestra la nota del cobro RETENCION: sólo el tipo del catálogo, sin nombres de impuestos.
  const notaRet = await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: pr, medio: "RETENCION" }, select: { nota: true } });
  assert.equal(notaRet.nota, RET, "la ficha dice «Retención sufrida (sin clasificar)»");
  const ret = await p.leer((tx) => tx.proyectoCobroRetencion.findMany({ where: { cuotaId: q }, select: { tipo: true, importeCentavos: true, certificado: true, cuentaComoCobrado: true, provisional: true, anuladoEl: true } }));
  assert.deepEqual(ret.map((r) => [r.tipo, Number(r.importeCentavos), r.certificado, r.cuentaComoCobrado, r.provisional, r.anuladoEl]), [[RET, 700, "CERT-T08", true, true, null]], "provisional: el parámetro lo es");
  const ac = (await p.enSesion(() => p.mb.aCobrarPorCuota(p.a.id, [q]))).get(q)!;
  assert.deepEqual([ac.cobrado, ac.retenido], [100, 7]);
  // La retención sola no se anula: se anula con su cobro, y la cuota vuelve.
  assert.equal((await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pagos.find((x) => x.medio === "RETENCION")!.id })))).ok, false);
  p.ok(await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: banco.id }))));
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: pr, anuladoEl: null } }), 0, "las dos anuladas");
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } })).pagadoEl, null, "la cuota vuelve a esperar");
  const ret2 = await p.leer((tx) => tx.proyectoCobroRetencion.findFirstOrThrow({ where: { cuotaId: q }, select: { anuladoEl: true } }));
  assert.ok(ret2.anuladoEl);
});

test("C-O35 · cuota ↔ factura por tramo: facturado y cobrado a mano; parcial deja saldo; una por cuota; la de otro no", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const q = await p.cuota(pr, 1000);
  const fa = await p.factura(1210);
  assert.equal((await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q, facturaId: fa, tramo: "OTRO" })))).ok, false);
  p.ok(await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q, facturaId: fa, tramo: "ANTICIPO" }))));
  const fb = await p.factura(500);
  assert.deepEqual(await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q, facturaId: fb, tramo: "SALDO" }))), { ok: false, error: "Esa cuota ya tiene una factura enlazada. Desenlazala primero." });
  // Dos enlaces a la vez a otra cuota: entra 1.
  const q2 = await p.cuota(pr, 500);
  const dos = await Promise.all([fa, fb].map((f) => p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q2, facturaId: f, tramo: "SALDO" })))));
  assert.equal(dos.filter((r) => r.ok).length, 1, JSON.stringify(dos));
  // Cobro parcial de 400: cobrado 400 y a la cuota le faltan 600.
  p.ok(await p.enSesion(() => p.ficha.marcarCuota(p.form({ id: q, medio: "TRANSFERENCIA", monto: "400" }))));
  const ac = (await p.enSesion(() => p.mb.aCobrarPorCuota(p.a.id, [q]))).get(q)!;
  assert.deepEqual([ac.tramo, ac.facturado, ac.cobrado, ac.retenido, 1000 - ac.cobrado], ["ANTICIPO", 1210, 400, 0, 600]);
  // Una cuota de pago no lleva factura.
  const qp = (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: pr, tipo: "PAGO", concepto: "Pago T08", monto: 10, moneda: "ARS", venceEl: new Date(AHORA + DIA), auto: false }, select: { id: true } })).id;
  assert.equal((await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: qp, facturaId: fb, tramo: "SALDO" })))).ok, false);
  // Desenlazar y volver a enlazar con otra.
  p.ok(await p.enSesion(() => p.empresa.desenlazarCuotaFactura(p.form({ cuotaId: q }))));
  p.ok(await p.enSesion(() => p.empresa.enlazarCuotaFactura(p.form({ cuotaId: q, facturaId: fb, tramo: "SALDO" }))));
  assert.equal((await p.enSesion(() => p.mb.aCobrarPorCuota(p.a.id, [q]))).get(q)!.facturado, 500);
});

test("C-O31 · costo en US$ al cambio del comprobante; la diferencia del pago va a Administración, no al proyecto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = (await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `Proveedor T08 ${sig()}` }, select: { id: true } })).id;
  // El catálogo trae el valor del plan, provisional: el cambio del costo es el del día del comprobante y la cotización
  // del proyecto la carga a mano, con fecha, Administración.
  const def = (clave: string) => CATALOGO.find((d) => d.clave === clave);
  assert.deepEqual([def("moneda.cambioDelCosto")?.rubro, def("moneda.cambioDelCosto")?.provisional], ["DEL_COMPROBANTE", true]);
  assert.deepEqual([def("moneda.cotizacionDelProyecto")?.rubro, def("moneda.cotizacionDelProyecto")?.provisional], ["A_MANO_CON_FECHA", true]);
  // Sin cambio de USD cargado para el 05/11 (ni antes): rechazo que lo dice, aunque se escriba uno a mano.
  const sinCambio = await p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, fecha: "2026-11-05", tipo: "C", numero: `0001-${String(sig()).padStart(8, "0")}`, neto: "1000", iva: "0", total: "1000", moneda: "USD", cambio: "999", destino: pr, categoria: "Catering" })));
  assert.equal(sinCambio.ok, false, "sin cambio para la fecha del comprobante: no");
  assert.match((sinCambio as { error: string }).error, /No hay cambio de USD cargado/);
  // Administración carga el cambio del 10/11 ($ 1.000); el comprobante de ese día lo toma solo: US$ 1.000 → $ 1.000.000.
  p.ok(await p.cambio("USD", "2026-11-10", "1000"));
  const r = await p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, fecha: "2026-11-10", tipo: "C", numero: `0001-${String(sig()).padStart(8, "0")}`, neto: "1000", iva: "0", total: "1000", moneda: "USD", destino: pr, categoria: "Catering" })));
  p.ok(r);
  const cid = (r as unknown as { id: string }).id;
  const foto = await p.leer((tx) => tx.proyectoMovMoneda.findFirstOrThrow({ where: { origenTipo: "COMPROBANTE", origenId: cid } }));
  assert.deepEqual([Number(foto.cambioCentavos), Number(foto.pesosCentavos), foto.cambioDia, foto.criterio, foto.criterioProvisional], [100000, 100000000, "2026-11-10", "DEL_COMPROBANTE", true]);
  const real = async () => (await p.enSesion(() => p.datos.fichaProyecto(pr)))!.real.costoReal;
  assert.equal(await real(), 1_000_000, "del comprobante: 1.000 × 1.000");
  // Hoy el dólar está a 1.100: la orden por el total sale a $ 1.100.000 y la diferencia (100.000) va a Administración.
  p.ok(await p.cambio("USD", "2026-11-19", "1100"));
  const o = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: cid, cuotaId: null, importeCentavos: 100000 }] }));
  p.ok(o);
  const oid = (o as { id: string }).id;
  // MIA-199 · P6: por transferencia, con cuentas en el negocio, el pago dice de cuál sale.
  const banco = await p.cuenta(2_000_000);
  p.ok(await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: oid, cuentaId: banco }))));
  const egresos = await p.duenio.cashMovement.findMany({ where: { proyectoOrdenPagoId: oid }, select: { type: true, amount: true } });
  assert.deepEqual(egresos.map((e) => [e.type, Number(e.amount)]), [["EGRESO", 1_100_000]]);
  const dif = await p.enSesion(() => p.mb.diferenciasDeCambio(p.a.id));
  assert.equal(dif.totalCentavos, 10_000_000, "1.000 × (1.100 − 1.000) = $ 100.000");
  assert.equal(await real(), 1_000_000, "la defensa del proyecto no cambia al pagar");
  // Anular la orden: su diferencia deja de contar.
  p.ok(await p.admin(() => p.ordenes.anularOrden(p.form({ id: oid }))));
  assert.equal((await p.enSesion(() => p.mb.diferenciasDeCambio(p.a.id))).totalCentavos, 0);
});
