// ============================================================================
// RESET DE LA CONTRASEÑA DEL OWNER DE UN NEGOCIO — responsable de seguridad.
// ============================================================================
//
//   OPERATOR_DATABASE_URL=<conexión> RESET_SLUG=<slug> RESET_CONFIRMAR=<slug> \
//   RESET_ACTOR="sistema:responsable-seguridad (SEG-NNN)" RESET_SALIDA=<archivo fuera del repo> \
//   [OPS_DB_DRIVER=neon-ws] npx tsx scripts/seguridad/reset-owner-password.mts
//
// Desde una sesión en la nube (sólo sale HTTPS por proxy) va con OPS_DB_DRIVER=neon-ws: el driver de
// Neon por WebSocket seguro (443), por el proxy del entorno. Sin la variable, TCP como siempre
// (`src/lib/operador/db-de-scripts.ts`).
//
// Autorización: Factory-GSG `CLAUDE.md` § «Responsable de seguridad (08/11)». Usa la lógica oficial
// (`src/lib/seguridad/reset-owner-por-slug.ts`). La provisoria NUNCA sale por consola: se escribe en
// RESET_SALIDA (permiso 600, fuera del repo) para mandarla por mail aparte al titular, y ese archivo
// se borra después de enviarla. Por consola sólo salen ids (auditoría, usuario) y el flag verificado.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const env = (k: string) => (process.env[k] ?? "").trim();

async function main() {
  if (!env("OPERATOR_DATABASE_URL")) throw new Error("Falta OPERATOR_DATABASE_URL.");
  const salida = env("RESET_SALIDA");
  if (!salida) throw new Error("Falta RESET_SALIDA (archivo fuera del repo para la provisoria).");
  if (resolve(salida).startsWith(process.cwd())) throw new Error("RESET_SALIDA no puede quedar dentro del repo.");

  const { crearClienteDeScript } = await import("../../src/lib/operador/db-de-scripts");
  const { resetOwnerPorSlug } = await import("../../src/lib/seguridad/reset-owner-por-slug");
  const db = await crearClienteDeScript(process.env, env("OPERATOR_DATABASE_URL"));
  try {
    const r = await resetOwnerPorSlug(db.prisma, {
      slug: env("RESET_SLUG"),
      confirmacion: env("RESET_CONFIRMAR"),
      actor: env("RESET_ACTOR"),
    });
    if (!r.ok) throw new Error(r.error);
    writeFileSync(salida, JSON.stringify({ email: r.email, password: r.password }), { mode: 0o600 });
    console.log(
      JSON.stringify({ ok: true, driver: db.driver, auditId: r.auditId, userId: r.userId, tenantId: r.tenantId, mustChangePassword: true }),
    );
  } finally {
    await db.cerrar();
  }
}

main().catch(async (e) => {
  const { sinSecretos } = await import("../../src/lib/operador/db-de-scripts");
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`No se reseteó: ${sinSecretos(msg, env("OPERATOR_DATABASE_URL"))}`);
  process.exit(1);
});
