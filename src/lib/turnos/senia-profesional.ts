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
  const out: Record<string, SnapshotSeniaProfesional> = {};
  for (const [id, u] of Object.entries(ultimaPedidaPorTurno(filas))) {
    const s = snapshotDeChanges(u.changes);
    if (s) out[id] = s;
  }
  return out;
}

/** La marca que deja la nota de un cobro dirigido a la profesional (la leen el «Deshacer» y los listados). */
export const MARCA_NO_ENTRA_A_LA_CAJA = "no entra a la caja del negocio";
/** El agregado de la nota (y la advertencia de la agenda) cuando el turno cambió de profesional. */
export const AVISO_SENIA_REASIGNADA = "la seña se pidió a la cuenta de otra profesional, antes de cambiar el turno: verificala en esa cuenta";

/** La nota del cobro de una seña a la profesional (§4): deja escrito que no entra a la caja. */
export function notaDeCobroProfesional(s: { alias: string | null; titular: string | null; reasignada?: boolean }): string {
  const quien = s.alias ? (s.titular ? `${s.titular} (${s.alias})` : s.alias) : "la profesional del turno";
  return `a ${quien} — ${MARCA_NO_ENTRA_A_LA_CAJA}${s.reasignada ? ` · ojo: ${AVISO_SENIA_REASIGNADA}` : ""}`;
}

/** ¿Esta nota es la de una seña cobrada a la cuenta de la profesional? */
export function esNotaDeCobroProfesional(note: string | null | undefined): boolean {
  return typeof note === "string" && note.startsWith("a ") && note.includes(` — ${MARCA_NO_ENTRA_A_LA_CAJA}`);
}

/**
 * ¿A dónde fue la seña de este turno? Manda la ÚLTIMA fila `deposit_requested` (lo que la clienta
 * vio al transferir): con snapshot → la profesional del snapshot (aunque el turno haya cambiado de
 * profesional, o la marca o el interruptor se hayan apagado después); sin snapshot → el negocio
 * (aunque el servicio se haya marcado después). Sólo SIN fila pedida decide la marca actual con el
 * interruptor. Nunca: nota «no entra a la caja» con asiento, ni seña al negocio sin asiento.
 */
export type DestinoDeSenia =
  | { a: "negocio" }
  | { a: "profesional"; cuenta: { alias: string | null; titular: string | null; cuit: string | null }; reasignada: boolean; congelada: boolean };

export function destinoDeLaSenia(input: {
  /** `changes` de la última `deposit_requested` del turno; `null` = nunca se pidió. */
  ultimaPedida: { changes: unknown } | null;
  professionalIdDelTurno: string;
  /** Sólo se mira si nunca se pidió: interruptor + marca actuales y la ficha de la profesional del turno. */
  actual: { nailArtist: boolean; depositToProfessional: boolean | null | undefined; ficha: FichaDeCobro | null | undefined };
}): DestinoDeSenia {
  if (input.ultimaPedida) {
    const snap = snapshotDeChanges(input.ultimaPedida.changes);
    if (!snap) return { a: "negocio" };
    return {
      a: "profesional",
      cuenta: { alias: snap.alias, titular: snap.titular, cuit: snap.cuit },
      reasignada: snap.professionalId !== input.professionalIdDelTurno,
      congelada: true,
    };
  }
  const r = seniaDeLaProfesional({
    nailArtist: input.actual.nailArtist,
    depositToProfessional: input.actual.depositToProfessional,
    appointment: { professionalId: input.professionalIdDelTurno },
    profesional: input.actual.ficha,
    monto: 0,
  });
  if (!r.aplica) return { a: "negocio" };
  const cuenta = r.ok ? { alias: r.snapshot.alias, titular: r.snapshot.titular, cuit: r.snapshot.cuit } : { alias: null, titular: null, cuit: null };
  return { a: "profesional", cuenta, reasignada: false, congelada: false };
}

/** Lo que la agenda muestra del destino (`null` = la seña va al negocio: el pedido de siempre). */
export function cuentaDeSeniaEnAgenda(input: Parameters<typeof destinoDeLaSenia>[0]): {
  cuenta: { alias: string; titular: string | null; cuit: string | null } | null;
  reasignada?: boolean;
} | null {
  const d = destinoDeLaSenia(input);
  if (d.a === "negocio") return null;
  const cuenta = d.cuenta.alias ? { alias: d.cuenta.alias, titular: d.cuenta.titular, cuit: d.cuenta.cuit } : null;
  return d.reasignada ? { cuenta, reasignada: true } : { cuenta };
}

/** De las filas `deposit_requested` (cualquier orden), la última de cada turno. */
export function ultimaPedidaPorTurno(
  filas: readonly { entityId: string | null; createdAt: Date | string; changes: unknown }[],
): Record<string, { changes: unknown }> {
  const ultima: Record<string, { iso: string; changes: unknown }> = {};
  for (const f of filas) {
    if (!f.entityId) continue;
    const iso = new Date(f.createdAt).toISOString();
    if (!ultima[f.entityId] || ultima[f.entityId].iso < iso) ultima[f.entityId] = { iso, changes: f.changes };
  }
  const out: Record<string, { changes: unknown }> = {};
  for (const [id, u] of Object.entries(ultima)) out[id] = { changes: u.changes };
  return out;
}

/** La seña dirigida a la profesional entra a SU cuenta: sólo por transferencia (el efectivo quedaría en el mostrador sin asiento). */
export const SENIA_PROFESIONAL_SOLO_TRANSFERENCIA =
  "Esta seña se pidió al alias de la profesional: registrala como transferencia. Si la clienta pagó en efectivo o por otro medio, coordinalo con la profesional (no entra a la caja del negocio).";

export function medioDeSeniaProfesionalValido(method: string): boolean {
  return method === "TRANSFERENCIA";
}
