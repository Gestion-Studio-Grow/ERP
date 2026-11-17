// ============================================================================
// PARÁMETROS — la lectura por negocio. La usan todas las tandas: `parametrosDelNegocio(tenantId)` o `valorDelNegocio`.
// Sin fila rige el valor del rubro. Sin la migración M7a aplicada (Gate 2), también: el código tolera su ausencia.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { defDe, esClave, type Clave, type Valores } from "./catalogo";
import { resolverParametros, textoDelValor, valoresDe, type Parametros } from "./validar";

type Db = Prisma.TransactionClient | typeof prisma;

/** Las filas del negocio; sin la tabla (M7a sin aplicar), ninguna. */
async function filasDelNegocio(tenantId: string, db: Db) {
  try {
    return await db.proyectoParametro.findMany({ where: { tenantId }, select: { clave: true, valor: true, provisional: true, actualizadoNombre: true, actualizadoEl: true } });
  } catch (e) {
    // Dentro de una transacción el error ya la abortó: se deja subir para que la acción responda «falta la base».
    if (esTablaInexistente(e) && db === prisma) return [];
    throw e;
  }
}

/** Todos los parámetros del negocio, con su origen (negocio o rubro) y su marca de provisional. */
export async function parametrosDelNegocio(tenantId: string, db: Db = prisma): Promise<Parametros> {
  return resolverParametros(await filasDelNegocio(tenantId, db));
}

/** Sólo los valores. */
export async function valoresDelNegocio(tenantId: string, db: Db = prisma): Promise<Valores> {
  return valoresDe(await parametrosDelNegocio(tenantId, db));
}

/** Un parámetro. Lee todos porque los que dependen de otros (comisión, matriz) se ajustan a las funciones del negocio. */
export async function valorDelNegocio<K extends Clave>(tenantId: string, clave: K, db: Db = prisma): Promise<Valores[K]> {
  return (await parametrosDelNegocio(tenantId, db))[clave].valor as Valores[K];
}

export interface RenglonHistorial { id: string; clave: Clave; nombre: string; antes: string; despues: string; provisionalAntes: boolean | null; provisionalDespues: boolean | null; autorNombre: string; createdAt: Date }

/** Los últimos cambios, de un grupo de claves o de todas. */
export async function historialDeParametros(tenantId: string, claves: readonly Clave[] | null, max = 50, vigentes?: Pick<Valores, "equipo.funciones" | "reparto.conceptos">): Promise<RenglonHistorial[]> {
  try {
    const filas = await prisma.proyectoParametroHistorial.findMany({ where: { tenantId, ...(claves ? { clave: { in: [...claves] } } : {}) }, orderBy: { createdAt: "desc" }, take: max });
    return filas.flatMap((f) => {
      const def = esClave(f.clave) ? defDe(f.clave) : null;
      if (!def) return [];
      return [{ id: f.id, clave: def.clave, nombre: def.nombre, antes: textoDelValor(def, f.antes, vigentes), despues: textoDelValor(def, f.despues, vigentes), provisionalAntes: f.provisionalAntes, provisionalDespues: f.provisionalDespues, autorNombre: f.autorNombre, createdAt: f.createdAt }];
    });
  } catch (e) {
    if (esTablaInexistente(e)) return [];
    throw e;
  }
}
