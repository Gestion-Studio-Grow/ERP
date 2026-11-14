// CAMBIO OBLIGATORIO DE CONTRASEÑA CONTRA POSTGRES (GSG-SEG-008, 09/11/2026), con el rol de la app (app_rls, sin
// BYPASSRLS) y RLS encendido, sobre una base efímera propia (src/test/base-efimera.ts) que corre `migrate deploy`.
//
// Con la migración 20261109120000_must_change_password:
//   · la columna existe y el cliente de Prisma (que ahora la conoce) lee y escribe `User` sin romper el login;
//   · el operador marca el flag dentro de `enElNegocio` (la conexión de la consola está sujeta a RLS) y la app lo ve;
//   · el negocio B no ve ni toca el flag de A; bajarlo (`clearMustChangePassword`) lo deja en false.
// Sin la columna (se borra a propósito en la base efímera): el reset del OWNER FALLA CERRADO — no emite provisoria,
// no toca el hash ni deja auditoría — y el alta tira CambioObligatorioInactivo y la transacción no deja al usuario.
// Sin Postgres local se saltea con el motivo (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

// Una sola base para el archivo: los módulos de la app quedan atados a la primera que ven. El segundo test borra
// la columna, así que corre después del primero (node:test los corre en orden).
const laBase = baseEfimeraDelArchivo();

test("con la migración: el flag se marca desde la consola, la app lo ve, B no lo toca y se baja", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const mc = await import("@/lib/must-change-password");
  base.alBorrar(() => operatorPrisma.$disconnect());

  const a = base.a.duenia;
  const b = base.b.duenia;

  // La columna llegó por `migrate deploy`, con default false en las filas existentes.
  const [col] = await duenio.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'mustChangePassword'`;
  assert.equal(col.n, 1);
  assert.equal(await mc.mustChangePasswordFor(a), false);

  // El cliente de Prisma conoce la columna: un `findFirst` sin `select` (como el login) no rompe.
  const u = await duenio.user.findFirst({ where: { id: a.id } });
  assert.equal(u?.mustChangePassword, false);

  // Operador → marca el flag de la dueña de A (dentro del negocio, como el reset real).
  const set = await enElNegocio(a.tenantId, (tx) => mc.operatorSetMustChange(tx, { userId: a.id, tenantId: a.tenantId }, true));
  assert.deepEqual(set, { persisted: true });
  assert.equal(await enElNegocio(a.tenantId, (tx) => mc.operatorReadMustChange(tx, a.id)), true);
  assert.equal(await mc.mustChangePasswordFor(a), true);

  // Parado en B no se ve ni se pisa la fila de A (RLS).
  assert.equal(await enElNegocio(b.tenantId, (tx) => mc.operatorReadMustChange(tx, a.id)), false);
  assert.deepEqual(
    await enElNegocio(b.tenantId, (tx) => mc.operatorSetMustChange(tx, { userId: a.id, tenantId: b.tenantId }, false)),
    { persisted: false },
    "desde B el UPDATE no toca la fila de A: no cuenta como marcado",
  );
  // Parado en A pero con el negocio de B en el filtro: el `AND "tenantId"` escrito a mano también frena (GSG-SEG-013),
  // no sólo RLS.
  assert.deepEqual(
    await enElNegocio(a.tenantId, (tx) => mc.operatorSetMustChange(tx, { userId: a.id, tenantId: b.tenantId }, false)),
    { persisted: false },
  );
  // Con el negocio de B no se lee A: 0 filas → LADO SEGURO (GSG-SEG-013): pide el cambio en vez de dejar pasar.
  assert.equal(await mc.mustChangePasswordFor({ id: a.id, tenantId: b.tenantId }), true, "0 filas → true (falla cerrado)");
  assert.equal(await mc.mustChangePasswordFor(a), true, "B no pudo bajar el flag de A");
  assert.equal(await mc.mustChangePasswordFor(b), false);

  // FALLA CERRADO ante un error que no es «falta la columna»: sin permiso de lectura sobre User, la app manda a
  // cambiar la contraseña en vez de dejar pasar (B no tiene el flag y aun así da true).
  await duenio.$executeRawUnsafe(`REVOKE SELECT ON "User" FROM app_rls`);
  try {
    assert.equal(await mc.mustChangePasswordFor(b), true);
  } finally {
    await duenio.$executeRawUnsafe(`GRANT SELECT ON "User" TO app_rls`);
  }
  assert.equal(await mc.mustChangePasswordFor(b), false);

  // Ya con contraseña nueva: se baja y queda en false (lo confirma el dueño de las tablas).
  await mc.clearMustChangePassword(a);
  assert.equal(await mc.mustChangePasswordFor(a), false);
  const fila = await duenio.user.findUnique({ where: { id: a.id }, select: { mustChangePassword: true } });
  assert.equal(fila?.mustChangePassword, false);
});

test("sin la columna: el reset y el alta fallan cerrado (ninguna provisoria, nada escrito)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const duenio = await prismaComoDuenio(base);
  await duenio.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN "mustChangePassword"`);
  const { enElNegocio } = await import("@/lib/operator-db");
  const mc = await import("@/lib/must-change-password");
  const { resetOwnerPasswordCore } = await import("@/lib/owner-password-reset");
  const { altaPersonaCore } = await import("@/lib/operador/alta-persona");

  const a = base.a.duenia;
  const hashAntes = (await duenio.$queryRaw<{ h: string }[]>`SELECT "passwordHash" AS h FROM "User" WHERE id = ${a.id}`)[0].h;
  const auditsAntes = (await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "AuditLog"`)[0].n;

  // Reset del OWNER con el puerto armado igual que el real (operator-actions.ts → operatorResetPort), en SQL crudo
  // para no depender de un cliente que SELECT-ea la columna que acabamos de borrar.
  const r = await enElNegocio(a.tenantId, (tx) =>
    resetOwnerPasswordCore(
      {
        findOwner: async () => ({ id: a.id, email: a.email }),
        setPasswordHash: async (id, h) => {
          await tx.$executeRaw`UPDATE "User" SET "passwordHash" = ${h} WHERE id = ${id}`;
        },
        setMustChange: (id, v) => mc.operatorSetMustChange(tx, { userId: id, tenantId: a.tenantId }, v),
        audit: async () => {
          await tx.$executeRaw`INSERT INTO "AuditLog" (id) VALUES ('no-deberia')`;
        },
      },
      { tenantId: a.tenantId, operatorSubject: "test" },
    ),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, mc.CAMBIO_OBLIGATORIO_INACTIVO);
  const hashDespues = (await duenio.$queryRaw<{ h: string }[]>`SELECT "passwordHash" AS h FROM "User" WHERE id = ${a.id}`)[0].h;
  assert.equal(hashDespues, hashAntes, "la contraseña vieja quedó intacta");
  assert.equal((await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "AuditLog"`)[0].n, auditsAntes);

  // Alta: crea la fila, el flag no se puede marcar → tira y la transacción la deshace.
  const email = "provisoria@negocio-a.test";
  await assert.rejects(
    enElNegocio(a.tenantId, (tx) =>
      altaPersonaCore(
        {
          existeEmail: async () => false,
          decidirTope: async () => ({ ok: true }),
          crear: async (d) => {
            await tx.$executeRaw`INSERT INTO "User" (id, "tenantId", name, email, "passwordHash", role, "updatedAt")
              VALUES ('u-provisoria', ${d.tenantId}, ${d.name}, ${d.email}, ${d.passwordHash}, 'RECEPTION', now())`;
            return { id: "u-provisoria" };
          },
          setMustChange: (id, v) => mc.operatorSetMustChange(tx, { userId: id, tenantId: a.tenantId }, v),
          audit: async () => {},
        },
        { tenantId: a.tenantId, operatorSubject: "test", entrada: { name: "Provisoria", email, role: "RECEPTION" } },
      ),
    ),
    (e: unknown) => e instanceof mc.CambioObligatorioInactivo,
  );
  const quedo = await duenio.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "User" WHERE email = ${email}`;
  assert.equal(quedo[0].n, 0, "el alta se deshizo entera");

  // La lectura sin columna no traba a nadie (y sin columna no hay provisorias que forzar).
  assert.equal(await mc.mustChangePasswordFor(a), false);
  assert.equal(await enElNegocio(a.tenantId, (tx) => mc.operatorReadMustChange(tx, a.id)), "pendiente");

  // Se aplica la migración en caliente: la lectura se entera en el acto (el «no existe» no se recuerda),
  // así que una provisoria emitida apenas después obliga al cambio sin ventana.
  await duenio.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`);
  assert.deepEqual(await enElNegocio(a.tenantId, (tx) => mc.operatorSetMustChange(tx, { userId: a.id, tenantId: a.tenantId }, true)), { persisted: true });
  assert.equal(await mc.mustChangePasswordFor(a), true);
});
