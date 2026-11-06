// ============================================================================
// ADMINISTRACIÓN Y DIRECCIÓN — lecturas del servidor, siempre acotadas al negocio. El permiso lo pide cada pantalla antes de
// llamar. Escrituras: acciones-empresa.ts. Reglas puras: empresa-core.ts y gestion-core.ts.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { aItemFicha, tiposDeCambio } from "./gestion.server";
import { configProyectos } from "./datos.server";
import { aPesos, codigoProyecto, nivelDeCarga, pipelinePonderado, proyeccionDeCaja, resumenCuotas, totalesFicha, type NivelCarga } from "./gestion-core";
import { desviosDelEvento, estaAbierto, estaActivo, estaConfirmado, finDeSemana, margenSobreVenta } from "./empresa-core";
import { redondear, yaVencio } from "./core";

const MESES_PROYECCION = 6;

// ── Cuotas ──────────────────────────────────────────────────────────────────

export async function cuotasDelNegocio(tenantId: string) {
  return prisma.proyectoCuota.findMany({
    where: { tenantId, anuladoEl: null, prevista: false },
    orderBy: { venceEl: "asc" },
    take: 3000,
    select: {
      id: true,
      proyectoId: true,
      tipo: true,
      concepto: true,
      monto: true,
      moneda: true,
      venceEl: true,
      pagadoEl: true,
      medio: true,
      factura: true,
      comentario: true,
      auto: true,
      supplier: { select: { name: true } },
      proyecto: { select: { id: true, numero: true, nombre: true, createdAt: true, client: { select: { name: true } } } },
    },
  });
}
export type CuotaDelNegocio = Awaited<ReturnType<typeof cuotasDelNegocio>>[number];

export async function recuadrosDeCuotas(tenantId: string) {
  const [cuotas, tc] = await Promise.all([cuotasDelNegocio(tenantId), tiposDeCambio(tenantId)]);
  return { cuotas, tc, resumen: resumenCuotas(cuotas, tc) };
}

export async function proveedoresActivos(tenantId: string) {
  return prisma.supplier.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } });
}

// ── Cashflow ────────────────────────────────────────────────────────────────

export async function cashflowDeEmpresa(tenantId: string) {
  const [cuentas, personas, fijos, { cuotas, tc }, proyectos] = await Promise.all([
    prisma.proyectoCuentaBanco.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, moneda: true, saldo: true } }),
    prisma.proyectoPersona.findMany({ where: { tenantId, activa: true }, select: { sueldoBase: true } }),
    prisma.proyectoGastoFijo.findMany({ where: { tenantId, activo: true }, select: { tipo: true, frecuencia: true, monto: true, moneda: true, fecha: true, activo: true } }),
    recuadrosDeCuotas(tenantId),
    proyectosConNumeros(tenantId),
  ]);
  const cajaHoy = redondear(cuentas.reduce((s, c) => s + aPesos(c.saldo, c.moneda, tc), 0));
  const sueldosMes = redondear(personas.reduce((s, p) => s + p.sueldoBase, 0));
  const proyeccion = proyeccionDeCaja({ cajaHoy, cuotas, sueldosMes, fijos, tiposDeCambio: tc, meses: MESES_PROYECCION });
  const minimo = proyeccion.reduce((m, x) => Math.min(m, x.saldo), 0);
  return {
    cuentas: cuentas.map((c) => ({ ...c, enPesos: aPesos(c.saldo, c.moneda, tc) })),
    cajaHoy,
    sueldosMes,
    proyeccion,
    necesidad: redondear(-minimo),
    ponderado: pipelinePonderado(proyectos.map((p) => ({ etapa: p.etapa, venta: p.ventaOEstimado, perdidoEl: p.perdidoEl }))),
    tc,
    sinCambio: faltaCambio(tc, [...cuotas, ...fijos, ...cuentas]),
  };
}

/** Sin tipo de cambio cargado, los dólares valdrían cero en todos los totales: la pantalla lo avisa. */
export function faltaCambio(tc: Readonly<Record<string, number>>, filas: readonly { moneda: string }[]): boolean {
  return filas.some((f) => f.moneda !== "ARS" && !(tc[f.moneda] > 0));
}

// ── Bancos ──────────────────────────────────────────────────────────────────

export async function datosDeBancos(tenantId: string) {
  const [cuentas, movimientos, sinConciliar, { cuotas, tc }, conciliadas] = await Promise.all([
    prisma.proyectoCuentaBanco.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, moneda: true, saldo: true } }),
    prisma.proyectoMovBanco.findMany({
      where: { tenantId },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        cuentaId: true,
        fecha: true,
        descripcion: true,
        importe: true,
        lote: true,
        cuotaId: true,
        cuenta: { select: { nombre: true, moneda: true } },
        cuota: { select: { id: true, tipo: true, concepto: true, pagadoEl: true, anuladoEl: true, proyectoId: true } },
      },
    }),
    prisma.proyectoMovBanco.groupBy({ by: ["cuentaId"], where: { tenantId, cuotaId: null }, _count: { _all: true } }),
    recuadrosDeCuotas(tenantId),
    prisma.proyectoMovBanco.findMany({ where: { tenantId, cuotaId: { not: null } }, select: { cuotaId: true } }),
  ]);
  const usadas = new Set(conciliadas.map((c) => c.cuotaId));
  return {
    cuentas: cuentas.map((c) => ({ ...c, sinConciliar: sinConciliar.find((s) => s.cuentaId === c.id)?._count._all ?? 0 })),
    movimientos,
    candidatas: cuotas.filter((c) => !usadas.has(c.id)),
    tc,
  };
}

// ── Monedas y gastos fijos ──────────────────────────────────────────────────

export async function monedasYFijos(tenantId: string) {
  const [cambio, fijos] = await Promise.all([
    prisma.proyectoTipoCambio.findFirst({ where: { tenantId, moneda: "USD" }, select: { porUnidad: true, updatedAt: true } }),
    prisma.proyectoGastoFijo.findMany({ where: { tenantId, activo: true }, orderBy: [{ tipo: "asc" }, { nombre: "asc" }], select: { id: true, tipo: true, nombre: true, frecuencia: true, monto: true, moneda: true, fecha: true } }),
  ]);
  return { cambio, fijos };
}

// ── Liquidaciones ───────────────────────────────────────────────────────────

export async function liquidacionesDelPeriodo(tenantId: string, periodo: string) {
  return prisma.proyectoLiquidacion.findMany({
    where: { tenantId, periodo },
    orderBy: { persona: { nombre: "asc" } },
    select: { id: true, periodo: true, base: true, extras: true, total: true, facturaA: true, estado: true, publicadaEl: true, vistaEl: true, persona: { select: { nombre: true, puesto: true } } },
  });
}

export async function misLiquidaciones(tenantId: string, personaId: string) {
  return prisma.proyectoLiquidacion.findMany({
    where: { tenantId, personaId, estado: { in: ["PUBLICADA", "PAGADA"] } }, // Rendí: la pagada se sigue viendo
    orderBy: { periodo: "desc" },
    take: 60,
    select: { id: true, periodo: true, base: true, extras: true, total: true, facturaA: true, publicadaEl: true, vistaEl: true, persona: { select: { nombre: true, puesto: true } } },
  });
}

export async function liquidacionParaImprimir(tenantId: string, id: string) {
  return prisma.proyectoLiquidacion.findFirst({
    where: { id, tenantId },
    select: { id: true, personaId: true, periodo: true, base: true, extras: true, total: true, facturaA: true, estado: true, publicadaEl: true, vistaEl: true, persona: { select: { nombre: true, puesto: true } } },
  });
}

// ── Proyectos con sus números ───────────────────────────────────────────────

/** Lo que Dirección mira de cada proyecto: venta y costo de la ficha viva (la última versión), lo real, lo cobrado y lo vencido. */
export async function proyectosConNumeros(tenantId: string) {
  const [proyectos, config, tc] = await Promise.all([
    prisma.proyecto.findMany({
      where: { tenantId },
      orderBy: [{ fechaEvento: { sort: "asc", nulls: "last" } }, { numero: "desc" }],
      take: 500,
      select: {
        id: true,
        numero: true,
        nombre: true,
        servicio: true,
        etapa: true,
        tipoEvento: true,
        ciudad: true,
        fechaEvento: true,
        moneda: true,
        presupuestoEstimado: true,
        perdidoEl: true,
        motivoPerdida: true,
        createdAt: true,
        client: { select: { name: true } },
        presupuestos: { orderBy: { version: "desc" }, take: 1, select: { items: { orderBy: { posicion: "asc" }, include: { supplier: { select: { name: true } } } } } },
        gastos: { where: { anuladoEl: null }, select: { rubro: true, neto: true, anuladoEl: true } },
        cuotas: { where: { anuladoEl: null, prevista: false, tipo: "COBRO" }, select: { monto: true, moneda: true, venceEl: true, pagadoEl: true, tipo: true } },
      },
    }),
    configProyectos(tenantId),
    tiposDeCambio(tenantId),
  ]);
  const hoy = new Date();
  return proyectos.map((p) => {
    const items = p.presupuestos[0]?.items ?? [];
    const t = totalesFicha(items.map(aItemFicha), tc, config.margenPct);
    const d = desviosDelEvento(items.map((i) => ({ id: i.id, descripcion: i.descripcion, rubro: i.rubro, cantidad: i.cantidad, costo: i.costo, moneda: i.moneda, costoReal: i.costoReal, proveedor: i.supplier?.name ?? i.proveedor })), p.gastos, tc);
    const r = resumenCuotas(p.cuotas, tc, hoy);
    const aCobrarTotal = redondear(r.cobrado + r.aCobrar);
    const estimado = p.presupuestoEstimado ? aPesos(p.presupuestoEstimado, p.moneda, tc) : 0;
    return {
      id: p.id,
      codigo: codigoProyecto(p.numero, p.createdAt),
      nombre: p.nombre,
      cliente: p.client.name,
      servicio: p.servicio,
      etapa: p.etapa,
      tipoEvento: p.tipoEvento,
      ciudad: p.ciudad,
      fechaEvento: p.fechaEvento,
      perdidoEl: p.perdidoEl,
      motivoPerdida: p.motivoPerdida,
      createdAt: p.createdAt,
      venta: t.venta,
      // Un lead todavía sin ficha pesa por lo que se estimó.
      ventaOEstimado: t.venta > 0 ? t.venta : estimado,
      costo: t.costo,
      margen: t.margen,
      margenPct: t.margenPct,
      conDatos: d.conDatos,
      lineas: d.lineas,
      costoReal: d.costoReal,
      margenReal: d.conDatos ? redondear(t.venta - d.costoReal) : null,
      margenRealPct: d.conDatos ? margenSobreVenta(t.venta, d.costoReal) : null,
      cobrado: r.cobrado,
      cobrosPct: aCobrarTotal > 0 ? redondear((r.cobrado / aCobrarTotal) * 100) : 0,
      vencido: r.cobrosVencidos,
    };
  });
}
export type ProyectoConNumeros = Awaited<ReturnType<typeof proyectosConNumeros>>[number];

export function resumenDeDireccion(proyectos: readonly ProyectoConNumeros[], hoy: Date = new Date()) {
  const anio = hoy.getFullYear();
  const delAnio = proyectos.filter((p) => estaConfirmado(p) && (p.fechaEvento ?? p.createdAt).getFullYear() === anio);
  const facturacion = redondear(delAnio.reduce((s, p) => s + p.venta, 0));
  const margen = redondear(delAnio.reduce((s, p) => s + p.margen, 0));
  return {
    anio,
    delAnio,
    facturacion,
    margen,
    margenPct: facturacion > 0 ? redondear((margen / facturacion) * 100) : 0,
    activos: proyectos.filter(estaActivo).length,
    pipeline: redondear(proyectos.filter(estaAbierto).reduce((s, p) => s + p.ventaOEstimado, 0)),
    proximos: proyectos.filter((p) => !p.perdidoEl && p.etapa !== "CIERRE" && p.fechaEvento && p.fechaEvento.getTime() >= hoy.getTime()).slice(0, 6),
  };
}

// ── Carga del equipo ────────────────────────────────────────────────────────

export interface FilaCarga {
  personaId: string;
  nombre: string;
  puesto: string;
  rol: string;
  proyectos: number;
  tareas: number;
  semana: number;
  vencidas: number;
  nivel: NivelCarga;
}

/** Una fila por persona activa, de la más cargada a la menos. Para la respuesta de arriba: `respuestaDeCarga` en empresa-core. */
export async function cargaDelEquipo(tenantId: string): Promise<FilaCarga[]> {
  const [personas, tareas] = await Promise.all([
    prisma.proyectoPersona.findMany({
      where: { tenantId, activa: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, puesto: true, rol: true, equipos: { select: { proyecto: { select: { etapa: true, perdidoEl: true } } } } },
    }),
    prisma.proyectoTarea.findMany({
      where: { tenantId, hechaEl: null, estado: { not: "APROBADA" }, proyecto: { perdidoEl: null } },
      select: { personaId: true, responsable: true, venceEl: true },
    }),
  ]);
  const hoy = new Date();
  const fin = finDeSemana(hoy).getTime();
  return personas
    .map((p) => {
      // Las tareas viejas guardan el responsable como texto, sin la persona.
      const suyas = tareas.filter((t) => t.personaId === p.id || (!t.personaId && t.responsable === p.nombre));
      return {
        personaId: p.id,
        nombre: p.nombre,
        puesto: p.puesto,
        rol: p.rol,
        proyectos: p.equipos.filter((e) => !e.proyecto.perdidoEl && e.proyecto.etapa !== "CIERRE").length,
        tareas: suyas.length,
        semana: suyas.filter((t) => t.venceEl && t.venceEl.getTime() >= hoy.getTime() && t.venceEl.getTime() < fin).length,
        vencidas: suyas.filter((t) => yaVencio(t.venceEl, hoy)).length,
        nivel: nivelDeCarga(suyas.length),
      };
    })
    .sort((a, b) => b.tareas - a.tareas || a.nombre.localeCompare(b.nombre));
}
