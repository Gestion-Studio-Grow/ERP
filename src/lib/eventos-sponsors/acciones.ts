"use server";

// ============================================================================
// EVENTOS Y SPONSORS — Server Actions (GSG-CRM-009).
// ============================================================================
//
// Importar lo que relevó el equipo de agentes. Orden de las guardias: (1) la app (rol y panel del
// negocio, `requireApp`), (2) el permiso `clients:manage` (cargar datos comerciales), (3) el
// interruptor «eventos-sponsors» del negocio (apagado = rechazo, nada se escribe), (4) la demo
// pública no escribe, (5) el tenantId del request, (6) la validación del lote y el repo.
// Sin envío de correos y sin datos de contacto de personas: `validarLote` rechaza el lote que los trae.

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireApp } from "@/lib/require-app";
import { permisoFueraDeLaAgenda } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { logger } from "@/lib/logger";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { eventosSponsorsPrendido } from "@/cambios/interruptores";
import { rolDeGestionPermiteEventos } from "./acceso.server";
import { leerLote, MAX_BYTES_LOTE, validarPedido, type Rechazo } from "./core";
import { crearPedido, importarLote, esFaltaDeTabla, ImportacionEnCurso, type ResultadoImportacion } from "./repo";

export type EstadoImportacion =
  | { estado: "inicial" }
  | { estado: "error"; mensaje: string; rechazos: Rechazo[] }
  | { estado: "ok"; resultado: ResultadoImportacion; rechazos: Rechazo[] };

const MIGRACION_PENDIENTE = "Falta un paso de base de datos para usar Eventos y sponsors. Avisale a GSG.";

/** Lee el lote del archivo subido o, si no hay archivo, del texto pegado. */
async function textoDelFormulario(formData: FormData): Promise<string | null> {
  const archivo = formData.get("archivo");
  if (archivo && typeof archivo === "object" && "size" in archivo && archivo.size > 0) {
    if (archivo.size > MAX_BYTES_LOTE) return null;
    return await archivo.text();
  }
  const pegado = formData.get("lote");
  return typeof pegado === "string" && pegado.trim() ? pegado : "";
}

export async function importarEventos(_prev: EstadoImportacion, formData: FormData): Promise<EstadoImportacion> {
  const user = await requireApp("eventos-sponsors");
  if (!permisoFueraDeLaAgenda(user, "clients:manage") || !(await rolDeGestionPermiteEventos(user))) return { estado: "error", mensaje: "Tu usuario no puede cargar eventos. Pedíselo a quien administra el negocio.", rechazos: [] };
  if (!eventosSponsorsPrendido(await interruptoresDelNegocio())) return { estado: "error", mensaje: "Eventos y sponsors no está activado en este negocio.", rechazos: [] };
  if (isDemoSandbox()) return { estado: "error", mensaje: "En la demo pública no se cargan datos.", rechazos: [] };

  const texto = await textoDelFormulario(formData);
  if (texto === null) return { estado: "error", mensaje: "El archivo es demasiado grande (tope 2 MB).", rechazos: [] };
  if (!texto) return { estado: "error", mensaje: "Subí el archivo JSON o pegá su contenido.", rechazos: [] };
  const lote = leerLote(texto);
  if (!lote.ok) return { estado: "error", mensaje: lote.motivo, rechazos: lote.rechazos };

  try {
    const tenantId = await getCurrentTenantId();
    const r = await importarLote(tenantId, lote.eventos);
    if (r.faltaMigracion) return { estado: "error", mensaje: MIGRACION_PENDIENTE, rechazos: [] };
    const { faltaMigracion: _f, ...resultado } = r;
    revalidatePath("/admin/eventos");
    revalidatePath("/admin/eventos/marcas");
    revalidatePath("/admin/eventos/equipo");
    return { estado: "ok", resultado, rechazos: lote.rechazos };
  } catch (e) {
    unstable_rethrow(e);
    if (esFaltaDeTabla(e)) return { estado: "error", mensaje: MIGRACION_PENDIENTE, rechazos: [] };
    if (e instanceof ImportacionEnCurso) return { estado: "error", mensaje: "Ya se están cargando resultados en este negocio. Esperá un momento y volvé a subir el archivo: lo que ya entró no se duplica.", rechazos: [] };
    logger.warn("eventos-sponsors", "no se pudo importar el lote", { error: e instanceof Error ? e.message : String(e) });
    return { estado: "error", mensaje: "No se pudo importar. Probá de nuevo en un rato.", rechazos: [] };
  }
}

export type EstadoPedido = { estado: "inicial" } | { estado: "error"; mensaje: string } | { estado: "ok" };

/**
 * Un pedido al equipo de agentes («buscá eventos en tal región»). Mismas guardias que la importación.
 * Sólo entra en la cola: lo toma una sesión de GSG. Acá no se llama a ningún modelo ni a ninguna API.
 */
export async function pedirAlEquipo(_prev: EstadoPedido, formData: FormData): Promise<EstadoPedido> {
  const user = await requireApp("eventos-sponsors");
  if (!permisoFueraDeLaAgenda(user, "clients:manage") || !(await rolDeGestionPermiteEventos(user))) return { estado: "error", mensaje: "Tu usuario no puede pedirle trabajo al equipo. Pedíselo a quien administra el negocio." };
  if (!eventosSponsorsPrendido(await interruptoresDelNegocio())) return { estado: "error", mensaje: "Eventos y sponsors no está activado en este negocio." };
  if (isDemoSandbox()) return { estado: "error", mensaje: "En la demo pública no se cargan pedidos." };
  const v = validarPedido(formData.get("puesto"), formData.get("pedido"), { region: formData.get("region"), desde: formData.get("desde"), hasta: formData.get("hasta") });
  if (!v.ok) return { estado: "error", mensaje: v.motivo };
  try {
    const r = await crearPedido(await getCurrentTenantId(), { puesto: v.puesto, pedido: v.pedido, region: v.region, desde: v.desde, hasta: v.hasta, creadoPor: user.id });
    if (r.faltaMigracion) return { estado: "error", mensaje: MIGRACION_PENDIENTE };
    revalidatePath("/admin/eventos/equipo");
    return { estado: "ok" };
  } catch (e) {
    unstable_rethrow(e);
    if (esFaltaDeTabla(e)) return { estado: "error", mensaje: MIGRACION_PENDIENTE };
    logger.warn("eventos-sponsors", "no se pudo guardar el pedido", { error: e instanceof Error ? e.message : String(e) });
    return { estado: "error", mensaje: "No se pudo guardar el pedido. Probá de nuevo en un rato." };
  }
}
