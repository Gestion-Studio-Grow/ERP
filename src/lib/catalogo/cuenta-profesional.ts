// ============================================================================
// LA CUENTA DE LA PROFESIONAL — alias / titular / CUIT (Box «Nail Artist», NAIL-ARTIST.md §1). PURO.
// ============================================================================
//
// Quién la edita: el dueño (OWNER) de cualquier profesional del negocio, y la propia profesional
// SÓLO su fila (misma regla de dueño de fila que `puedeCobrarEsteTurno`, cobro-mostrador.ts:43).
// Recepción no: es la cuenta a la que la clienta le transfiere plata.

export type CuentaProfesional = { aliasCbu: string | null; titularCuenta: string | null; cuitTitular: string | null };

export function puedeEditarCuentaDe(
  user: { role: string; professionalId?: string | null },
  professionalId: string,
): { ok: true } | { ok: false; motivo: string } {
  if (user.role === "OWNER") return { ok: true };
  if (user.role === "PROFESSIONAL" && user.professionalId && user.professionalId === professionalId) return { ok: true };
  return { ok: false, motivo: "Sólo el dueño o la propia profesional pueden cambiar su alias." };
}

const ALIAS = /^[a-zA-Z0-9.-]{6,20}$/;
const CBU = /^\d{22}$/;

/** Normaliza y valida lo que llega del formulario. Vacío = se borra (null). */
export function leerCuentaProfesional(input: {
  aliasCbu?: unknown;
  titularCuenta?: unknown;
  cuitTitular?: unknown;
}): { ok: true; cuenta: CuentaProfesional } | { ok: false; error: string } {
  const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const alias = txt(input.aliasCbu).replace(/\s+/g, "");
  const titular = txt(input.titularCuenta).replace(/\s+/g, " ");
  const cuit = txt(input.cuitTitular).replace(/[\s-]/g, "");
  if (alias && !ALIAS.test(alias) && !CBU.test(alias)) {
    return { ok: false, error: "El alias tiene que tener de 6 a 20 letras, números, puntos o guiones (o un CBU/CVU de 22 números)." };
  }
  if (titular.length > 80) return { ok: false, error: "El titular es muy largo (hasta 80 letras)." };
  if (alias && !titular) return { ok: false, error: "Cargá el titular de la cuenta: la clienta lo ve antes de transferir." };
  if (cuit && !/^\d{11}$/.test(cuit)) return { ok: false, error: "El CUIT tiene 11 números (con o sin guiones)." };
  return { ok: true, cuenta: { aliasCbu: alias || null, titularCuenta: titular || null, cuitTitular: cuit || null } };
}
