"use server";
// CONSOLA DE LA CUADRILLA · acciones del PANEL del negocio (supervisor del cliente y usuario de agente).
//
// El negocio sale SIEMPRE de la sesión (`actorDelPanel`), nunca del formulario: un id de otro negocio no se
// encuentra (cada consulta filtra tenantId y corre bajo RLS en `tenantTransaction`). Antes de escribir,
// `permisos.ts` decide con la fila leída; un usuario de agente no aprueba ni supervisa.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { actorDelPanel } from "@/lib/cuadrilla/actor-del-panel.server";
import { NoPermitido, cambiarEstadoDeAgentes, decidir, decidirLote, hablar, levantarExcepcion, reasignar } from "@/lib/cuadrilla/consola-core";
import { motivoDelError, texto, volverA } from "@/lib/cuadrilla/formulario";
import { CATEGORIAS, TIPOS } from "@/lib/cuadrilla/permisos";

const BASE = "/admin/cuadrilla";

/** El id de cada casilla del lote ("tenantId:id"): en el panel sólo cuentan las del negocio de la sesión. */
function idsDelLote(fd: FormData, tenantId: string): string[] {
  return fd
    .getAll("sel")
    .filter((v): v is string => typeof v === "string")
    .map((v) => {
      const i = v.indexOf(":");
      if (i <= 0 || v.slice(0, i) !== tenantId) throw new NoPermitido("Eso es de otro negocio: no lo podés ver ni tocar.");
      return v.slice(i + 1);
    });
}

async function correr(fd: FormData, ok: string, fn: (ctx: Awaited<ReturnType<typeof actorDelPanel>>) => Promise<unknown>, alFallar: Record<string, string> = {}) {
  const ctx = await actorDelPanel();
  let destino: string;
  try {
    if (!ctx.actor) throw new NoPermitido("La consola de la cuadrilla es para la dueña del negocio.");
    await fn(ctx);
    destino = volverA(BASE, fd, ok ? { ok } : {});
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e), ...alFallar });
  }
  revalidatePath(BASE);
  redirect(destino);
}

export async function panelDecidir(fd: FormData) {
  const op = texto(fd, "op");
  const id = texto(fd, "id");
  await correr(
    fd,
    op === "aprobar" ? "Aprobada." : op === "rechazar" ? "Rechazada." : "Resuelta.",
    ({ actor, tenantId }) => {
      if (op !== "aprobar" && op !== "rechazar" && op !== "resolver") throw new NoPermitido("Esa acción no existe.");
      return tenantTransaction((tx) => decidir(tx, actor!, tenantId, id, op, { huellaVista: texto(fd, "huella"), motivo: texto(fd, "motivo") }), { tenantId });
    },
    { ex: id },
  );
}

export async function panelLote(fd: FormData) {
  const op = texto(fd, "op");
  await correr(fd, "Listo.", ({ actor, tenantId }) => {
    const ids = idsDelLote(fd, tenantId);
    if (ids.length === 0) throw new NoPermitido("Elegí al menos una.");
    return tenantTransaction(async (tx) => {
      if (op === "aprobar" || op === "rechazar") return decidirLote(tx, actor!, tenantId, ids, op, texto(fd, "motivo"));
      if (op === "reasignar") {
        const [t, agente] = texto(fd, "destino").split(":");
        if (t !== tenantId) throw new NoPermitido("Ese agente no es de este negocio.");
        return reasignar(tx, actor!, tenantId, ids, agente ?? "");
      }
      if (op === "pausar") {
        const filas = await tx.excepcionCuadrilla.findMany({ where: { tenantId, id: { in: ids } }, select: { agenteId: true } });
        return cambiarEstadoDeAgentes(tx, actor!, tenantId, filas.map((f) => f.agenteId), "PAUSADO");
      }
      throw new NoPermitido("Esa acción no existe.");
    }, { tenantId });
  });
}

export async function panelAgente(fd: FormData) {
  const estado = texto(fd, "estado") === "PAUSADO" ? "PAUSADO" : "ACTIVO";
  await correr(fd, estado === "PAUSADO" ? "Agente pausado." : "Agente reanudado.", ({ actor, tenantId }) =>
    tenantTransaction((tx) => cambiarEstadoDeAgentes(tx, actor!, tenantId, [texto(fd, "agenteId")], estado), { tenantId }),
  );
}

export async function panelHablar(fd: FormData) {
  await correr(fd, "", ({ actor, tenantId }) => tenantTransaction((tx) => hablar(tx, actor!, tenantId, texto(fd, "hilo"), texto(fd, "texto")), { tenantId }));
}

/** Sólo un usuario de agente: pide aprobación, avisa que se frenó, que el sistema lo rechazó, o escala. */
export async function panelLevantar(fd: FormData) {
  const tipo = texto(fd, "tipo");
  const categoria = texto(fd, "categoria") || "OTRA";
  await correr(fd, "Excepción levantada: la ve tu supervisión.", ({ actor, tenantId }) => {
    if (!(TIPOS as readonly string[]).includes(tipo) || !(CATEGORIAS as readonly string[]).includes(categoria)) throw new NoPermitido("Tipo o categoría inválidos.");
    return tenantTransaction((tx) => levantarExcepcion(tx, actor!, tenantId, { tipo, categoria, titulo: texto(fd, "titulo"), contenido: texto(fd, "contenido") }), { tenantId });
  });
}
