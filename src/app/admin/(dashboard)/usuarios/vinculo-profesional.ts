// Qué se acepta al vincular un usuario Profesional con su ficha de profesional. PURO.
//
// Sin el vínculo (`User.professionalId`), la profesional entra a una agenda vacía: `getAgendaDay`
// filtra por su ficha y, sin ficha, no muestra nada. Antes se hacía «desde la base»; ahora lo hace
// la dueña en Usuarios (UAT de CH, 18/10). La action (`vincularProfesional`, user-actions.ts) le
// pasa lo que leyó del negocio y hace lo que esto dice.

/** El código del aviso que muestra /admin/usuarios (`?status=`). */
export type RechazoDeVinculo = "error_vinculo_rol" | "error_not_found" | "error_vinculo_ocupado";

export interface FichaVinculable {
  id: string;
  /** Usuario que ya la tiene, o null. */
  usuarioId: string | null;
}

export function decidirVinculoProfesional(input: {
  usuario: { id: string; role: string };
  /** "" = desvincular. */
  fichaId: string;
  fichas: readonly FichaVinculable[];
}): { ok: true; professionalId: string | null } | { ok: false; status: RechazoDeVinculo } {
  if (input.usuario.role !== "PROFESSIONAL") return { ok: false, status: "error_vinculo_rol" };
  if (!input.fichaId) return { ok: true, professionalId: null };
  const ficha = input.fichas.find((f) => f.id === input.fichaId);
  if (!ficha) return { ok: false, status: "error_not_found" };
  if (ficha.usuarioId && ficha.usuarioId !== input.usuario.id) return { ok: false, status: "error_vinculo_ocupado" };
  return { ok: true, professionalId: ficha.id };
}
