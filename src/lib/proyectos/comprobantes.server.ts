// ============================================================================
// Comprobantes, imputación y a pagar (MIA-50 T05): las lecturas. Todo por negocio (`tenantId` + RLS). Sin la
// migración M1 aplicada (Gate 2), las pantallas lo dicen y lo demás sigue: el costo real se calcula sin lo imputado.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { parametrosDelNegocio } from "./parametros/leer.server";
import { defDe } from "./parametros/catalogo";
import { imputadoPorProyecto } from "./imputacion-core";
import { saldoDe, type EstadoOrden } from "./orden-pago-core";
import { redondear, resultadoReal, SIN_IMPUTADO, type GastoCalculable, type Imputado, type ResultadoReal, type Totales } from "./core";
import { aPesos } from "./gestion-core";
import { porPagarDeCuotas } from "./pago-parcial-core";
import { pagosParcialesDeCuotas } from "./pago-parcial.server";
import { cambiosDeComprobantes, enPesosDelComprobante } from "./moneda-bancos.server";

type Db = Prisma.TransactionClient | typeof prisma;
const n = (v: bigint | number): number => Number(v);

/** Sin la tabla (M1 sin aplicar), `null`: la pantalla avisa en vez de caerse. */
export async function siHayM1<T>(leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    if (esTablaInexistente(e)) return null;
    throw e;
  }
}
/**
 * MIA-50 T05 · vuelta 2 (CERT-4): el candado de la cuota de pago. Lo toman, en la transacción, todos los caminos que la
 * pagan o la atan a un comprobante: `enlazarCuota`, `marcarCuota` (pago), `marcarCuotaEmpresa` (M4c), `crearOrdenPago` y
 * `aprobarYPagarOrden`.
 * Orden fijo: primero el comprobante (si hay), después la cuota, por id. Devuelve lo que se mira con el candado tomado.
 */
export async function tomarCuotas(tx: Prisma.TransactionClient, tenantId: string, ids: readonly string[]): Promise<Map<string, { pagado: boolean; anulado: boolean }>> {
  if (ids.length === 0) return new Map();
  const orden = [...new Set(ids)].sort();
  const filas = await tx.$queryRaw<{ id: string; pagadoEl: Date | null; anuladoEl: Date | null }[]>`
    SELECT "id", "pagadoEl", "anuladoEl" FROM "ProyectoCuota" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(orden)}) ORDER BY "id" FOR UPDATE`;
  return new Map(filas.map((f) => [f.id, { pagado: f.pagadoEl !== null, anulado: f.anuladoEl !== null }]));
}

export const SIN_M1 = "Los comprobantes de proveedor necesitan la actualización de la base M1, que todavía no está aplicada. Lo demás funciona igual.";

/** Lo que la carga y la imputación leen del catálogo de parámetros (R8): nada de esto queda escrito en el código. */
export async function parametrosDeComprobantes(tenantId: string, db: Db = prisma) {
  const p = await parametrosDelNegocio(tenantId, db);
  const tipos = defDe("iva.porComprobante").def;
  return {
    tipos: tipos.tipo === "mapaOpcion" ? tipos.claves.map((o) => o.id) : [],
    /** Para el selector: «A», «B», «C», «Sin factura». */
    tiposConNombre: tipos.tipo === "mapaOpcion" ? tipos.claves : [],
    ivaPorTipo: p["iva.porComprobante"].valor,
    ivaProvisional: p["iva.porComprobante"].provisional,
    vinculadas: p["sociedades.vinculadas"].valor,
    modeloCompra: p["sociedades.modeloCompra"].valor,
    modeloCompraProvisional: p["sociedades.modeloCompra"].provisional,
    listas: { sectores: p["costos.sectores"].valor, categorias: p["costos.categorias"].valor, categoriasAdministracion: p["costos.categoriasAdministracion"].valor },
  };
}

const SELECT_SALDO = {
  totalCentavos: true,
  anuladoEl: true,
  pagos: { select: { importeCentavos: true, orden: { select: { estado: true } } } },
} satisfies Prisma.ProyectoComprobanteSelect;

type ConPagos = { totalCentavos: bigint; anuladoEl: Date | null; pagos: { importeCentavos: bigint; orden: { estado: string } }[] };

/** Lo que toman las órdenes vivas, lo pagado y el saldo de un comprobante, en centavos. */
export function cuentasDe(c: ConPagos) {
  const vivas = c.pagos.filter((p) => p.orden.estado !== "ANULADA");
  const enOrdenes = vivas.reduce((s, p) => s + n(p.importeCentavos), 0);
  const pagado = vivas.filter((p) => p.orden.estado === "PAGADA").reduce((s, p) => s + n(p.importeCentavos), 0);
  const total = n(c.totalCentavos);
  return { total, enOrdenes, pagado, saldo: c.anuladoEl ? 0 : saldoDe(total, enOrdenes), porPagar: c.anuladoEl ? 0 : Math.max(0, total - pagado) };
}

export async function comprobantesDelNegocio(tenantId: string, filtro: { supplierId?: string; referencia?: string } = {}) {
  const filas = await prisma.proyectoComprobante.findMany({
    where: { tenantId, ...(filtro.supplierId ? { supplierId: filtro.supplierId } : {}), ...(filtro.referencia ? { referenciaVinculada: filtro.referencia } : {}) },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, tipo: true, numero: true, fecha: true, netoCentavos: true, ivaCentavos: true, vinculada: true, referenciaVinculada: true, cargadoNombre: true,
      supplier: { select: { id: true, name: true } },
      adjunto: { select: { nombre: true } },
      lineas: { select: { netoCentavos: true, ivaCentavos: true } },
      ...SELECT_SALDO,
    },
  });
  return filas.map((c) => {
    const cuentas = cuentasDe(c);
    const imputado = c.lineas.reduce((s, l) => s + n(l.netoCentavos) + n(l.ivaCentavos), 0);
    return { ...c, ...cuentas, faltaImputar: cuentas.total - imputado, anulado: !!c.anuladoEl };
  });
}
export type FilaComprobante = Awaited<ReturnType<typeof comprobantesDelNegocio>>[number];

export async function comprobanteParaVer(tenantId: string, id: string) {
  const c = await prisma.proyectoComprobante.findFirst({
    where: { tenantId, id },
    select: {
      id: true, tipo: true, numero: true, fecha: true, moneda: true, netoCentavos: true, ivaCentavos: true, detalle: true, vinculada: true, referenciaVinculada: true,
      modeloCompra: true, modeloCompraProvisional: true, cargadoPorId: true, cargadoNombre: true, createdAt: true, anuladoPor: true,
      supplier: { select: { id: true, name: true, taxId: true } },
      adjunto: { select: { nombre: true, tipoMime: true, tamanoBytes: true } },
      lineas: {
        orderBy: { orden: "asc" },
        select: { id: true, destino: true, sector: true, categoria: true, detalle: true, netoCentavos: true, ivaCentavos: true, ivaTratamiento: true, ivaProvisional: true, costoCentavos: true, proyecto: { select: { id: true, numero: true, nombre: true } } },
      },
      cuotas: { select: { cuota: { select: { id: true, concepto: true, monto: true, moneda: true, venceEl: true, pagadoEl: true, proyecto: { select: { numero: true, nombre: true } } } } } },
      ...SELECT_SALDO,
    },
  });
  if (!c) return null;
  const [enlazables, ordenes] = await Promise.all([
    prisma.proyectoCuota.findMany({
      where: { tenantId, supplierId: c.supplier.id, tipo: { not: "COBRO" }, anuladoEl: null, pagadoEl: null, comprobanteEnlace: null },
      orderBy: { venceEl: "asc" },
      take: 50,
      select: { id: true, concepto: true, monto: true, moneda: true, venceEl: true, proyecto: { select: { numero: true, nombre: true } } },
    }),
    prisma.proyectoOrdenPagoLinea.findMany({
      where: { tenantId, comprobanteId: id },
      select: { importeCentavos: true, cuotaId: true, orden: { select: { id: true, numero: true, estado: true, aprobadaNombre: true, pagadaEl: true } } },
    }),
  ]);
  return { ...c, ...cuentasDe(c), anulado: !!c.anuladoEl, enlazables, ordenes };
}

/**
 * A pagar a proveedores por comprobante: los que tienen saldo (lo que no toma ninguna orden viva) o una orden pendiente
 * de pagar. `porPagar` = total − lo pagado. Agrupado por proveedor.
 */
export async function aPagarPorComprobante(tenantId: string) {
  const filas = await prisma.proyectoComprobante.findMany({
    where: { tenantId, anuladoEl: null },
    orderBy: { fecha: "asc" },
    select: {
      id: true, tipo: true, numero: true, fecha: true, cargadoPorId: true,
      supplier: { select: { id: true, name: true } },
      cuotas: { select: { cuota: { select: { id: true, concepto: true, monto: true, venceEl: true } } } },
      ...SELECT_SALDO,
      pagos: { select: { importeCentavos: true, cuotaId: true, orden: { select: { estado: true } } } },
    },
  });
  const conDeuda = filas.map((c) => ({ ...c, ...cuentasDe(c) })).filter((c) => c.porPagar > 0);
  const porProveedor = new Map<string, { supplierId: string; nombre: string; porPagar: number; saldo: number; comprobantes: typeof conDeuda }>();
  for (const c of conDeuda) {
    const g = porProveedor.get(c.supplier.id) ?? { supplierId: c.supplier.id, nombre: c.supplier.name, porPagar: 0, saldo: 0, comprobantes: [] };
    g.porPagar += c.porPagar;
    g.saldo += c.saldo;
    g.comprobantes.push(c);
    porProveedor.set(c.supplier.id, g);
  }
  return [...porProveedor.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * MIA-199 · P5-1: lo que se debe por comprobantes SIN cuotas (lo de los que tienen cuotas ya lo cuentan sus cuotas de
 * pago), en pesos, total y por proveedor. Así «A PAGAR» de Administración y «Por pagar» de Proveedores no dan $ 0 con
 * comprobantes impagos. Sin M1, cero.
 */
export async function aPagarSinCuotas(tenantId: string, db: Db = prisma): Promise<{ total: number; porProveedor: Map<string, number> }> {
  const filas = await siHayM1(() =>
    db.proyectoComprobante.findMany({
      where: { tenantId, anuladoEl: null, cuotas: { none: {} } },
      select: { id: true, moneda: true, supplierId: true, ...SELECT_SALDO, pagos: { select: { importeCentavos: true, cuotaId: true, orden: { select: { estado: true } } } } },
    }),
  );
  const porProveedor = new Map<string, number>();
  if (!filas) return { total: 0, porProveedor };
  const cambios = await cambiosDeComprobantes(db, tenantId, filas);
  let total = 0;
  for (const c of filas) {
    const debe = cuentasDe(c).porPagar;
    if (!(debe > 0)) continue;
    const enPesos = enPesosDelComprobante(debe, c.moneda, cambios.get(c.id));
    total += enPesos;
    porProveedor.set(c.supplierId, (porProveedor.get(c.supplierId) ?? 0) + enPesos / 100);
  }
  return { total: total / 100, porProveedor };
}

/** Lo imputado a cada proyecto, en pesos, para `resultadoReal` (O13). Sin M1, nada. */
export async function imputadoDeProyectos(tenantId: string, proyectoIds: readonly string[], db: Db = prisma): Promise<Map<string, Imputado>> {
  const salida = new Map<string, Imputado>();
  if (proyectoIds.length === 0) return salida;
  const comprobantes = await siHayM1(() =>
    db.proyectoComprobante.findMany({
      where: { tenantId, anuladoEl: null, lineas: { some: { proyectoId: { in: [...proyectoIds] } } } },
      select: { ...SELECT_SALDO, id: true, moneda: true, lineas: { select: { proyectoId: true, netoCentavos: true, ivaCentavos: true, costoCentavos: true } } },
    }),
  );
  if (!comprobantes) return salida;
  // T08 · O31: un comprobante en otra moneda cuesta en pesos con el cambio con que se fijó su costo (su foto): pagarlo
  // a otro cambio no mueve el costo del proyecto; la diferencia va a Administración.
  const cambios = await cambiosDeComprobantes(db, tenantId, comprobantes);
  const k = (c: { id: string; moneda: string }, centavos: number) => enPesosDelComprobante(centavos, c.moneda, cambios.get(c.id));
  const m = imputadoPorProyecto(
    comprobantes.map((c) => ({
      totalCentavos: k(c, n(c.totalCentavos)),
      pagadoCentavos: k(c, cuentasDe(c).pagado),
      anulado: !!c.anuladoEl,
      lineas: c.lineas.map((l) => ({ proyectoId: l.proyectoId, netoCentavos: k(c, n(l.netoCentavos)), ivaCentavos: k(c, n(l.ivaCentavos)), costoCentavos: k(c, n(l.costoCentavos)) })),
    })),
  );
  for (const [id, v] of m) salida.set(id, { costo: v.costo / 100, pagado: v.pagado / 100, porPagar: v.porPagar / 100 });
  return salida;
}
/** Las líneas imputadas a un proyecto, como costo por categoría (para la tabla por rubro de la ficha). Sin M1, ninguna. */
export async function lineasImputadasDe(tenantId: string, proyectoId: string) {
  const filas = await siHayM1(() =>
    prisma.proyectoComprobanteLinea.findMany({
      where: { tenantId, proyectoId, comprobante: { anuladoEl: null } },
      select: { categoria: true, costoCentavos: true, comprobante: { select: { tipo: true, numero: true, supplier: { select: { name: true } } } } },
    }),
  );
  return (filas ?? []).map((l) => ({ rubro: l.categoria, neto: n(l.costoCentavos) / 100, iva: 0, pagadoEl: null, anuladoEl: null, origen: `${l.comprobante.supplier.name} · ${l.comprobante.tipo} ${l.comprobante.numero}` }));
}

/** MIA-211 · H2: un comprobante de proveedor imputado al proyecto, como salida del cashflow del evento. */
export interface ComprobanteEnFlujo {
  /** «comprobante:<id>»: no choca con el id de una cuota. */
  id: string;
  comprobanteId: string;
  tipo: "PAGO";
  concepto: string;
  proveedor: string;
  /** Lo que se le paga al proveedor por lo imputado a ESTE proyecto (neto + IVA de sus líneas), en la moneda del comprobante. */
  monto: number;
  moneda: string;
  /** La fecha del comprobante; pagado, la de la orden que lo terminó de pagar. */
  venceEl: Date;
  pagadoEl: Date | null;
  anuladoEl: null;
}

/**
 * MIA-211 · H2: los comprobantes imputados al proyecto (no anulados), uno por comprobante, con lo que se le paga al
 * proveedor por la parte de este proyecto. Pagado = las órdenes PAGADAS cubren su total. `cuotas`: las cuotas enlazadas a
 * esos comprobantes, que el flujo no cuenta otra vez (es la misma deuda). Sin M1, ninguno.
 */
export async function comprobantesEnElFlujo(tenantId: string, proyectoId: string): Promise<{ comprobantes: ComprobanteEnFlujo[]; cuotas: Set<string> }> {
  const filas = await siHayM1(() =>
    prisma.proyectoComprobante.findMany({
      where: { tenantId, anuladoEl: null, lineas: { some: { proyectoId } } },
      orderBy: { fecha: "asc" },
      select: {
        id: true,
        tipo: true,
        numero: true,
        fecha: true,
        moneda: true,
        totalCentavos: true,
        supplier: { select: { name: true } },
        lineas: { where: { proyectoId }, select: { netoCentavos: true, ivaCentavos: true } },
        pagos: { where: { orden: { estado: "PAGADA" } }, select: { importeCentavos: true, orden: { select: { pagadaEl: true } } } },
        cuotas: { select: { cuotaId: true } },
      },
    }),
  );
  const comprobantes = (filas ?? []).map((c): ComprobanteEnFlujo => {
    const pagado = c.pagos.reduce((x, p) => x + n(p.importeCentavos), 0);
    const ultima = c.pagos.reduce<Date | null>((x, p) => (p.orden.pagadaEl && (!x || p.orden.pagadaEl > x) ? p.orden.pagadaEl : x), null);
    const pagadoEl = pagado >= n(c.totalCentavos) ? (ultima ?? c.fecha) : null;
    return {
      id: `comprobante:${c.id}`,
      comprobanteId: c.id,
      tipo: "PAGO",
      concepto: `${c.tipo === "SIN_FACTURA" ? "Comprobante sin factura" : `Factura ${c.tipo}`} ${c.numero}`,
      proveedor: c.supplier.name,
      monto: c.lineas.reduce((x, l) => x + n(l.netoCentavos) + n(l.ivaCentavos), 0) / 100,
      moneda: c.moneda,
      venceEl: pagadoEl ?? c.fecha,
      pagadoEl,
      anuladoEl: null,
    };
  });
  return { comprobantes, cuotas: new Set((filas ?? []).flatMap((c) => c.cuotas.map((q) => q.cuotaId))) };
}

/**
 * MIA-211 · H3: el costo (en pesos) imputado al proyecto por comprobantes no anulados de proveedores que no están en
 * `conItem` (los proveedores de los ítems, cuyas cuotas ya salen en el cashflow). Sin M1, 0.
 */
export async function imputadoSinItem(tenantId: string, proyectoId: string, conItem: ReadonlySet<string>, tc: Readonly<Record<string, number>>): Promise<number> {
  const filas = await siHayM1(() =>
    prisma.proyectoComprobanteLinea.findMany({
      where: { tenantId, proyectoId, comprobante: { anuladoEl: null, supplierId: { notIn: [...conItem] } } },
      select: { costoCentavos: true, comprobante: { select: { moneda: true } } },
    }),
  );
  return redondear((filas ?? []).reduce((s, l) => s + aPesos(n(l.costoCentavos) / 100, l.comprobante.moneda, tc), 0));
}

export const imputadoDe = (m: Map<string, Imputado>, id: string): Imputado => m.get(id) ?? SIN_IMPUTADO;

/** Las cuotas de pago enlazadas a un comprobante: ya no son previstas (las cuenta su comprobante). Sin M1, ninguna. */
export async function cuotasEnlazadas(tenantId: string, proyectoIds?: readonly string[], db: Db = prisma): Promise<Set<string>> {
  const filas = await siHayM1(() =>
    db.proyectoCuotaComprobante.findMany({ where: { tenantId, ...(proyectoIds ? { cuota: { proyectoId: { in: [...proyectoIds] } } } : {}) }, select: { cuotaId: true } }),
  );
  return new Set((filas ?? []).map((f) => f.cuotaId));
}

/** Los gastos de campo rendidos que todavía no se aprobaron (O13): cuentan en el provisorio, no en el premio. Sin la tabla, ninguno. */
export async function gastosRendidosSinAprobar(tenantId: string, proyectoIds: readonly string[], db: Db = prisma): Promise<Set<string>> {
  if (proyectoIds.length === 0) return new Set();
  const filas = await siHayM1(() =>
    db.proyectoRendicion.findMany({ where: { tenantId, proyectoId: { in: [...proyectoIds] }, estado: { notIn: ["aprobada", "reintegrada"] } }, select: { gastoId: true } }),
  );
  return new Set((filas ?? []).map((f) => f.gastoId));
}

type CuotaParaCosto = { id: string; tipo: string; monto: number; moneda: string; pagadoEl: Date | null; anuladoEl: Date | null; prevista?: boolean | null };
export interface ProyectoParaCosto {
  id: string;
  t: Totales | null;
  gastos: readonly (GastoCalculable & { id: string })[];
  /** Las cuotas de PAGO del proyecto (las demás no cuentan). */
  cuotas: readonly CuotaParaCosto[];
}

/**
 * O13 · EL costo real de cada proyecto, con todo lo que lo forma: lo imputado por comprobantes, los gastos (los rendidos
 * sin aprobar, marcados para el premio) y lo previsto por cuotas de pago que NO están enlazadas a un comprobante. La
 * ficha, Dirección y Rentabilidad la llaman: por eso muestran el mismo número.
 */
// Préstamo de T10 (Adenda 1 § D.1): `db` opcional, para que la liquidación del proyecto congele el costo dentro de su transacción.
export async function costoRealDeProyectos(tenantId: string, proyectos: readonly ProyectoParaCosto[], tc: Readonly<Record<string, number>>, db: Db = prisma): Promise<Map<string, ResultadoReal>> {
  const ids = proyectos.map((p) => p.id);
  const [imputado, enlazadas, sinAprobar, pagados] = await Promise.all([
    imputadoDeProyectos(tenantId, ids, db),
    cuotasEnlazadas(tenantId, ids, db),
    gastosRendidosSinAprobar(tenantId, ids, db),
    pagosParcialesDeCuotas(tenantId, proyectos.flatMap((p) => p.cuotas), tc, db),
  ]);
  return new Map(
    proyectos.map((p) => {
      const previstas = p.cuotas.filter((q) => !enlazadas.has(q.id));
      const gastos = p.gastos.map((g) => ({ ...g, sinAprobar: sinAprobar.has(g.id) }));
      return [p.id, resultadoReal(p.t, gastos, porPagarDeCuotas(previstas, pagados, tc), imputadoDe(imputado, p.id))];
    }),
  );
}

/** O30 · el IVA crédito fiscal del período (mes «AAAA-MM»), por comprobante: para exportar al contador. */
export async function ivaCreditoDelPeriodo(tenantId: string, mes: string) {
  const desde = new Date(`${mes}-01T00:00:00-03:00`);
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);
  const filas = await prisma.proyectoComprobante.findMany({
    where: { tenantId, anuladoEl: null, fecha: { gte: desde, lt: hasta }, lineas: { some: { ivaTratamiento: "CREDITO" } } },
    orderBy: { fecha: "asc" },
    select: { id: true, tipo: true, numero: true, fecha: true, supplier: { select: { name: true, taxId: true } }, lineas: { where: { ivaTratamiento: "CREDITO" }, select: { netoCentavos: true, ivaCentavos: true } } },
  });
  const renglones = filas.map((c) => ({ ...c, neto: c.lineas.reduce((s, l) => s + n(l.netoCentavos), 0), iva: c.lineas.reduce((s, l) => s + n(l.ivaCentavos), 0) }));
  return { renglones, totalIva: renglones.reduce((s, r) => s + r.iva, 0), totalNeto: renglones.reduce((s, r) => s + r.neto, 0) };
}

/** O44 · compras a sociedades vinculadas del negocio (nunca lee otro negocio: el filtro es `tenantId` y la RLS). */
export async function comprasAVinculadas(tenantId: string) {
  const filas = await prisma.proyectoComprobante.findMany({
    where: { tenantId, vinculada: true },
    orderBy: { fecha: "desc" },
    take: 200,
    select: { id: true, tipo: true, numero: true, fecha: true, totalCentavos: true, referenciaVinculada: true, anuladoEl: true, supplier: { select: { name: true } } },
  });
  return filas.map((f) => ({ ...f, total: n(f.totalCentavos) }));
}

export async function ordenesDelNegocio(tenantId: string) {
  const filas = await prisma.proyectoOrdenPago.findMany({
    where: { tenantId },
    orderBy: { numero: "desc" },
    take: 100,
    select: { id: true, numero: true, estado: true, totalCentavos: true, medio: true, creadaNombre: true, aprobadaNombre: true, pagadaEl: true, createdAt: true, supplier: { select: { name: true } } },
  });
  return filas.map((f) => ({ ...f, estado: f.estado as EstadoOrden, total: n(f.totalCentavos) }));
}

export async function ordenParaVer(tenantId: string, id: string) {
  const o = await prisma.proyectoOrdenPago.findFirst({
    where: { tenantId, id },
    select: {
      id: true, numero: true, estado: true, totalCentavos: true, medio: true, creadaPorId: true, creadaNombre: true, aprobadaNombre: true, pagadaEl: true, anuladaEl: true, anuladaPor: true, createdAt: true,
      supplier: { select: { id: true, name: true, taxId: true } },
      lineas: {
        select: {
          importeCentavos: true,
          comprobante: { select: { id: true, tipo: true, numero: true, fecha: true, totalCentavos: true, cargadoPorId: true, cargadoNombre: true } },
          cuota: { select: { concepto: true, venceEl: true } },
        },
      },
    },
  });
  if (!o) return null;
  return { ...o, estado: o.estado as EstadoOrden, total: n(o.totalCentavos), cargadores: [...new Set(o.lineas.map((l) => l.comprobante.cargadoPorId))] };
}

/** El adjunto, para bajarlo. */
export async function adjuntoDe(tenantId: string, comprobanteId: string) {
  return await prisma.proyectoComprobanteAdjunto.findFirst({ where: { tenantId, comprobanteId }, select: { nombre: true, tipoMime: true, datos: true } });
}
