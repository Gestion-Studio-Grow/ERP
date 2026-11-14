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

test("varios OWNER activos: sin email frena; con email resetea sólo a ése; email ajeno, inactivo o no OWNER frena", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { resetOwnerPorSlug } = await import("@/lib/seguridad/reset-owner-por-slug");
  base.alBorrar(() => operatorPrisma.$disconnect());
  const a = base.a;
  const hash = (await duenio.user.findUniqueOrThrow({ where: { id: a.recepcion.id }, select: { passwordHash: true } })).passwordHash;
  const owner = (email: string, extra: { active?: boolean; deletedAt?: Date; createdAt?: Date } = {}) =>
    duenio.user.create({
      data: { tenantId: a.id, name: email, email, passwordHash: hash, role: "OWNER", ...extra },
      select: { id: true, email: true },
    });
  // El fundador es el OWNER más antiguo: el puerto de la consola lo elegiría a él.
  const fundador = await owner("fundador@negocio-a.erp.test", { createdAt: new Date("2020-01-01T00:00:00Z") });
  const socia = await owner("Socia@Negocio-A.erp.test");
  const inactivo = await owner("inactivo@negocio-a.erp.test", { active: false });
  const borrado = await owner("borrado@negocio-a.erp.test", { deletedAt: new Date("2026-01-01T00:00:00Z") });

  const foto = async () =>
    JSON.stringify(
      await duenio.user.findMany({ orderBy: { id: "asc" }, select: { id: true, passwordHash: true, mustChangePassword: true } }),
    );
  const auditorias = () => duenio.auditLog.count({ where: { action: "owner.password.reset" } });
  const antes = await foto();
  const auditAntes = await auditorias();
  const intento = (email?: string) => resetOwnerPorSlug(operatorPrisma, { slug: a.slug, confirmacion: a.slug, actor: ACTOR, email });

  // (a) Más de un OWNER activo y sin email: frena con el aviso, nada cambia.
  const sinEmail = await intento();
  assert.equal(sinEmail.ok, false);
  if (!sinEmail.ok) assert.match(sinEmail.error, /más de un dueño activo.*RESET_EMAIL/);
  assert.equal((await intento("   ")).ok, false, "un email en blanco cuenta como sin email");
  // (c) Email del OWNER de OTRO negocio. (d) Inactivo, borrado, no OWNER, inexistente.
  for (const email of [base.b.duenia.email, inactivo.email, borrado.email, a.recepcion.email, "nadie@negocio-a.erp.test"]) {
    const r = await intento(email);
    assert.equal(r.ok, false, `no debe resetear con ${email}`);
  }
  assert.equal(await foto(), antes, "ningún hash ni flag cambió");
  assert.equal(await auditorias(), auditAntes, "ninguna auditoría nueva");

  // (b) Email de la socia con mayúsculas y espacios: sólo ella cambia, no el fundador (el más antiguo).
  const r = await intento("  SOCIA@negocio-a.ERP.TEST ");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.userId, socia.id);
  assert.equal(r.email, socia.email);
  const u = await duenio.user.findUniqueOrThrow({ where: { id: socia.id }, select: { mustChangePassword: true, passwordHash: true } });
  assert.equal(u.mustChangePassword, true);
  assert.equal(await verifyPassword(r.password, u.passwordHash), true);
  const audit = await duenio.auditLog.findUniqueOrThrow({ where: { id: r.auditId } });
  assert.equal(audit.entityId, socia.id);
  assert.equal(audit.tenantId, a.id);
  assert.equal(await auditorias(), auditAntes + 1);

  const antesPorId = new Map((JSON.parse(antes) as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
  const despues = JSON.parse(await foto()) as { id: string }[];
  for (const x of despues) {
    if (x.id === socia.id) continue;
    assert.equal(JSON.stringify(x), antesPorId.get(x.id), `el usuario ${x.id} no se tocó`);
  }
  assert.ok(antesPorId.has(fundador.id));
});
