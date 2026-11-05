// STUB TEMPORAL DEL BLOQUE A (matriz de permisos, docs/producto/permisos/PLAN.md §2 y §8). PURO.
//
// El Bloque B (contacto enmascarado + pantalla de la matriz) se construye en paralelo con el A, que
// es el dueño de `capabilities.ts`, `session.ts`, `authz.ts` y `user-actions.ts`. Para compilar sin
// tocar esos archivos, B importa de acá lo que A va a exportar, con la MISMA firma del contrato.
//
// AL INTEGRAR, este archivo se reemplaza entero por:
//   export { permisoEfectivo, CAPACIDADES_POR_USUARIO } from "@/lib/capabilities";
//   export type { Capability as CapabilityPorUsuario } from "@/lib/capabilities";
//   export { setUserPermission } from "@/lib/user-actions";
// (o se repuntan los imports y se borra). No le sumes lógica propia: no es el resolvedor.

import { roleHasCapability, type Capability, type Role } from "@/lib/capabilities";

/** Las capacidades nuevas del plan (§3). Al integrar ya están en el union `Capability`. */
type CapabilityNueva = "agenda:create" | "clients:contact" | "cash:manage" | "payments:own-account";
export type CapabilityPorUsuario = Capability | CapabilityNueva;

export type OverrideDePermiso = { capability: string; allowed: boolean };

/** Las que se pueden prender o apagar por persona (las 8 casillas). El resto ignora overrides. */
export const CAPACIDADES_POR_USUARIO: readonly CapabilityPorUsuario[] = [
  "agenda:create",
  "agenda:manage",
  "agenda:collect",
  "clients:contact",
  "stock:receive",
  "stock:count",
  "stock:adjust",
  "payments:own-account",
  "cash:manage",
];

// Default por rol de las nuevas (§3): OWNER y RECEPTION sí, PROFESSIONAL no; la 7, nadie.
const NUEVAS_POR_ROL: Record<CapabilityNueva, readonly Role[]> = {
  "agenda:create": ["OWNER", "RECEPTION"],
  "clients:contact": ["OWNER", "RECEPTION"],
  "cash:manage": ["OWNER", "RECEPTION"],
  "payments:own-account": [],
};

function esNueva(cap: CapabilityPorUsuario): cap is CapabilityNueva {
  return cap in NUEVAS_POR_ROL;
}

export function permisoEfectivo(
  user: { role: Role; overrides?: ReadonlyArray<OverrideDePermiso> },
  cap: CapabilityPorUsuario,
): boolean {
  if (CAPACIDADES_POR_USUARIO.includes(cap)) {
    const o = user.overrides?.find((x) => x.capability === cap);
    if (o) return o.allowed;
  }
  return esNueva(cap) ? NUEVAS_POR_ROL[cap].includes(user.role) : roleHasCapability(user.role, cap);
}

/** Stub de la acción del Bloque A (`src/lib/user-actions.ts`). Al integrar es la server action real. */
export async function setUserPermission(formData: FormData): Promise<void> {
  void formData;
  throw new Error("setUserPermission: pendiente del Bloque A (stub)");
}
