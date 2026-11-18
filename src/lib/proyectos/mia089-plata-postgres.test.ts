// ============================================================================
// GSG-MIA-089 · la plata de Proyectos contra Postgres de verdad (base efímera migrada, rol `app_rls` con RLS, sesión de
// la dueña) y con las acciones y los loaders REALES de cada pantalla. El dueño de la base sólo siembra y mira filas.
//
//  V1  ir y volver de etapa (Confirmado → Lead → Confirmado, y «Corregir etapa») no toca una cuota que ya fue firme:
//      ni su vencimiento, ni su monto, ni su estado. «Cobros vencidos» no baja. Caso PRY-098: la seña vencía el 26/10.
//  V1b con un cobro hecho, volver antes de Confirmado se rechaza, lo dice y no cambia ni una fila (provisional a confirmar).
//  V2  perdido: ficha, Administración, Rentabilidad, Dirección y cashflow dicen lo mismo; no se debe nada; lo cobrado
//      sigue cobrado y el saldo del cashflow lo cuenta; el servidor rechaza cobrar y marcar; anular un cobro anda.
//  V3  reabrir (desde la ficha o soltándolo en otra columna del tablero) vuelve a la etapa que tenía, con las cuotas
//      (clave, monto, vencimiento, estado) como antes de perderse.
//  V6  un gasto directo sin pagar está en «A pagar» de Administración con el mismo monto que en Rentabilidad; pagarlo lo
//      saca de los dos con un solo egreso de caja; con cuotas no cuenta dos veces. Otro negocio no lo ve.
//  V8a cambiar el tipo de cambio no mueve un peso de lo ya cobrado o pagado (cobros, caja y cuotas pagadas, fila por fila).
//  T   un concepto, un total: por cobrar, cobrado, por pagar y pagado dan lo mismo en cada pantalla, y el total de
//      Administración es la suma de los proyectos.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** La seña del caso PRY-098 quedó firme y vencía el 26/10. */
const VENCIA = new Date("2026-10-26T15:00:00Z");

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "8", DB_CONNECT_TIMEOUT_MS: "5000" });
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  if (!(await duenio.proyectoTipoCambio.findFirst({ where: { tenantId: a.id, moneda: "USD" } }))) await duenio.proyectoTipoCambio.create({ data: { tenantId: a.id, moneda: "USD", porUnidad: 1200 } });

  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const { regenerarCuotas, exigirVer } = await import("./gestion.server");
  const { cabeceraFicha, datosFinanzas, datosResumen, vistaDe } = await import("./ficha.server");
  const { reporteProyectos } = await import("./datos.server");
  const { proyectosConNumeros, recuadrosDeCuotas } = await import("./empresa.server");
  const { aPesos } = await import("./gestion-core");
  const { redondear } = await import("./core");

  let numero = (await duenio.proyecto.count()) + 700;
  /** Un proyecto de A aprobado por $ 1.210 (1.000 + IVA 21 %), seña del 50 %, evento en 60 días. Con `cuotas`, el plan se genera. */
  const proyecto = async (o: { etapa?: string; moneda?: string; tcVenta?: number | null; precio?: number; cuotas?: boolean; evento?: boolean } = {}) => {
    const evento = new Date(Date.now() + 60 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand ${numero}`, servicio: "ARQUITECTURA", etapa: o.etapa ?? "APROBADO", moneda: o.moneda ?? "ARS", anticipoClientePct: 50, ...(o.evento !== false && { fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) }) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `tok-${p.id}`, ivaPct: 21, tcVenta: o.tcVenta ?? null }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: o.precio ?? 1000 } });
    if (o.cuotas !== false) await enSesion(() => regenerarCuotas(a.id, p.id));
    return p.id;
  };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const enSesionDe = async <R>(n: NegocioDePrueba, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: { id: n.duenia.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => enSesionDe(a, fn);
  const mover = (id: string, destino: string, motivo?: string) => enSesion(() => ficha.moverProyecto({ id, destino, motivo }));
  const cobrar = (proyectoId: string, monto: number) => enSesion(() => acciones.registrarCobro(form({ proyectoId, medio: "TRANSFERENCIA", monto: String(monto) })));
  const marcar = (id: string) => enSesion(() => ficha.marcarCuota(form({ id, medio: "TRANSFERENCIA" })));
  const sena = async (proyectoId: string) => (await duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId, clave: `${proyectoId}:cliente:anticipo` }, select: { id: true } })).id;
  /** Las cuotas tal como las ve el certificador: clave, monto, vencimiento y estado. */
  const cuotas = async (proyectoId: string) =>
    (await duenio.proyectoCuota.findMany({ where: { proyectoId }, orderBy: [{ clave: "asc" }, { concepto: "asc" }], select: { clave: true, concepto: true, tipo: true, monto: true, moneda: true, venceEl: true, prevista: true, pagadoEl: true, anuladoEl: true } })).map((c) => ({
      clave: c.clave ?? c.concepto,
      tipo: c.tipo,
      monto: c.monto,
      moneda: c.moneda,
      vence: c.venceEl.toISOString(),
      prevista: c.prevista,
      estado: c.anuladoEl ? "anulada" : c.pagadoEl ? "pagada" : "pendiente",
    }));
  /** Todo lo que el rechazo no puede tocar: el proyecto, sus cuotas, su historial y su plata. */
  const filas = async (proyectoId: string) => ({
    proyecto: await duenio.proyecto.findUniqueOrThrow({ where: { id: proyectoId }, select: { etapa: true, perdidoEl: true, motivoPerdida: true, updatedAt: true } }),
    cuotas: await duenio.proyectoCuota.findMany({ where: { proyectoId }, orderBy: { id: "asc" } }),
    historial: await duenio.proyectoCambio.count({ where: { proyectoId } }),
    pagos: await duenio.proyectoPago.findMany({ where: { proyectoId }, orderBy: { id: "asc" } }),
  });

  /** Cada pantalla, por su loader real, para los proyectos pedidos. */
  const pantallas = (ids: readonly string[], n: NegocioDePrueba = a) =>
    enSesionDe(n, async () => {
      const actor = await exigirVer("pipeline");
      const vista = vistaDe(actor);
      const [rentabilidad, direccion, admin] = await Promise.all([reporteProyectos(), proyectosConNumeros(n.id), recuadrosDeCuotas(n.id)]);
      const por = new Map<string, Record<string, Record<string, number>>>();
      for (const id of ids) {
        const cab = await cabeceraFicha(actor, id);
        if (!cab) continue;
        const resumen = await datosResumen(actor, cab, vista);
        const fin = await datosFinanzas(actor, cab, vista);
        const r = rentabilidad.find((f) => f.id === id)!;
        const d = direccion.find((f) => f.id === id)!;
        const deCuotas = admin.cuotas.filter((c) => c.proyectoId === id && !c.pagadoEl);
        const sumar = (tipo: string) => redondear(deCuotas.filter((c) => c.tipo === tipo).reduce((s, c) => s + aPesos(c.pendiente, c.moneda, admin.tc), 0));
        const gastos = ((admin as { gastosSinPagar?: { proyectoId: string; pesos: number }[] }).gastosSinPagar ?? []).filter((g) => g.proyectoId === id);
        por.set(id, {
          porCobrar: {
            "ficha · Estado financiero": resumen.finanzas!.aCobrar,
            "ficha · Finanzas (saldo)": fin.saldo,
            "Administración (renglones)": redondear(sumar("COBRO") + admin.sinCalendario.filter((f) => f.proyectoId === id).reduce((s, f) => s + f.pesos, 0)),
            Rentabilidad: r.porCobrar,
          },
          cobrado: { "ficha · Estado financiero": resumen.finanzas!.cobrado, "ficha · Finanzas": fin.cobrado, Rentabilidad: r.cobrado, Dirección: d.cobrado },
          porPagar: { "ficha · Estado financiero": resumen.finanzas!.aPagar, "Administración (renglones)": redondear(sumar("PAGO") + gastos.reduce((s, g) => s + g.pesos, 0)), Rentabilidad: r.real.porPagar },
          pagado: { "ficha · Estado financiero": resumen.finanzas!.pagado, Rentabilidad: r.real.pagado },
          cashflow: { saldoFinal: fin.flujo.saldoFinal },
          vencidos: { Dirección: d.vencido },
        });
      }
      return { por, admin: admin.resumen, ids: new Set(admin.cuotas.map((c) => c.proyectoId).concat(((admin as { gastosSinPagar?: { proyectoId: string }[] }).gastosSinPagar ?? []).map((g) => g.proyectoId))) };
    });
  /** Cada concepto da lo mismo en todas las pantallas que lo muestran. */
  const unSoloNumero = (porConcepto: Record<string, Record<string, number>>, esperado: Partial<Record<string, number>>, quien: string) => {
    for (const [concepto, valores] of Object.entries(porConcepto)) {
      const e = esperado[concepto];
      if (e === undefined) continue;
      for (const [pantalla, valor] of Object.entries(valores)) assert.ok(Math.abs(valor - e) < 0.005, `${quien} · ${concepto} en ${pantalla} da ${valor} y debía dar ${e}: ${JSON.stringify(valores)}`);
    }
  };
  return { base, duenio, a, b, acciones, ficha, empresa, proyecto, form, enSesion, enSesionDe, mover, cobrar, marcar, sena, cuotas, filas, pantallas, unSoloNumero };
}

test("V1 · Confirmado → Lead → Confirmado y «Corregir etapa»: la seña firme que vencía el 26/10 no se corre y «Cobros vencidos» no baja", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  await p.duenio.proyectoCuota.update({ where: { id: await p.sena(id) }, data: { venceEl: VENCIA } });
  const antes = await p.cuotas(id);
  assert.equal(antes.filter((c) => !c.prevista && c.estado === "pendiente").length, 2, JSON.stringify(antes));
  const vencidosAntes = (await p.pantallas([id])).admin;

  assert.deepEqual(await p.mover(id, "PROPUESTA"), { ok: true });
  assert.deepEqual(await p.cuotas(id), antes, "en Lead, las cuotas que ya eran firmes siguen igual (fecha, monto y estado)");
  assert.deepEqual(await p.mover(id, "APROBADO"), { ok: true });
  assert.deepEqual(await p.cuotas(id), antes, "de vuelta en Confirmado, la seña sigue venciendo el 26/10");
  for (const destino of ["PRODUCCION", "ARMADO", "APROBADO"]) {
    assert.deepEqual(await p.mover(id, destino), { ok: true });
    assert.deepEqual(await p.cuotas(id), antes, `«Corregir etapa» a ${destino} no toca las cuotas`);
  }
  const vencidosDespues = (await p.pantallas([id])).admin;
  assert.equal(vencidosDespues.cantCobrosVencidos, vencidosAntes.cantCobrosVencidos, "la cantidad de cobros vencidos no baja");
  assert.equal(vencidosDespues.cobrosVencidos, vencidosAntes.cobrosVencidos, "el monto de cobros vencidos no baja");
  assert.ok(vencidosAntes.cobrosVencidos >= 605, `la seña de $ 605 está vencida: ${vencidosAntes.cobrosVencidos}`);
});

test("V1b · con un cobro hecho, volver antes de Confirmado se rechaza, lo dice y no cambia ni una fila", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  assert.deepEqual(await p.cobrar(id, 300), { ok: true });
  const antes = await p.filas(id);
  const r = await p.mover(id, "PROPUESTA");
  assert.equal(r.ok, false, "el rechazo es del servidor");
  assert.match(String((r as { error: string }).error), /cobro/i);
  assert.match(String((r as { error: string }).error), /anul/i, "dice qué hacer: anular el cobro");
  assert.deepEqual(await p.filas(id), antes, "0 filas cambiadas");
});

test("V2 · perdido con la seña cobrada: no se debe nada, lo cobrado sigue cobrado en todas las pantallas, el servidor no deja cobrar ni marcar y anular anda", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const id = await p.proyecto();
  // Una cuota cargada a mano (no la toca el plan): sigue viva después de perder el proyecto.
  const manual = (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "COBRO", concepto: "Extra", monto: 100, moneda: "ARS", venceEl: new Date(Date.now() + 5 * DIA), auto: false }, select: { id: true } })).id;
  assert.deepEqual(await p.cobrar(id, 605), { ok: true });
  assert.deepEqual(await p.mover(id, "PERDIDO", "Precio"), { ok: true });

  const vista = await p.pantallas([id]);
  p.unSoloNumero(vista.por.get(id)!, { porCobrar: 0, cobrado: 605 }, "perdido");
  assert.equal(vista.por.get(id)!.cashflow.saldoFinal, 605, "el saldo del cashflow cuenta lo cobrado");
  assert.equal(vista.por.get(id)!.vencidos["Dirección"], 0);

  const pagosAntes = await p.duenio.proyectoPago.count({ where: { proyectoId: id } });
  const cobro = await p.cobrar(id, 50);
  assert.equal(cobro.ok, false, "el servidor no le cobra a un proyecto perdido");
  assert.match(String((cobro as { error: string }).error), /perdido/i);
  const marca = await p.marcar(manual);
  assert.equal(marca.ok, false, "el servidor no marca una cuota de un proyecto perdido");
  assert.match(String((marca as { error: string }).error), /perdido/i);
  assert.equal(await p.duenio.proyectoPago.count({ where: { proyectoId: id } }), pagosAntes, "ningún cobro nuevo");
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: manual } })).pagadoEl, null);

  const pago = await p.duenio.proyectoPago.findFirstOrThrow({ where: { proyectoId: id, anuladoEl: null }, select: { id: true } });
  const anulado = await p.enSesion(() => p.ficha.anularCobroFicha(p.form({ id: pago.id })));
  assert.equal(anulado.ok, true, JSON.stringify(anulado));
  p.unSoloNumero((await p.pantallas([id])).por.get(id)!, { porCobrar: 0, cobrado: 0 }, "perdido sin el cobro");
});

test("V3 · reabrir vuelve a la etapa que tenía al perderse (soltándolo en otra columna o desde la ficha) con las cuotas como antes", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const soltarEn of ["PEDIDO", "PRODUCCION"]) {
    const id = await p.proyecto({ etapa: "PRODUCCION" });
    await p.duenio.proyectoCuota.update({ where: { id: await p.sena(id) }, data: { venceEl: VENCIA } });
    const antes = await p.cuotas(id);
    assert.deepEqual(await p.mover(id, "PERDIDO", "Se cayó la feria"), { ok: true });
    const r = await p.mover(id, soltarEn);
    assert.equal(r.ok, true, JSON.stringify(r));
    const ahora = await p.duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { etapa: true, perdidoEl: true, motivoPerdida: true } });
    assert.deepEqual(ahora, { etapa: "PRODUCCION", perdidoEl: null, motivoPerdida: null }, `soltado en ${soltarEn}: vuelve a Producción`);
    assert.deepEqual(await p.cuotas(id), antes, `soltado en ${soltarEn}: las cuotas como antes de perderse`);
  }
});

test("V6 · un gasto directo sin pagar está en «A pagar» de Administración igual que en Rentabilidad; pagarlo lo saca de los dos con un egreso; sin doble cuenta; B no lo ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // Sin cuotas: aprobado pero sin plan.
  const sinCuotas = await p.proyecto({ cuotas: false });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: sinCuotas, descripcion: "Alfombra", neto: "1000", iva: "210", proveedor: "Alfombras SRL", rubro: "General" }))), { ok: true });
  // Con cuotas: una cuota de pago a proveedor pendiente de $ 500 y un gasto directo sin pagar de $ 300.
  const conCuotas = await p.proyecto();
  await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: conCuotas, tipo: "PAGO", concepto: "Anticipo carpintería", monto: 500, moneda: "ARS", venceEl: new Date(Date.now() + 3 * DIA), auto: false } });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: conCuotas, descripcion: "Flete", neto: "300", proveedor: "Fletes SA", rubro: "General" }))), { ok: true });

  const v = await p.pantallas([sinCuotas, conCuotas]);
  p.unSoloNumero(v.por.get(sinCuotas)!, { porPagar: 1210 }, "sin cuotas");
  p.unSoloNumero(v.por.get(conCuotas)!, { porPagar: 800 }, "con cuotas");
  assert.equal(v.admin.aPagar, 2010, "el «A pagar» de Administración es la suma de los proyectos");
  const deB = await p.pantallas([], p.b);
  assert.ok(!deB.ids.has(sinCuotas) && !deB.ids.has(conCuotas), "el negocio B no ve la plata de A");
  assert.equal(deB.admin.aPagar, 0);

  const gasto = await p.duenio.proyectoGasto.findFirstOrThrow({ where: { proyectoId: sinCuotas }, select: { id: true } });
  assert.deepEqual(await p.enSesion(() => p.acciones.pagarGasto(p.form({ id: gasto.id, medio: "EFECTIVO" }))), { ok: true });
  const v2 = await p.pantallas([sinCuotas]);
  p.unSoloNumero(v2.por.get(sinCuotas)!, { porPagar: 0, pagado: 1210 }, "pagado");
  assert.equal(v2.admin.aPagar, 800);
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoGastoId: gasto.id } }), 1, "un solo egreso de caja");
});

test("V8a · cambiar el tipo de cambio no mueve un peso de lo ya cobrado o pagado (cobros, caja y cuotas pagadas, fila por fila)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // En dólares: $ 100.000 + IVA vendidos a 1.000 = 121 USD; cobro en pesos, seña marcada y un pago a proveedor marcado.
  const id = await p.proyecto({ moneda: "USD", tcVenta: 1000, precio: 100_000 });
  assert.deepEqual(await p.cobrar(id, 12_000), { ok: true });
  assert.equal((await p.marcar(await p.sena(id))).ok, true);
  const pagoProv = (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: id, tipo: "PAGO", concepto: "Carpintería", monto: 10, moneda: "USD", venceEl: new Date(Date.now() + 2 * DIA), auto: false }, select: { id: true } })).id;
  assert.equal((await p.marcar(pagoProv)).ok, true);
  const foto = async () => {
    const pagos = await p.duenio.proyectoPago.findMany({ where: { tenantId: p.a.id }, orderBy: { id: "asc" } });
    const gastos = await p.duenio.proyectoGasto.findMany({ where: { tenantId: p.a.id, pagadoEl: { not: null } }, orderBy: { id: "asc" } });
    const caja = await p.duenio.cashMovement.findMany({ where: { tenantId: p.a.id }, orderBy: { id: "asc" } });
    const pagadas = await p.duenio.proyectoCuota.findMany({ where: { tenantId: p.a.id, pagadoEl: { not: null } }, orderBy: { id: "asc" } });
    return { pagos, gastos, caja, pagadas };
  };
  const antes = await foto();
  assert.ok(antes.pagos.length >= 2 && antes.caja.length >= 3 && antes.pagadas.length >= 2, JSON.stringify({ pagos: antes.pagos.length, caja: antes.caja.length, pagadas: antes.pagadas.length }));
  const r = await p.enSesion(() => p.empresa.guardarTipoCambio(p.form({ porUnidad: "1500" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(await foto(), antes, "lo ya cobrado o pagado queda igual, fila por fila");
});

test("T · un concepto, un total: por cobrar, cobrado, por pagar y pagado dan lo mismo en cada pantalla, y Administración suma los proyectos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // Confirmado: aprobado 1.210, cobró 300, un gasto pagado de 100 + IVA y uno sin pagar de 50.
  const confirmado = await p.proyecto();
  assert.deepEqual(await p.cobrar(confirmado, 300), { ok: true });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: confirmado, descripcion: "Luces", neto: "100", iva: "21", proveedor: "Luces SA", rubro: "General", pagado: "on", medio: "EFECTIVO" }))), { ok: true });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: confirmado, descripcion: "Cables", neto: "50", proveedor: "Luces SA", rubro: "General" }))), { ok: true });
  // Perdido con la seña cobrada (605).
  const perdido = await p.proyecto();
  assert.deepEqual(await p.cobrar(perdido, 605), { ok: true });
  assert.deepEqual(await p.mover(perdido, "PERDIDO", "Precio"), { ok: true });
  // Sin cuotas, con un gasto directo sin pagar de 200.
  const sinCuotas = await p.proyecto({ cuotas: false, evento: false });
  assert.deepEqual(await p.enSesion(() => p.acciones.registrarGasto(p.form({ proyectoId: sinCuotas, descripcion: "Volquete", neto: "200", proveedor: "Volquetes SA", rubro: "General" }))), { ok: true });

  // A mano: por cobrar = aprobado − cobrado (perdido: 0); por pagar = gastos sin pagar con IVA; pagado = gastos pagados con IVA.
  const esperado: Record<string, Record<string, number>> = {
    [confirmado]: { porCobrar: 910, cobrado: 300, porPagar: 50, pagado: 121 },
    [perdido]: { porCobrar: 0, cobrado: 605, porPagar: 0, pagado: 0 },
    [sinCuotas]: { porCobrar: 1210, cobrado: 0, porPagar: 200, pagado: 0 },
  };
  const v = await p.pantallas(Object.keys(esperado));
  for (const [id, e] of Object.entries(esperado)) p.unSoloNumero(v.por.get(id)!, e, id);
  assert.equal(v.admin.aCobrar, 910 + 1210, "el «A cobrar» de Administración es la suma de los proyectos");
  assert.equal(v.admin.aPagar, 50 + 200, "el «A pagar» de Administración es la suma de los proyectos");
});
