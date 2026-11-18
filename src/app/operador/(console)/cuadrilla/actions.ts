"use server";
// CONSOLA DE LA CUADRILLA · acciones del OPERADOR GSG (todos los negocios).
//
// Primero la guardia del negocio (candado de CH, trinquete de guardia-negocio.test.ts); después, TODO corre
// parado en ese negocio con `enElNegocio` (RLS con `app_rls`, sin BYPASSRLS) y cada consulta filtra tenantId.
// El negocio sale del formulario porque el operador es justamente quien elige el negocio; el id de la fila se
// busca DENTRO de ese negocio: un id de otro no se encuentra.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { enElNegocio } from "@/lib/operator-db";
import { requireOperadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { NoPermitido, cambiarEstadoDeAgentes, decidir, decidirLote, reasignar } from "@/lib/cuadrilla/consola-core";
import { hablarOPedir, vencerPedidos } from "@/lib/cuadrilla/pedidos-core";
import { igualarAccesos } from "@/lib/cuadrilla/accesos-core";
import { elegidasPorNegocio, motivoDelError, texto, volverA } from "@/lib/cuadrilla/formulario";
import type { Actor } from "@/lib/cuadrilla/permisos";

const BASE = "/operador/cuadrilla";

// Lectores del formulario LOCALES y sin efectos: el trinquete de guardia-negocio.test.ts los deja ir antes de la guardia.
function campo(fd: FormData, k: string): string {
  return texto(fd, k);
}
function casillas(fd: FormData): Map<string, string[]> {
  return elegidasPorNegocio(fd.getAll("sel"));
}
/** El texto del resultado de un lote, con lo que se hizo y cuántas. */
function hechoDelLote(op: string, n: number): string {
  if (op === "aprobar") return `Aprobadas: ${n}.`;
  if (op === "rechazar") return `Rechazadas: ${n}.`;
  if (op === "reasignar") return `Reasignadas: ${n}.`;
  return `Agentes pausados: ${n}.`;
}
function unSoloNegocio(fd: FormData): string {
  const negocios = [...casillas(fd).keys()];
  return negocios.length === 1 ? negocios[0] : "";
}

export async function operadorDecidir(fd: FormData) {
  const tenantId = campo(fd, "tenantId");
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  const op = texto(fd, "op");
  const id = texto(fd, "id");
  let destino: string;
  try {
    if (op !== "aprobar" && op !== "rechazar" && op !== "resolver") throw new Error("op");
    await enElNegocio(tenantId, (tx) => decidir(tx, actor, tenantId, id, op, { huellaVista: texto(fd, "huella"), motivo: texto(fd, "motivo") }));
    destino = volverA(BASE, fd, { ok: op === "aprobar" ? "Aprobada." : op === "rechazar" ? "Rechazada." : "Resuelta." });
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e), ex: id });
  }
  revalidatePath(BASE);
  redirect(destino);
}

/**
 * El lote va de a UN negocio por vez (la guardia de CH mira ese negocio). Si las elegidas son de varios, no se
 * hace nada y se pide filtrar por negocio.
 */
export async function operadorLote(fd: FormData) {
  const tenantId = unSoloNegocio(fd);
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  const op = campo(fd, "op");
  const ids = casillas(fd).get(tenantId) ?? [];
  let destino: string;
  try {
    if (casillas(fd).size > 1) throw new NoPermitido("El lote va de a un negocio: filtrá por negocio y elegí de nuevo.");
    if (!tenantId || ids.length === 0) throw new NoPermitido("Elegí al menos una.");
    const n = await enElNegocio(tenantId, async (tx) => {
      if (op === "aprobar" || op === "rechazar") return decidirLote(tx, actor, tenantId, ids, op, campo(fd, "motivo"));
      if (op === "reasignar") {
        const [t, agente] = campo(fd, "destino").split(":");
        if (t !== tenantId) throw new NoPermitido("Reasignar sólo dentro del mismo negocio: elegí un agente de ese negocio.");
        return reasignar(tx, actor, tenantId, ids, agente ?? "");
      }
      if (op === "pausar") {
        const filas = await tx.excepcionCuadrilla.findMany({ where: { tenantId, id: { in: ids } }, select: { agenteId: true } });
        return cambiarEstadoDeAgentes(tx, actor, tenantId, filas.map((f) => f.agenteId), "PAUSADO");
      }
      throw new NoPermitido("Esa acción no existe.");
    });
    destino = volverA(BASE, fd, { ok: hechoDelLote(op, n) });
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e) });
  }
  revalidatePath(BASE);
  redirect(destino);
}

export async function operadorAgente(fd: FormData) {
  const tenantId = campo(fd, "tenantId");
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  const estado = texto(fd, "estado") === "PAUSADO" ? "PAUSADO" : "ACTIVO";
  let destino: string;
  try {
    await enElNegocio(tenantId, (tx) => cambiarEstadoDeAgentes(tx, actor, tenantId, [texto(fd, "agenteId")], estado));
    destino = volverA(BASE, fd, { ok: estado === "PAUSADO" ? "Agente pausado." : "Agente reanudado." });
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e) });
  }
  revalidatePath(BASE);
  redirect(destino);
}

export async function operadorHablar(fd: FormData) {
  const tenantId = campo(fd, "tenantId");
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  let destino: string;
  try {
    const pedido = await enElNegocio(tenantId, (tx) =>
      hablarOPedir(tx, actor, tenantId, texto(fd, "hilo"), texto(fd, "texto"), { minutos: texto(fd, "topeMinutos"), turnos: texto(fd, "topeTurnos") }),
    );
    destino = volverA(BASE, fd, pedido ? { ok: "Pedido enviado, con su tope." } : {});
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e) });
  }
  revalidatePath(BASE);
  redirect(destino);
}

/**
 * Escala los pedidos de UN negocio que pasaron su tope de minutos (GSG-MIA-072). Abrir la consola ya no lo hace:
 * escribir en un negocio pasa por su guardia (en CH, sólo el dueño de GSG).
 */
export async function operadorVencer(fd: FormData) {
  const tenantId = campo(fd, "tenantId");
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  let destino: string;
  try {
    if (!tenantId) throw new NoPermitido("Elegí el negocio.");
    const n = await enElNegocio(tenantId, (tx) => vencerPedidos(tx, actor, tenantId));
    destino = volverA(BASE, fd, { ok: n === 0 ? "No había pedidos vencidos." : `Escalados por tope: ${n}.` });
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e) });
  }
  revalidatePath(BASE);
  redirect(destino);
}

/** Deja al usuario de un agente con los mismos accesos que la persona de su puesto (GSG-MIA-072). En CH, sólo el dueño. */
export async function operadorAccesos(fd: FormData) {
  const tenantId = campo(fd, "tenantId");
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const actor: Actor = { tipo: "operador", nombre: sesion.nombre };
  let destino: string;
  try {
    const quedan = await enElNegocio(tenantId, (tx) => igualarAccesos(tx, actor, tenantId, texto(fd, "agenteId"), texto(fd, "personaId")));
    destino = volverA(BASE, fd, quedan.length ? { error: `Quedan diferencias: ${quedan.join("; ")}.` } : { ok: "Accesos iguales a los de la persona del puesto." });
  } catch (e) {
    destino = volverA(BASE, fd, { error: motivoDelError(e) });
  }
  revalidatePath(BASE);
  redirect(destino);
}
