// ============================================================================
// PROYECTOS — lecturas del pipeline y de la ficha. Siempre a través de lo que esta persona puede ver: lo que su rol no ve no sale
// de acá, ni escondido en el HTML. Las escrituras: acciones-ficha.ts.
// ============================================================================

import type { Prisma } from "@/generated/prisma/client";
import { getCurrentTenantId } from "@/lib/tenant";
import "server-only";
import { prisma } from "@/lib/prisma";
import { aPesos, COLUMNAS_FICHA, cashflowDelEvento, codigoProyecto, resumenCuotas, totalesFicha, ventaTotalItem } from "./gestion-core";
import { columnasOcultas, filtroDeProyectos, puede, tiposDeCambio, versionViva, aItemFicha, type Actor } from "./gestion.server";
import { configProyectos, datosDelNegocio } from "./datos.server";
import { facturasDeCuotas, motivoParaNoFacturarCuotas, type FacturaDeCuotaVista } from "./facturar-cuota.server";
import { desvioPorRubro, fechaCorta, fechaParaInput, redondear, resultadoReal, totales } from "./core";
import { cambioDeVenta, costoSinProveedor, enMonedaDeVenta, ventaEn } from "./gestion-core";
import { cambioVisible, columnaDe, filaDeFicha, iniciales, monedasSinCambio, planillaDeVenta } from "./ficha-core";

export interface TarjetaProyecto {
  id: string;
  ventaTexto: string; // en la moneda del evento; `venta` sigue en pesos para sumar
  codigo: string;
  nombre: string;
  ciudad: string | null;
  cliente: string;
  tipo: string | null;
  iniciales: string[];
  venta: number;
  fecha: string;
  fechaOrden: number;
  etapa: string;
  columna: string;
  motivoPerdida: string | null;
}

export const TOPE_TABLERO = 300;

export async function tableroPipeline(a: Actor): Promise<TarjetaProyecto[]> {
  const [proyectos, tc, config] = await Promise.all([
    prisma.proyecto.findMany({
      where: filtroDeProyectos(a),
      orderBy: [{ fechaEvento: { sort: "asc", nulls: "last" } }, { numero: "desc" }],
      take: TOPE_TABLERO,
      select: {
        id: true,
        moneda: true,
        numero: true,
        nombre: true,
        etapa: true,
        ciudad: true,
        tipoEvento: true,
        evento: true,
        fechaEvento: true,
        createdAt: true,
        perdidoEl: true,
        motivoPerdida: true,
        client: { select: { name: true } },
        equipo: { select: { persona: { select: { nombre: true } } } },
        presupuestos: { orderBy: { version: "desc" }, take: 1, select: { tcVenta: true, items: { select: { cantidad: true, costo: true, moneda: true, recargoPct: true, precio: true } } } },
      },
    }),
    tiposDeCambio(a.tenantId),
    configProyectos(a.tenantId),
  ]);
  return proyectos.map((p) => ({
    id: p.id,
    codigo: codigoProyecto(p.numero, p.createdAt),
    nombre: p.nombre,
    ciudad: p.ciudad,
    cliente: p.client.name,
    tipo: p.tipoEvento ?? p.evento,
    iniciales: p.equipo.map((e) => iniciales(e.persona.nombre)),
    venta: redondear((p.presupuestos[0]?.items ?? []).reduce((s, i) => s + ventaTotalItem(i, tc, config.margenPct), 0)),
    ventaTexto: ventaEn(redondear((p.presupuestos[0]?.items ?? []).reduce((s, i) => s + ventaTotalItem(i, tc, config.margenPct), 0)), p.moneda, cambioDeVenta(p.moneda, p.presupuestos[0]?.tcVenta, tc)),
    fecha: p.fechaEvento ? fechaCorta(p.fechaEvento) : "Sin fecha",
    fechaOrden: p.fechaEvento?.getTime() ?? Number.MAX_SAFE_INTEGER,
    etapa: p.etapa,
    columna: columnaDe(p),
    motivoPerdida: p.motivoPerdida,
  }));
}

export interface Vista {
  costos: boolean;
  editaCostos: boolean;
  pagos: boolean;
  editaPagos: boolean;
  pipelineEdita: boolean;
  fichaEdita: boolean;
  cotizaciones: boolean;
  editaCotizaciones: boolean;
  ocultas: Set<string>;
}

export function vistaDe(a: Actor): Vista {
  const costos = puede(a, "costos", "ver");
  // Sin el permiso de costos, se ocultan las cuatro columnas aunque el rol no las tenga en su lista.
  const ocultas = new Set(costos ? columnasOcultas(a) : COLUMNAS_FICHA.map((c) => c.id));
  return {
    costos,
    editaCostos: puede(a, "costos", "editar"),
    pagos: puede(a, "pagos", "ver"),
    editaPagos: puede(a, "pagos", "editar"),
    pipelineEdita: puede(a, "pipeline", "editar"),
    fichaEdita: puede(a, "ficha", "editar"),
    cotizaciones: puede(a, "cotizaciones", "ver"),
    editaCotizaciones: puede(a, "cotizaciones", "editar"),
    ocultas,
  };
}

/** Lo que usan el encabezado y todas las pestañas. Null si el proyecto no es de esta persona: de afuera, es como si no existiera. */
export async function cabeceraFicha(a: Actor, id: string) {
  const proyecto = await prisma.proyecto.findFirst({
    where: { ...filtroDeProyectos(a), id },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      equipo: { include: { persona: { select: { id: true, nombre: true, puesto: true } } } },
    },
  });
  if (!proyecto) return null;
  const [viva, config, tc, negocio] = await Promise.all([versionViva(a.tenantId, id), configProyectos(a.tenantId), tiposDeCambio(a.tenantId), datosDelNegocio(a.tenantId)]);
  const items = (viva?.items ?? []).map(aItemFicha);
  return {
    proyecto,
    viva,
    config,
    tc,
    negocio,
    codigo: codigoProyecto(proyecto.numero, proyecto.createdAt),
    totales: totalesFicha(items, tc, config.margenPct),
    sinProveedor: costoSinProveedor(items, tc),
    faltanCambio: monedasSinCambio(viva?.items ?? [], tc),
  };
}

export type Cabecera = NonNullable<Awaited<ReturnType<typeof cabeceraFicha>>>;

export async function datosResumen(a: Actor, cab: Cabecera, vista: Vista) {
  const [personas, cuotas, cantChecklist] = await Promise.all([
    prisma.proyectoPersona.findMany({ where: { tenantId: a.tenantId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true, puesto: true } }),
    vista.pagos ? prisma.proyectoCuota.findMany({ where: { tenantId: a.tenantId, proyectoId: cab.proyecto.id, anuladoEl: null, prevista: false }, select: { tipo: true, monto: true, moneda: true, venceEl: true, pagadoEl: true, anuladoEl: true } }) : [],
    prisma.proyectoChecklist.count({ where: { tenantId: a.tenantId, proyectoId: cab.proyecto.id } }),
  ]);
  return { personas, finanzas: vista.pagos ? resumenCuotas(cuotas, cab.tc) : null, cantCuotas: cuotas.length, cantChecklist };
}

export async function datosFicha(a: Actor, cab: Cabecera, vista: Vista) {
  const items = cab.viva?.items ?? [];
  const [archivos, proveedores] = await Promise.all([
    items.length > 0 ? prisma.proyectoArchivo.groupBy({ by: ["itemId"], where: { tenantId: a.tenantId, proyectoId: cab.proyecto.id, itemId: { in: items.map((i) => i.id) } }, _count: { _all: true } }) : [],
    vista.fichaEdita ? prisma.supplier.findMany({ where: { tenantId: a.tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }) : [],
  ]);
  const adjuntos = new Map(archivos.map((f) => [f.itemId, f._count._all]));
  const filas = items.map((i) =>
    filaDeFicha({ ...i, fechaLimite: fechaParaInput(i.fechaLimite), adjuntos: adjuntos.get(i.id) ?? 0 }, cab.tc, cab.config.margenPct, vista.ocultas),
  );
  return { filas, proveedores };
}

export async function datosCotizacion(a: Actor, proyectoId: string) {
  return prisma.proyectoPresupuesto.findMany({
    where: { tenantId: a.tenantId, proyectoId },
    orderBy: { version: "desc" },
    include: { items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }] } },
  });
}

export async function datosFinanzas(a: Actor, cab: Cabecera, vista: Vista) {
  const proyectoId = cab.proyecto.id;
  const { tenantId } = a;
  const [cuotas, pagos, gastos, aprobada, proveedores] = await Promise.all([
    prisma.proyectoCuota.findMany({ where: { tenantId, proyectoId }, include: { supplier: { select: { name: true } } }, orderBy: { venceEl: "asc" } }),
    prisma.proyectoPago.findMany({ where: { tenantId, proyectoId }, orderBy: { createdAt: "desc" } }),
    vista.costos ? prisma.proyectoGasto.findMany({ where: { tenantId, proyectoId }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], include: { supplier: { select: { name: true } } } }) : [],
    prisma.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId, estado: "APROBADO" }, orderBy: { version: "desc" }, select: { ivaPct: true, items: true } }),
    vista.editaPagos ? prisma.supplier.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }) : [],
  ]);
  // Sin permiso de costos, un pago a proveedor delata el costo: sólo se ven los cobros.
  const visibles = vista.costos ? cuotas : cuotas.filter((c) => c.tipo === "COBRO");
  const flujo = cashflowDelEvento(visibles, cab.tc);
  // Pasados a pesos: un ítem en dólares no se puede comparar como si fueran pesos.
  const aprobadaEnPesos = aprobada?.items.map((i) => ({ rubro: i.rubro, cantidad: i.cantidad, costo: aPesos(i.costo, i.moneda, cab.tc), precio: i.cantidad > 0 ? ventaTotalItem(i, cab.tc, cab.config.margenPct) / i.cantidad : 0 })) ?? [];
  const totalesAprobada = aprobada ? totales(aprobadaEnPesos, aprobada.ivaPct) : null;
  const cobrado = redondear(pagos.filter((p) => !p.anuladoEl).reduce((s, p) => s + p.monto, 0));
  const totalAprobado = totalesAprobada?.total ?? 0;
  // Etapa 2 · T2: la factura de ARCA de cada cobro, si el negocio factura cuotas (las cuatro llaves).
  const facturaCuotas = (await motivoParaNoFacturarCuotas(tenantId)) === null;
  const facturas = facturaCuotas ? await facturasDeCuotas(tenantId, visibles.filter((c) => c.tipo === "COBRO").map((c) => c.id)) : new Map<string, FacturaDeCuotaVista>();
  return {
    facturaCuotas,
    facturas,
    cuotas: visibles,
    flujo,
    resumen: resumenCuotas(visibles, cab.tc),
    pagos,
    gastos,
    totalesAprobada,
    totalAprobado,
    cobrado,
    saldo: redondear(totalAprobado - cobrado),
    real: resultadoReal(totalesAprobada, gastos),
    rubros: desvioPorRubro(aprobadaEnPesos, gastos),
    proveedores,
  };
}

export async function datosSeguimiento(a: Actor, cab: Cabecera, vista: Vista) {
  const proyectoId = cab.proyecto.id;
  const { tenantId } = a;
  const [checklist, tareas, cuotas, pagos] = await Promise.all([
    prisma.proyectoChecklist.findMany({ where: { tenantId, proyectoId }, orderBy: [{ fecha: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] }),
    prisma.proyectoTarea.findMany({ where: { tenantId, proyectoId }, orderBy: [{ hechaEl: { sort: "asc", nulls: "first" } }, { venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] }),
    vista.pagos ? prisma.proyectoCuota.findMany({ where: { tenantId, proyectoId, tipo: "COBRO", anuladoEl: null, prevista: false }, orderBy: { venceEl: "asc" } }) : [],
    vista.pagos ? prisma.proyectoPago.findMany({ where: { tenantId, proyectoId, anuladoEl: null }, orderBy: { createdAt: "desc" } }) : [],
  ]);
  return { checklist, tareas, cuotas, pagos };
}

// Los comprobantes de Rendí no van acá: se ven en «Rendiciones», con su permiso.
export async function datosArchivos(a: Actor, cab: Cabecera) {
  const filas = await prisma.proyectoArchivo.findMany({ where: { tenantId: a.tenantId, proyectoId: cab.proyecto.id, tipo: { not: "COMPROBANTE" } }, orderBy: { createdAt: "desc" } });
  const items = cab.viva?.items ?? [];
  // La imagen viaja por su ruta, de a una: acá sólo su tamaño, para no meter 30 MB en la página.
  return {
    archivos: filas.map(({ datos, ...f }) => ({ ...f, esImagen: !!datos?.startsWith("data:image/"), esPdf: !!datos?.startsWith("data:application/pdf"), tamano: f.tamanoBytes ?? (datos ? Math.round(datos.length * 0.75) : null) })),
    items: items.map((i) => ({ id: i.id, descripcion: i.descripcion })),
  };
}

export async function datosHistorial(a: Actor, proyectoId: string, vista: Vista) {
  const filas = await prisma.proyectoCambio.findMany({ where: { tenantId: a.tenantId, proyectoId }, orderBy: { createdAt: "desc" }, take: 300 });
  return filas.filter((c) => cambioVisible(c, { costos: vista.costos, pagos: vista.pagos }));
}

/** Para las piezas y el armador, que siguen viviendo en la ficha. */
export async function datosDiseno(a: Actor, proyectoId: string) {
  const [stands, entregables] = await Promise.all([
    prisma.proyectoStand.findMany({ where: { tenantId: a.tenantId, proyectoId }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true } }),
    prisma.proyectoEntregable.findMany({
      where: { tenantId: a.tenantId, proyectoId, anuladoEl: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, nombre: true, especificacion: true, venceEl: true, versiones: { orderBy: { numero: "desc" }, select: { numero: true, estado: true, comentario: true, respondidoPor: true } } },
    }),
  ]);
  return { stands, entregables };
}

/** Lo que sale en papel y en la planilla descargable: nunca un costo. */
export function planillaParaPapel(a: Actor, proyectoId: string, versionId?: string | null) {
  return armarPapel(a.tenantId, { ...filtroDeProyectos(a), id: proyectoId }, versionId);
}

/** El mismo papel para el cliente, con el link de su propuesta. Un borrador todavía no existe para él. */
export async function papelDeLaPropuesta(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const version = await prisma.proyectoPresupuesto.findFirst({ where: { tenantId, token, estado: { not: "BORRADOR" } }, select: { id: true, proyectoId: true } });
  return version ? armarPapel(tenantId, { tenantId, id: version.proyectoId }, version.id) : null;
}

async function armarPapel(tenantId: string, cual: Prisma.ProyectoWhereInput, versionId?: string | null) {
  const p = await prisma.proyecto.findFirst({
    where: cual,
    select: { moneda: true, id: true, numero: true, nombre: true, lugar: true, ciudad: true, fechaEvento: true, createdAt: true, client: { select: { name: true } } },
  });
  if (!p) return null;
  const version = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId, proyectoId: p.id, ...(versionId ? { id: versionId } : {}) },
    orderBy: { version: "desc" },
    select: { version: true, ivaPct: true, tcVenta: true, condiciones: true, items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { descripcion: true, rubro: true, unidad: true, cantidad: true, costo: true, moneda: true, recargoPct: true, precio: true, visibleCliente: true } } },
  });
  if (!version) return null;
  const [tc, config, negocio] = await Promise.all([tiposDeCambio(tenantId), configProyectos(tenantId), datosDelNegocio(tenantId)]);
  const enPesos = planillaDeVenta(version.items, tc, config.margenPct);
  // El papel es para el cliente: va en la moneda de venta.
  const cambio = cambioDeVenta(p.moneda, version.tcVenta, tc);
  const moneda = cambio > 0 ? p.moneda : "ARS";
  const en = (n: number) => (moneda === "ARS" ? n : enMonedaDeVenta(n, cambio));
  const grupos = enPesos.grupos.map((g) => ({ ...g, subtotal: en(g.subtotal), lineas: g.lineas.map((l) => ({ ...l, importe: en(l.importe) })) }));
  const neto = en(enPesos.neto);
  const iva = redondear((neto * version.ivaPct) / 100);
  return { proyecto: p, codigo: codigoProyecto(p.numero, p.createdAt), negocio, moneda, version: version.version, condiciones: version.condiciones, ivaPct: version.ivaPct, grupos, neto, iva, total: redondear(neto + iva) };
}
