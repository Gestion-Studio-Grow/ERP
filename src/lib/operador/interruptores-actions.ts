"use server";

// ============================================================================
// PRENDER Y APAGAR UN INTERRUPTOR EN UN NEGOCIO — la action de la ficha del operador.
// ============================================================================
//
// Server Action del plano de operador (ADR-021). Publica UN solo endpoint, `cambiarInterruptor`,
// que recibe el formulario de la ficha. El operador sale de `requireOperator()` (la cookie firmada
// con su nombre), nunca del formulario. Todo lo demás se decide de nuevo con la base fresca en
// `cambiarInterruptorCon` (src/cambios/interruptores-core.ts):
//   · relee el estado y los módulos, y los compara con lo que vio el operador;
//   · recalcula la vista previa y exige 0 apps perdidas para prender;
//   · en CH (REQUIEREN_OK_DEL_DUENIO) sólo el operador dueño, escribiendo el slug.
// La escritura es UNA fila de AuditLog, condicional (interruptores-escritura.server.ts): dentro de
// la transacción se vuelve a mirar que los módulos y el interruptor sigan como se leyeron. Sin lock
// ni ventana de horas (simplificación decidida): dos operadores que prenden a la vez dejan dos
// filas iguales, que es inofensivo.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/operator-session";
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
  const op = await requireOperator();
  const pedido: PedidoDeInterruptor = {
    tenantId: String(formData.get("tenantId") || "").trim(),
    interruptor: String(formData.get("interruptor") || "").trim(),
    accion: String(formData.get("accion") || "").trim(),
    visto: String(formData.get("visto") || "").trim(),
    modulosVistos: leerModulosVistos(formData.get("modulosVistos")),
    slugTipeado: String(formData.get("slug") || ""),
  };
  if (!pedido.tenantId) redirect("/operador?error=notfound");

  const r = await cambiarInterruptorCon(depsDeCambioReales(), op, pedido);
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
