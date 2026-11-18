// CONSOLA DE LA CUADRILLA · quién es la persona del panel del negocio, leído de la SESIÓN (nunca del formulario).
//
// - Si su usuario es el de un agente: AGENTE (aunque tenga rol de dueña: un agente nunca supervisa).
// - Si no, y es OWNER: SUPERVISOR de su negocio.
// - Cualquier otro: sin consola (null).
import "server-only";
import { requireUser } from "@/lib/authz";
import { tenantTransaction } from "@/lib/rls";
import { agenteDelUsuario } from "./consola-core";
import type { Actor } from "./permisos";

export async function actorDelPanel(): Promise<{ actor: Actor | null; tenantId: string }> {
  const user = await requireUser();
  const tenantId = user.tenantId;
  const agente = await tenantTransaction((tx) => agenteDelUsuario(tx, tenantId, user.id), { tenantId });
  if (agente) return { tenantId, actor: { tipo: "agente", tenantId, userId: user.id, agenteId: agente.id, nombre: agente.nombre } };
  if (user.role === "OWNER") return { tenantId, actor: { tipo: "supervisor", tenantId, userId: user.id, nombre: user.name } };
  return { tenantId, actor: null };
}
