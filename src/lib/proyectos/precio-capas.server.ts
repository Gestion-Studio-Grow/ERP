// PROYECTOS · PRECIO POR CAPAS (MIA T1) — lecturas. Toleran la migración 20261107120000 sin aplicar: sin las tablas,
// el negocio sigue con el margen único y la ficha no muestra nada nuevo (P2021/P2022 → «no disponible»).

import "server-only";
import { prisma } from "@/lib/prisma";
import { faltaLaMigracion } from "./rendiciones-core";
import { aItemFicha, tiposDeCambio, versionViva } from "./gestion.server";
import { costoTotalItem, totalesFicha } from "./gestion-core";
import { configProyectos } from "./datos.server";
import {
  centavosDePesos,
  comisionesDelProyecto,
  desglosePrecio,
  formulaVigente,
  PARAMETROS_MIA,
  precioFinal,
  rangoDelTope,
  repartoDelAhorro,
  type ComisionDePersona,
  type ConfigPrecioGuardada,
  type DesglosePrecio,
  type ParametrosPrecio,
  type PrecioFinal,
  type RepartoAhorro,
} from "./precio-capas-core";

export interface FormulaDelNegocio {
  /** La tabla existe (la migración está aplicada). */
  disponible: boolean;
  /** Lo guardado, o los valores de MIA apagados si no hay fila: es lo que muestra el formulario. */
  config: ConfigPrecioGuardada;
  /** Null: el negocio no usa la fórmula. */
  vigente: ParametrosPrecio | null;
}

const APAGADA: ConfigPrecioGuardada = { activa: false, ...PARAMETROS_MIA };

export async function formulaDelNegocio(tenantId: string): Promise<FormulaDelNegocio> {
  try {
    const fila = await prisma.proyectoPrecioConfig.findUnique({
      where: { tenantId },
      select: { activa: true, rentabilidadBp: true, comisionProductorBp: true, comisionComercialBp: true, margenErrorBp: true, impuestosBp: true, topeRedondeoBp: true, ahorroEmpresaBp: true },
    });
    return { disponible: true, config: fila ?? APAGADA, vigente: formulaVigente(fila) };
  } catch (e) {
    if (faltaLaMigracion(e)) return { disponible: false, config: APAGADA, vigente: null };
    throw e;
  }
}

export interface VentaDelProyecto {
  disponible: boolean;
  productorId: string | null;
  comercialId: string | null;
  /** Centavos. */
  precioFinalCent: number | null;
  fechaEventoTexto: string | null;
  statusImportado: string | null;
}

const SIN_VENTA = { productorId: null, comercialId: null, precioFinalCent: null, fechaEventoTexto: null, statusImportado: null };

export async function ventaDelProyecto(tenantId: string, proyectoId: string): Promise<VentaDelProyecto> {
  try {
    const v = await prisma.proyectoVenta.findFirst({
      where: { tenantId, proyectoId },
      select: { productorId: true, comercialId: true, precioFinalCent: true, fechaEventoTexto: true, statusImportado: true },
    });
    if (!v) return { disponible: true, ...SIN_VENTA };
    return { disponible: true, ...v, precioFinalCent: v.precioFinalCent === null ? null : Number(v.precioFinalCent) };
  } catch (e) {
    if (faltaLaMigracion(e)) return { disponible: false, ...SIN_VENTA };
    throw e;
  }
}

/** El costo de la versión viva, en centavos, con el mismo cálculo que el encabezado de la ficha. */
export async function costoVigenteCent(tenantId: string, proyectoId: string): Promise<number> {
  const [viva, config, tc] = await Promise.all([versionViva(tenantId, proyectoId), configProyectos(tenantId), tiposDeCambio(tenantId)]);
  return centavosDePesos(totalesFicha((viva?.items ?? []).map(aItemFicha), tc, config.margenPct).costo);
}

export interface PrecioCapasDelProyecto {
  parametros: ParametrosPrecio;
  venta: VentaDelProyecto;
  desglose: DesglosePrecio;
  precio: PrecioFinal;
  rango: { minimo: number; maximo: number };
  /** Las comisiones se calculan sobre la versión aprobada; sin aprobada, sobre la vigente. */
  comisionesSobre: "aprobada" | "vigente";
  comisiones: ComisionDePersona[];
  /** Costo presupuestado (aprobado) y real, en centavos; null sin aprobada o sin gastos. */
  presupuestoCent: number | null;
  realCent: number | null;
  reparto: RepartoAhorro;
}

/**
 * Todo lo de la pestaña «Precio y comisiones». Null si el negocio no usa la fórmula (o sin la migración): la ficha queda
 * como hoy. `costoVivoPesos` es el que ya calculó el encabezado.
 */
export async function precioCapasDelProyecto(tenantId: string, proyectoId: string, costoVivoPesos: number, tc: Readonly<Record<string, number>>): Promise<PrecioCapasDelProyecto | null> {
  const formula = await formulaDelNegocio(tenantId);
  if (!formula.vigente) return null;
  const parametros = formula.vigente;
  const [venta, aprobada, gastos] = await Promise.all([
    ventaDelProyecto(tenantId, proyectoId),
    prisma.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId, estado: "APROBADO" }, orderBy: { version: "desc" }, select: { items: { select: { cantidad: true, costo: true, moneda: true } } } }),
    prisma.proyectoGasto.findMany({ where: { tenantId, proyectoId, anuladoEl: null }, select: { neto: true } }),
  ]);
  const desglose = desglosePrecio(centavosDePesos(costoVivoPesos), parametros);
  const precio = precioFinal(desglose.sugerido, venta.precioFinalCent, parametros.topeRedondeoBp);
  const presupuestoCent = aprobada ? aprobada.items.reduce((s, i) => s + centavosDePesos(costoTotalItem(i, tc)), 0) : null;
  const realCent = gastos.length > 0 ? gastos.reduce((s, g) => s + centavosDePesos(g.neto), 0) : null;
  const reparto = repartoDelAhorro(presupuestoCent, realCent, parametros.ahorroEmpresaBp);
  const base = presupuestoCent === null ? desglose : desglosePrecio(presupuestoCent, parametros);
  return {
    parametros,
    venta,
    desglose,
    precio,
    rango: rangoDelTope(desglose.sugerido, parametros.topeRedondeoBp),
    comisionesSobre: presupuestoCent === null ? "vigente" : "aprobada",
    comisiones: comisionesDelProyecto(base, reparto, venta),
    presupuestoCent,
    realCent,
    reparto,
  };
}
