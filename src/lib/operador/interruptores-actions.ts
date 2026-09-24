"use server";

// ============================================================================
// PRENDER Y APAGAR UN INTERRUPTOR EN UN NEGOCIO — la action de la ficha del operador.
// ============================================================================
//
// Server Action del plano de operador (ADR-021). Publica UN solo endpoint, `cambiarInterruptor`,
// que recibe el formulario de la ficha. El operador sale de `requireOperadorParaNegocio` (la cookie
// firmada con su nombre y su rol; en CH, sólo el dueño), nunca del formulario. Todo lo demás se
// decide de nuevo con la base fresca en `cambiarInterruptorCon` (src/cambios/interruptores-core.ts):
//   · relee el estado y los módulos, y los compara con lo que vio el operador;
//   · recalcula la vista previa y exige 0 apps perdidas para prender;
//   · en CH (REQUIEREN_OK_DEL_DUENIO) sólo el operador dueño (rol firmado), escribiendo el slug.
// La escritura es UNA fila de AuditLog, condicional (interruptores-escritura.server.ts): toma el
// candado de las apps del negocio (el mismo que la escritura de módulos, con espera acotada) y dentro
// de la transacción vuelve a mirar que los módulos y el interruptor sigan como se leyeron. Sin
// ventana de horas entre cambios (simplificación decidida).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { interruptorPorId } from "@/cambios/interruptores";
import { cambiarInterruptorCon, type PedidoDeInterruptor } from "@/cambios/interruptores-core";
import { depsDeCambioReales } from "@/lib/operador/interruptores-escritura.server";

function volver(tenantId: string, q: Record<string, string>): never {
  redirect(`/operador/tenants/${tenantId}?${new URLSearchParams(q).toString()}#interruptores`);
}

function leerModulosVistos(valor: FormDataEntryValue | null): string[] | null {
  try {
    const v: unknown = JSON.parse(String(valor ?? ""));
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
  } catch {
    return null;
  }
}

export async function cambiarInterruptor(formData: FormData) {
  const tenantId = String(formData.get("tenantId") || "").trim();
  const sesion = await requireOperadorParaNegocio({ id: tenantId });
  const pedido: PedidoDeInterruptor = {
    tenantId,
    interruptor: String(formData.get("interruptor") || "").trim(),
    accion: String(formData.get("accion") || "").trim(),
    visto: String(formData.get("visto") || "").trim(),
    modulosVistos: leerModulosVistos(formData.get("modulosVistos")),
    slugTipeado: String(formData.get("slug") || ""),
  };
  if (!pedido.tenantId) redirect("/operador?error=notfound");

  const r = await cambiarInterruptorCon(depsDeCambioReales(), sesion, pedido);
  if (r.tipo === "no-existe") redirect("/operador?error=notfound");
  if (r.tipo === "rechazado") volver(pedido.tenantId, { error: r.motivo });

  const nombre = interruptorPorId(r.interruptor).nombre;
  if (r.tipo === "sin-cambios") {
    volver(pedido.tenantId, {
      ok: `No había nada que cambiar: “${nombre}” ya estaba ${r.accion === "encender" ? "prendido" : "apagado"}.`,
    });
  }
  // La consola y el panel del negocio. Las pantallas del panel son dinámicas y leen el interruptor
  // en cada carga; esto limpia además cualquier caché de ruta del layout.
  revalidatePath(`/operador/tenants/${pedido.tenantId}`);
  revalidatePath("/operador");
  revalidatePath("/admin", "layout");
  volver(pedido.tenantId, {
    ok: `${r.accion === "encender" ? "Prendiste" : "Apagaste"} “${nombre}”. Se nota la próxima vez que abran su panel, sin deploy.`,
  });
}
