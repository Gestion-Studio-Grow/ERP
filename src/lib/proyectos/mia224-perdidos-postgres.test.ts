// ============================================================================
// GSG-MIA-224 · decisiones del dueño (20/11/2026) sobre proyectos perdidos y la vuelta a Pedido, contra Postgres de verdad
// (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión). Fuente: Factory-GSG `PENDIENTES.md`
// (20/11, 10:40Z) y `00-ESTADO/certificacion/GSG-MIA-094.md` § «Decisiones que quedan para el dueño».
//
//  D2  Al perder, las cuotas de pago a proveedores NO se anulan: siguen en «A pagar» con su proyecto y se pagan sin
//      reabrir. Reabrir (dos veces) no las duplica. Carrera perder/pagar en los dos órdenes, con el candado de la cobranza.
//  D3  «Avance de cobro» de un perdido: lo cobrado contra la venta original (B, provisional a confirmar con Ale).
//  D4  Un proyecto con presupuesto aprobado que vuelve a Pedido pierde la aprobación (la versión queda «enviada», a la
//      espera del cliente) y queda en el historial; el cliente la vuelve a aprobar.
// D1 (Rentabilidad = Dirección con un perdido) ya la cubre `mia089-plata-postgres.test.ts` · «T (MIA-099)».
// Las fechas son fijas: el resultado no depende del reloj.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { avanceDeCobro } from "./ficha-core";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const PLAZO_MS = 20_000;
const EVENTO = new Date("2027-03-10T12:00:00Z");
const ORDENES = [0, 1, 0, 1, 0, 1];

/** Cuántos pedidos esperan el candado consultivo `clave` (el mismo cálculo que mia089-plata-postgres.test.ts). */
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
  const ficha = await import("./acciones-ficha");
  const gestion = await import("./gestion.server");
  const { cobranzasDelNegocio, tiposDeCambio } = await import("./cobranza.server");
  const { configProyectos } = await import("./datos.server");
  const { recuadrosDeCuotas } = await import("./empresa.server");
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
  let numero = (await duenio.proyecto.count()) + 2240;
  /**
   * Proyecto aprobado por $ 1.210 (1.000 + IVA 21 %, anticipo del cliente 50 % = $ 605) con un ítem de un proveedor que
   * cuesta $ 400: el plan suma cuotas de pago a ese proveedor.
   */
  const proyecto = async (etapa = "APROBADO") => {
    const p = await duenio.proyecto.create({
      data: { tenantId: a.id, numero: ++numero, clientId: a.clientes[0], nombre: `Stand 224 ${numero}`, servicio: "ARQUITECTURA", etapa, moneda: "ARS", fechaArmado: new Date(EVENTO.getTime() - 2 * DIA), fechaEvento: EVENTO, fechaDesarme: new Date(EVENTO.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `m224-${p.id}`, ivaPct: 21, respondidoEl: new Date("2026-11-02T12:00:00Z"), respondidoPor: "Cliente" }, select: { id: true } });
    const prov = await duenio.supplier.create({ data: { tenantId: a.id, name: `Proveedor 224 ${numero}` }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pres.id, rubro: "Carpintería", descripcion: "Madera", cantidad: 1, costo: 400, precio: 0, supplierId: prov.id } });
    await enSesion(() => gestion.regenerarCuotas(a.id, p.id));
    return { id: p.id, presupuestoId: pres.id };
  };
  /** Las cuotas de pago a proveedor vivas y sin pagar, con lo que importa (ordenadas). */
  const deudaProveedor = async (proyectoId: string) =>
    JSON.stringify(await duenio.proyectoCuota.findMany({ where: { proyectoId, tipo: "PAGO", anuladoEl: null, pagadoEl: null }, orderBy: { clave: "asc" }, select: { id: true, clave: true, monto: true, venceEl: true, supplierId: true, proyectoId: true } }));
  const cuotasPago = (proyectoId: string) => duenio.proyectoCuota.findMany({ where: { proyectoId, tipo: "PAGO" }, orderBy: { clave: "asc" }, select: { id: true, clave: true, monto: true, pagadoEl: true, anuladoEl: true } });
  const etapa = (id: string) => duenio.proyecto.findUniqueOrThrow({ where: { id }, select: { etapa: true, perdidoEl: true } });
  const mover = (id: string, destino: string, motivo?: string) => enSesion(() => ficha.moverProyecto({ id, destino, motivo }));
  const marcar = (id: string) => enSesion(() => ficha.marcarCuota(form({ envio: crypto.randomUUID(), id, medio: "TRANSFERENCIA" })));
  const aPagar = async () => (await enSesion(() => recuadrosDeCuotas(a.id))).resumen.aPagar;
  const cobranza = (proyectoId: string) =>
    enSesion(async () => {
      const [config, tc] = await Promise.all([configProyectos(a.id), tiposDeCambio(a.id)]);
      return (await cobranzasDelNegocio(a.id, tc, config.margenPct, [proyectoId])).get(proyectoId)!;
    });
  const claveCobranza = (proyectoId: string) => `cobranza-proyecto:${a.id}:${proyectoId}`;
  return { base, duenio, a, ficha, form, enSesion, proyecto, deudaProveedor, cuotasPago, etapa, mover, marcar, aPagar, cobranza, claveCobranza };
}

test("D2 · perder con deuda a un proveedor: sus cuotas siguen vivas en «A pagar», con su proyecto, y se pagan sin reabrir", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto("PRODUCCION");
  const deuda = await p.deudaProveedor(id);
  const pagos = JSON.parse(deuda) as { id: string; monto: number }[];
  assert.ok(pagos.length > 0, "el plan tiene cuotas de pago al proveedor");
  const aPagarAntes = await p.aPagar();
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  assert.notEqual((await p.etapa(id)).perdidoEl, null);
  assert.equal(await p.deudaProveedor(id), deuda, "las cuotas al proveedor no se anulan ni cambian: mismo id, monto, vencimiento y proyecto");
  assert.equal(await p.aPagar(), aPagarAntes, "«A pagar» de Administración no baja al perder");
  // Se pagan sin reabrir: el proyecto sigue perdido.
  for (const c of pagos) assert.equal((await p.marcar(c.id)).ok, true, `se paga la cuota ${c.id} del perdido`);
  assert.notEqual((await p.etapa(id)).perdidoEl, null, "pagar no reabre");
  assert.equal(await p.deudaProveedor(id), "[]", "ya no queda deuda con el proveedor");
  assert.equal(await p.duenio.proyectoGasto.count({ where: { proyectoId: id, anuladoEl: null, pagadoEl: { not: null } } }), pagos.length, "un gasto pagado por cuota");
});

test("D2 · perder y reabrir dos veces no duplica las cuotas al proveedor (tampoco con una ya pagada en el medio)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto("PRODUCCION");
  const antes = await p.cuotasPago(id);
  assert.equal((await p.mover(id, "PERDIDO", "Se cayó la feria")).ok, true);
  assert.equal((await p.mover(id, "APROBADO")).ok, true, "reabrir 1");
  assert.deepEqual(await p.cuotasPago(id), antes, "reabrir 1: las mismas cuotas, ninguna nueva");
  // Perdido otra vez, se paga una cuota al proveedor y se reabre: la pagada queda pagada y no aparece otra igual.
  assert.equal((await p.mover(id, "PERDIDO", "Se cayó de nuevo")).ok, true);
  assert.equal((await p.marcar(antes[0].id)).ok, true, "se paga en el perdido");
  assert.equal((await p.mover(id, "APROBADO")).ok, true, "reabrir 2");
  const despues = await p.cuotasPago(id);
  assert.deepEqual(despues.map((c) => c.clave), antes.map((c) => c.clave), "reabrir 2: las mismas claves, sin duplicados");
  assert.equal(despues.filter((c) => c.anuladoEl).length, 0, "ninguna anulada");
  assert.equal(despues.filter((c) => c.pagadoEl).length, 1, "la pagada sigue pagada, una sola");
  assert.deepEqual(await p.etapa(id), { etapa: "PRODUCCION", perdidoEl: null });
});

test("D2 · carrera perder contra pagar al proveedor, en los dos órdenes (3 veces cada uno): se paga una vez y el proyecto queda perdido", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  for (const orden of ORDENES) {
    const { id } = await p.proyecto("PRODUCCION");
    const [cuota] = JSON.parse(await p.deudaProveedor(id)) as { id: string }[];
    const perder = (): Promise<{ ok: boolean }> => p.mover(id, "PERDIDO", "carrera");
    const pagar = (): Promise<{ ok: boolean }> => p.marcar(cuota.id);
    const res: { ok: boolean }[] = await enFila(p.base, p.claveCobranza(id), orden ? [pagar, perder] : [perder, pagar]);
    assert.equal(res.every((r) => r.ok), true, `orden ${orden}: los dos ganan (${JSON.stringify(res)})`);
    assert.notEqual((await p.etapa(id)).perdidoEl, null, `orden ${orden}: queda perdido`);
    const c = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: cuota.id }, select: { pagadoEl: true, anuladoEl: true } });
    assert.ok(c.pagadoEl && !c.anuladoEl, `orden ${orden}: la cuota quedó pagada y viva`);
    assert.equal(await p.duenio.proyectoGasto.count({ where: { proyectoId: id, anuladoEl: null, pagadoEl: { not: null } } }), 1, `orden ${orden}: un solo pago`);
  }
});

test("D3 · «Avance de cobro» de un perdido con la seña cobrada: lo cobrado contra la venta original (931,70 / 1.863,40 = 50 %)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id } = await p.proyecto("PRODUCCION");
  const sena = await p.duenio.proyectoCuota.findFirstOrThrow({ where: { proyectoId: id, clave: { endsWith: ":cliente:anticipo" } }, select: { id: true } });
  assert.equal((await p.marcar(sena.id)).ok, true);
  assert.equal((await p.mover(id, "PERDIDO", "Eligió otro proveedor")).ok, true);
  const c = await p.cobranza(id);
  assert.equal(c.porCobrar, 0, "un perdido no tiene nada por cobrar (V2)");
  // A mano: el stand 1.000 + la madera 400 con el recargo general de 35 % (540) = 1.540, + IVA 21 % = 1.863,40; la seña es
  // el 50 %: 931,70.
  assert.equal(c.cobrado, 931.7, "lo cobrado: la seña");
  assert.equal(c.ventaOriginal, 1863.4, "la venta original, no lo cobrado");
  assert.equal(avanceDeCobro({ cobrado: c.cobrado, aCobrar: c.porCobrar, ventaOriginal: c.ventaOriginal }, true), 50);
});

test("D4 · un aprobado que vuelve a Pedido pierde la aprobación, queda en el historial y el cliente la vuelve a aprobar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id, presupuestoId } = await p.proyecto("APROBADO");
  assert.equal((await p.mover(id, "PEDIDO")).ok, true);
  const v = await p.duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: presupuestoId }, select: { estado: true, respondidoEl: true, respondidoPor: true } });
  assert.deepEqual(v, { estado: "ENVIADO", respondidoEl: null, respondidoPor: null }, "la versión vuelve a esperar la respuesta del cliente");
  assert.equal(await p.duenio.proyectoPresupuesto.count({ where: { proyectoId: id, estado: "APROBADO" } }), 0, "ninguna versión aprobada");
  const hist = await p.duenio.proyectoCambio.findMany({ where: { proyectoId: id, entidad: "ProyectoPresupuesto", entidadId: presupuestoId }, select: { campo: true, antes: true, despues: true } });
  assert.equal(hist.length, 1, "una fila de historial");
  assert.match(hist[0].campo, /Aprobación/);
  assert.match(hist[0].antes ?? "", /Aprob/);
  assert.match(hist[0].despues ?? "", /Pedido/);
  // Volver a Pedido otra vez no escribe otra fila (ya no hay aprobación que perder).
  assert.equal((await p.mover(id, "DISENO")).ok, true);
  assert.equal((await p.mover(id, "PEDIDO")).ok, true);
  assert.equal(await p.duenio.proyectoCambio.count({ where: { proyectoId: id, entidad: "ProyectoPresupuesto", entidadId: presupuestoId } }), 1, "sin aprobación no hay nada que registrar");
  // El cliente responde que sí: la misma versión vuelve a quedar aprobada.
  const r = await p.enSesion(() => p.ficha.registrarRespuesta(p.form({ id: presupuestoId, respuesta: "APROBADO", nombre: "Cliente" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await p.duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: presupuestoId }, select: { estado: true } })).estado, "APROBADO");
});

test("D4 · volver a otra etapa comercial (Diseño) no toca la aprobación: la decisión es sólo para Pedido", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { id, presupuestoId } = await p.proyecto("APROBADO");
  assert.equal((await p.mover(id, "DISENO")).ok, true);
  assert.equal((await p.duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: presupuestoId }, select: { estado: true } })).estado, "APROBADO");
});
