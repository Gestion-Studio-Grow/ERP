"use server";
// ============================================================================
// CONSOLA DE SOPORTE GSG (T1) — las acciones de los tickets.
// ============================================================================
//
// "use server" publica cada export como endpoint: tres, con FormData y la sesión de operador como
// primera línea (sin sesión → login de la consola). Antes de tocar un ticket va la guardia del
// negocio (CH sólo la toca el dueño de GSG, guardia-negocio-core). Del formulario llegan el negocio,
// el número y el cambio; quién lo hace sale de la sesión.

import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { operadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { requireSesionOperador } from "@/lib/operator-session";
import { decidirOperadorParaNegocios } from "@/lib/operador/guardia-negocio-core";
import { pedirAlModelo } from "@/lib/proyectos/ia.server";
import { cambiarTicket, fichaDeTicket, traerPedidosSinTicket, type CambioDeTicket } from "@/lib/soporte/tickets.server";
import { datosParaLaIa, ESQUEMA_SUGERENCIA, INSTRUCCIONES_SUGERENCIA, leerSugerencia } from "@/lib/soporte/tickets-core";

export type ResultadoTicket = { ok: true; mensaje: string } | { ok: false; error: string };

function ref(fd: FormData): { tenantId: string; numero: number } {
  return { tenantId: String(fd.get("negocio") ?? "").trim(), numero: Number(fd.get("numero")) };
}

const LISTO: Record<CambioDeTicket["que"], string> = {
  estado: "Listo: cambió el estado.",
  prioridad: "Listo: cambió la prioridad y el vencimiento.",
  nota: "Listo: la nota quedó en el historial (no la ve el cliente).",
  respuesta: "Listo: la respuesta quedó guardada. Mandásela al cliente por WhatsApp.",
  tomar: "Listo: el ticket quedó a tu nombre.",
  borrador: "",
};

/** Estado, prioridad, nota interna, respuesta o «tomar». Un endpoint, el cambio dice `que`. */
export async function cambiarTicketAction(_previo: ResultadoTicket | null, fd: FormData): Promise<ResultadoTicket> {
  const { tenantId, numero } = ref(fd);
  const g = await operadorParaNegocio({ id: tenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const que = String(fd.get("que") ?? "");
  let cambio: CambioDeTicket;
  if (que === "estado" || que === "prioridad") cambio = { que, valor: fd.get("valor") };
  else if (que === "nota" || que === "respuesta") cambio = { que, texto: fd.get("texto") };
  else if (que === "tomar") cambio = { que };
  else return { ok: false, error: "No entendimos qué cambio pediste." };
  const r = await cambiarTicket(operatorPrisma, { tenantId, numero, operador: g.sesion.nombre, cambio });
  if (!r.ok) return r;
  revalidatePath("/operador/soporte");
  return { ok: true, mensaje: LISTO[cambio.que] };
}

/**
 * «Sugerir clasificación y respuesta»: la IA lee el ticket (sin CUIT ni ids) y deja un BORRADOR en
 * la ficha. Nunca cambia el tipo, la prioridad ni la respuesta: eso lo decide la persona de Soporte.
 */
export async function sugerirConIaAction(_previo: ResultadoTicket | null, fd: FormData): Promise<ResultadoTicket> {
  const { tenantId, numero } = ref(fd);
  const g = await operadorParaNegocio({ id: tenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const t = await fichaDeTicket(operatorPrisma, tenantId, numero);
  if (!t) return { ok: false, error: "Ese ticket no existe." };
  const ia = await pedirAlModelo({
    sistema: INSTRUCCIONES_SUGERENCIA,
    mensajes: [{ role: "user", content: datosParaLaIa(t) }],
    esquema: ESQUEMA_SUGERENCIA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });
  if (!ia.ok) return { ok: false, error: ia.error };
  const sugerencia = leerSugerencia(ia.texto);
  if (!sugerencia) return { ok: false, error: "La IA contestó algo que no se pudo usar. Probá de nuevo." };
  const r = await cambiarTicket(operatorPrisma, { tenantId, numero, operador: g.sesion.nombre, cambio: { que: "borrador", sugerencia } });
  if (!r.ok) return r;
  revalidatePath("/operador/soporte");
  return { ok: true, mensaje: "Listo: la sugerencia quedó como borrador. Revisala antes de usarla." };
}

/** Trae los pedidos de la cartera abiertos que todavía no tienen ticket (idempotente). */
export async function traerPedidosAction(): Promise<ResultadoTicket> {
  const sesion = await requireSesionOperador();
  const r = await traerPedidosSinTicket(operatorPrisma, (slug) => decidirOperadorParaNegocios(sesion, [slug]).ok);
  if ("sinTabla" in r) return { ok: false, error: "Todavía no está la tabla de tickets (falta aplicar la migración)." };
  revalidatePath("/operador/soporte");
  return { ok: true, mensaje: r.creados === 0 ? "No había pedidos sin ticket." : `Listo: ${r.creados} pedido${r.creados === 1 ? "" : "s"} pasaron a ticket.` };
}
