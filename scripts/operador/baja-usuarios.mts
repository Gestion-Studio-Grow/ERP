// ============================================================================
// BAJA DE USUARIOS DE UN NEGOCIO — Operador de producción.
// ============================================================================
//
//   OPERATOR_DATABASE_URL=<conexión> BAJA_SLUG=<slug> BAJA_CONFIRMAR=<slug> BAJA_IDS=<id1,id2,...> \
//   BAJA_ACTOR="sistema:operador-produccion (OPS-NNN)" [BAJA_APLICAR=si] [OPS_DB_DRIVER=neon-ws] \
//   npx tsx scripts/operador/baja-usuarios.mts
//
// Sin BAJA_APLICAR=si es un DRY-RUN: no escribe nada y muestra qué filas cambiarían y qué dueños activos
// quedan. Con BAJA_APLICAR=si escribe en UNA transacción, con el candado de usuarios del negocio, la guarda
// de último dueño y auditoría `deactivate`; es idempotente (correrlo dos veces no cambia nada la segunda).
// Antes de aplicar en producción: rama de respaldo en Neon (regla de rotación de 4).
//
// Lógica: `src/lib/operador/baja-usuarios-por-slug.ts` (la misma regla que la baja del panel, `setUserActive`).
// Por consola sale sólo id, nombre, rol, dominio del email y activo antes→después; nunca el email completo
// ni la conexión.
const env = (k: string) => (process.env[k] ?? "").trim();

async function main() {
  if (!env("OPERATOR_DATABASE_URL")) throw new Error("Falta OPERATOR_DATABASE_URL.");
  const { crearClienteDeScript } = await import("../../src/lib/operador/db-de-scripts");
  const { bajaDeUsuariosPorSlug } = await import("../../src/lib/operador/baja-usuarios-por-slug");
  const db = await crearClienteDeScript(process.env, env("OPERATOR_DATABASE_URL"));
  try {
    const r = await bajaDeUsuariosPorSlug(db.prisma, {
      slug: env("BAJA_SLUG"),
      confirmacion: env("BAJA_CONFIRMAR"),
      actor: env("BAJA_ACTOR"),
      ids: env("BAJA_IDS").split(","),
      aplicar: env("BAJA_APLICAR") === "si",
    });
    if (!r.ok) throw new Error(r.error);
    console.log(JSON.stringify({ driver: db.driver, ...r }, null, 2));
  } finally {
    await db.cerrar();
  }
}

main().catch(async (e) => {
  const { sinSecretos } = await import("../../src/lib/operador/db-de-scripts");
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`No se dio de baja: ${sinSecretos(msg, env("OPERATOR_DATABASE_URL"))}`);
  process.exit(1);
});
