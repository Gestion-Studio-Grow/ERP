"use server";
// ============================================================================
// CONFIGURADOR (Soporte GSG) — las dos acciones de la consola.
// ============================================================================
//
// "use server" publica cada export como endpoint: sólo estas dos, las dos con FormData y la sesión
// de operador como primera línea (sin sesión → login de la consola). Primero va la guardia del
// negocio con el estudio que dice el formulario (candado de CH: beauty-spa sólo el dueño de GSG, el
// trinquete de guardia-negocio.test.ts); después el núcleo exige que el pedido sea de ESE estudio y
// vuelve a aplicar la guardia con lo que lee de la base (estudio y cliente existente).

import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { operadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { configurarSolicitud, descartarSolicitud, type ResultadoConfigurador } from "./configurador.server";
import type { FormConfigurador } from "./configurador-reglas";

const CAMPOS: readonly (keyof FormConfigurador)[] = [
  "razonSocial", "cuit", "condicionIva", "puntoVenta", "rubro", "plan", "email", "whatsapp", "alias",
  "subdominio", "accesoContadora", "contadoraNombre", "contadoraEmail", "autorizaVinculo", "duplicado",
];

function texto(fd: FormData, campo: string): string {
  const v = fd.get(campo);
  return typeof v === "string" ? v : "";
}

export async function configurarSolicitudAction(
  _previo: ResultadoConfigurador | null,
  fd: FormData,
): Promise<ResultadoConfigurador> {
  const estudioTenantId = texto(fd, "estudioTenantId").trim();
  const g = await operadorParaNegocio({ id: estudioTenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const sesion = g.sesion;
  const solicitudId = texto(fd, "solicitudId").trim();
  if (!solicitudId) return { ok: false, error: "Falta el pedido." };
  const form: FormConfigurador = {};
  for (const c of CAMPOS) form[c] = texto(fd, c);
  const r = await configurarSolicitud(operatorPrisma, { solicitudId, estudioTenantId, sesion, form });
  if (r.ok) {
    revalidatePath("/operador/solicitudes");
    revalidatePath(`/operador/tenants/${r.clienteTenantId}`);
    revalidatePath(`/operador/tenants/${r.estudio.id}`);
  }
  return r;
}

export async function descartarSolicitudAction(
  _previo: { ok: true } | { ok: false; error: string } | null,
  fd: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const estudioTenantId = texto(fd, "estudioTenantId").trim();
  const g = await operadorParaNegocio({ id: estudioTenantId });
  if (!g.ok) return { ok: false, error: g.motivo };
  const sesion = g.sesion;
  const solicitudId = texto(fd, "solicitudId").trim();
  if (!solicitudId) return { ok: false, error: "Falta el pedido." };
  const r = await descartarSolicitud(operatorPrisma, { solicitudId, estudioTenantId, sesion, motivo: texto(fd, "motivo") });
  if (r.ok) revalidatePath("/operador/solicitudes");
  return r;
}
