"use server";

// Definir o cambiar el PIN de desbloqueo propio (reglas en src/lib/sesion-pin.ts). Sólo con la contraseña comprobada
// hace poco (`puedeDefinirPin`): una cookie robada con la sesión activa no alcanza para plantar un PIN.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit-core";
import { getSessionCookieName } from "@/lib/auth";
import { requireUser } from "@/lib/authz";
import { normalizarPin, problemaDelPinNuevo, puedeDefinirPin } from "@/lib/sesion-pin";
import { guardarPin } from "@/lib/sesion-pin.server";
import { destinoDeRenovar } from "@/lib/sesion-legado";

export interface EstadoDelPinNuevo {
  error?: string;
}

export async function definirPin(_previo: EstadoDelPinNuevo, formData: FormData): Promise<EstadoDelPinNuevo> {
  const user = await requireUser();
  const next = destinoDeRenovar(String(formData.get("next") ?? "/admin"));
  const habilitado = await puedeDefinirPin((await cookies()).get(getSessionCookieName())?.value);
  if (habilitado !== user.id) {
    return { error: "Por seguridad, el PIN se define justo después de entrar con tu contraseña. Volvé a entrar y probá de nuevo." };
  }
  const pin = normalizarPin(formData.get("pin"));
  const problema = problemaDelPinNuevo(pin, normalizarPin(formData.get("confirmacion")));
  if (problema) return { error: problema };
  if (!(await guardarPin(user.id, user.tenantId, pin!))) {
    return { error: "El PIN todavía no está disponible en este panel. Por ahora seguí entrando con tu contraseña." };
  }
  // Se audita que lo definió, NUNCA el PIN.
  await auditAdmin({ action: "define_own_pin", entity: "User", entityId: user.id });
  redirect(next);
}
