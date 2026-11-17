// ============================================================================
// CONSOLA DE LA CUADRILLA · C1(f) de la certificación GSG-MIA-076 (QA ronda 3, GSG-MIA-078), SEGURIDAD.
// ============================================================================
//
// El techo (GSG-MIA-076) impide que IGUALAR deje al usuario de un agente como Dueño/a. Pero un usuario de agente
// puede YA ser OWNER (cargado antes del techo, o a mano en la base). Para ese caso:
//   · la consola lo muestra como ALERTA (no como una diferencia más);
//   · en Usuarios no cambia claves, no da de baja, no da de alta ni toca permisos o fichas: todo se rechaza en el
//     servidor y no se escribe nada. La dueña de verdad sigue pudiendo.
// Con la base real bajo RLS (`app_rls`) y las Server Actions REALES. Sin Postgres local el arnés saltea (en CI falla).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

test("cuadrilla C1(f): el usuario de un agente que ya es OWNER es alerta en la consola y no administra Usuarios", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { ...process.env };
  Object.assign(process.env, { AUTH_SECRET: "secreto-de-auth-qa" });
  t.after(() => {
    if (antes.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes.AUTH_SECRET;
  });
  prepararAccionesDeServidor();

  const duenio = await prismaComoDuenio(base);
  base.alBorrar(() => duenio.$disconnect());
  const { a } = base;
  const { hashPassword } = await import("@/lib/auth-password");
  const hash = await hashPassword("no-se-usa-en-el-test-1");
  // El usuario del agente, YA OWNER (antes del techo). Una persona del puesto para comparar.
  const delAgente = await duenio.user.create({ data: { tenantId: a.id, name: "Usuario Agente Owner", email: "agente-owner@negocio.test", passwordHash: hash, role: "OWNER" } });
  const persona = await duenio.user.create({ data: { tenantId: a.id, name: "Cajera Humana", email: "cajera@negocio.test", passwordHash: hash, role: "RECEPTION" } });
  const agente = await duenio.agenteCuadrilla.create({ data: { tenantId: a.id, nombre: "Joaquín", puesto: "caja", equipo: "Caja", userId: delAgente.id } });
  const comoAgente = { negocio: a, usuario: delAgente };
  const laDuenia = { negocio: a, usuario: a.duenia };
  const conError = (r: { tipo: string; destino?: string }) => r.tipo === "redireccion" && /status=error_/.test(r.destino ?? "");

  const { resetUserPassword, setUserActive, createUser, setUserPermission, vincularProfesional } = await import("@/lib/user-actions");

  const foto = async () => {
    const us = await duenio.user.findMany({
      where: { tenantId: a.id },
      orderBy: { id: "asc" },
      select: { id: true, passwordHash: true, active: true, mustChangePassword: true, role: true, professionalId: true, permissionOverrides: { select: { capability: true, allowed: true } } },
    });
    return JSON.stringify(us);
  };

  await t.test("la consola lo muestra como alerta, con o sin persona del puesto", async () => {
    const { tenantTransaction } = await import("@/lib/rls");
    const { estadoDeAccesos } = await import("@/lib/cuadrilla/accesos-core");
    for (const comoUserId of [null, persona.id]) {
      const e = await tenantTransaction(async (tx) => (await estadoDeAccesos(tx, a.id, [{ id: agente.id, userId: delAgente.id, comoUserId }])).get(agente.id)!, { tenantId: a.id });
      assert.match(e.alerta ?? "", /Dueño\/a/, `alerta con comoUserId=${comoUserId}`);
      assert.match(e.alerta ?? "", /Usuarios/);
    }
    // Un agente con rol del puesto no es alerta.
    await duenio.user.update({ where: { id: delAgente.id }, data: { role: "RECEPTION" } });
    const e = await tenantTransaction(async (tx) => (await estadoDeAccesos(tx, a.id, [{ id: agente.id, userId: delAgente.id, comoUserId: persona.id }])).get(agente.id)!, { tenantId: a.id });
    assert.equal(e.alerta, null);
    await duenio.user.update({ where: { id: delAgente.id }, data: { role: "OWNER" } });
  });

  await t.test("en Usuarios no cambia claves, no da de baja, no da de alta ni toca permisos: nada escrito", async () => {
    const inicial = await foto();
    assert.ok(conError(await ejecutarAccion(comoAgente, () => resetUserPassword(fd({ userId: a.duenia.id, password: "una-clave-nueva-123" })))), "cambiar la clave de la dueña");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => resetUserPassword(fd({ userId: persona.id, password: "una-clave-nueva-123" })))), "cambiar la clave de la cajera");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => setUserActive(fd({ userId: a.duenia.id, active: "false" })))), "dar de baja a la dueña");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => setUserActive(fd({ userId: persona.id, active: "false" })))), "dar de baja a la cajera");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => createUser(fd({ name: "Nueva", email: "nueva@negocio.test", role: "OWNER", password: "una-clave-nueva-123" })))), "dar de alta");
    assert.ok(conError(await ejecutarAccion(comoAgente, () => vincularProfesional(fd({ userId: persona.id, professionalId: "" })))), "tocar la ficha");
    const r = await ejecutarAccion(comoAgente, () => setUserPermission(fd({ userId: persona.id, capability: "clients:contact", allowed: "false" })));
    assert.ok(r.tipo === "respuesta" && (r.valor as { ok: boolean }).ok === false, `tocar un permiso: ${JSON.stringify(r)}`);
    assert.equal(await foto(), inicial, "nada escrito");
    assert.equal(await duenio.user.count({ where: { tenantId: a.id, email: "nueva@negocio.test" } }), 0);
  });

  await t.test("la dueña de verdad sí cambia claves (control)", async () => {
    const antesHash = (await duenio.user.findUniqueOrThrow({ where: { id: persona.id } })).passwordHash;
    const r = await ejecutarAccion(laDuenia, () => resetUserPassword(fd({ userId: persona.id, password: "una-clave-nueva-123" })));
    assert.ok(r.tipo === "redireccion" && /status=ok_password_reset/.test(r.destino), JSON.stringify(r));
    assert.notEqual((await duenio.user.findUniqueOrThrow({ where: { id: persona.id } })).passwordHash, antesHash);
  });
});
