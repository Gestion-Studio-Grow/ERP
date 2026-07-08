import type { Perfil } from "@/modules/perfil";

// Naming al cliente (ADR-059 D7): "lite"/"enterprise" son nombres de INGENIERÍA
// (perfil del ScopeItem), NUNCA de cara al cliente — "lite/básico" lee "de
// segunda". El cliente ve EDICIONES: "Comercio" (lite) / "Empresa" (enterprise).
// Extraído a leaf puro (mismo patrón que perfil.ts) para poder testear el
// mapeo sin renderizar y para que ProfileBadge no sea la única barrera contra
// una fuga de jerga de ingeniería al copy.

export const PROFILE_EDITION_LABEL: Readonly<Record<Perfil, string>> = {
  lite: "Comercio",
  enterprise: "Empresa",
};

export function profileEditionLabel(profile: Perfil): string {
  return PROFILE_EDITION_LABEL[profile];
}
