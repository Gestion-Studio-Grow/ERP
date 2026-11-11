// ============================================================================
// EDITAR UNA PERSONA DESDE LA CONSOLA — base efímera con RLS (la consola es `app_rls`, como en producción).
// ============================================================================
//
// `editarUsuarioDeTenant` (operator-actions.ts) sobre una base real:
//   · slug mal tipeado → no toca nada;
//   · un usuario del OTRO negocio, pedido desde éste → «no es de este negocio», el otro queda igual;
//   · el último dueño activo no se baja de rol ni se da de baja;
//   · rol + nombre + ficha de agenda: se escriben y quedan auditados en ESTE negocio; contraseña y email intactos;
//   · con dos dueños, uno se puede dar de baja; el otro negocio no recibió ni un cambio ni una auditoría;
//   · CARRERAS (norma 6 de CI): con dos dueños, dos cambios a la vez que bajan cada uno a uno de ellos —consola
//     contra consola, y baja del panel (`darDeBajaUsuarioSiQuedaDuenio`) contra consola— nunca dejan 0 dueños.
//     Deterministas: el test toma antes el candado de usuarios del negocio, larga las dos con `Promise.all`,
//     espera a ver las DOS en fila detrás del candado (si alguna no lo toma, falla) y recién ahí lo suelta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("consola: editar una persona respeta el negocio, el último dueño y deja auditoría", async (t) => {
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
  const { editarUsuarioDeTenant } = await import("@/lib/operator-actions");
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };
  assert.equal(await operatorPrisma.user.count(), 0, "la conexión de la consola tiene que estar sujeta a RLS");

  const { a, b } = base;
  const ficha = await duenio.professional.create({ data: { tenantId: a.id, name: "Laura" }, select: { id: true } });

  const fd = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };
  const intentar = async (campos: Record<string, string>) => {
    const r = await ejecutarAccion(operador, () => editarUsuarioDeTenant(fd(campos)));
    assert.equal(r.tipo, "respuesta");
    return r.tipo === "respuesta" ? r.valor : null;
  };
  const fotoDe = async (tenantId: string) =>
    JSON.stringify({
      usuarios: await duenio.user.findMany({
        where: { tenantId },
        orderBy: { id: "asc" },
        select: { id: true, name: true, email: true, role: true, active: true, professionalId: true, passwordHash: true },
      }),
      auditorias: await duenio.auditLog.count({ where: { tenantId, entity: "User" } }),
    });
  const fotoB = await fotoDe(b.id);
  const fotoA = await fotoDe(a.id);

  await t.test("slug mal tipeado: no toca nada", async () => {
    const r = await intentar({ tenantId: a.id, slug: b.slug, userId: a.recepcion.id, nombre: "Otra" });
    assert.equal(r?.ok, false);
    assert.equal(r && !r.ok ? r.codigo : null, "slug-no-coincide");
    assert.equal(await fotoDe(a.id), fotoA);
  });

  await t.test("un usuario del otro negocio, pedido desde éste: no existe acá y no se toca", async () => {
    const r = await intentar({ tenantId: a.id, slug: a.slug, userId: b.duenia.id, rol: "RECEPTION", nombre: "Pisada" });
    assert.equal(r && !r.ok ? r.codigo : null, "no-encontrado");
    assert.equal(await fotoDe(b.id), fotoB);
  });

  await t.test("el último dueño activo no se baja de rol ni se da de baja", async () => {
    for (const cambio of [{ rol: "RECEPTION" }, { activo: "false" }] as Record<string, string>[]) {
      const r = await intentar({ tenantId: a.id, slug: a.slug, userId: a.duenia.id, ...cambio });
      assert.equal(r && !r.ok ? r.codigo : null, "ultimo-owner", JSON.stringify(cambio));
    }
    assert.equal(await fotoDe(a.id), fotoA);
  });

  await t.test("rol, nombre y ficha: se escriben y quedan auditados en este negocio; clave y email intactos", async () => {
    const previo = await duenio.user.findUniqueOrThrow({ where: { id: a.recepcion.id }, select: { email: true, passwordHash: true } });
    const r = await intentar({
      tenantId: a.id,
      slug: ` ${a.slug.toUpperCase()} `,
      userId: a.recepcion.id,
      rol: "PROFESSIONAL",
      nombre: "  Laura Gómez ",
      fichaId: ficha.id,
      activo: "true",
    });
    assert.equal(r?.ok, true, JSON.stringify(r));
    const u = await duenio.user.findUniqueOrThrow({
      where: { id: a.recepcion.id },
      select: { name: true, role: true, professionalId: true, email: true, passwordHash: true },
    });
    assert.deepEqual(
      { name: u.name, role: u.role, professionalId: u.professionalId },
      { name: "Laura Gómez", role: "PROFESSIONAL", professionalId: ficha.id },
    );
    assert.equal(u.email, previo.email);
    assert.equal(u.passwordHash, previo.passwordHash);
    const audits = await duenio.auditLog.findMany({ where: { entity: "User", entityId: a.recepcion.id, action: "update" } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].tenantId, a.id);
    assert.equal(audits[0].actor, "operator:tomas");
    assert.deepEqual((audits[0].changes as { despues: unknown }).despues, {
      name: "Laura Gómez",
      role: "PROFESSIONAL",
      professionalId: ficha.id,
    });
  });

  await t.test("con dos dueños, uno se puede dar de baja; el otro negocio no recibió nada", async () => {
    assert.equal((await intentar({ tenantId: a.id, slug: a.slug, userId: a.recepcion.id, rol: "OWNER" }))?.ok, true);
    assert.equal((await intentar({ tenantId: a.id, slug: a.slug, userId: a.duenia.id, activo: "false" }))?.ok, true);
    const d = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { active: true } });
    assert.equal(d.active, false);
    // Ahora el único dueño activo es la ex recepcionista: no se la puede bajar.
    const r = await intentar({ tenantId: a.id, slug: a.slug, userId: a.recepcion.id, activo: "false" });
    assert.equal(r && !r.ok ? r.codigo : null, "ultimo-owner");
    assert.equal(await fotoDe(b.id), fotoB);
  });

  // --- Carreras sobre el último dueño -----------------------------------------------------------------
  const { bloquearUsuariosDelNegocioEnTx, darDeBajaUsuarioSiQuedaDuenio } = await import("@/lib/usuarios-del-plan");
  const duenosActivos = () => duenio.user.count({ where: { tenantId: a.id, role: "OWNER", active: true, deletedAt: null } });
  const dosDuenos = async () => {
    for (const id of [a.duenia.id, a.recepcion.id]) {
      await duenio.user.update({ where: { id }, data: { role: "OWNER", active: true, professionalId: null } });
    }
    assert.equal(await duenosActivos(), 2);
  };
  const enFilaDetrasDelCandado = async () => {
    const [{ n }] = await duenio.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_locks
      WHERE locktype = 'advisory' AND NOT granted
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`;
    return n;
  };
  // Toma el candado de usuarios del negocio, larga las carreras, espera a que TODAS estén esperándolo y lo
  // suelta: así corren de verdad a la vez, sin depender de la suerte del planificador.
  const aLaVez = async <T>(carreras: Array<() => Promise<T>>): Promise<T[]> => {
    let soltar!: () => void;
    const suelto = new Promise<void>((r) => (soltar = r));
    let tomado!: () => void;
    const yaTomado = new Promise<void>((r) => (tomado = r));
    const guardia = duenio.$transaction(
      async (tx) => {
        await bloquearUsuariosDelNegocioEnTx(tx, a.id);
        tomado();
        await suelto;
      },
      { timeout: 30_000 },
    );
    await yaTomado;
    const todas = Promise.all(carreras.map((c) => c()));
    let enFila = 0;
    for (let i = 0; i < 400 && enFila < carreras.length; i++) {
      enFila = await enFilaDetrasDelCandado();
      if (enFila < carreras.length) await new Promise((r) => setTimeout(r, 25));
    }
    soltar();
    await guardia;
    const rs = await todas;
    assert.equal(enFila, carreras.length, "cada cambio tiene que esperar el candado de usuarios del negocio");
    return rs;
  };
  const codigoDe = (r: unknown) => (r as { ok?: boolean; codigo?: string; motivo?: string } | null);

  await t.test("carrera consola contra consola: bajar de rol a una y dar de baja a la otra a la vez nunca deja 0 dueños", async () => {
    await dosDuenos();
    const rs = await aLaVez([
      () => intentar({ tenantId: a.id, slug: a.slug, userId: a.duenia.id, rol: "RECEPTION" }),
      () => intentar({ tenantId: a.id, slug: a.slug, userId: a.recepcion.id, activo: "false" }),
    ]);
    assert.equal(await duenosActivos(), 1, JSON.stringify(rs));
    assert.deepEqual(rs.map((r) => (r?.ok ? "ok" : r?.codigo)).sort(), ["ok", "ultimo-owner"], JSON.stringify(rs));
  });

  await t.test("carrera panel contra consola: la baja del panel y el cambio de rol de la consola nunca dejan 0 dueños", async () => {
    await dosDuenos();
    const rs = await aLaVez<unknown>([
      () => darDeBajaUsuarioSiQuedaDuenio(a.id, a.recepcion.id),
      () => intentar({ tenantId: a.id, slug: a.slug, userId: a.duenia.id, rol: "RECEPTION" }),
    ]);
    assert.equal(await duenosActivos(), 1, JSON.stringify(rs));
    const [panel, consola] = rs.map(codigoDe);
    assert.deepEqual(
      [panel?.ok ? "ok" : panel?.motivo, consola?.ok ? "ok" : consola?.codigo].filter((x) => x !== "ok"),
      ["ultimo-owner"],
      JSON.stringify(rs),
    );
    // El panel tampoco da de baja al último dueño cuando está solo.
    const sola = (await duenio.user.findFirstOrThrow({ where: { tenantId: a.id, role: "OWNER", active: true }, select: { id: true } })).id;
    assert.deepEqual(await darDeBajaUsuarioSiQuedaDuenio(a.id, sola), { ok: false, motivo: "ultimo-owner" });
    assert.equal(await duenosActivos(), 1);
    assert.equal(await fotoDe(b.id), fotoB);
  });
});
