// Reset del OWNER por slug (script del responsable de seguridad) contra Postgres con RLS, sobre una base
// efímera propia. Sin Postgres local se saltea con el motivo (en CI falla).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, CLAVE_DE_PRUEBA } from "@/test/base-efimera";
import { verifyPassword } from "@/lib/auth-password";

const laBase = baseEfimeraDelArchivo();
const ACTOR = "sistema:responsable-seguridad (test)";

test("reset por slug: flag en true, auditoría firmada, hash nuevo; el otro negocio no se toca", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { resetOwnerPorSlug } = await import("@/lib/seguridad/reset-owner-por-slug");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const a = base.a;
  const hashB = async () =>
    (await duenio.user.findUniqueOrThrow({ where: { id: base.b.duenia.id }, select: { passwordHash: true } })).passwordHash;
  const hashBAntes = await hashB();

  // Confirmación distinta del slug: no toca nada.
  const mal = await resetOwnerPorSlug(operatorPrisma, { slug: a.slug, confirmacion: base.b.slug, actor: ACTOR });
  assert.equal(mal.ok, false);
  // Negocio inexistente.
  const nada = await resetOwnerPorSlug(operatorPrisma, { slug: "no-existe", confirmacion: "no-existe", actor: ACTOR });
  assert.equal(nada.ok, false);
  // Sin firma de auditoría.
  assert.equal((await resetOwnerPorSlug(operatorPrisma, { slug: a.slug, confirmacion: a.slug, actor: " " })).ok, false);
  assert.equal(await duenio.auditLog.count({ where: { action: "owner.password.reset" } }), 0);

  const r = await resetOwnerPorSlug(operatorPrisma, { slug: a.slug, confirmacion: ` ${a.slug.toUpperCase()} `, actor: ACTOR });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.userId, a.duenia.id);
  assert.equal(r.email, a.duenia.email);

  const u = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { mustChangePassword: true, passwordHash: true } });
  assert.equal(u.mustChangePassword, true);
  assert.equal(await verifyPassword(r.password, u.passwordHash), true);
  assert.equal(await verifyPassword(CLAVE_DE_PRUEBA, u.passwordHash), false, "la vieja deja de valer");

  const audit = await duenio.auditLog.findUniqueOrThrow({ where: { id: r.auditId } });
  assert.equal(audit.tenantId, a.id);
  assert.equal(audit.actor, `operator:${ACTOR}`);
  assert.equal(audit.entityId, a.duenia.id);
  assert.ok(!JSON.stringify(audit.changes).includes(r.password), "la auditoría no lleva la contraseña");

  assert.equal(await hashB(), hashBAntes, "el negocio B no se tocó");
  const flagB = await duenio.user.findUniqueOrThrow({ where: { id: base.b.duenia.id }, select: { mustChangePassword: true } });
  assert.equal(flagB.mustChangePassword, false);
});
