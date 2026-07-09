// ============================================================================
// IDENTIDAD DE PRODUCTO GSG (RFC-004) — flag maestro, tenant-agnóstica.
// ============================================================================
//
// Separa la IDENTIDAD del PRODUCTO (GSG) del BRANDING del TENANT (accent/tema/logo):
// el color es del tenant, la identidad es de GSG (ADR-059 D5, C-004). Hoy el "look base"
// es la paleta de CH (RFC-004 §1 L1); esta capa introduce la base neutra PROPIA de GSG
// bajo `[data-identity="gsg"]` en globals.css.
//
// DEFAULT OFF: con `GSG_IDENTITY_ENABLED` apagado, el layout no setea el atributo →
// tokens actuales intactos → byte-idéntico. Aditivo/reversible: encender el flag (o
// revertir) alterna la identidad sin tocar el mecanismo de accent/tema que ya funciona.

/** ¿Está encendida la identidad de producto GSG? Default OFF. PURA (env inyectable). */
export function gsgIdentityEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.GSG_IDENTITY_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Valor de `data-identity` para el layout: "gsg" si el flag está ON, si no `undefined` (sin atributo). PURA. */
export function identityAttr(enabled: boolean): "gsg" | undefined {
  return enabled ? "gsg" : undefined;
}
