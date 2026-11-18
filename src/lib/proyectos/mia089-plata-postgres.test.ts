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
// Las fechas son fijas (26/10/2026): el resultado no depende del reloj.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

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
  /** Proyecto aprobado por $ 1.210 (1.000 + IVA 21 %): anticipo del cliente 50 % = $ 605, con sus cuotas. */
  const proyecto = async (etapa = "APROBADO") => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand 089 ${numero}`, servicio: "ARQUITECTURA", etapa, fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `m89-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
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
