// ============================================================================
// SEÑA A LA PROFESIONAL — Box «Nail Artist» (docs/tenants/ch/NAIL-ARTIST.md §1-§4). PURO, client-safe.
// ============================================================================
//
// Un servicio marcado `depositToProfessional` («la seña y el cobro van a la profesional») pide la
// seña al alias de la profesional DEL TURNO. Reglas que vigila el test (senia-profesional.test.ts):
//   · el alias sale SIEMPRE de `appointment.professionalId`: si la ficha que llega es de otra
//     profesional, no hay alias (nunca se le transfiere a quien no atiende);
//   · sin alias no hay seña por transferencia: nunca se cae a `ALIAS_SENIA_PROVISIONAL` ni a un
//     alias del negocio (sería mandar la plata a otra persona);
//   · la seña CONGELA el alias: al pedirla se guarda `{ alias, titular, monto }` en `changes` de la
//     fila `deposit_requested`; el comprobante y «Llegó la seña» leen ESE snapshot, nunca la ficha.
//
// Con el interruptor `nail-artist` apagado o el servicio sin la marca, `aplica: false`: todo sigue
// por el camino de siempre, byte a byte.

export type FichaDeCobro = {
  id: string;
  name?: string | null;
  aliasCbu?: string | null;
  titularCuenta?: string | null;
  cuitTitular?: string | null;
};

export type SnapshotSeniaProfesional = {
  professionalId: string;
  alias: string;
  titular: string | null;
  cuit: string | null;
  monto: number;
};

export type SeniaProfesional =
  | { aplica: false }
  | { aplica: true; ok: false; motivo: "sin-alias" }
  | { aplica: true; ok: true; snapshot: SnapshotSeniaProfesional };

/** El texto para el mostrador cuando la profesional no cargó su alias. */
export const SENIA_SIN_ALIAS =
  "La profesional de este turno no cargó su alias: la seña se coordina con ella. Cargalo en Catálogo → Profesionales.";

function limpio(v: string | null | undefined): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/**
 * ¿La seña de este turno va a la profesional, y a qué cuenta? `profesional` es la ficha que el
 * llamador cargó; si su id no es el del turno, se descarta (se resuelve por el turno, no por la ficha).
 */
export function seniaDeLaProfesional(input: {
  nailArtist: boolean;
  depositToProfessional: boolean | null | undefined;
  appointment: { professionalId: string };
  profesional: FichaDeCobro | null | undefined;
  monto: number;
}): SeniaProfesional {
  if (!input.nailArtist || input.depositToProfessional !== true) return { aplica: false };
  const ficha = input.profesional && input.profesional.id === input.appointment.professionalId ? input.profesional : null;
  const alias = limpio(ficha?.aliasCbu);
  if (!ficha || !alias) return { aplica: true, ok: false, motivo: "sin-alias" };
  return {
    aplica: true,
    ok: true,
    snapshot: {
      professionalId: ficha.id,
      alias,
      titular: limpio(ficha.titularCuenta),
      cuit: limpio(ficha.cuitTitular),
      monto: Number.isFinite(input.monto) ? input.monto : 0,
    },
  };
}

/** Las claves con que el snapshot viaja en `changes` de `deposit_requested`. */
export function changesDelSnapshot(s: SnapshotSeniaProfesional): Record<string, unknown> {
  return {
    monto: s.monto,
    aProfesional: true,
    professionalId: s.professionalId,
    alias: s.alias,
    titular: s.titular,
    cuit: s.cuit,
  };
}

/** Lee el snapshot de una fila `deposit_requested` (null si no es una seña a la profesional). */
export function snapshotDeChanges(changes: unknown): SnapshotSeniaProfesional | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, unknown>;
  if (c.aProfesional !== true) return null;
  const alias = typeof c.alias === "string" ? limpio(c.alias) : null;
  const professionalId = typeof c.professionalId === "string" ? c.professionalId : null;
  if (!alias || !professionalId) return null;
  const monto = typeof c.monto === "number" && Number.isFinite(c.monto) ? c.monto : 0;
  return {
    professionalId,
    alias,
    titular: typeof c.titular === "string" ? limpio(c.titular) : null,
    cuit: typeof c.cuit === "string" ? limpio(c.cuit) : null,
    monto,
  };
}

/**
 * De las filas `deposit_requested` (cualquier orden), el snapshot de la ÚLTIMA seña pedida de cada
 * turno, si fue a la profesional. Una seña pedida al negocio después pisa a una anterior (no hay snapshot).
 */
export function ultimoSnapshotPorTurno(
  filas: readonly { entityId: string | null; createdAt: Date | string; changes: unknown }[],
): Record<string, SnapshotSeniaProfesional> {
  const ultima: Record<string, { iso: string; changes: unknown }> = {};
  for (const f of filas) {
    if (!f.entityId) continue;
    const iso = new Date(f.createdAt).toISOString();
    if (!ultima[f.entityId] || ultima[f.entityId].iso < iso) ultima[f.entityId] = { iso, changes: f.changes };
  }
  const out: Record<string, SnapshotSeniaProfesional> = {};
  for (const [id, u] of Object.entries(ultima)) {
    const s = snapshotDeChanges(u.changes);
    if (s) out[id] = s;
  }
  return out;
}

/** La nota del cobro de una seña a la profesional (§4): deja escrito que no entra a la caja. */
export function notaDeCobroProfesional(s: { alias: string; titular: string | null }): string {
  const quien = s.titular ? `${s.titular} (${s.alias})` : s.alias;
  return `a ${quien} — no entra a la caja del negocio`;
}
