// «Confirmado: …» con su tecla «Avisarle por WhatsApp» (punto 8). Client-safe: el origen se lee al armar el aviso.
import type { AccionDelAviso } from "../../ToastProvider";
import { linkDeConfirmado } from "@/lib/turnos/mensajes-whatsapp";

export function accionDeConfirmado(t: { id: string; telefono: string | null | undefined; clienta: string; servicio: string; inicio: string | Date; profesional?: string | null }): AccionDelAviso | undefined {
  const href = linkDeConfirmado({ turnoId: t.id, telefono: t.telefono, clienta: t.clienta, servicio: t.servicio, inicio: t.inicio, profesional: t.profesional }, window.location.origin);
  return href ? { texto: "Avisarle por WhatsApp", alTocar: () => void window.open(href, "_blank", "noopener,noreferrer") } : undefined;
}
