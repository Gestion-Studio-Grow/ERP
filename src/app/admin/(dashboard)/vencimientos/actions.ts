"use server";

// Monitor de obligaciones del negocio (FC-11 · T7). El negocio sale de la sesión; del formulario
// llegan sólo ids y valores, y cada escritura verifica que el id sea de ESTE negocio (repo y
// monitor.server, dentro de tenantTransaction). Errores → vuelven a la pantalla en `?aviso=`.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { activarObligacion, cambiarEstadoVencimiento, generarCalendario } from "@/lib/contabilidad/repo";
import { asignarResponsable } from "@/lib/contabilidad/monitor.server";
import { contabilidadPrendidaEn } from "@/lib/contabilidad/modulo.server";
import { ESTADOS_QUE_MARCA_EL_NEGOCIO, esResponsable, periodosParaGenerar } from "@/lib/contabilidad/monitor";
import type { EstadoVencimiento } from "@/lib/contabilidad/vencimientos";

const RUTA = "/admin/vencimientos";
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function volver(aviso?: string): never {
  revalidatePath(RUTA);
  redirect(aviso ? `${RUTA}?aviso=${encodeURIComponent(aviso)}` : RUTA);
}

/** Sesión con permiso de escribir lo fiscal y Contabilidad prendida en el negocio. */
async function negocioParaEscribir() {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  if (!(await contabilidadPrendidaEn(tenantId))) volver("Contabilidad no está prendida en este negocio.");
  return { user, tenantId };
}

export async function generarProximosVencimientos(): Promise<void> {
  const { tenantId } = await negocioParaEscribir();
  let creados = 0;
  const avisos = new Set<string>();
  for (const periodo of periodosParaGenerar()) {
    const r = await generarCalendario(tenantId, null, periodo);
    if (!r.ok) volver(r.mensaje);
    creados += r.creados;
    for (const a of r.avisos) avisos.add(a);
  }
  volver(
    `${creados === 0 ? "El calendario ya estaba al día." : `Sumamos ${creados} vencimiento${creados === 1 ? "" : "s"}.`}` +
      (avisos.size ? ` ${[...avisos].slice(0, 3).join(" ")}` : ""),
  );
}

export async function marcarVencimiento(fd: FormData): Promise<void> {
  const { user, tenantId } = await negocioParaEscribir();
  const estado = texto(fd, "estado") as EstadoVencimiento;
  if (!ESTADOS_QUE_MARCA_EL_NEGOCIO.includes(estado)) volver("Ese estado no se puede marcar.");
  const r = await cambiarEstadoVencimiento(tenantId, texto(fd, "vencimientoId"), estado, {}, { actor: `admin:${user.name}`, channel: "admin" });
  volver(r.ok ? undefined : r.mensaje);
}

export async function cambiarResponsable(fd: FormData): Promise<void> {
  const { user, tenantId } = await negocioParaEscribir();
  const responsable = texto(fd, "responsable");
  if (!esResponsable(responsable)) volver("Elegí quién tiene la obligación.");
  const r = await asignarResponsable(tenantId, texto(fd, "obligacionId"), responsable, `admin:${user.name}`);
  volver(r.ok ? undefined : r.mensaje);
}

export async function prenderObligacion(fd: FormData): Promise<void> {
  const { tenantId } = await negocioParaEscribir();
  const r = await activarObligacion(tenantId, texto(fd, "obligacionId"), texto(fd, "activa") === "si");
  volver(r.ok ? undefined : r.mensaje);
}
