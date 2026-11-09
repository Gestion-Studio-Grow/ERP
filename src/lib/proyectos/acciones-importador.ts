"use server";

// ============================================================================
// PROYECTOS · Etapa 2 · T3 — acciones del importador de planillas: vista previa y confirmar.
// ============================================================================
// Cada export es un endpoint: ninguno recibe tenantId (sale de la sesión) y los dos pasan por la barrera: el
// interruptor «importador» del negocio prendido y la persona en Dirección. Confirmar NO confía en la vista previa:
// toma el candado del negocio, vuelve a leer el archivo y la base DENTRO de la transacción que escribe y sólo escribe
// si la huella es la que vio la persona (patrón catalogo/planilla-actions.ts). Dos confirmaciones a la vez: la segunda
// espera el candado, ve las claves de la primera y no carga nada.

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit-core";
import { logger } from "@/lib/logger";
import { configProyectos } from "./datos.server";
import { etapa2ActivaActual } from "./etapa2.server";
import { MENSAJE_APAGADO } from "./etapa2-core";
import { actorActual, type Actor } from "./gestion.server";
import { contar, planificarImportacion, type ConteoImportacion, type FilaRef, type FilaVista, type PlanImportacion } from "./importador-core";
import { leerLibro, MAX_BYTES_LIBRO } from "./importador-xlsx";
import { escribirImportacion, leerBaseImportacion, tomarCandadoImportador } from "./importador.server";

export interface VistaImportacion {
  huella: string;
  conteo: ConteoImportacion;
  filas: FilaVista[];
  clientesNuevos: string[];
  avisos: FilaRef[];
  avisosLibro: string[];
}
export type ResultadoVistaImportacion = { ok: true; vista: VistaImportacion } | { ok: false; error: string };
export type ResultadoConfirmarImportacion =
  | { ok: true; cargados: number; clientesNuevos: number; yaEstaban: number }
  | { ok: false; error: string; vista?: VistaImportacion };

const mal = (error: string) => ({ ok: false as const, error });

/** Interruptor del negocio + Dirección. Devuelve el motivo en vez de reventar la pantalla. */
async function barrera(): Promise<Actor | string> {
  if (!(await etapa2ActivaActual("importador"))) return MENSAJE_APAGADO.importador;
  const a = await actorActual();
  return a.rol === "DIRECCION" ? a : "Sólo Dirección puede importar planillas.";
}

async function leerArchivo(fd: FormData) {
  const f = fd.get("archivo");
  if (!f || typeof f === "string") return mal("Elegí la planilla (.xlsx).");
  if (f.size > MAX_BYTES_LIBRO) return mal("El archivo pesa más de 2 MB. Dejá sólo las pestañas de proyectos y probá de nuevo.");
  return leerLibro(new Uint8Array(await f.arrayBuffer()));
}

function vistaDe(plan: PlanImportacion, avisosLibro: string[]): VistaImportacion {
  return { huella: plan.huella, conteo: contar(plan), filas: plan.filas, clientesNuevos: plan.clientesNuevos.map((c) => c.nombre), avisos: plan.avisos, avisosLibro };
}

/** Vista previa: lee el archivo y la base en una transacción de sólo lectura y devuelve el plan, sin escribir nada. */
export async function previsualizarImportacion(fd: FormData): Promise<ResultadoVistaImportacion> {
  const a = await barrera();
  if (typeof a === "string") return mal(a);
  const libro = await leerArchivo(fd);
  if (!libro.ok) return libro;
  try {
    const plan = await tenantTransaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return planificarImportacion(libro.hojas, await leerBaseImportacion(tx, a.tenantId));
      },
      { tenantId: a.tenantId },
    );
    return { ok: true, vista: vistaDe(plan, libro.avisos) };
  } catch (err) {
    logger.error("proyectos/importador", "no se pudo armar la vista previa", err);
    return mal("No se pudo leer el ERP para comparar. Probá de nuevo.");
  }
}

/** Carga las altas de la planilla. `huella` es la de la vista previa que la persona aprobó. */
export async function confirmarImportacion(fd: FormData, huella: string): Promise<ResultadoConfirmarImportacion> {
  const a = await barrera();
  if (typeof a === "string") return mal(a);
  const libro = await leerArchivo(fd);
  if (!libro.ok) return libro;
  const { tenantId } = a;
  const config = await configProyectos(tenantId);

  let resultado: ResultadoConfirmarImportacion;
  let escrito: { plan: PlanImportacion; ids: string[] } | null = null;
  try {
    resultado = await tenantTransaction(
      async (tx): Promise<ResultadoConfirmarImportacion> => {
        await tomarCandadoImportador(tx, tenantId);
        const plan = planificarImportacion(libro.hojas, await leerBaseImportacion(tx, tenantId));
        // Nada para cargar (doble clic, otra pestaña que ya confirmó): no es un error, ya está todo.
        if (plan.altas.length === 0) return { ok: true, cargados: 0, clientesNuevos: 0, yaEstaban: plan.yaEnBase.length };
        if (plan.huella !== String(huella ?? "")) {
          return { ok: false, error: "La planilla o el ERP cambiaron desde la vista previa. Revisá la vista previa nueva y confirmá de nuevo.", vista: vistaDe(plan, libro.avisos) };
        }
        const r = await escribirImportacion(tx, tenantId, plan, a.nombre, config);
        escrito = { plan, ids: r.ids };
        return { ok: true, cargados: r.proyectos, clientesNuevos: r.clientesNuevos, yaEstaban: plan.yaEnBase.length };
      },
      { tenantId, timeoutMs: 120_000 },
    );
  } catch (err) {
    logger.error("proyectos/importador", "no se pudo confirmar la importación", err);
    return mal("No se pudo cargar la planilla. No se guardó nada: probá de nuevo.");
  }

  const hecho = escrito as { plan: PlanImportacion; ids: string[] } | null;
  if (resultado.ok && hecho) {
    await auditAdmin({
      action: "proyecto.importar",
      entity: "Proyecto",
      changes: { proyectos: hecho.ids.length, clientesNuevos: hecho.plan.clientesNuevos.length, repetidas: hecho.plan.repetidas.length, yaEstaban: hecho.plan.yaEnBase.length, noSeCargaron: hecho.plan.errores.length, huella: hecho.plan.huella },
    });
    revalidatePath("/admin/proyectos");
  }
  return resultado;
}
