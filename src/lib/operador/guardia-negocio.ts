// ============================================================================
// GUARDIA DE LAS ACTIONS DEL OPERADOR QUE TOCAN UN NEGOCIO (servidor).
// ============================================================================
//
// `requireOperadorParaNegocio(...negocios)`: la sesión de operador (si no hay, al login) y, si alguno
// de los negocios es CH (REQUIEREN_OK_DEL_DUENIO), exige que sea el dueño. Si no, vuelve a la ficha
// con el motivo y NO se ejecuta nada de la action. `operadorParaNegocio` decide lo mismo pero
// devuelve el rechazo, para las actions que contestan un resultado en vez de redirigir.
//
// NO lleva "use server" (no es un endpoint). `server-only`: lee la base con `operatorPrisma`.
// El slug de cada negocio se lee de la base por su id: el formulario no lo decide.

import "server-only";
import { redirect } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import type { SesionOperador } from "@/lib/operator-auth";
import { decidirOperadorParaNegocios, type DecisionOperadorNegocio, type RefNegocio } from "./guardia-negocio-core";

async function slugsDe(refs: readonly RefNegocio[]): Promise<string[]> {
  const ids = refs.flatMap((r) => ("id" in r && r.id.trim() !== "" ? [r.id.trim()] : []));
  const slugs = refs.flatMap((r) => ("slug" in r ? [r.slug] : []));
  if (ids.length === 0) return slugs;
  const filas = await operatorPrisma.tenant.findMany({ where: { id: { in: ids } }, select: { slug: true } });
  return [...slugs, ...filas.map((f) => f.slug)];
}

/** La sesión y, si no puede tocar alguno de estos negocios, el motivo. */
export async function operadorParaNegocio(
  ...refs: RefNegocio[]
): Promise<({ ok: true } | { ok: false; motivo: string }) & { sesion: SesionOperador }> {
  const sesion = await requireSesionOperador();
  const d: DecisionOperadorNegocio = decidirOperadorParaNegocios(sesion, await slugsDe(refs));
  return { ...d, sesion };
}

/** La sesión, o vuelve a la ficha del (primer) negocio con el motivo, sin hacer nada. */
export async function requireOperadorParaNegocio(...refs: RefNegocio[]): Promise<SesionOperador> {
  const g = await operadorParaNegocio(...refs);
  if (!g.ok) {
    const id = refs.find((r): r is { id: string } => "id" in r && r.id.trim() !== "")?.id;
    const q = new URLSearchParams({ error: g.motivo }).toString();
    redirect(id ? `/operador/tenants/${encodeURIComponent(id)}?${q}` : `/operador?${q}`);
  }
  return g.sesion;
}
