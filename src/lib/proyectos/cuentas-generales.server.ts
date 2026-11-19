// MIA-50 · T08 · Adenda 1 § B: la lectura de las cuentas generales con lo de Proyectos (reglas en cuentas-generales.ts).
import "server-only";
import { prisma } from "@/lib/prisma";
import { leerCuentasACobrar, leerCuentasAPagar } from "@/lib/debts/cuentas-lectura";
import { actorActual, puede } from "./gestion.server";
import { recuadrosDeCuotas } from "./empresa.server";
import { proyectosEnCuentasGenerales, type DependenciasCuentas, type ProyectosEnCuentas } from "./cuentas-generales";
import { redondear } from "./core";

/** Las dependencias reales: el negocio, el permiso de quien mira y la misma lectura que Administración de Proyectos. */
export const dependenciasCuentas: DependenciasCuentas = {
  tieneProyectos: async (id) => ((await prisma.tenant.findUnique({ where: { id }, select: { modules: true } }))?.modules ?? []).includes("proyectos"),
  veEmpresa: async () => {
    try {
      return puede(await actorActual(), "empresa", "ver");
    } catch {
      return false; // sin permiso de agenda (o un ARM): no ve Proyectos, que es lo mismo que no tener el permiso
    }
  },
  recuadros: recuadrosDeCuotas,
};

/** Lo de Proyectos para quien mira: null sin la app de Proyectos o sin «Empresa · ver» (sin leer ninguna cuota). */
export function proyectosParaCuentas(tenantId: string, deps: DependenciasCuentas = dependenciasCuentas): Promise<ProyectosEnCuentas | null> {
  return proyectosEnCuentasGenerales(tenantId, deps);
}

/** CG1: las cuentas propias (fiado y deudas) más lo de Proyectos. El total es la suma de las dos partes. */
export async function cuentasGenerales(tenantId: string, deps: DependenciasCuentas = dependenciasCuentas) {
  const [cobrar, pagar, proyectos] = await Promise.all([leerCuentasACobrar(prisma, tenantId), leerCuentasAPagar(prisma, tenantId), proyectosParaCuentas(tenantId, deps)]);
  const propiasCobrar = redondear(cobrar.cuentas.reduce((s, c) => s + (c.saldo > 0 ? c.saldo : 0), 0));
  const propiasPagar = redondear(pagar.cuentas.reduce((s, c) => s + (c.saldo > 0 ? c.saldo : 0), 0));
  const deProyectosCobrar = proyectos?.aCobrar.total ?? 0;
  const deProyectosPagar = proyectos?.aPagar.total ?? 0;
  return {
    proyectos,
    aCobrar: { propias: propiasCobrar, proyectos: deProyectosCobrar, total: redondear(propiasCobrar + deProyectosCobrar) },
    aPagar: { propias: propiasPagar, proyectos: deProyectosPagar, total: redondear(propiasPagar + deProyectosPagar) },
  };
}
