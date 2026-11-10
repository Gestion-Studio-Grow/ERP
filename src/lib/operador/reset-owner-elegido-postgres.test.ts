// ============================================================================
// RESET DEL DUEÑO DESDE LA CONSOLA CON VARIOS OWNER ACTIVOS — base efímera con RLS.
// ============================================================================
//
// Antes la consola reseteaba siempre al OWNER activo MÁS ANTIGUO: con dos dueños, le cambiaba la
// contraseña a quien no era. Ahora (`resetOwnerPasswordDeTenant` con `ownerId`, operator-actions.ts):
//   · con dos dueños y sin elegir → se niega y no cambia ningún hash, flag ni auditoría;
//   · lo mismo la acción legada `resetOwnerPassword`;
//   · un `ownerId` de otro negocio, inactivo, borrado o de una recepcionista → se niega sin tocar nada;
//   · el `ownerId` elegido (el MÁS NUEVO) → cambia sólo ése: hash, cambio obligatorio y auditoría suya;
//   · un negocio con un solo dueño y sin `ownerId` → sale como siempre.
// La consola es `app_rls`, como en producción.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, CLAVE_DE_PRUEBA } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { verifyPassword } from "@/lib/auth-password";

test("consola: con varios dueños activos hay que elegir; se resetea sólo al elegido", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { ...env };
  Object.assign(env, {
    OPERATOR_DATABASE_URL: base.urlApp,
    OPERATOR_SECRET: "secreto-de-operador-qa",
    AUTH_SECRET: "secreto-de-auth-qa",
    OPERADOR_DUENIO: "tomas",
  });
  t.after(() => {
    for (const k of ["OPERATOR_DATABASE_URL", "OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO"]) {
      if (antes[k] === undefined) delete env[k];
      else env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { resetOwnerPassword, resetOwnerPasswordDeTenant } = await import("@/lib/operator-actions");
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };
  assert.equal(await operatorPrisma.user.count(), 0, "la conexión de la consola tiene que estar sujeta a RLS");

  const a = base.a;
  const hashDePrueba = (await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { passwordHash: true } }))
    .passwordHash;
  // La dueña del arnés es la MÁS ANTIGUA: el puerto viejo la habría elegido a ella.
  await duenio.user.update({ where: { id: a.duenia.id }, data: { createdAt: new Date("2020-01-01T00:00:00Z") } });
  const owner = (email: string, extra: { active?: boolean; deletedAt?: Date; createdAt?: Date } = {}) =>
    duenio.user.create({
      data: { tenantId: a.id, name: email, email, passwordHash: hashDePrueba, role: "OWNER", ...extra },
      select: { id: true, email: true },
    });
  const socia = await owner("socia@negocio-a.erp.test", { createdAt: new Date("2021-01-01T00:00:00Z") });
  const inactivo = await owner("inactivo@negocio-a.erp.test", { active: false });
  const borrado = await owner("borrado@negocio-a.erp.test", { deletedAt: new Date("2026-01-01T00:00:00Z") });

  const foto = async () =>
    JSON.stringify({
      usuarios: await duenio.user.findMany({
        orderBy: { id: "asc" },
        select: { id: true, passwordHash: true, mustChangePassword: true },
      }),
      auditorias: await duenio.auditLog.count({ where: { action: "owner.password.reset" } }),
    });
  const intentar = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    const r = await ejecutarAccion(operador, fn);
    assert.equal(r.tipo, "respuesta");
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const sinTocar = await foto();

  await t.test("dos dueños y sin elegir: se niega y no toca nada", async () => {
    const r = await intentar(() => resetOwnerPasswordDeTenant(a.id, a.slug));
    assert.equal(r?.ok, false);
    assert.match(String(r?.error), /más de un dueño activo/);
    assert.match(String(r?.error), /No se tocó nada/);
    assert.equal(await foto(), sinTocar);
  });

  await t.test("la acción legada tampoco elige al más antiguo", async () => {
    const r = await intentar(() => resetOwnerPassword(a.id));
    assert.equal(r?.ok, false);
    assert.match(String(r?.error), /más de un dueño activo/);
    assert.equal(await foto(), sinTocar);
  });

  await t.test("ownerId de otro negocio, inactivo, borrado, de recepción o inexistente: se niega sin tocar nada", async () => {
    for (const id of [base.b.duenia.id, inactivo.id, borrado.id, a.recepcion.id, "no-existe"]) {
      const r = await intentar(() => resetOwnerPasswordDeTenant(a.id, a.slug, id));
      assert.equal(r?.ok, false, `tenía que negarse con ${id}`);
      assert.match(String(r?.error), /No se tocó nada/);
    }
    // Slug mal tipeado con un dueño válido: tampoco.
    assert.equal((await intentar(() => resetOwnerPasswordDeTenant(a.id, base.b.slug, socia.id)))?.ok, false);
    assert.equal(await foto(), sinTocar);
  });

  await t.test("el dueño elegido (el más nuevo): cambia sólo el suyo, con cambio obligatorio y auditoría", async () => {
    const r = await ejecutarAccion(operador, () => resetOwnerPasswordDeTenant(a.id, ` ${a.slug.toUpperCase()} `, socia.id));
    assert.equal(r.tipo, "respuesta");
    if (r.tipo !== "respuesta" || !r.valor.ok) return assert.fail(`el reset tenía que salir: ${JSON.stringify(r).slice(0, 300)}`);
    assert.equal(r.valor.email, socia.email);

    const s = await duenio.user.findUniqueOrThrow({ where: { id: socia.id }, select: { passwordHash: true, mustChangePassword: true } });
    assert.equal(await verifyPassword(r.valor.password, s.passwordHash), true);
    assert.equal(await verifyPassword(CLAVE_DE_PRUEBA, s.passwordHash), false, "la vieja deja de valer");
    assert.equal(s.mustChangePassword, true);

    const f = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { passwordHash: true, mustChangePassword: true } });
    assert.equal(f.passwordHash, hashDePrueba, "la dueña más antigua no se toca");
    assert.equal(f.mustChangePassword, false);

    const audits = await duenio.auditLog.findMany({ where: { action: "owner.password.reset" } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].tenantId, a.id);
    assert.equal(audits[0].entityId, socia.id);
    assert.equal(audits[0].actor, "operator:tomas");
    assert.ok(!JSON.stringify(audits[0].changes).includes(r.valor.password), "la auditoría no lleva la contraseña");

    // Los demás usuarios (inactivo, borrado, recepción, el otro negocio) quedaron como estaban.
    const otros = await duenio.user.findMany({
      where: { id: { notIn: [socia.id] } },
      select: { passwordHash: true, mustChangePassword: true },
    });
    assert.ok(otros.every((u) => u.mustChangePassword === false));
  });

  await t.test("un solo dueño y sin elegir: sale como siempre", async () => {
    const b = base.b;
    const r = await ejecutarAccion(operador, () => resetOwnerPasswordDeTenant(b.id, b.slug));
    assert.equal(r.tipo, "respuesta");
    if (r.tipo !== "respuesta" || !r.valor.ok) return assert.fail("el reset con un solo dueño tenía que salir");
    assert.equal(r.valor.email, b.duenia.email);
    const u = await duenio.user.findUniqueOrThrow({ where: { id: b.duenia.id }, select: { passwordHash: true, mustChangePassword: true } });
    assert.equal(await verifyPassword(r.valor.password, u.passwordHash), true);
    assert.equal(u.mustChangePassword, true);
    const audit = await duenio.auditLog.findFirstOrThrow({ where: { action: "owner.password.reset", tenantId: b.id } });
    assert.equal(audit.entityId, b.duenia.id);
  });
});
