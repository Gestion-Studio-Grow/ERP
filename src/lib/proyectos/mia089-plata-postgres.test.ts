// ============================================================================
// GSG-MIA-089 (construye GSG-MIA-092) · plata de Proyectos de MIA, contra Postgres de verdad (base efímera migrada, rol
// app_rls sin BYPASSRLS, Server Actions con sesión). Criterios: Factory-GSG `00-ESTADO/certificacion/GSG-MIA-089.md`.
//
//  V1  ir y volver de etapa no toca una cuota que ya fue firme (vencimiento, monto, estado) y «Cobros vencidos» no baja;
//      con un cobro registrado no se vuelve antes de Confirmado (pregunta 1 = A, provisional a confirmar por el dueño).
//  V2  perdido: no queda nada por cobrar en ninguna pantalla (pregunta 2 = A) y el servidor no cobra ni marca.
//  V3  reabrir, también soltando la tarjeta en otra columna, vuelve a la etapa que tenía (pregunta 3 = A) con sus cuotas.
//  V4  carreras con dos conexiones, en los dos órdenes, detrás del candado de la cobranza.
//  V6  un gasto directo sin pagar está en «A pagar» de Administración por lo mismo que en Rentabilidad.
//  V7  el mismo envío dos veces (o diez a la vez) deja una sola cuota; dos cuotas iguales de envíos distintos, dos.
//  V8a cambiar el tipo de cambio no cambia nada de lo ya cobrado.
//  ADV-7 (MIA-107) un cobro cargado a mano en Pedido o Presupuesto, y después perdido, no queda pendiente en Administración.
//  MIA-111 Bancos, con un depósito del mismo importe que el cobro de un perdido: no lo propone ni ofrece «Marcar cobrada».
// Las fechas son fijas (26/10/2026): el resultado no depende del reloj.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ETAPAS } from "./core";
import { generaCuotas } from "./gestion-core";
import { PERDIDO_NO_COBRA } from "./ficha-core";
import { ofreceMarcarConciliada, pasaFiltro, propuestasDeConciliacion } from "./empresa-core";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
/** El vencimiento firme de la seña del caso PRY-098 (26/10), ya vencido. */
const VENCIO = new Date("2026-10-26T12:00:00Z");
const EVENTO = new Date("2027-03-10T12:00:00Z");

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

/** Corre `pedidos` a la vez, en fila detrás del candado `clave`: cada uno sale recién cuando el anterior quedó trabado. */
async function enFila<T>(base: BaseEfimera, clave: string, pedidos: readonly (() => Promise<T>)[]): Promise<T[]> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [clave]);
    const enCurso: Promise<T>[] = [];
    try {
      for (let i = 0; i < pedidos.length; i++) {
        let termino = false;
        const p = pedidos[i]();
        p.then(() => (termino = true), () => (termino = true));
        enCurso.push(p);
        const hasta = performance.now() + PLAZO_MS;
        while ((await trabados(c, clave)) < i + 1) {
          if (termino) assert.fail(`el pedido ${i + 1} terminó sin trabarse en «${clave}»: ${JSON.stringify(await p.catch((e: unknown) => String(e)))}`);
          if (performance.now() > hasta) assert.fail(`el pedido ${i + 1} no llegó al candado «${clave}»`);
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
  Object.assign(process.env as Record<string, string | undefined>, { DB_CONNECTION_LIMIT: "14" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  await duenio.auditLog.deleteMany({ where: { tenantId: a.id, entity: { in: ["CierreDiario", "CierreMes"] } } });
  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const gestion = await import("./gestion.server");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const { configProyectos, reporteProyectos } = await import("./datos.server");
  const { recuadrosDeCuotas, proyectosConNumeros, cashflowDeEmpresa } = await import("./empresa.server");
  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const enSesion = async <R>(fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  let numero = (await duenio.proyecto.count()) + 700;
  /**
   * Proyecto aprobado por $ 1.210 (1.000 + IVA 21 %): anticipo del cliente 50 % = $ 605, con sus cuotas. En dólares, el
   * ítem se lista en pesos ($ 1.000.000) y la venta queda en USD al cambio del día: con 1.000, USD 1.210 y seña USD 605.
   */
  const proyecto = async (etapa = "APROBADO", moneda = "ARS") => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand 089 ${numero}`, servicio: "ARQUITECTURA", etapa, moneda, fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `m89-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: moneda === "USD" ? 1_000_000 : 1000 } });
    await enSesion(() => gestion.regenerarCuotas(a.id, p.id));
    return p.id;
  };
  const anticipo = (proyectoId: string) => duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId, clave: { endsWith: ":cliente:anticipo" } }, select: { id: true, monto: true, venceEl: true, prevista: true, pagadoEl: true, anuladoEl: true } });
  /** Foto de las cuotas de un proyecto (clave, monto, vencimiento y estado), ordenada. */
  const foto = async (proyectoId: string) =>
    JSON.stringify(await duenio.proyectoCuota.findMany({ where: { proyectoId }, orderBy: [{ clave: "asc" }, { createdAt: "asc" }], select: { clave: true, tipo: true, monto: true, venceEl: true, prevista: true, pagadoEl: true, anuladoEl: true } }));
  const etapa = async (id: string) => duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { etapa: true, perdidoEl: true } });
  const mover = (id: string, destino: string, motivo?: string) => enSesion(() => ficha.moverProyecto({ id, destino, motivo }));
  const marcar = (id: string) => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA" })));
  const cobrar = (proyectoId: string, monto: number) => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto) })));
  const porCobrar = (proyectoId: string) =>
    enSesion(async () => {
      const [config, tc] = await Promise.all([configProyectos(a.id), tiposDeCambio(a.id)]);
      return (await cobranzasDelNegocio(a.id, tc, config.margenPct, [proyectoId])).get(proyectoId)!.porCobrar;
    });
  const administracion = () => enSesion(() => recuadrosDeCuotas(a.id));
  const rentabilidad = async (proyectoId: string) => (await enSesion(() => reporteProyectos())).find((p) => p.id === proyectoId)!;
  const direccion = async (proyectoId: string) => (await enSesion(() => proyectosConNumeros(a.id))).find((p) => p.id === proyectoId)!;
  /** Egresos a proveedores del mes en curso en el cashflow de la empresa (incluye lo vencido). */
  const cashflowProveedores = async () => (await enSesion(() => cashflowDeEmpresa(a.id))).proyeccion[0]!.proveedores;
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, acciones, ficha, empresa, gestion, form, enSesion, proyecto, anticipo, foto, etapa, mover, marcar, cobrar, porCobrar, administracion, rentabilidad, direccion, cashflowProveedores, claveCobranza };
}

test("V1 · Confirmado → Lead → Confirmado sin cobros: la seña firme y vencida (26/10) conserva vencimiento, monto y estado, y «Cobros vencidos» no baja", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const s = await p.anticipo(id);
  await p.duenio.proyectoCuota.update({ where: { id: s.id }, data: { venceEl: VENCIO } });
  const antes = await p.foto(id);
  const vencidosAntes = (await p.administracion()).resumen;
  assert.equal((await p.mover(id, "PEDIDO")).ok, true);
  const enLead = await p.anticipo(id);
  assert.equal(enLead.venceEl.toISOString(), VENCIO.toISOString(), "en Lead la seña firme no cambia de fecha");
  assert.equal(enLead.prevista, false, "en Lead la seña que ya fue firme sigue firme");
  assert.equal((await p.mover(id, "APROBADO")).ok, true);
  assert.equal(await p.foto(id), antes, "ida y vuelta: las cuotas quedan como estaban");
  const despues = (await p.administracion()).resumen;
  assert.equal(despues.cobrosVencidos, vencidosAntes.cobrosVencidos, "«Cobros vencidos» (monto) no baja sin cobrar");
  assert.equal(despues.cantCobrosVencidos, vencidosAntes.cantCobrosVencidos, "«Cobros vencidos» (cantidad) no baja sin cobrar");
});

test("V1 · con un cobro registrado no se vuelve antes de Confirmado: 0 filas cambiadas y lo dice", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PRODUCCION");
  const s = await p.anticipo(id);
  assert.equal((await p.marcar(s.id)).ok, true);
  const antes = await p.foto(id);
  const r = await p.mover(id, "PEDIDO");
  assert.equal(r.ok, false, "rechaza el retroceso con plata cobrada");
  assert.match((r as { error: string }).error, /cobro|pago/i);
  assert.deepEqual(await p.etapa(id), { etapa: "PRODUCCION", perdidoEl: null });
  assert.equal(await p.foto(id), antes);
  // Entre etapas con cuotas se puede (Producción → Confirmado) y no toca nada de lo firme.
  assert.equal((await p.mover(id, "APROBADO")).ok, true);
  assert.equal(await p.foto(id), antes);
});

test("V2 · perdido con la seña cobrada: nada por cobrar en la fuente única, Administración y Rentabilidad; el servidor no cobra ni marca", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const s = await p.anticipo(id);
  assert.equal((await p.marcar(s.id)).ok, true);
  const manual = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "COBRO", concepto: "Saldo a mano", monto: 100, moneda: "ARS", venceEl: VENCIO, auto: false }, select: { id: true } });
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  assert.notEqual((await p.etapa(id)).perdidoEl, null);
  assert.equal(await p.porCobrar(id), 0, "fuente única: un perdido no tiene nada por cobrar");
  const adm = await p.administracion();
  const delProyecto = adm.cuotas.filter((c) => c.proyectoId === id).reduce((x, c) => x + c.pendiente, 0) + adm.sinCalendario.filter((f) => f.proyectoId === id).reduce((x, f) => x + f.pesos, 0);
  assert.equal(delProyecto, 0, "Administración: nada pendiente del perdido");
  const fila = await p.rentabilidad(id);
  assert.equal(fila.porCobrar, 0, "Rentabilidad: nada por cobrar del perdido");
  assert.equal(fila.cobrado, 605, "lo cobrado sigue a la vista como cobrado");
  const dir = await p.direccion(id);
  assert.equal(dir.vencido, 0, "Dirección: un perdido no tiene cobros vencidos (la cuota a mano vencida no cuenta)");
  assert.equal(dir.cobrado, 605, "Dirección: el mismo cobrado que Rentabilidad");
  const pagos = await p.duenio.proyectoPago.count({ where: { proyectoId: id } });
  assert.equal((await p.cobrar(id, 50)).ok, false, "registrarCobro rechaza un perdido");
  assert.equal((await p.marcar(manual.id)).ok, false, "marcarCuota rechaza un perdido");
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), pagos, "0 cobros nuevos");
});

test("V2b (MIA-094) · perdido con un cobro suelto: saldo 0 en la ficha, Finanzas y Rentabilidad, y el cashflow de la ficha arranca con lo cobrado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  // Un cobro registrado aparte (no marcando la cuota): al perderse, la seña pendiente se anula y ese cobro queda sin cuota viva.
  assert.equal((await p.cobrar(id, 300)).ok, true);
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  const datos = await import("./datos.server");
  const fichaSrv = await import("./ficha.server");
  const vista = await p.enSesion(async () => {
    const f = await datos.fichaProyecto(id);
    const a = await p.gestion.actorActual();
    const cab = await fichaSrv.cabeceraFicha(a, id);
    assert.ok(cab, "la cabecera de la ficha");
    const fin = await fichaSrv.datosFinanzas(a, cab, fichaSrv.vistaDe(a));
    return { ficha: { cobrado: f!.cobrado, saldo: f!.saldo }, finanzas: { saldo: fin.saldo, inicial: fin.flujo.inicial, saldoFinal: fin.flujo.saldoFinal } };
  });
  assert.deepEqual(vista.ficha, { cobrado: 300, saldo: 0 }, "ficha: lo cobrado sigue cobrado y no queda saldo");
  assert.equal(vista.finanzas.saldo, 0, "Finanzas: sin saldo");
  assert.equal(vista.finanzas.inicial, 300, "cashflow de la ficha: lo cobrado sin cuota viva es la primera línea");
  assert.equal(vista.finanzas.saldoFinal, 300, "cashflow de la ficha: termina en lo cobrado, no en cero");
  const fila = await p.rentabilidad(id);
  assert.deepEqual({ cobrado: fila.cobrado, saldo: fila.saldo, porCobrar: fila.porCobrar }, { cobrado: 300, saldo: 0, porCobrar: 0 }, "Rentabilidad: la columna Saldo no muestra lo que no se cobra");
});

test("V3 · perdido en Producción y reabierto soltando la tarjeta en Confirmado: vuelve a Producción con las cuotas de antes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PRODUCCION");
  const antes = await p.foto(id);
  assert.equal((await p.mover(id, "PERDIDO", "Se cayó la feria")).ok, true);
  assert.equal((await p.mover(id, "APROBADO")).ok, true);
  assert.deepEqual(await p.etapa(id), { etapa: "PRODUCCION", perdidoEl: null });
  assert.equal(await p.foto(id), antes);
});

test("A2 (DIR-007, MIA-094) · invariante de saldos: después de cada operación la ficha, Administración, Rentabilidad y Dirección dan el mismo cobrado, por cobrar y por pagar; mover de etapa no corre vencimientos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  // Un ítem con proveedor y costo: el plan suma cuotas de pago a proveedor.
  const prov = await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `Proveedor A2 ${id.slice(-6)}` }, select: { id: true } });
  const pres = await p.duenio.proyectoPresupuesto.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: pres.id, rubro: "Carpintería", descripcion: "Madera", cantidad: 1, costo: 400, precio: 0, supplierId: prov.id } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const datos = await import("./datos.server");
  const fichaSrv = await import("./ficha.server");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const leer = async () => {
    const ficha = await p.enSesion(async () => {
      const f = await datos.fichaProyecto(id);
      const a = await p.gestion.actorActual();
      const cab = await fichaSrv.cabeceraFicha(a, id);
      const vista = fichaSrv.vistaDe(a);
      const res = await fichaSrv.datosResumen(a, cab!, vista);
      const fin = await fichaSrv.datosFinanzas(a, cab!, vista);
      return { cobrado: f!.cobrado, saldo: f!.saldo, aCobrar: res.finanzas!.aCobrar, aPagar: res.finanzas!.aPagar, saldoFinanzas: fin.saldo };
    });
    const fuente = await p.enSesion(async () => {
      const [config, tc] = await Promise.all([datos.configProyectos(p.a.id), tiposDeCambio(p.a.id)]);
      return (await cobranzasDelNegocio(p.a.id, tc, config.margenPct, [id])).get(id)!;
    });
    const adm = await p.administracion();
    const delProyecto = adm.cuotas.filter((c) => c.proyectoId === id);
    const admCobrar = delProyecto.filter((c) => c.tipo === "COBRO").reduce((x, c) => x + c.pendiente, 0) + adm.sinCalendario.filter((f) => f.proyectoId === id).reduce((x, f) => x + f.pesos, 0);
    const admPagar = delProyecto.filter((c) => c.tipo !== "COBRO").reduce((x, c) => x + c.pendiente, 0) + adm.gastosSinPagar.filter((g) => g.proyecto.id === id).reduce((x, g) => x + g.total, 0);
    const fila = await p.rentabilidad(id);
    const dir = await p.direccion(id);
    return { fuente, ficha, admCobrar: Math.round(admCobrar * 100) / 100, admPagar: Math.round(admPagar * 100) / 100, fila, dir };
  };
  const igualdad = async (paso: string) => {
    const l = await leer();
    const cobrado = [l.fuente.cobrado, l.ficha.cobrado, l.fila.cobrado, l.dir.cobrado];
    assert.ok(cobrado.every((x) => x === cobrado[0]), `${paso} · cobrado (fuente, ficha, Rentabilidad, Dirección): ${cobrado}`);
    const porCobrar = [l.fuente.porCobrar, l.ficha.aCobrar, l.admCobrar, l.fila.porCobrar];
    assert.ok(porCobrar.every((x) => x === porCobrar[0]), `${paso} · por cobrar (fuente, ficha, Administración, Rentabilidad): ${porCobrar}`);
    const saldo = [l.fuente.saldo, l.ficha.saldo, l.ficha.saldoFinanzas, l.fila.saldo];
    assert.ok(saldo.every((x) => x === saldo[0]), `${paso} · saldo (fuente, Estado financiero, Finanzas, Rentabilidad): ${saldo}`);
    const porPagar = [l.ficha.aPagar, l.admPagar, l.fila.real.porPagar];
    assert.ok(porPagar.every((x) => x === porPagar[0]), `${paso} · por pagar (ficha, Administración, Rentabilidad): ${porPagar}`);
    return l;
  };
  const vencimientos = async () => new Map((await p.duenio.proyectoCuota.findMany({ where: { proyectoId: id, anuladoEl: null }, select: { id: true, venceEl: true } })).map((c) => [c.id, c.venceEl.getTime()]));
  const sinCorrer = async (antes: Map<string, number>, paso: string) => {
    const despues = await vencimientos();
    for (const [cuota, vence] of antes) if (despues.has(cuota)) assert.equal(despues.get(cuota), vence, `${paso}: la cuota ${cuota} no cambia de vencimiento`);
  };

  const l0 = await igualdad("alta");
  assert.ok(l0.fila.real.porPagar > 0 && l0.fuente.porCobrar > 0, `el caso tiene algo por cobrar y por pagar: ${l0.fuente.porCobrar} · ${l0.fila.real.porPagar}`);
  assert.equal((await p.cobrar(id, 300)).ok, true);
  await igualdad("cobrar 300");
  const pago = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, tipo: "PAGO", anuladoEl: null, pagadoEl: null }, orderBy: { venceEl: "asc" }, select: { id: true } });
  assert.equal((await p.marcar(pago.id)).ok, true);
  await igualdad("pagar una cuota a proveedor");
  assert.equal((await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: "Flete A2", neto: "100", iva: "21" })))).ok, true);
  await igualdad("cargar un gasto sin pagar");
  let antes = await vencimientos();
  assert.equal((await p.mover(id, "PRODUCCION")).ok, true);
  await sinCorrer(antes, "mover a Producción");
  await igualdad("mover a Producción");
  antes = await vencimientos();
  assert.equal((await p.mover(id, "PERDIDO", "Se cayó la feria")).ok, true);
  const perdido = await igualdad("perder");
  assert.equal(perdido.fuente.porCobrar, 0, "perdido: nada por cobrar");
  assert.equal((await p.mover(id, "APROBADO")).ok, true);
  await sinCorrer(antes, "perder y reabrir");
  await igualdad("reabrir");
});

// Cinco corridas por orden (plan GSG-MIA-089 · V4).
const ORDENES = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1];

test("V4 · carreras: perder contra cobrar y retroceder contra marcar, en los dos órdenes (5 veces cada uno), con el candado de la cobranza", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const orden of ORDENES) {
    const id = await p.proyecto();
    const perder = () => p.mover(id, "PERDIDO", "carrera");
    const cobro = () => p.cobrar(id, 100);
    await enFila(p.base, p.claveCobranza(id), orden ? [cobro, perder] : [perder, cobro]);
    const e: { etapa: string; perdidoEl: Date | null } = await p.etapa(id);
    const despues: number = e.perdidoEl ? await p.duenio.proyectoPago.count({ where: { proyectoId: id, createdAt: { gt: e.perdidoEl } } }) : 0;
    assert.equal(despues, 0, `orden ${orden}: ningún cobro entró a un perdido`);
  }
  for (const orden of ORDENES) {
    const id = await p.proyecto();
    const s = await p.anticipo(id);
    const atras = () => p.mover(id, "PEDIDO");
    const marca = () => p.marcar(s.id);
    await enFila(p.base, p.claveCobranza(id), orden ? [marca, atras] : [atras, marca]);
    const e: { etapa: string; perdidoEl: Date | null } = await p.etapa(id);
    const cobrada = await p.anticipo(id);
    if (orden === 1) assert.equal(e.etapa, "APROBADO", "con la seña cobrada no se volvió a Lead");
    if (cobrada.pagadoEl) assert.equal(cobrada.prevista, false, "una cuota cobrada nunca queda prevista");
    // Repetir el mismo cambio no cambia nada la segunda vez.
    const f = await p.foto(id);
    assert.equal((await p.mover(id, e.etapa)).ok, true);
    assert.equal(await p.foto(id), f);
  }
});

test("V6 · gasto directo sin pagar en un proyecto sin cuotas: «A pagar» de Administración = «Por pagar» de Rentabilidad; pagarlo lo saca de las dos con un egreso", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PEDIDO");
  const antes = (await p.administracion()).resumen.aPagar;
  const cajaAntes = await p.cashflowProveedores();
  assert.equal((await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: "Flete", neto: "1000", iva: "210" })))).ok, true);
  const g = await p.duenio.proyectoGasto.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  assert.equal((await p.rentabilidad(id)).real.porPagar, 1210, "a mano: 1.000 + 210");
  assert.equal((await p.administracion()).resumen.aPagar - antes, 1210, "Administración suma el gasto sin pagar");
  assert.equal(Math.round((await p.cashflowProveedores()) - cajaAntes), 1210, "el cashflow lo saca de la caja este mes");
  assert.equal((await p.enSesion(() => p.acciones.pagarGasto(p.form({ id: g.id, medio: "TRANSFERENCIA" })))).ok, true);
  assert.equal((await p.rentabilidad(id)).real.porPagar, 0);
  assert.equal((await p.administracion()).resumen.aPagar, antes);
  assert.equal(await p.cashflowProveedores(), cajaAntes, "pagado, sale de la proyección (ya está en la caja)");
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoGastoId: g.id } }), 1, "un solo egreso en caja");
});

test("V7 · el mismo envío dos veces y diez a la vez deja una sola fila (cuota de empresa, movimiento manual, gasto pagado con su egreso); dos envíos distintos iguales, dos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("PEDIDO");
  const empresa = (clave: string) => p.enSesion(() => p.empresa.crearPagoEmpresa(p.form({ tipo: "PAGO", concepto: `Alquiler ${clave.slice(0, 4)}`, monto: "5000", venceEl: "2026-12-01", moneda: "ARS", claveEnvio: clave })));
  const manual = (clave: string) => p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo: "PAGO", concepto: `Flete ${clave.slice(0, 4)}`, monto: "700", moneda: "ARS", venceEl: "2026-12-01", claveEnvio: clave })));
  for (const [nombre, alta, cuenta] of [
    ["empresa", empresa, (c: string) => p.duenio.proyectoCuota.count({ where: { tenantId: p.a.id, proyectoId: null, concepto: `Alquiler ${c.slice(0, 4)}` } })],
    ["manual", manual, (c: string) => p.duenio.proyectoCuota.count({ where: { proyectoId: id, concepto: `Flete ${c.slice(0, 4)}` } })],
  ] as const) {
    const dos = `dos${nombre}`.padEnd(20, "x");
    assert.equal((await alta(dos)).ok, true);
    assert.equal((await alta(dos)).ok, true, `${nombre}: el reintento contesta bien`);
    assert.equal(await cuenta(dos), 1, `${nombre}: 2 envíos iguales seguidos → 1 cuota`);
    const diez = `diz${nombre}`.padEnd(20, "y");
    await Promise.all(Array.from({ length: 10 }, () => alta(diez)));
    assert.equal(await cuenta(diez), 1, `${nombre}: 10 envíos iguales a la vez → 1 cuota`);
    const otra = `otr${nombre}`.padEnd(20, "z");
    await alta(`otr${nombre}`.padEnd(20, "1"));
    await alta(otra);
    assert.equal(await p.duenio.proyectoCuota.count({ where: { tenantId: p.a.id, concepto: `${nombre === "empresa" ? "Alquiler" : "Flete"} otr${nombre[0]}` } }), 2, `${nombre}: dos envíos distintos e iguales en contenido → 2 cuotas`);
  }
  // registrarGasto «ya pagado»: crea el gasto Y el egreso de caja. Un envío repetido no carga ni asienta dos veces.
  const gasto = (clave: string, desc: string) => p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, descripcion: desc, neto: "300", pagado: "on", medio: "TRANSFERENCIA", claveEnvio: clave })));
  const gastos = (desc: string) => p.duenio.proyectoGasto.findMany({ where: { proyectoId: id, descripcion: desc }, select: { id: true } });
  const egresos = async (desc: string) => p.duenio.cashMovement.count({ where: { proyectoGastoId: { in: (await gastos(desc)).map((g) => g.id) } } });
  const clave2 = "gasto-dos".padEnd(20, "x");
  assert.equal((await gasto(clave2, "Gasto dos")).ok, true);
  assert.equal((await gasto(clave2, "Gasto dos")).ok, true, "gasto: el reintento contesta bien");
  assert.equal((await gastos("Gasto dos")).length, 1, "gasto: 2 envíos iguales seguidos → 1 gasto");
  assert.equal(await egresos("Gasto dos"), 1, "gasto: 1 egreso de caja");
  const clave10 = "gasto-diez".padEnd(20, "y");
  await Promise.all(Array.from({ length: 10 }, () => gasto(clave10, "Gasto diez")));
  assert.equal((await gastos("Gasto diez")).length, 1, "gasto: 10 envíos iguales a la vez → 1 gasto");
  assert.equal(await egresos("Gasto diez"), 1, "gasto: 1 egreso de caja");
  await gasto("gasto-otro".padEnd(20, "1"), "Gasto otro");
  await gasto("gasto-otro".padEnd(20, "2"), "Gasto otro");
  assert.equal((await gastos("Gasto otro")).length, 2, "gasto: dos envíos distintos e iguales en contenido → 2 gastos");
});

test("V8a · cambiar el tipo de cambio no cambia un peso de lo ya cobrado ni de las cuotas pagadas", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  await p.duenio.proyecto.update({ where: { id }, data: { moneda: "USD" } });
  await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1000" })));
  const s = await p.anticipo(id);
  assert.equal((await p.marcar(s.id)).ok, true);
  const plata = async () =>
    JSON.stringify({
      pagos: await p.duenio.proyectoPago.findMany({ where: { proyectoId: id }, orderBy: { id: "asc" }, select: { id: true, monto: true, anuladoEl: true } }),
      caja: await p.duenio.cashMovement.findMany({ where: { proyectoPago: { proyectoId: id } }, orderBy: { id: "asc" }, select: { id: true, amount: true, type: true } }),
      pagadas: await p.duenio.proyectoCuota.findMany({ where: { proyectoId: id, pagadoEl: { not: null } }, orderBy: { id: "asc" }, select: { id: true, monto: true, moneda: true, venceEl: true, pagadoEl: true } }),
    });
  const antes = await plata();
  assert.equal((await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1250" })))).ok, true);
  assert.equal(await plata(), antes);
});

test("N8b (MIA-094) · un gasto a mano sin pagar del proveedor que ya tiene una cuota de pago pendiente frena: con «es otra deuda» se graba y deja rastro; una cuota prevista o otro proveedor no frenan", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const sufijo = id.slice(-6);
  const proveedor = (nombre: string) => p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `${nombre} ${sufijo}` }, select: { id: true, name: true } });
  const [madera, sinCuota, previsto] = await Promise.all([proveedor("Maderera N8b"), proveedor("Flete N8b"), proveedor("Imprenta N8b")]);
  const pres = await p.duenio.proyectoPresupuesto.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  for (const [s, costo] of [[madera, 400], [previsto, 250]] as const)
    await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: pres.id, rubro: "Producción", descripcion: s.name, cantidad: 1, costo, precio: 0, supplierId: s.id } });
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const pendientes = (supplierId: string) => p.duenio.proyectoCuota.count({ where: { proyectoId: id, tipo: "PAGO", supplierId, pagadoEl: null, anuladoEl: null, prevista: false } });
  assert.ok((await pendientes(madera.id)) > 0, "precondición: la maderera tiene una cuota de pago real pendiente");
  // La de la imprenta queda como previsión (fixture): todavía no es deuda firme.
  await p.duenio.proyectoCuota.updateMany({ where: { proyectoId: id, supplierId: previsto.id }, data: { prevista: true } });
  const aPagar = async () => {
    const adm = await p.administracion();
    const total = adm.cuotas.filter((c) => c.proyectoId === id && c.tipo !== "COBRO").reduce((x, c) => x + c.pendiente, 0) + adm.gastosSinPagar.filter((g) => g.proyecto.id === id).reduce((x, g) => x + g.total, 0);
    return Math.round(total * 100) / 100;
  };
  const gastos = (supplierId: string) => p.duenio.proyectoGasto.findMany({ where: { proyectoId: id, supplierId }, select: { id: true } });
  const cargar = (prov: string, extra: Record<string, string> = {}) =>
    p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: id, proveedor: prov, descripcion: "Madera", neto: "400", ...extra })));

  const antes = await aPagar();
  const frenado = await cargar(madera.name.toUpperCase());
  assert.equal(frenado.ok, false, "la misma deuda no se carga dos veces");
  assert.ok(!frenado.ok && frenado.confirmar, "pide el sí explícito");
  assert.match(!frenado.ok ? frenado.error : "", /400/, "el cartel dice lo que falta pagar de la cuota");
  assert.equal((await gastos(madera.id)).length, 0);
  assert.equal(await aPagar(), antes, "«A pagar» no se infla");

  assert.equal((await cargar(madera.name, { confirmaOtraDeuda: "1" })).ok, true);
  const [otra] = await gastos(madera.id);
  assert.ok(otra, "con «es otra deuda» se graba");
  assert.ok(await p.duenio.proyectoCambio.findFirst({ where: { proyectoId: id, entidad: "ProyectoGasto", entidadId: otra.id, campo: "Otra deuda" } }), "y queda el rastro");
  assert.equal(await aPagar(), Math.round((antes + 400) * 100) / 100);

  assert.equal((await cargar(previsto.name)).ok, true, "una cuota prevista no frena");
  assert.equal((await cargar(sinCuota.name)).ok, true, "un proveedor sin cuota no frena");
  // Ya pagado tampoco frena: no es deuda.
  assert.equal((await cargar(madera.name, { pagado: "on", medio: "TRANSFERENCIA" })).ok, true);
});

// ── GSG-MIA-099 · cierre del NO CUMPLE de MIA-094 (veredicto `00-ESTADO/certificacion/GSG-MIA-094.md`, «Qué falta» 1-5) ──

test("T (MIA-099) · igualdad Rentabilidad = Dirección con un perdido confirmado: «Vendido» = «Facturación» y «Ganancia presupuestada» = «Margen» (decisión 1 = A, provisional a confirmar por el dueño)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { totalesDeRentabilidad } = await import("./empresa-core");
  const { proyectosConNumeros, resumenDeDireccion } = await import("./empresa.server");
  const { reporteProyectos } = await import("./datos.server");
  const vivo = await p.proyecto("APROBADO");
  const perdido = await p.proyecto("PRODUCCION");
  const s = await p.anticipo(perdido);
  assert.equal((await p.marcar(s.id)).ok, true, "el perdido tiene la seña cobrada");
  assert.equal((await p.mover(perdido, "PERDIDO", "Eligió otro proveedor")).ok, true);
  const ids = new Set([vivo, perdido]);
  const rent = totalesDeRentabilidad((await p.enSesion(() => reporteProyectos())).filter((f) => ids.has(f.id)));
  const dir = resumenDeDireccion((await p.enSesion(() => proyectosConNumeros(p.a.id))).filter((f) => ids.has(f.id)), EVENTO);
  // A mano: cada proyecto vende 1.000 neto (el ítem de $ 1.000 sin costo); el perdido no suma.
  assert.equal(dir.facturacion, 1000, "Dirección: sólo el confirmado vivo");
  assert.equal(rent.neto, dir.facturacion, `«Vendido» de Rentabilidad (${rent.neto}) = «Facturación» de Dirección (${dir.facturacion})`);
  assert.equal(rent.ganancia, dir.margen, `«Ganancia presupuestada» (${rent.ganancia}) = «Margen» de Dirección (${dir.margen})`);
  // Lo cobrado del perdido sigue a la vista y no queda nada por cobrar (V2).
  assert.equal(rent.porCobrar, 1210, "por cobrar, a mano: la venta del vivo con IVA (1.000 + 210); del perdido, nada");
});

/** Las filas de historial «Etapa» de un proyecto, en orden. */
const historialDeEtapa = (p: NonNullable<Awaited<ReturnType<typeof preparar>>>, id: string) =>
  p.duenio.proyectoCambio.findMany({ where: { proyectoId: id, entidad: "Proyecto", campo: "Etapa" }, orderBy: { createdAt: "asc" }, select: { antes: true, despues: true } });

test("V4 (MIA-099) · dos cambios de etapa a la vez, en los dos órdenes (5 veces cada uno), y el mismo cambio dos veces a la vez deja 1 fila de historial", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // [primero, segundo] desde Confirmado: dos etapas con cuotas, adelante contra atrás a Lead, y perder contra mover.
  const pares = [["PRODUCCION", "CIERRE"], ["PRODUCCION", "PEDIDO"], ["PERDIDO", "PRODUCCION"]] as const;
  let corridas = 0;
  for (const [x, y] of pares) {
    for (const orden of ORDENES) {
      const id = await p.proyecto("APROBADO");
      const [primero, segundo] = orden ? [y, x] : [x, y];
      const r = await enFila(p.base, p.claveCobranza(id), [primero, segundo].map((d) => () => p.mover(id, d, d === "PERDIDO" ? "carrera" : undefined)));
      assert.ok(r.every((x) => x.ok), `${primero} y ${segundo}: los dos contestan bien ${JSON.stringify(r)}`);
      const e = await p.etapa(id);
      // Lo que tiene que quedar: el segundo pedido corre sobre lo que dejó el primero. Mover un perdido lo reabre en su etapa.
      const esperado = segundo === "PERDIDO" ? { etapa: primero, perdidoEl: true } : primero === "PERDIDO" ? { etapa: "APROBADO", perdidoEl: false } : { etapa: segundo, perdidoEl: false };
      assert.deepEqual({ etapa: e.etapa, perdidoEl: e.perdidoEl !== null }, esperado, `${primero} → ${segundo}`);
      const h = await historialDeEtapa(p, id);
      assert.equal(h.length, 2, `${primero} → ${segundo}: dos filas de historial`);
      assert.equal(h[1].antes, h[0].despues?.replace(/^Perdido: .*/, "Perdido"), `${primero} → ${segundo}: el segundo vio lo que dejó el primero (en fila, no pisado)`);
      // La etapa y las cuotas coinciden: rehacer el plan de cuotas con la etapa final no cambia nada.
      const f = await p.foto(id);
      await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
      assert.equal(await p.foto(id), f, `${primero} → ${segundo}: las cuotas son las de la etapa que quedó`);
      corridas++;
    }
  }
  for (const destino of ["PRODUCCION", "PERDIDO"]) {
    for (let vuelta = 0; vuelta < 5; vuelta++) {
      const id = await p.proyecto("APROBADO");
      await enFila(p.base, p.claveCobranza(id), [0, 1].map(() => () => p.mover(id, destino, destino === "PERDIDO" ? "dos veces" : undefined)));
      assert.equal((await historialDeEtapa(p, id)).length, 1, `${destino} dos veces a la vez: 1 fila de historial`);
      const f = await p.foto(id);
      assert.equal((await p.mover(id, destino, "otra vez")).ok, true);
      assert.equal(await p.foto(id), f, `${destino} una tercera vez no cambia nada`);
      assert.equal((await historialDeEtapa(p, id)).length, 1);
      corridas++;
    }
  }
  t.diagnostic(`corridas de carrera: ${corridas} (${pares.length} pares × ${ORDENES.length} + 2 × 5 del mismo cambio), todas verdes`);
});

// Del par revisor de MIA-099 (su ADV-1, pasado al repo para que quede como evidencia): el chequeo de perdido del cobro
// manual va después de `trabarCobranza`, en la misma transacción que la escritura, igual que `moverProyecto`.
test("V2 (MIA-099) · carrera: cobro manual contra «Marcar perdido», en los dos órdenes (5 veces cada uno): ningún cobro entra a un perdido", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const orden of ORDENES) {
    // En Pedido no hay cuotas del plan: el cobro de 1 tiene lugar bajo el tope y lo único que lo frena es estar perdido.
    const id = await p.proyecto("PEDIDO");
    type Resultado = { ok: boolean; error?: string };
    const cobro = (): Promise<Resultado> => p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo: "COBRO", concepto: "Extra", monto: "1", moneda: "ARS", venceEl: "2026-10-26" })));
    const perder = (): Promise<Resultado> => p.mover(id, "PERDIDO", "carrera");
    const [r1, r2]: Resultado[] = await enFila<Resultado>(p.base, p.claveCobranza(id), orden ? [perder, cobro] : [cobro, perder]);
    const [rCobro, rPerder]: Resultado[] = orden ? [r2, r1] : [r1, r2];
    const e = await p.etapa(id);
    assert.ok(rPerder.ok && e.perdidoEl, `orden ${orden}: el proyecto queda perdido`);
    const extra: number = await p.duenio.proyectoCuota.count({ where: { proyectoId: id, concepto: "Extra" } });
    // Cobro primero: entra antes de perder (1 cuota). Perder primero: el cobro se rechaza con el cartel y no graba (0).
    assert.equal(rCobro.ok, orden === 0, `orden ${orden}: ${JSON.stringify(rCobro)}`);
    assert.equal(extra, orden === 0 ? 1 : 0, `orden ${orden}: cuotas «Extra»`);
    if (orden) assert.equal(rCobro.error, PERDIDO_NO_COBRA);
  }
});

test("V2 (MIA-099) · perdido: la deuda con un proveedor se paga sin reabrir y un cobro no se carga ni a mano (decisión 2 = A, provisional a confirmar por el dueño)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("APROBADO");
  const manual = (tipo: string, concepto: string) => p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo, concepto, monto: "200", moneda: "ARS", venceEl: "2026-10-26" })));
  assert.equal((await manual("PAGO", "Flete a mano")).ok, true, "antes de perder: el pago a mano");
  assert.equal((await p.mover(id, "PERDIDO", "Se cayó la feria")).ok, true);
  const deuda = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, concepto: "Flete a mano" }, select: { id: true, anuladoEl: true } });
  assert.equal(deuda.anuladoEl, null, "perder no anula la deuda cargada a mano");
  // Pagar la deuda: un gasto pagado y un egreso de caja, y sale de «A pagar».
  const r = await p.marcar(deuda.id);
  assert.equal(r.ok, true, `se paga sin reabrir: ${JSON.stringify(r)}`);
  assert.notEqual((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: deuda.id }, select: { pagadoEl: true } })).pagadoEl, null);
  const gastos = await p.duenio.proyectoGasto.findMany({ where: { proyectoId: id, pagadoEl: { not: null } }, select: { id: true, neto: true } });
  assert.deepEqual(gastos.map((g) => g.neto), [200], "un gasto pagado por lo que se debía");
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoGastoId: gastos[0].id, type: "EGRESO" } }), 1, "un solo egreso en caja");
  const adm = await p.administracion();
  assert.equal(adm.cuotas.filter((c) => c.proyectoId === id).reduce((x, c) => x + c.pendiente, 0), 0, "Administración: no queda nada pendiente del perdido");
  // Un cobro a mano en un perdido: el servidor lo rechaza con el mismo cartel que «Registrar cobro», y no graba nada.
  const cuotas = await p.duenio.proyectoCuota.count({ where: { proyectoId: id } });
  const cobro = await manual("COBRO", "Penalidad");
  assert.equal(cobro.ok, false);
  assert.equal((cobro as { error: string }).error, PERDIDO_NO_COBRA);
  assert.equal(await p.duenio.proyectoCuota.count({ where: { proyectoId: id } }), cuotas, "0 cuotas nuevas");
  // Una deuda nueva con un proveedor sí se carga (es plata que se debe igual).
  assert.equal((await manual("PAGO", "Flete de vuelta")).ok, true);
});

test("V2 (MIA-099) · anular un cobro de un perdido: vuelve la plata, la caja tiene su contraasiento y sigue sin quedar nada por cobrar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto("APROBADO");
  const s = await p.anticipo(id);
  assert.equal((await p.marcar(s.id)).ok, true);
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  const pago = await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true, monto: true } });
  assert.equal(pago.monto, 605);
  const r = await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pago.id })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.notEqual((await p.duenio.proyectoPago.findUniqueOrThrow({ where: { id: pago.id }, select: { anuladoEl: true } })).anuladoEl, null);
  const caja = await p.duenio.cashMovement.findMany({ where: { proyectoPagoId: pago.id }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true } });
  assert.deepEqual(caja.map((m) => [m.type, m.amount]), [["VENTA", 605], ["EGRESO", 605]], "el cobro y su contraasiento");
  assert.equal(await p.porCobrar(id), 0, "fuente única: sigue sin nada por cobrar");
  const fila = await p.rentabilidad(id);
  assert.deepEqual({ cobrado: fila.cobrado, porCobrar: fila.porCobrar }, { cobrado: 0, porCobrar: 0 });
  assert.equal((await p.direccion(id)).cobrado, 0);
  const adm = await p.administracion();
  assert.equal(adm.cuotas.filter((c) => c.proyectoId === id && c.tipo === "COBRO").reduce((x, c) => x + c.pendiente, 0), 0, "Administración: la seña no revive como deuda");
  assert.equal((await p.etapa(id)).perdidoEl !== null, true, "sigue perdido");
});

test("V3 (MIA-099) · perdido en cada etapa (con y sin seña cobrada donde hay cuotas) y reabierto por la ficha y por el tablero: misma etapa y mismas cuotas", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  let casos = 0;
  for (const etapa of ETAPAS) {
    for (const cobrada of generaCuotas(etapa) ? [false, true] : [false]) {
      for (const por of ["ficha", "tablero"] as const) {
        const id = await p.proyecto(etapa);
        if (cobrada) assert.equal((await p.marcar((await p.anticipo(id)).id)).ok, true);
        const antes = await p.foto(id);
        assert.equal((await p.mover(id, "PERDIDO", "Se cayó")).ok, true);
        // La ficha manda la etapa guardada; el tablero, la columna donde se suelta (otra).
        const destino = por === "ficha" ? etapa : etapa === "CIERRE" ? "PEDIDO" : "CIERRE";
        assert.equal((await p.mover(id, destino)).ok, true);
        assert.deepEqual(await p.etapa(id), { etapa, perdidoEl: null }, `${etapa}${cobrada ? " con seña cobrada" : ""}, por ${por}`);
        assert.equal(await p.foto(id), antes, `${etapa}${cobrada ? " con seña cobrada" : ""}, por ${por}: las cuotas de antes`);
        casos++;
      }
    }
  }
  t.diagnostic(`casos: ${casos}`);
});

test("V8a (MIA-099) · con un pago a proveedor en dólares ya hecho, cambiar el tipo de cambio no toca el gasto, la caja ni la cuota pagada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  const prov = await p.duenio.supplier.create({ data: { tenantId: p.a.id, name: `Proveedor V8a ${id.slice(-6)}` }, select: { id: true } });
  const pres = await p.duenio.proyectoPresupuesto.findFirstOrThrow({ where: { proyectoId: id }, select: { id: true } });
  await p.duenio.proyectoItem.create({ data: { tenantId: p.a.id, presupuestoId: pres.id, rubro: "Carpintería", descripcion: "Madera", cantidad: 1, costo: 400, precio: 0, moneda: "USD", supplierId: prov.id } });
  await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1000" })));
  await p.enSesion(() => p.gestion.regenerarCuotas(p.a.id, id));
  const cuota = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, tipo: "PAGO", anuladoEl: null, pagadoEl: null, prevista: false }, orderBy: { venceEl: "asc" }, select: { id: true, moneda: true } });
  assert.equal(cuota.moneda, "USD", "precondición: la cuota a proveedor está en dólares");
  assert.equal((await p.marcar(cuota.id)).ok, true);
  const plata = async () =>
    JSON.stringify({
      gastos: await p.duenio.proyectoGasto.findMany({ where: { proyectoId: id }, orderBy: { id: "asc" }, select: { id: true, neto: true, iva: true, pagadoEl: true, anuladoEl: true } }),
      caja: await p.duenio.cashMovement.findMany({ where: { proyectoGasto: { proyectoId: id } }, orderBy: { id: "asc" }, select: { id: true, amount: true, type: true } }),
      pagadas: await p.duenio.proyectoCuota.findMany({ where: { proyectoId: id, pagadoEl: { not: null } }, orderBy: { id: "asc" }, select: { id: true, monto: true, moneda: true, venceEl: true, pagadoEl: true } }),
    });
  const antes = await plata();
  assert.match(antes, /"amount":\d/, "hay un egreso asentado");
  assert.equal((await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1250" })))).ok, true);
  assert.equal(await plata(), antes);
});

test("V2 (MIA-099) · perdido en dólares con la seña cobrada: nada por cobrar y el mismo cobrado en la fuente, Administración, Rentabilidad y Dirección", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1000" })));
  const id = await p.proyecto("APROBADO", "USD");
  const s = await p.anticipo(id);
  assert.equal((await p.marcar(s.id)).ok, true);
  const cobradoEnPesos = (await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id }, select: { monto: true } })).monto;
  assert.equal(cobradoEnPesos, 605_000, "a mano: USD 605 × 1.000");
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  assert.equal(await p.porCobrar(id), 0, "fuente única");
  const adm = await p.administracion();
  assert.equal(adm.cuotas.filter((c) => c.proyectoId === id && c.tipo === "COBRO").reduce((x, c) => x + c.pendiente, 0) + adm.sinCalendario.filter((f) => f.proyectoId === id).reduce((x, f) => x + f.pesos, 0), 0, "Administración");
  const fila = await p.rentabilidad(id);
  const dir = await p.direccion(id);
  assert.deepEqual({ porCobrar: fila.porCobrar, saldo: fila.saldo }, { porCobrar: 0, saldo: 0 }, "Rentabilidad");
  assert.equal(dir.vencido, 0, "Dirección: sin cobros vencidos");
  assert.equal(fila.cobrado, dir.cobrado, `cobrado: Rentabilidad ${fila.cobrado} = Dirección ${dir.cobrado}`);
  assert.equal(fila.cobrado, cobradoEnPesos, "al mismo cambio, lo cobrado en pesos es lo que entró a la caja");
});

// Tipos explícitos: adentro del `for`, tsc no infiere estas constantes (TS7022).
type FilaDeAdministracion = Awaited<ReturnType<typeof import("./empresa.server").recuadrosDeCuotas>>["cuotas"][number];

test("ADV-7 (MIA-107) · un cobro cargado a mano en Pedido o en Presupuesto y después perdido: Administración no lo cuenta pendiente, la caja no lo espera y el servidor no lo marca (decisión 2 = A, provisional a confirmar por el dueño)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { cashflowDeEmpresa } = await import("./empresa.server");
  const cobrosDelMes = async () => (await p.enSesion(() => cashflowDeEmpresa(p.a.id))).proyeccion[0]!.cobros;
  const hoy = new Date("2026-11-18T12:00:00Z");
  for (const etapa of ["PEDIDO", "PRESUPUESTO"]) {
    const id = await p.proyecto(etapa);
    const concepto = `Seña a mano en ${etapa}`;
    const r: { ok: boolean } = await p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo: "COBRO", concepto, monto: "200", moneda: "ARS", venceEl: "2026-10-26" })));
    assert.equal(r.ok, true, `${etapa}: el cobro a mano se carga: ${JSON.stringify(r)}`);
    const cuota: { id: string } = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, concepto }, select: { id: true } });
    const antes: FilaDeAdministracion = (await p.administracion()).cuotas.find((c) => c.id === cuota.id)!;
    assert.equal(antes.pendiente, 200, `${etapa}: antes de perder, pendiente por su monto`);
    const cajaAntes = await cobrosDelMes();
    assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
    const adm = await p.administracion();
    const fila: FilaDeAdministracion | undefined = adm.cuotas.find((c) => c.id === cuota.id);
    assert.ok(fila, `${etapa}: la cuota sigue en la lista (en «Todos»): no se borra nada`);
    assert.equal(fila.pagadoEl, null, `${etapa}: perder no la marca`);
    assert.equal(fila.pendiente, 0, `${etapa}: un perdido no se cobra: la cuota no queda pendiente de cobro`);
    assert.equal(pasaFiltro(fila, "pendientes", hoy), false, `${etapa}: no aparece en «Pendientes» (ahí estaría con el botón «Cobrado»)`);
    assert.equal(pasaFiltro(fila, "vencidos", hoy), false, `${etapa}: no aparece en «Vencidos»`);
    assert.equal(pasaFiltro(fila, "todos", hoy), true, `${etapa}: sí aparece en «Todos»`);
    assert.equal(adm.sinCalendario.filter((f) => f.proyectoId === id).length, 0, `${etapa}: sin renglón «Sin calendario»`);
    assert.equal(await p.porCobrar(id), 0, `${etapa}: la fuente única da por cobrar 0`);
    assert.equal(await cobrosDelMes(), cajaAntes - 200, `${etapa}: el cashflow de la empresa deja de esperar esos $ 200`);
    assert.equal((await p.marcar(cuota.id)).ok, false, `${etapa}: el servidor no la marca`);
  }
});

test("MIA-111 · Bancos con el cobro de un perdido: no lo propone ni lo deja elegir para un depósito del mismo importe, y el ya conciliado no ofrece «Marcar cobrada» (ADV-7, decisión 2 = A, provisional a confirmar por el dueño)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { datosDeBancos } = await import("./empresa.server");
  const id = await p.proyecto("PEDIDO");
  // Importes que no usa otro test del archivo: la propuesta sale por importe.
  const cuotaDe = async (concepto: string, monto: number): Promise<string> => {
    const r: { ok: boolean } = await p.enSesion(() => p.ficha.crearMovimientoManual(p.form({ proyectoId: id, tipo: "COBRO", concepto, monto: String(monto), moneda: "ARS", venceEl: "2026-10-26" })));
    assert.equal(r.ok, true, `el cobro a mano se carga: ${JSON.stringify(r)}`);
    return (await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, concepto }, select: { id: true } })).id;
  };
  const libre = await cuotaDe("Seña banco libre", 431);
  const atada = await cuotaDe("Seña banco atada", 432);
  const cuenta = (await p.duenio.proyectoCuentaBanco.create({ data: { tenantId: p.a.id, nombre: "Banco 111", moneda: "ARS", saldo: 0 }, select: { id: true } })).id;
  const deposito = async (importe: number): Promise<string> =>
    (await p.duenio.proyectoMovBanco.create({ data: { tenantId: p.a.id, cuentaId: cuenta, fecha: new Date("2026-10-26T12:00:00Z"), descripcion: `Transferencia ${importe}`, importe }, select: { id: true } })).id;
  const movLibre = await deposito(431);
  const movAtado = await deposito(432);
  // Antes de perder: se concilia como cualquier cobro (así queda un depósito ya atado cuando se pierde).
  const conciliado: { ok: boolean } = await p.enSesion(() => p.empresa.conciliarMovimiento(p.form({ id: movAtado, cuotaId: atada })));
  assert.equal(conciliado.ok, true, JSON.stringify(conciliado));
  type Bancos = Awaited<ReturnType<typeof datosDeBancos>>;
  const bancos = (): Promise<Bancos> => p.enSesion(() => datosDeBancos(p.a.id));
  const propuestaPara = (b: Bancos, movId: string) => propuestasDeConciliacion(b.movimientos.filter((m) => !m.cuotaId), b.candidatas, b.tc).get(movId)?.id;
  const ofrece = (b: Bancos) => {
    const cuota = b.movimientos.find((m) => m.id === movAtado)?.cuota;
    assert.ok(cuota, "el depósito atado sigue atado");
    return ofreceMarcarConciliada(cuota, { editaPagos: true, editaEmpresa: true });
  };
  const antes = await bancos();
  assert.equal(propuestaPara(antes, movLibre), libre, "antes de perder, el depósito de $ 431 propone su cobro");
  assert.equal(ofrece(antes), true, "antes de perder, el atado ofrece «Marcar cobrada»");

  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  const despues = await bancos();
  assert.equal(propuestaPara(despues, movLibre), undefined, "perdido: el depósito no propone el cobro del perdido");
  assert.equal(despues.candidatas.filter((c) => c.proyectoId === id && c.tipo === "COBRO").length, 0, "perdido: sus cobros no están para elegir a mano");
  assert.equal(ofrece(despues), false, "perdido: el depósito atado no ofrece «Marcar cobrada»");
  assert.equal((await p.marcar(atada)).ok, false, "y el servidor no la marca (ADV-7)");

  assert.equal((await p.mover(id, "PEDIDO")).ok, true, "reabrir");
  const reabierto = await bancos();
  assert.equal(propuestaPara(reabierto, movLibre), libre, "reabierto: vuelve a proponerlo");
  assert.equal(ofrece(reabierto), true, "reabierto: vuelve a ofrecer «Marcar cobrada»");
});
