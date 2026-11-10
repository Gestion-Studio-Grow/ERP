// A QUÉ OWNER se le resetea la contraseña. Un negocio puede tener varios OWNER activos y el puerto,
// sin `ownerId`, toma el más antiguo (que puede ser otra persona). Por eso la consola
// (`resetOwnerPasswordDeTenant`, `resetOwnerPassword`) y el script del responsable de seguridad
// (`resetOwnerPorSlug`) eligen ANTES de escribir nada, con esta misma regla:
//   - con `email` (sin espacios ni mayúsculas) o con `ownerId`: el único OWNER activo de ESTE negocio
//     que coincide; si no hay exactamente uno → `no-coincide`;
//   - sin criterio y más de un OWNER activo → `varios` (hay que elegir);
//   - sin criterio y un solo OWNER activo → ése (comportamiento de siempre);
//   - sin criterio y ninguno → `sin-owner`.
// Puro: recibe la lista de OWNER activos ya leída (parado en el negocio). Cada llamador traduce el
// motivo a su mensaje, porque la consola y el script piden cosas distintas (elegir vs. RESET_EMAIL).

export type OwnerActivo = { id: string; email: string };

export type EleccionDeOwner =
  | { ok: true; ownerId: string }
  | { ok: false; motivo: "sin-owner" | "varios" | "no-coincide" };

export function elegirOwner(
  owners: readonly OwnerActivo[],
  criterio: { ownerId?: string; email?: string } = {},
): EleccionDeOwner {
  const email = (criterio.email ?? "").trim().toLowerCase();
  const ownerId = (criterio.ownerId ?? "").trim();
  if (email || ownerId) {
    // Comparación en JS (no `mode: "insensitive"`): evita que `_` o `%` del email actúen de comodín.
    const coinciden = owners.filter((o) =>
      email ? o.email.trim().toLowerCase() === email : o.id === ownerId,
    );
    return coinciden.length === 1 ? { ok: true, ownerId: coinciden[0].id } : { ok: false, motivo: "no-coincide" };
  }
  if (owners.length > 1) return { ok: false, motivo: "varios" };
  if (owners.length === 0) return { ok: false, motivo: "sin-owner" };
  return { ok: true, ownerId: owners[0].id };
}
