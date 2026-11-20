// ============================================================================
// MIA-50 · tanda T05 (comprobantes, imputación y a pagar), contra Postgres real: base efímera con TODAS las migraciones
// (M1 incluida), rol app_rls sin BYPASSRLS y las Server Actions reales con sesión. Esperados escritos a mano ANTES de
// correr (R7). Importes en pesos salvo donde dice centavos.
//
//  C-O27  carga ×1 con adjunto que se recupera igual (el número se guarda normalizado: «0003-…» → «00003-…»); el mismo proveedor+tipo+número no entra dos veces (índice único);
//         10 envíos a la vez con la misma clave → 1 fila; 10 a la vez con claves distintas → 1 fila y 9 «ya está cargado»;
//         el negocio B puede usar el mismo número (es otro proveedor y otro negocio).
//  C-O28  A 1.000 + IVA 210 = 1.210 repartido: P1 600+126, P2 300+63, Administración 100+21 → costo P1 +600, P2 +300,
//         P3 +0 (crédito: el IVA no va al proyecto). Las líneas que no suman al centavo (falta 0,01) → 0 líneas guardadas.
//  C-O30  A 1.000+210 a P → +1.000; B 1.000+210 a P → +1.210. IVA crédito de octubre: sólo el A → IVA 210, neto 1.000.
//         La marca «provisional» del parámetro queda en la línea; si una persona elige otro tratamiento, no.
//  C-O33  orden parcial de 500 sobre 1.210: aprobada por otra persona → 1 EGRESO de 500, saldo 710; 5 aprobaciones a la
//         vez → sigue 1 asiento; quien cargó el comprobante no aprueba (0 asientos); 8 órdenes a la vez → números
//         consecutivos sin huecos; 5 órdenes a la vez por el total de 1.000 → entra 1; anular la pagada → contraasiento
//         INGRESO y el saldo vuelve; el libro no borra el asiento de la orden.
//  C-O13  3 proyectos. P1: comprobante A 1.000 imputado + gasto viejo 200 + gasto rendido sin aprobar 50 → real 1.250,
//         premio 1.200. P2: cuota de pago 400 sin enlazar → previsto 400, real 400; enlazada a un comprobante C de 400
//         imputado a P2 → real 400 (no 800) y previsto 0. P3: 0. Ficha, Dirección y Rentabilidad dan lo mismo.
//  C-O44  proveedor marcado como vinculada por parámetro: la carga guarda la referencia y el modelo de compra con su marca
//         provisional; el listado lo trae; B no lo ve (acciones, listado y SQL directo como app_rls).
//  RLS    las 7 tablas de M1 con política tenant_isolation y FORCE.
//  DEMO   pasos 7, 8 y 11: C1 600.000 + 21 % = 726.000 (crédito → +600.000); C2 300.000 sin IVA (→ +300.000), con 2 cuotas
//         de 150.000 enlazadas; los dos 100 % al proyecto Z → real 900.000; a pagar 1.026.000. OP1 726.000 y OP2 anticipo
//         150.000, aprobadas por otra persona → 2 EGRESO, a pagar 150.000. OP3 saldo 150.000 → a pagar 0.
//
// Reloj fijado: `Date` vale AHORA en todo el archivo.
// ============================================================================

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { DUPLICADO } from "./comprobantes-core";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
/** 19/11/2026 a las 15:00 en Buenos Aires. */
const AHORA = Date.parse("2026-11-19T18:00:00Z");
const TABLAS_M1 = ["ProyectoComprobante", "ProyectoComprobanteAdjunto", "ProyectoComprobanteLinea", "ProyectoCuotaComprobante", "ProyectoOrdenPago", "ProyectoOrdenPagoLinea", "ProyectoNumerador"];

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
  // Recepción de A es de Administración (pagos: editar, ve la plata): es «la otra persona» que aprueba (C-O42 de T01).
  if (!(await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, userId: a.recepcion.id } }))) {
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Administración T05", rol: "ADMINISTRACION" } });
  }

  const comp = await import("./acciones-comprobantes");
  const ordenes = await import("./acciones-orden-pago");
  const ficha = await import("./acciones-ficha");
  const empresa = await import("./acciones-empresa");
  const server = await import("./comprobantes.server");
  const datos = await import("./datos.server");
  const empresaServer = await import("./empresa.server");
  const fichaServer = await import("./ficha.server");
  const gestion = await import("./gestion.server");
  const libro = await import("@/lib/libro-caja-actions");

  let numero = (await duenio.proyecto.count()) + 900;
  /** Proyecto confirmado, v1 APROBADA: 1 ítem de $ 1.000 + IVA 21 %. */
  const proyecto = async (n: NegocioDePrueba = a) => {
    const evento = new Date(AHORA + 30 * DIA);
    const p = await duenio.proyecto.create({
      data: { tenantId: n.id, numero: ++numero, clientId: n.clientes[0], nombre: `Stand T05 ${numero}`, servicio: "ARQUITECTURA", etapa: "APROBADO", fechaArmado: new Date(evento.getTime() - 2 * DIA), fechaEvento: evento, fechaDesarme: new Date(evento.getTime() + DIA) },
      select: { id: true },
    });
    const pres = await duenio.proyectoPresupuesto.create({ data: { tenantId: n.id, proyectoId: p.id, version: 1, estado: "APROBADO", token: `t05-${p.id}`, ivaPct: 21 }, select: { id: true } });
    await duenio.proyectoItem.create({ data: { tenantId: n.id, presupuestoId: pres.id, rubro: "General", descripcion: "Stand", cantidad: 1, precio: 1000 } });
    return p.id;
  };
  const proveedor = async (nombre = `Proveedor T05 ${sig()}`, n: NegocioDePrueba = a) => (await duenio.supplier.create({ data: { tenantId: n.id, name: nombre }, select: { id: true } })).id;
  const form = (campos: Record<string, string | Blob>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(usuarioId: string, fn: () => Promise<R>, negocio: NegocioDePrueba = a): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
    return (r as { valor: R }).valor;
  };
  const enSesion = <R>(fn: () => Promise<R>) => como(a.duenia.id, fn);
  const admin = <R>(fn: () => Promise<R>) => como(a.recepcion.id, fn);
  /** Carga como la dueña (es la que «cargó»): devuelve el id o falla el test. */
  const cargar = async (campos: Record<string, string | Blob>, quien = a.duenia.id, n: NegocioDePrueba = a) => {
    const r = await como(quien, () => comp.cargarComprobante(form({ fecha: "2026-11-10", tipo: "A", numero: `0001-${String(sig()).padStart(8, "0")}`, ...campos })), n);
    assert.equal(r.ok, true, JSON.stringify(r));
    return (r as { id: string }).id;
  };
  /** Las tablas de M1 (y los parámetros) tienen FORCE: el dueño de la base también lee con el negocio fijado. */
  const m1 = <R>(fn: (tx: Parameters<Parameters<typeof duenio.$transaction>[0]>[0]) => Promise<R>, tenantId: string = a.id) =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  const egresosDeOrden = (ordenId: string) => duenio.cashMovement.findMany({ where: { proyectoOrdenPagoId: ordenId }, select: { id: true, type: true, amount: true } });
  /** El costo real del proyecto según las 4 pantallas (O13): ficha (datos y pestaña), Rentabilidad y Dirección. */
  const reales = async (id: string) => {
    const f = await enSesion(() => datos.fichaProyecto(id));
    const pestana = await enSesion(async () => {
      const ac = await gestion.actorActual();
      const cab = await fichaServer.cabeceraFicha(ac, id);
      return fichaServer.datosFinanzas(ac, cab!, fichaServer.vistaDe(ac));
    });
    const rent = (await enSesion(() => datos.reporteProyectos())).find((x) => x.id === id);
    const dir = (await enSesion(() => empresaServer.proyectosConNumeros(a.id))).find((x) => x.id === id);
    return { ficha: f!.real, pestana: pestana.real, rentabilidad: rent!.real, direccion: dir!.costoReal };
  };
  return { base, duenio, m1, a, b, comp, ordenes, ficha, empresa, server, libro, proyecto, proveedor, form, como, enSesion, admin, cargar, egresosDeOrden, reales };
}

type P = NonNullable<Awaited<ReturnType<typeof preparar>>>;
const linea = (proyectoId: string | null, neto: number, iva: number, extra: Partial<{ categoria: string; ivaTratamiento: "CREDITO" | "COSTO" }> = {}) => ({
  destino: proyectoId ? ("PROYECTO" as const) : ("ADMINISTRACION" as const),
  proyectoId,
  sector: null,
  categoria: extra.categoria ?? (proyectoId ? "Escenografía y stands" : "Alquiler"),
  detalle: "",
  netoCentavos: neto,
  ivaCentavos: iva,
  ivaTratamiento: extra.ivaTratamiento ?? ("" as "CREDITO"),
});

test("C-O27 · carga ×1 con adjunto; duplicado rechazado por la base; carreras de 10; B puede usar el mismo número", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const s = await p.proveedor();
  const pdf = new File([new TextEncoder().encode("%PDF-1.4 comprobante T05")], "factura.pdf", { type: "application/pdf" });
  const id = await p.cargar({ supplierId: s, numero: "0003-00000077", neto: "1000", iva: "210", total: "1210", adjunto: pdf });
  const adj = await p.enSesion(() => p.server.adjuntoDe(p.a.id, id));
  assert.equal(adj?.tipoMime, "application/pdf");
  assert.equal(new TextDecoder().decode(adj!.datos), "%PDF-1.4 comprobante T05", "el adjunto vuelve byte a byte");
  const c = await p.m1((tx) => tx.proyectoComprobante.findUniqueOrThrow({ where: { id }, select: { netoCentavos: true, ivaCentavos: true, totalCentavos: true, numero: true } }));
  assert.deepEqual([Number(c.netoCentavos), Number(c.ivaCentavos), Number(c.totalCentavos)], [100000, 21000, 121000], "a mano: 1.000 / 210 / 1.210 en centavos");
  // Duplicado: mismo proveedor, tipo y número.
  const dup = await p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, tipo: "A", numero: "0003-00000077", fecha: "2026-11-11", neto: "1", iva: "0", total: "1" })));
  assert.deepEqual(dup, { ok: false, error: DUPLICADO });
  // 10 a la vez con la misma clave (doble clic, red lenta): 1 fila, todas ok.
  const mismaClave = () => p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, tipo: "B", numero: "0003-00000088", fecha: "2026-11-11", neto: "500", iva: "0", total: "500", claveEnvio: "t05-carga-clave-0001" })));
  const r1 = await Promise.all(Array.from({ length: 10 }, mismaClave));
  assert.ok(r1.every((r) => r.ok), JSON.stringify(r1));
  assert.equal(await p.m1((tx) => tx.proyectoComprobante.count({ where: { tenantId: p.a.id, supplierId: s, numero: "00003-00000088" } })), 1);
  // 10 a la vez con claves distintas y el mismo número: entra 1, los demás «ya está cargado».
  const r2 = await Promise.all(Array.from({ length: 10 }, (_, i) => p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, tipo: "C", numero: "0003-00000099", fecha: "2026-11-11", neto: "500", iva: "0", total: "500", claveEnvio: `t05-carga-distinta-${i}0000000` })))));
  assert.equal(r2.filter((r) => r.ok).length, 1, JSON.stringify(r2));
  assert.equal(await p.m1((tx) => tx.proyectoComprobante.count({ where: { tenantId: p.a.id, supplierId: s, numero: "00003-00000099" } })), 1);
  // B: su proveedor, el mismo tipo y número.
  const sb = await p.proveedor("Proveedor B T05", p.b);
  const enB = await p.como(p.b.duenia.id, () => p.comp.cargarComprobante(p.form({ supplierId: sb, tipo: "A", numero: "0003-00000077", fecha: "2026-11-10", neto: "1000", iva: "210", total: "1210" })), p.b);
  assert.equal(enB.ok, true, JSON.stringify(enB));
  // B no puede cargar con un proveedor de A.
  const cruzado = await p.como(p.b.duenia.id, () => p.comp.cargarComprobante(p.form({ supplierId: s, tipo: "A", numero: "0003-00000555", fecha: "2026-11-10", neto: "1", iva: "0", total: "1" })), p.b);
  assert.equal(cruzado.ok, false);
  // El total que no es neto + IVA no entra.
  const mal = await p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: s, tipo: "A", numero: "0003-00000556", fecha: "2026-11-10", neto: "1000", iva: "210", total: "1200" })));
  assert.equal(mal.ok, false);
});

test("C-O28 · imputar a 2 proyectos y Administración sube cada costo por su parte; mal sumado no guarda nada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [p1, p2, p3] = [await p.proyecto(), await p.proyecto(), await p.proyecto()];
  const antes = await Promise.all([p1, p2, p3].map(async (id) => (await p.reales(id)).ficha.costoReal));
  assert.deepEqual(antes, [0, 0, 0]);
  const s = await p.proveedor();
  const id = await p.cargar({ supplierId: s, neto: "1000", iva: "210", total: "1210" });
  // Falta 1 centavo: no se guarda nada.
  const mal = await p.enSesion(() => p.comp.imputarComprobante({ comprobanteId: id, lineas: [linea(p1, 60000, 12600), linea(p2, 30000, 6300), linea(null, 9999, 2100)] }));
  assert.equal(mal.ok, false);
  assert.match((mal as { error: string }).error, /0,01/);
  assert.equal(await p.m1((tx) => tx.proyectoComprobanteLinea.count({ where: { comprobanteId: id } })), 0, "0 líneas");
  const bien = await p.enSesion(() => p.comp.imputarComprobante({ comprobanteId: id, lineas: [linea(p1, 60000, 12600), linea(p2, 30000, 6300), linea(null, 10000, 2100)] }));
  assert.equal(bien.ok, true, JSON.stringify(bien));
  const [r1, r2, r3] = await Promise.all([p1, p2, p3].map((x) => p.reales(x)));
  assert.equal(r1.ficha.costoReal, 600, "a mano: A → crédito, al proyecto va el neto 600");
  assert.equal(r2.ficha.costoReal, 300);
  assert.equal(r3.ficha.costoReal, 0, "el tercero no se mueve");
  assert.equal(r1.ficha.porPagar, 726, "a pagar con IVA: 600 + 126");
  // Reimputar todo a P3 reemplaza (no suma): P1 y P2 vuelven a 0.
  const otra = await p.enSesion(() => p.comp.imputarComprobante({ comprobanteId: id, lineas: [linea(p3, 100000, 21000)] }));
  assert.equal(otra.ok, true);
  const [s1, s3] = await Promise.all([p1, p3].map((x) => p.reales(x)));
  assert.deepEqual([s1.ficha.costoReal, s3.ficha.costoReal], [0, 1000]);
  // B no imputa un comprobante de A.
  const deB = await p.como(p.b.duenia.id, () => p.comp.imputarComprobante({ comprobanteId: id, lineas: [linea(null, 100000, 21000)] }), p.b);
  assert.equal(deB.ok, false);
  assert.equal(await p.m1((tx) => tx.proyectoComprobanteLinea.count({ where: { comprobanteId: id } })), 1);
});

test("C-O30 · el IVA de A es crédito (no va al proyecto), el de B es costo; IVA crédito del período sólo con A; marca provisional", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [pa, pb] = [await p.proyecto(), await p.proyecto()];
  const s = await p.proveedor();
  const ca = await p.cargar({ supplierId: s, tipo: "A", fecha: "2026-10-05", neto: "1000", iva: "210", total: "1210", destino: pa, categoria: "Catering" });
  await p.cargar({ supplierId: s, tipo: "B", fecha: "2026-10-06", neto: "1000", iva: "210", total: "1210", destino: pb, categoria: "Catering" });
  assert.equal((await p.reales(pa)).ficha.costoReal, 1000, "a mano: A → +1.000");
  assert.equal((await p.reales(pb)).ficha.costoReal, 1210, "a mano: B → +1.210");
  const iva = await p.enSesion(() => p.server.ivaCreditoDelPeriodo(p.a.id, "2026-10"));
  assert.deepEqual([iva.renglones.length, iva.totalIva, iva.totalNeto], [1, 21000, 100000], "sólo el A: IVA 210, neto 1.000 (centavos)");
  const l = await p.m1((tx) => tx.proyectoComprobanteLinea.findFirstOrThrow({ where: { comprobanteId: ca }, select: { ivaTratamiento: true, ivaProvisional: true } }));
  assert.deepEqual(l, { ivaTratamiento: "CREDITO", ivaProvisional: true }, "salió del parámetro provisional: la marca queda en la base");
  // Una persona elige COSTO para el A: deja de ser provisional y el proyecto suma el total.
  const r = await p.enSesion(() => p.comp.imputarComprobante({ comprobanteId: ca, lineas: [linea(pa, 100000, 21000, { categoria: "Catering", ivaTratamiento: "COSTO" })] }));
  assert.equal(r.ok, true, JSON.stringify(r));
  const l2 = await p.m1((tx) => tx.proyectoComprobanteLinea.findFirstOrThrow({ where: { comprobanteId: ca }, select: { ivaTratamiento: true, ivaProvisional: true } }));
  assert.deepEqual(l2, { ivaTratamiento: "COSTO", ivaProvisional: false });
  assert.equal((await p.reales(pa)).ficha.costoReal, 1210);
});

test("C-O33 · orden parcial ×1, separación de funciones, números consecutivos, sobrepago a la vez, anulación y libro", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const c = await p.cargar({ supplierId: s, neto: "1000", iva: "210", total: "1210", destino: pr, categoria: "Catering" });
  const crear = (importe: number, comprobanteId = c, quien = p.a.duenia.id, clave?: string) =>
    p.como(quien, () => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", claveEnvio: clave, lineas: [{ comprobanteId, cuotaId: null, importeCentavos: importe }] }));
  const o = await crear(50000);
  assert.equal(o.ok, true, JSON.stringify(o));
  const oid = (o as { id: string }).id;
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoOrdenPagoId: oid } }), 0, "crear no paga");
  // Quien cargó el comprobante no aprueba.
  const yo = await p.enSesion(() => p.ordenes.aprobarYPagarOrden(p.form({ id: oid })));
  assert.equal(yo.ok, false);
  assert.match((yo as { error: string }).error, /otra persona/);
  assert.equal(await p.duenio.cashMovement.count({ where: { proyectoOrdenPagoId: oid } }), 0);
  // Otra persona, 5 veces a la vez: 1 asiento de 500.
  const cinco = await Promise.all(Array.from({ length: 5 }, () => p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: oid })))));
  assert.ok(cinco.some((r) => r.ok), JSON.stringify(cinco));
  assert.deepEqual((await p.egresosDeOrden(oid)).map((m) => [m.type, m.amount]), [["EGRESO", 500]]);
  const cuentas = async () => p.server.cuentasDe(await p.m1((tx) => tx.proyectoComprobante.findUniqueOrThrow({ where: { id: c }, select: { totalCentavos: true, anuladoEl: true, pagos: { select: { importeCentavos: true, orden: { select: { estado: true } } } } } })));
  assert.deepEqual(await cuentas(), { total: 121000, enOrdenes: 50000, pagado: 50000, saldo: 71000, porPagar: 71000 }, "a mano: 1.210 − 500 = 710");
  // El libro no borra el asiento de la orden.
  const [asiento] = await p.egresosDeOrden(oid);
  const borra = await p.enSesion(() => p.libro.deleteLibroEntry(null, p.form({ id: asiento.id })));
  assert.equal(borra?.ok, false);
  assert.equal(await p.duenio.cashMovement.count({ where: { id: asiento.id } }), 1);
  // 8 órdenes a la vez de 10 c/u → números consecutivos, sin huecos ni repetidos.
  const ocho = await Promise.all(Array.from({ length: 8 }, () => crear(1000)));
  assert.ok(ocho.every((r) => r.ok), JSON.stringify(ocho));
  const nums = ocho.map((r) => (r as { numero: number }).numero).sort((x, y) => x - y);
  assert.deepEqual(nums, Array.from({ length: 8 }, (_, i) => nums[0] + i));
  assert.equal(nums[0], (o as { numero: number }).numero + 1);
  // Lo que queda del comprobante: 710 − 80 = 630. 5 órdenes a la vez por 630 → entra 1.
  const sobre = await Promise.all(Array.from({ length: 5 }, () => crear(63000)));
  assert.equal(sobre.filter((r) => r.ok).length, 1, JSON.stringify(sobre));
  assert.equal((await cuentas()).saldo, 0);
  // Anular la pagada: contraasiento y el saldo vuelve 500.
  const an = await p.admin(() => p.ordenes.anularOrden(p.form({ id: oid })));
  assert.equal(an.ok, true, JSON.stringify(an));
  assert.deepEqual((await p.egresosDeOrden(oid)).map((m) => [m.type, m.amount]).sort(), [["EGRESO", 500], ["INGRESO", 500]]);
  assert.equal((await cuentas()).saldo, 50000);
  // Una orden de otro proveedor con este comprobante no entra.
  const otro = await p.proveedor();
  const cruz = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: otro, medio: "EFECTIVO", lineas: [{ comprobanteId: c, cuotaId: null, importeCentavos: 100 }] }));
  assert.equal(cruz.ok, false);
  // B no aprueba ni anula una orden de A.
  const pend = (ocho[0] as { id: string }).id;
  const bAprueba = await p.como(p.b.duenia.id, () => p.ordenes.aprobarYPagarOrden(p.form({ id: pend })), p.b);
  assert.equal(bAprueba.ok, false);
  assert.equal((await p.m1((tx) => tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: pend }, select: { estado: true } }))).estado, "PENDIENTE");
});

test("C-O13 · una sola cuenta del costo real: ficha, pestaña, Rentabilidad y Dirección dan lo mismo; premio sin lo no aprobado; enlazar saca lo previsto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [p1, p2, p3] = [await p.proyecto(), await p.proyecto(), await p.proyecto()];
  const s = await p.proveedor();
  await p.cargar({ supplierId: s, neto: "1000", iva: "210", total: "1210", destino: p1, categoria: "Catering" });
  await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: p1, descripcion: "Gasto viejo sin comprobante", neto: 200 } });
  const rendido = await p.duenio.proyectoGasto.create({ data: { tenantId: p.a.id, proyectoId: p1, descripcion: "Taxi rendido", neto: 50 }, select: { id: true } });
  const persona = await p.duenio.proyectoPersona.create({ data: { tenantId: p.a.id, nombre: "Producción T05", rol: "PRODUCCION" }, select: { id: true } });
  await p.duenio.proyectoRendicion.create({ data: { tenantId: p.a.id, proyectoId: p1, gastoId: rendido.id, personaId: persona.id, medio: "PROPIO", montoCentavos: 5000, estado: "enviada" } });
  const cuota = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: p2, supplierId: s, tipo: "PAGO", concepto: "Anticipo proveedor", monto: 400, venceEl: new Date(AHORA + 10 * DIA) }, select: { id: true } });

  const r1 = await p.reales(p1);
  for (const [donde, v] of Object.entries(r1)) assert.equal(typeof v === "number" ? v : v.costoReal, 1250, `P1 ${donde}: a mano 1.000 + 200 + 50`);
  assert.equal(r1.ficha.costoParaElPremio, 1200, "el rendido sin aprobar no cuenta para el premio");
  assert.equal(r1.pestana.costoParaElPremio, 1200);
  const r2 = await p.reales(p2);
  for (const [donde, v] of Object.entries(r2)) assert.equal(typeof v === "number" ? v : v.costoReal, 400, `P2 ${donde}: previsto 400`);
  assert.equal(r2.ficha.previsto, 400);
  const r3 = await p.reales(p3);
  for (const [donde, v] of Object.entries(r3)) assert.equal(typeof v === "number" ? v : v.costoReal, 0, `P3 ${donde}`);

  // Enlazar la cuota a un comprobante C de 400 imputado a P2: el real sigue 400 (no 800) y lo previsto pasa a 0.
  const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: p2, categoria: "Catering" });
  const en = await p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: cuota.id })));
  assert.equal(en.ok, true, JSON.stringify(en));
  const r2b = await p.reales(p2);
  for (const [donde, v] of Object.entries(r2b)) assert.equal(typeof v === "number" ? v : v.costoReal, 400, `P2 enlazada ${donde}`);
  assert.deepEqual([r2b.ficha.previsto, r2b.ficha.imputado], [0, 400]);
  // La cuota enlazada no se paga desde el calendario (se pagaría dos veces).
  const marca = await p.enSesion(() => p.ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: cuota.id, medio: "TRANSFERENCIA" })));
  assert.equal(marca.ok, false);
  assert.match(String((marca as { error?: string }).error), /orden de pago/);
  // Aprobada la rendición, el premio la cuenta.
  await p.duenio.proyectoRendicion.updateMany({ where: { gastoId: rendido.id }, data: { estado: "aprobada" } });
  assert.equal((await p.reales(p1)).ficha.costoParaElPremio, 1250);
});

test("C-O44 · vinculada por parámetro: referencia y modelo de compra con marca; listado del negocio; B no lo ve", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.m1((tx) => tx.proyectoParametro.upsert({
    where: { tenantId_clave: { tenantId: p.a.id, clave: "sociedades.vinculadas" } },
    create: { tenantId: p.a.id, clave: "sociedades.vinculadas", valor: ["Hermana T05 SA"], provisional: false, actualizadoPor: p.a.duenia.id, actualizadoNombre: "Dueña" },
    update: { valor: ["Hermana T05 SA"] },
  }));
  const s = await p.proveedor("Hermana T05 SA");
  const id = await p.cargar({ supplierId: s, neto: "5000", iva: "1050", total: "6050", referencia: "ref-entre-77" });
  const c = await p.m1((tx) => tx.proyectoComprobante.findUniqueOrThrow({ where: { id }, select: { vinculada: true, referenciaVinculada: true, modeloCompra: true, modeloCompraProvisional: true } }));
  assert.deepEqual(c, { vinculada: true, referenciaVinculada: "REF-ENTRE-77", modeloCompra: "CADA_UNA_COMPRA", modeloCompraProvisional: true });
  const lista = await p.enSesion(() => p.server.comprasAVinculadas(p.a.id));
  assert.ok(lista.some((f) => f.id === id && f.total === 605000));
  // Referencia con un proveedor que no es vinculada: no entra.
  const comun = await p.proveedor();
  const r = await p.enSesion(() => p.comp.cargarComprobante(p.form({ supplierId: comun, tipo: "A", numero: "0009-00000001", fecha: "2026-11-10", neto: "1", iva: "0", total: "1", referencia: "x" })));
  assert.equal(r.ok, false);
  // B: su listado (con su sesión) no trae nada de A.
  const deB = await p.como(p.b.duenia.id, () => p.server.comprasAVinculadas(p.b.id), p.b);
  assert.equal(deB.filter((f) => f.id === id).length, 0);
  const deBconIdA = await p.como(p.b.duenia.id, () => p.server.comprasAVinculadas(p.a.id), p.b);
  assert.equal(deBconIdA.length, 0, "aunque pida el id de A, la RLS no le devuelve filas");
  // SQL directo como app_rls con el negocio B: 0 filas de A en las 7 tablas.
  const cli = new pg.Client({ connectionString: p.base.urlApp });
  await cli.connect();
  t.after(() => cli.end().catch(() => {}));
  await cli.query("BEGIN");
  await cli.query("SELECT set_config('app.current_tenant_id', $1, true)", [p.b.id]);
  for (const tabla of TABLAS_M1) {
    const { rows }: { rows: { n: number }[] } = await cli.query(`SELECT count(*)::int AS n FROM "${tabla}" WHERE "tenantId" = $1`, [p.a.id]);
    assert.equal(rows[0].n, 0, `${tabla}: B no ve filas de A`);
  }
  await cli.query("ROLLBACK");
  // Sin negocio fijado: tampoco.
  const { rows } = await cli.query(`SELECT count(*)::int AS n FROM "ProyectoComprobante"`);
  assert.equal(rows[0].n, 0);
});

test("RLS · las 7 tablas de M1 tienen tenant_isolation y FORCE ROW LEVEL SECURITY", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const cli = new pg.Client({ connectionString: p.base.urlDuenio });
  await cli.connect();
  t.after(() => cli.end().catch(() => {}));
  const { rows } = await cli.query(
    `SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS force, (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS pol
     FROM pg_class c WHERE c.relname = ANY($1) AND c.relkind = 'r' ORDER BY 1`,
    [TABLAS_M1],
  );
  assert.equal(rows.length, 7);
  for (const r of rows) assert.deepEqual([r.rls, r.force, r.pol], [true, true, 1], r.tabla);
});

test("DEMO pasos 7, 8 y 11 · C1 crédito y C2 a costo al proyecto Z; OP1 + OP2 por otra persona; OP3 deja a pagar en 0", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const z = await p.proyecto();
  const s1 = await p.proveedor("Carpintería Demo T05");
  const s2 = await p.proveedor("Iluminación Demo T05");
  const q1 = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: z, supplierId: s2, tipo: "PAGO", concepto: "Anticipo iluminación", monto: 150000, venceEl: new Date(AHORA + 5 * DIA) }, select: { id: true } });
  const q2 = await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: z, supplierId: s2, tipo: "PAGO", concepto: "Saldo iluminación", monto: 150000, venceEl: new Date(AHORA + 20 * DIA) }, select: { id: true } });
  assert.equal((await p.reales(z)).ficha.previsto, 300000, "antes de enlazar, las 2 cuotas son previstas");
  // Paso 7: carga e imputación.
  const c1 = await p.cargar({ supplierId: s1, tipo: "A", neto: "600000", iva: "126000", total: "726000", destino: z, categoria: "Escenografía y stands" });
  const c2 = await p.cargar({ supplierId: s2, tipo: "C", neto: "300000", iva: "0", total: "300000", destino: z, categoria: "Audio, video e iluminación" });
  for (const q of [q1, q2]) assert.equal((await p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c2, cuotaId: q.id })))).ok, true);
  const r = await p.reales(z);
  for (const [donde, v] of Object.entries(r)) assert.equal(typeof v === "number" ? v : v.costoReal, 900000, `real ${donde}: a mano 600.000 + 300.000`);
  const aPagar = async () => (await p.enSesion(() => p.server.aPagarPorComprobante(p.a.id))).filter((g) => g.supplierId === s1 || g.supplierId === s2).reduce((x, g) => x + g.porPagar, 0);
  assert.equal(await aPagar(), 102600000, "a pagar 1.026.000 (centavos)");
  assert.equal(r.ficha.porPagar, 1026000);
  // Paso 8: OP1 por C1 entero, OP2 por el anticipo de C2; las aprueba otra persona.
  const op1 = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s1, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c1, cuotaId: null, importeCentavos: 72600000 }] }));
  const op2 = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s2, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c2, cuotaId: q1.id, importeCentavos: 15000000 }] }));
  assert.ok(op1.ok && op2.ok, JSON.stringify([op1, op2]));
  for (const o of [op1, op2]) {
    const r2: { ok: boolean } = await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: (o as { id: string }).id })));
    assert.equal(r2.ok, true);
  }
  const egresos = await p.duenio.cashMovement.findMany({ where: { proyectoOrdenPagoId: { in: [op1, op2].map((o) => (o as { id: string }).id) } }, select: { type: true, amount: true } });
  assert.deepEqual(egresos.map((m) => [m.type, m.amount]).sort((x, y) => Number(x[1]) - Number(y[1])), [["EGRESO", 150000], ["EGRESO", 726000]]);
  assert.equal(await aPagar(), 15000000, "queda el saldo de C2: 150.000");
  const cuotas = await p.duenio.proyectoCuota.findMany({ where: { id: { in: [q1.id, q2.id] } }, orderBy: { venceEl: "asc" }, select: { pagadoEl: true } });
  assert.deepEqual(cuotas.map((q) => !!q.pagadoEl), [true, false], "el anticipo quedó pagado; el saldo no");
  // Paso 11: OP3 por el saldo.
  const op3 = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s2, medio: "EFECTIVO", lineas: [{ comprobanteId: c2, cuotaId: q2.id, importeCentavos: 15000000 }] }));
  assert.equal(op3.ok, true, JSON.stringify(op3));
  assert.equal((await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: (op3 as { id: string }).id })))).ok, true);
  assert.equal(await aPagar(), 0, "a pagar 0");
  const fin = await p.reales(z);
  assert.deepEqual([fin.ficha.costoReal, fin.ficha.porPagar, fin.ficha.pagado], [900000, 0, 1026000]);
});

// ── Carreras de la vuelta (certificación MIA-127, CERT-1 a CERT-3) ──────────────────────────────────────────────────
// Esperados a mano, antes de correr (R7). Cada caso se repite: una carrera que pasa una vez no prueba nada.

test("CERT-1 · 6 imputaciones a la vez de 1 línea de 1.210 sobre un comprobante de 1.210 → queda 1 línea, suma 121000 centavos, costo 1.000", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [p1, p2] = [await p.proyecto(), await p.proyecto()];
  const s = await p.proveedor();
  const malas: string[] = [];
  for (let ronda = 0; ronda < 4; ronda++) {
    const c = await p.cargar({ supplierId: s, neto: "1000", iva: "210", total: "1210" });
    const rs = await Promise.all(
      Array.from({ length: 6 }, (_, i) => p.enSesion(() => p.comp.imputarComprobante({ comprobanteId: c, lineas: [linea(i % 2 ? p2 : p1, 100000, 21000, { categoria: "Catering" })] }))),
    );
    const lineas = await p.m1((tx) => tx.proyectoComprobanteLinea.findMany({ where: { comprobanteId: c }, select: { netoCentavos: true, ivaCentavos: true, costoCentavos: true } }));
    const suma = lineas.reduce((x, l) => x + Number(l.netoCentavos) + Number(l.ivaCentavos), 0);
    const costo = lineas.reduce((x, l) => x + Number(l.costoCentavos), 0);
    const foto = { ronda, oks: rs.filter((r) => r.ok).length, lineas: lineas.length, suma, costo };
    if (foto.oks < 1 || foto.lineas !== 1 || suma !== 121000 || costo !== 100000) malas.push(JSON.stringify(foto));
  }
  assert.deepEqual(malas, [], "a mano: 1 línea, 1.000 + 210 = 121000 centavos, costo 100000 (A: el IVA es crédito)");
});

test("CERT-2 · crear la orden y anular el comprobante a la vez, 15 veces → nunca queda un comprobante anulado con una orden viva", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const malas: string[] = [];
  for (let i = 0; i < 15; i++) {
    const c = await p.cargar({ supplierId: s, tipo: "C", neto: "1000", iva: "0", total: "1000", destino: pr, categoria: "Catering" });
    const [o, an] = await Promise.all([
      p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: null, importeCentavos: 100000 }] })),
      p.admin(() => p.comp.anularComprobante(p.form({ id: c }))),
    ]);
    const f = await p.m1((tx) => tx.proyectoComprobante.findUniqueOrThrow({ where: { id: c }, select: { anuladoEl: true, pagos: { where: { orden: { estado: { not: "ANULADA" } } }, select: { id: true } } } }));
    if ((f.anuladoEl && f.pagos.length > 0) || (o.ok && an.ok)) malas.push(JSON.stringify({ i, orden: o.ok, anular: an.ok, anulado: !!f.anuladoEl, vivas: f.pagos.length }));
  }
  assert.deepEqual(malas, [], "a mano: gana una sola; anulado ⇒ 0 órdenes vivas");
});

test("CERT-2b · una orden viva sobre un comprobante anulado no se aprueba ni asienta caja", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const c = await p.cargar({ supplierId: s, tipo: "C", neto: "1000", iva: "0", total: "1000", destino: pr, categoria: "Catering" });
  const o = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: null, importeCentavos: 100000 }] }));
  assert.equal(o.ok, true, JSON.stringify(o));
  const oid = (o as { id: string }).id;
  // El estado que dejaba la carrera de CERT-2 en 7f4cbd01 (o una base vieja): el comprobante anulado con la orden viva.
  await p.m1((tx) => tx.proyectoComprobante.update({ where: { id: c }, data: { anuladoEl: new Date(), anuladoPor: "carrera" } }));
  const r = await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: oid })));
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match((r as { error: string }).error, /anulado/);
  assert.deepEqual(await p.egresosDeOrden(oid), [], "a mano: 0 egresos");
  assert.equal((await p.m1((tx) => tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: oid }, select: { estado: true } }))).estado, "PENDIENTE");
});

test("CERT-3 · dos cuotas de 300 enlazadas a la vez a un comprobante de 400, 10 veces → entra 1", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const malas: string[] = [];
  for (let i = 0; i < 10; i++) {
    const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: pr, categoria: "Catering" });
    const cuotas = await Promise.all([1, 2].map(() => p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: pr, supplierId: s, tipo: "PAGO", concepto: "Cuota T05", monto: 300, venceEl: new Date(AHORA + 10 * DIA) }, select: { id: true } })));
    const rs = await Promise.all(cuotas.map((q) => p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q.id })))));
    const enlaces = await p.m1((tx) => tx.proyectoCuotaComprobante.count({ where: { comprobanteId: c } }));
    if (rs.filter((r) => r.ok).length !== 1 || enlaces !== 1) malas.push(JSON.stringify({ i, oks: rs.filter((r) => r.ok).length, enlaces }));
  }
  assert.deepEqual(malas, [], "a mano: 300 + 300 = 600 > 400 → 1 enlace");
});

// ── Carreras de la vuelta 2 (certificación MIA-132, CERT-4 y CERT-4b) ───────────────────────────────────────────────
// Esperados a mano, antes de correr (R7). La cuota se paga por UN solo camino: a mano desde el calendario (marcarCuota,
// toda o una parte) o enlazada a un comprobante y con una orden de pago. Nunca por los dos.

/** Los pagos asentados a mano por la cuota (todos o partes): el registro «Asiento» que deja `marcarCuota`. */
async function asientosAMano(p: P, cuotaId: string): Promise<number> {
  return p.m1((tx): Promise<number> => tx.proyectoCambio.count({ where: { entidad: "ProyectoCuota", entidadId: cuotaId, campo: "Asiento" } }));
}

test("CERT-4 · enlazar la cuota de 300 a un comprobante de 400 y pagarla a mano (toda o una parte de 100) a la vez, 20 veces → nunca las dos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const malas: string[] = [];
  const ganan = { enlazar: 0, marcar: 0 };
  for (let ronda = 0; ronda < 20; ronda++) {
    const parte = ronda % 2 === 1;
    // `marcarCuota` lee más afuera de la transacción: sin demora gana siempre el enlace. Con el enlace demorado 0 a 60 ms
    // (fijo por ronda), también llega mientras el pago tiene la cuota tomada: se prueban los dos órdenes.
    const demora = (Math.floor(ronda / 2) % 5) * 15;
    const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: pr, categoria: "Catering" });
    const q = (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: pr, supplierId: s, tipo: "PAGO", concepto: "Cuota cert", monto: 300, venceEl: new Date(AHORA + 10 * DIA) }, select: { id: true } })).id;
    const [en, mk] = await Promise.all([
      new Promise<void>((listo) => setTimeout(listo, demora)).then(() => p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q })))),
      p.admin(() => p.ficha.marcarCuota(p.form({ envio: crypto.randomUUID(), id: q, medio: "TRANSFERENCIA", ...(parte ? { monto: "100" } : {}) }))),
    ]);
    const cuota = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } });
    const enlazada = await p.m1((tx) => tx.proyectoCuotaComprobante.count({ where: { cuotaId: q } }));
    const aMano = await asientosAMano(p, q);
    const foto = { ronda, parte, demora, enlazar: en.ok, marcar: mk.ok, pagada: !!cuota.pagadoEl, enlazada, aMano };
    // a mano: gana una sola; enlazada ⇒ 0 pagos a mano; con pago a mano ⇒ 0 enlaces.
    if ((en.ok && mk.ok) || (enlazada > 0 && (aMano > 0 || cuota.pagadoEl)) || en.ok === mk.ok) malas.push(JSON.stringify(foto));
    if (en.ok !== mk.ok) ganan[en.ok ? "enlazar" : "marcar"]++;
  }
  t.diagnostic(`gana enlazar ${ganan.enlazar}, gana marcar ${ganan.marcar}`);
  assert.deepEqual(malas, [], "a mano: una gana y la otra se rechaza; nunca enlazada y pagada a mano");
});

test("CERT-4b · una cuota enlazada que ya figura pagada a mano: la orden de pago no la toma y una orden previa no se aprueba (0 egresos)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const c = await p.cargar({ supplierId: s, tipo: "C", neto: "700", iva: "0", total: "700", destino: pr, categoria: "Catering" });
  const nueva = async () => (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: pr, supplierId: s, tipo: "PAGO", concepto: "Cuota cert", monto: 300, venceEl: new Date(AHORA + 10 * DIA) }, select: { id: true } })).id;
  const [q1, q2] = [await nueva(), await nueva()];
  for (const q of [q1, q2]) {
    const r: { ok: boolean } = await p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q })));
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  // q2: la orden se crea con la cuota abierta (todavía está bien).
  const previa = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: q2, importeCentavos: 30000 }] }));
  assert.equal(previa.ok, true, JSON.stringify(previa));
  // El estado que dejaba la carrera de CERT-4 en 0137103c (o una base vieja): enlazadas y pagadas a mano por $ 300.
  await p.duenio.proyectoCuota.updateMany({ where: { id: { in: [q1, q2] } }, data: { pagadoEl: new Date(), pagadoPor: "a mano", medio: "TRANSFERENCIA" } });

  const orden = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: q1, importeCentavos: 30000 }] }));
  assert.equal(orden.ok, false, JSON.stringify(orden));
  assert.match((orden as { error: string }).error, /pagada/);

  const pid = (previa as { id: string }).id;
  const aprobada = await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: pid })));
  assert.equal(aprobada.ok, false, JSON.stringify(aprobada));
  assert.match((aprobada as { error: string }).error, /pagada/);
  assert.deepEqual(await p.egresosDeOrden(pid), [], "a mano: 0 egresos ($ 300 no sale dos veces)");
  assert.equal((await p.m1((tx) => tx.proyectoOrdenPago.findUniqueOrThrow({ where: { id: pid }, select: { estado: true } }))).estado, "PENDIENTE");
});

// ── Vuelta 3 (certificación GSG-MIA-137, M4c): la cuota de la EMPRESA (sin proyecto) ────────────────────────────────
// Esperados a mano, antes de correr (R7). Comprobante C de $ 400 y cuota de empresa de $ 300 del mismo proveedor. Una cuota
// de empresa se puede enlazar (decisión de ORQ-007, opción 1); enlazada, se paga sólo con la orden de pago. Por C salen
// $ 400 en total, nunca $ 700 (300 a mano desde Administración + 400 de una orden sin cuota).

/** Lo que salió de la caja por la cuota de empresa pagada a mano (`marcarCuotaEmpresa`), en pesos. */
async function egresosDeCuotaEmpresa(p: P, cuotaId: string): Promise<number> {
  const movs = await p.duenio.cashMovement.findMany({ where: { createdBy: `gasto-proyecto:cuota-${cuotaId}`, type: "EGRESO" }, select: { amount: true } });
  return movs.reduce((s, m) => s + Number(m.amount), 0);
}
const cuotaDeEmpresa = async (p: P, supplierId: string) =>
  (await p.duenio.proyectoCuota.create({ data: { tenantId: p.a.id, proyectoId: null, supplierId, tipo: "PAGO", concepto: "Cuota empresa cert", monto: 300, venceEl: new Date(AHORA + 10 * DIA) }, select: { id: true } })).id;

test("M4c · cuota de empresa enlazada: a mano desde Administración no se paga (1 y 5 a la vez); la orden sin cuota deja $ 400, no $ 700", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: pr, categoria: "Catering" });
  const q = await cuotaDeEmpresa(p, s);
  const en = await p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q })));
  assert.equal(en.ok, true, JSON.stringify(en));

  const marcar = () => p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: q, medio: "TRANSFERENCIA" })));
  const una = await marcar();
  assert.equal(una.ok, false, JSON.stringify(una));
  assert.match((una as { error: string }).error, /orden de pago/);
  const cinco = await Promise.all([1, 2, 3, 4, 5].map(marcar));
  assert.deepEqual(cinco.map((r) => r.ok), [false, false, false, false, false]);
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } })).pagadoEl, null, "a mano: sigue sin pagar");
  assert.equal(await egresosDeCuotaEmpresa(p, q), 0, "a mano: 0 pesos a mano");

  // La orden sin cuota sobre C, por su saldo (400,00 = 40000 centavos), aprobada por otra persona.
  const o = await p.enSesion(() => p.ordenes.crearOrdenPago({ supplierId: s, medio: "TRANSFERENCIA", lineas: [{ comprobanteId: c, cuotaId: null, importeCentavos: 40000 }] }));
  assert.equal(o.ok, true, JSON.stringify(o));
  const oid = (o as { id: string }).id;
  const ap = await p.admin(() => p.ordenes.aprobarYPagarOrden(p.form({ id: oid })));
  assert.equal(ap.ok, true, JSON.stringify(ap));
  const deLaOrden = (await p.egresosDeOrden(oid)).filter((m) => m.type === "EGRESO").reduce((x, m) => x + Number(m.amount), 0);
  assert.equal(Math.round((deLaOrden + (await egresosDeCuotaEmpresa(p, q))) * 100), 40000, "a mano: por C salen 400,00");
});

test("M4c · enlazar la cuota de empresa de 300 y pagarla a mano desde Administración a la vez, 20 veces → nunca las dos", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const malas: string[] = [];
  const ganan = { enlazar: 0, marcar: 0 };
  for (let ronda = 0; ronda < 20; ronda++) {
    // `marcarCuotaEmpresa` lee menos afuera que `enlazarCuota`: sin demora gana siempre el pago. Las rondas pares demoran el
    // enlace y las impares el pago (0 a 120 ms, fijo por ronda): se prueban los dos órdenes, y el cruce con un candado tomado.
    const demora = (Math.floor(ronda / 2) % 5) * 30;
    const tarde = <R>(ms: number, fn: () => Promise<R>) => new Promise<void>((listo) => setTimeout(listo, ms)).then(fn);
    const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: pr, categoria: "Catering" });
    const q = await cuotaDeEmpresa(p, s);
    const [en, mk] = await Promise.all([
      tarde(ronda % 2 === 0 ? demora : 0, () => p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q })))),
      tarde(ronda % 2 === 1 ? demora : 0, () => p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: q, medio: "TRANSFERENCIA" })))),
    ]);
    const cuota = await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } });
    const enlazada = await p.m1((tx) => tx.proyectoCuotaComprobante.count({ where: { cuotaId: q } }));
    const aMano = await egresosDeCuotaEmpresa(p, q);
    const foto = { ronda, demora, enlazar: en.ok, marcar: mk.ok, pagada: !!cuota.pagadoEl, enlazada, aMano };
    // a mano: gana una sola; enlazada ⇒ 0 pesos a mano y sin pagar; pagada a mano ⇒ 300 y 0 enlaces.
    if (en.ok === mk.ok || (enlazada > 0 && (aMano > 0 || cuota.pagadoEl)) || (cuota.pagadoEl && aMano !== 300)) malas.push(JSON.stringify(foto));
    if (en.ok !== mk.ok) ganan[en.ok ? "enlazar" : "marcar"]++;
  }
  t.diagnostic(`gana enlazar ${ganan.enlazar}, gana marcar ${ganan.marcar}`);
  assert.deepEqual(malas, [], "a mano: una gana y la otra se rechaza; nunca enlazada y pagada a mano");
});

test("M4c · la escritura nula de `enlazarCuota`: el pago que sacó su foto antes del enlace y espera la cuota no la paga (orden fijo, sin demoras)", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const pr = await p.proyecto();
  const s = await p.proveedor();
  const c = await p.cargar({ supplierId: s, tipo: "C", neto: "400", iva: "0", total: "400", destino: pr, categoria: "Catering" });
  const q = await cuotaDeEmpresa(p, s);
  // Dos conexiones crudas: «traba» frena el INSERT del enlace (SHARE no deja pasar ROW EXCLUSIVE; sí las lecturas) y
  // «mira» espera, en pg_locks, que cada acción quede donde corresponde. El orden, entonces, es siempre el mismo:
  //   1. enlazarCuota toma el comprobante y la cuota (y, si está, hace la escritura nula) y espera la traba en el INSERT;
  //   2. marcarCuotaEmpresa abre su Serializable (la foto es de antes del enlace) y espera la cuota;
  //   3. se suelta la traba: el enlace se graba y suelta la cuota.
  // Con la escritura nula, la cuota tiene una versión nueva → 40001 → el reintento ve el enlace y no paga.
  // Sin ella, el pago toma la cuota sin error, cuenta 0 enlaces en su foto y paga: $ 300 a mano con la cuota enlazada.
  const traba = new pg.Client({ connectionString: p.base.urlDuenio });
  const mira = new pg.Client({ connectionString: p.base.urlDuenio });
  await traba.connect();
  await mira.connect();
  t.after(async () => {
    await traba.end().catch(() => undefined);
    await mira.end().catch(() => undefined);
  });
  /** Espera (sin reloj: por vueltas) a que haya `n` esperas de candado de este tipo en esta base. */
  const esperarEsperas = async (relacion: boolean, n: number) => {
    for (let vuelta = 0; vuelta < 500; vuelta++) {
      const { rows } = await mira.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE a.datname = current_database() AND NOT l.granted AND (l.locktype = 'relation') = $1`,
        [relacion],
      );
      if (rows[0].n >= n) return;
      await new Promise<void>((listo) => setTimeout(listo, 10));
    }
    assert.fail(`no llegó la espera (${relacion ? "el INSERT del enlace" : "la cuota"})`);
  };
  await traba.query("BEGIN");
  await traba.query(`LOCK TABLE "ProyectoCuotaComprobante" IN SHARE MODE`);
  let soltada = false;
  const soltar = async () => {
    if (soltada) return;
    soltada = true;
    await traba.query("COMMIT");
  };
  t.after(soltar);

  const enlazar = p.enSesion(() => p.comp.enlazarCuota(p.form({ comprobanteId: c, cuotaId: q })));
  await esperarEsperas(true, 1);
  const marcar = p.enSesion(() => p.empresa.marcarCuotaEmpresa(p.form({ id: q, medio: "TRANSFERENCIA" })));
  await esperarEsperas(false, 1);
  await soltar();
  const [en, mk] = await Promise.all([enlazar, marcar]);

  assert.equal(en.ok, true, JSON.stringify(en));
  assert.equal(mk.ok, false, `a mano: el pago se rechaza (${JSON.stringify(mk)})`);
  assert.match((mk as { error: string }).error, /orden de pago/);
  assert.equal((await p.duenio.proyectoCuota.findUniqueOrThrow({ where: { id: q }, select: { pagadoEl: true } })).pagadoEl, null, "a mano: sin pagar");
  assert.equal(await egresosDeCuotaEmpresa(p, q), 0, "a mano: 0 pesos a mano");
});
