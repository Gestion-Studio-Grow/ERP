// COCKPIT — flags de reversibilidad (spec T4).
//
// - COCKPIT_ENABLED: muestra el link del cockpit en el nav del operador. Default OFF
//   → el cockpit existe como ruta (accesible directo para QA) pero no se ofrece hasta
//   que el dueño lo prenda. Revertir = apagar el flag o `git revert`.
// - COCKPIT_NEON: activa el snapshot REAL de la DB (W3) contra pg_stat_* (read-only).
//   Default OFF → monitoreo "en pausa" (ahorro del plan free de Neon).

function on(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

/** ¿Se muestra el cockpit en el nav del operador? Default OFF. */
export function cockpitNavEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.COCKPIT_ENABLED);
}

/** ¿Se consulta Neon (pg_stat_*) para el estado de la DB? Default OFF (ahorro). */
export function cockpitNeonEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return on(env.COCKPIT_NEON);
}
