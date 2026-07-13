// ============================================================================
// FLAG DEL VERTICAL TORNEOS — reversibilidad (ADR-097, análogo a MODULE_REGISTRY_ENABLED).
// ============================================================================
//
// Todo el vertical de torneos es código nuevo detrás de este flag. Mientras esté OFF
// (default), el motor y la orquestación de persistencia EXISTEN y son testeables, pero
// ningún path del producto los toma como autoritativos y NADA toca la DB. Prenderlo es
// lo que habilita la persistencia real (tabla `Torneo`, Gate 2). Reversible sin datos:
// apagar el flag (o revertir el commit) restaura el estado previo.
//
// ⚠️ Guardarraíl schema-ahead (lección "defensive-flag-schema-ahead" / incidente CH):
// la tabla `Torneo` se crea recién en Gate 2. Con el flag OFF, `PrismaTorneoStore` no se
// instancia y NUNCA se lee/escribe la tabla → cero riesgo de 42703 contra una DB sin migrar.

/** ¿Está habilitado el vertical de torneos (persistencia real)? Default OFF. PURA (env inyectable). */
export function torneosEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.TORNEOS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
