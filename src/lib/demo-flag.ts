// Flag del modo SANDBOX de preventa — EDGE-SAFE A PROPÓSITO (mismo patrón que
// `auth.ts`): la importa `src/proxy.ts` (middleware, corre en edge), así que
// este módulo no puede arrastrar Prisma/datetime/report-kpis al bundle edge.
// Cero imports. El resto del sandbox (fixtures, identidad ficticia) vive en
// `demo-sandbox.ts`, que sí puede usar utilidades de runtime Node.
//
// Ver docs/preventa/plan-acceso-sandbox-sin-password.md y
// docs/demo/plan-sandbox-persistencia.md.

export function isDemoSandbox(): boolean {
  return process.env.DEMO_MODE_ENABLED === "true";
}

// Namespaced a propósito: ningún tenant/usuario real usa el prefijo "demo-".
export const DEMO_TENANT_ID = "demo-agenda";
