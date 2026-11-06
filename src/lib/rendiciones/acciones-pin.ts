"use server";

// Código de ingreso para pasar por WhatsApp (plan Rendí §4, alternativa sin mail). El permiso se comprueba en el servidor
// (pin.server.ts → generarPinParaPasar): esconder el botón en «Equipo» no protege nada.

import { actorActual } from "@/lib/proyectos/gestion.server";
import { generarPinParaPasar, type CodigoParaPasar } from "./pin.server";

export type EstadoCodigoParaPasar = CodigoParaPasar | null;

export async function generarCodigoParaPasar(_previo: EstadoCodigoParaPasar, formData: FormData): Promise<EstadoCodigoParaPasar> {
  const a = await actorActual();
  const personaId = String(formData.get("id") ?? "").trim().slice(0, 40);
  return generarPinParaPasar({ tenantId: a.tenantId, userId: a.user.id, rol: a.rol, nombre: a.nombre }, personaId);
}
