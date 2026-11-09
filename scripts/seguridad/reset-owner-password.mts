// ============================================================================
// RESET DE LA CONTRASEÑA DEL OWNER DE UN NEGOCIO — responsable de seguridad.
// ============================================================================
//
//   OPERATOR_DATABASE_URL=<conexión> RESET_SLUG=<slug> RESET_CONFIRMAR=<slug> \
//   RESET_ACTOR="sistema:responsable-seguridad (SEG-NNN)" RESET_SALIDA=<archivo fuera del repo> \
//   npx tsx scripts/seguridad/reset-owner-password.mts
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

  const { operatorPrisma } = await import("../../src/lib/operator-db");
  const { resetOwnerPorSlug } = await import("../../src/lib/seguridad/reset-owner-por-slug");
  try {
    const r = await resetOwnerPorSlug(operatorPrisma, {
      slug: env("RESET_SLUG"),
      confirmacion: env("RESET_CONFIRMAR"),
      actor: env("RESET_ACTOR"),
    });
    if (!r.ok) throw new Error(r.error);
    writeFileSync(salida, JSON.stringify({ email: r.email, password: r.password }), { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, auditId: r.auditId, userId: r.userId, tenantId: r.tenantId, mustChangePassword: true }));
  } finally {
    await operatorPrisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`No se reseteó: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
