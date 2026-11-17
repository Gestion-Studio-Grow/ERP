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
import { NoPermitido, cambiarEstadoDeAgentes, decidir, decidirLote, levantarExcepcion, reasignar } from "@/lib/cuadrilla/consola-core";
import { avanzarPedido, cerrarPedido, hablarOPedir, vencerPedidos } from "@/lib/cuadrilla/pedidos-core";
import type { CierrePedido } from "@/lib/cuadrilla/pedidos";
import { motivoDelError, texto, volverA } from "@/lib/cuadrilla/formulario";
import { CATEGORIAS, TIPOS } from "@/lib/cuadrilla/permisos";
import { igualarAccesos } from "@/lib/cuadrilla/accesos-core";

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

/** El aviso de vuelta: un texto fijo de éxito, o uno armado con lo que devolvió la acción (`{ ok }` o `{ error }`). */
type Resultado<R> = string | ((r: R) => { ok?: string; error?: string });

async function correr<R>(fd: FormData, ok: Resultado<R>, fn: (ctx: Awaited<ReturnType<typeof actorDelPanel>>) => Promise<R>, alFallar: Record<string, string> = {}) {
  const ctx = await actorDelPanel();
  let destino: string;
  try {
    if (!ctx.actor) throw new NoPermitido("La consola de la cuadrilla es para la dueña del negocio.");
    const r = await fn(ctx);
    destino = volverA(BASE, fd, typeof ok === "function" ? ok(r) : ok ? { ok } : {});
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
  const hecho = op === "aprobar" ? "Aprobadas" : op === "rechazar" ? "Rechazadas" : op === "reasignar" ? "Reasignadas" : "Agentes pausados";
  await correr(fd, (n: number) => ({ ok: `${hecho}: ${n}.` }), ({ actor, tenantId }) => {
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

/** En el hilo de un agente, lo que escribe una persona es un PEDIDO con su tope; el agente que contesta, no. */
export async function panelHablar(fd: FormData) {
  const topes = { minutos: texto(fd, "topeMinutos"), turnos: texto(fd, "topeTurnos") };
  await correr(
    fd,
    (pedido: string | null) => (pedido ? { ok: "Pedido enviado, con su tope." } : {}),
    ({ actor, tenantId }) => tenantTransaction((tx) => hablarOPedir(tx, actor!, tenantId, texto(fd, "hilo"), texto(fd, "texto"), topes, texto(fd, "pedidoId") || undefined), { tenantId }),
  );
}

/** La supervisión escala los pedidos de SU negocio que pasaron el tope (GSG-MIA-072). El negocio sale de la sesión. */
export async function panelVencer(fd: FormData) {
  await correr(
    fd,
    (n: number) => ({ ok: n === 0 ? "No había pedidos vencidos." : `Escalados por tope: ${n}.` }),
    ({ actor, tenantId }) => tenantTransaction((tx) => vencerPedidos(tx, actor!, tenantId), { tenantId }),
  );
}

/** La supervisión deja al usuario de un agente con los mismos accesos que la persona de su puesto (GSG-MIA-072). */
export async function panelAccesos(fd: FormData) {
  await correr(
    fd,
    (quedan: string[]) => (quedan.length ? { error: `Quedan diferencias: ${quedan.join("; ")}.` } : { ok: "Accesos iguales a los de la persona del puesto." }),
    ({ actor, tenantId }) => tenantTransaction((tx) => igualarAccesos(tx, actor!, tenantId, texto(fd, "agenteId"), texto(fd, "personaId")), { tenantId }),
  );
}

/** Sólo el usuario del agente que recibió el pedido: usa un turno (cuenta contra el tope). */
export async function panelAvanzarPedido(fd: FormData) {
  await correr(
    fd,
    (r: "sigue" | "escalado" | "tope") =>
      r === "sigue"
        ? { ok: "Turno anotado." }
        : r === "escalado"
          ? { ok: "Con este turno llegaste al tope: te frenás y el pedido pasó a una persona." }
          : { error: "Este pedido ya estaba en el tope: no se anotó el turno y pasó a una persona." },
    ({ actor, tenantId }) => tenantTransaction((tx) => avanzarPedido(tx, actor!, tenantId, texto(fd, "pedidoId"), texto(fd, "texto")), { tenantId }),
  );
}

/** Sólo el usuario del agente que recibió el pedido: lo cierra por UNA salida (hecho, ajeno u oportunidad). */
export async function panelCerrarPedido(fd: FormData) {
  const salida = texto(fd, "salida");
  const cierre: CierrePedido | null =
    salida === "HECHO"
      ? { salida, respuesta: texto(fd, "respuesta") }
      : salida === "AJENO"
        ? { salida, regla: texto(fd, "regla"), queSi: texto(fd, "queSi") }
        : salida === "OPORTUNIDAD"
          ? { salida }
          : null;
  await correr(
    fd,
    (estado: string) =>
      estado === "TOPE"
        ? { error: "Pasaste el tope: no se puede dar por terminado. El pedido pasó a una persona." }
        : { ok: estado === "HECHO" ? "Pedido terminado." : estado === "NEGADO" ? "Pedido negado: quedó con la regla de tu manual." : "Pedido traspasado a GSG: quedó en Oportunidades." },
    ({ actor, tenantId }) => {
      if (!cierre) throw new NoPermitido("Elegí cómo cerrar el pedido.");
      return tenantTransaction((tx) => cerrarPedido(tx, actor!, tenantId, texto(fd, "pedidoId"), cierre), { tenantId });
    },
  );
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
