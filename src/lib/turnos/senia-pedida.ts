// ============================================================================
// «SEÑA PEDIDA» — la marca, sin migración (reingeniería CH, Tanda 2). PURO, client-safe.
// ============================================================================
//
// Cuando la recepción da un turno y elige «Pedírsela por WhatsApp», el turno queda Reservado y con
// la marca «seña pedida» (CH-021). No hay columna para eso (la que viene es `depositRequestedAt`, con
// las migraciones de la Tanda 3, sin aplicar): la marca es una fila de `AuditLog` con
// `action = "deposit_requested"` sobre el turno, como ya se hace con «quién canceló». Escribirla es
// `marcarSeniaPedida` / `darTurno`; leerla, `seniasPedidas` (senia-actions.ts). Acá, el nombre de la
// acción y cómo se resume la lectura, para que escritura y lectura no puedan divergir.

/** La `action` de `AuditLog` que marca una seña pedida. */
export const ACCION_SENIA_PEDIDA = "deposit_requested";

/**
 * De las filas de auditoría (cualquier orden), la ÚLTIMA vez que se pidió la seña de cada turno:
 * turno → ISO. Las filas sin turno se ignoran.
 */
export function ultimaSeniaPedida(filas: readonly { entityId: string | null; createdAt: Date | string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of filas) {
    if (!f.entityId) continue;
    const iso = new Date(f.createdAt).toISOString();
    if (!out[f.entityId] || out[f.entityId] < iso) out[f.entityId] = iso;
  }
  return out;
}
