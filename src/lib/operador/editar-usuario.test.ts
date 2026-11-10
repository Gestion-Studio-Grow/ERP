// Edición de una persona desde la consola (editar-usuario.ts), con un puerto en memoria: sin base.
import test from "node:test";
import assert from "node:assert/strict";
import { editarUsuarioCore, type CambiosDeUsuario, type EditarUsuarioPort, type UsuarioEditable } from "./editar-usuario";

const T = "t1";
type Fila = UsuarioEditable & { tenantId: string; email: string; passwordHash: string };

function puerto(over: Partial<EditarUsuarioPort> = {}, filasIniciales?: Fila[]) {
  const filas: Fila[] = filasIniciales ?? [
    { id: "duenia", tenantId: T, name: "Caro", email: "caro@x.com", passwordHash: "H1", role: "OWNER", active: true, professionalId: null, deletedAt: null },
    { id: "recep", tenantId: T, name: "Recep", email: "r@x.com", passwordHash: "H2", role: "RECEPTION", active: true, professionalId: null, deletedAt: null },
    { id: "prof", tenantId: T, name: "Laura", email: "l@x.com", passwordHash: "H3", role: "PROFESSIONAL", active: true, professionalId: null, deletedAt: null },
    { id: "baja", tenantId: T, name: "Ida", email: "i@x.com", passwordHash: "H4", role: "RECEPTION", active: false, professionalId: null, deletedAt: null },
    { id: "borrada", tenantId: T, name: "Bo", email: "b@x.com", passwordHash: "H5", role: "OWNER", active: true, professionalId: null, deletedAt: new Date("2026-01-01") },
    { id: "ajena", tenantId: "otro", name: "Aje", email: "a@x.com", passwordHash: "H6", role: "OWNER", active: true, professionalId: null, deletedAt: null },
    { id: "carla", tenantId: T, name: "Carla", email: "c@x.com", passwordHash: "H7", role: "PROFESSIONAL", active: true, professionalId: "f-carla", deletedAt: null },
  ];
  const log = { bloqueos: 0, updates: [] as Array<{ userId: string; data: CambiosDeUsuario }>, audits: [] as Array<Record<string, unknown>> };
  const p: EditarUsuarioPort = {
    bloquearUsuarios: async () => {
      log.bloqueos++;
    },
    leerUsuario: async (tid, id) => filas.find((f) => f.id === id && f.tenantId === tid) ?? null,
    contarOwnersActivos: async (tid) => filas.filter((f) => f.tenantId === tid && f.role === "OWNER" && f.active && !f.deletedAt).length,
    fichas: async (tid) =>
      tid === T
        ? [
            { id: "f-libre", usuarioId: filas.find((f) => f.professionalId === "f-libre")?.id ?? null },
            { id: "f-carla", usuarioId: filas.find((f) => f.professionalId === "f-carla")?.id ?? null },
          ]
        : [],
    decidirTope: async () => ({ ok: true }),
    actualizar: async (_tid, userId, data) => {
      log.updates.push({ userId, data });
      Object.assign(filas.find((f) => f.id === userId)!, data);
    },
    audit: async (e) => {
      log.audits.push(e as Record<string, unknown>);
    },
    ...over,
  };
  return { p, log, filas };
}
const editar = (p: EditarUsuarioPort, input: Parameters<typeof editarUsuarioCore>[1]["input"]) =>
  editarUsuarioCore(p, { tenantId: T, operatorSubject: "tomas", input });

function sinTocar(log: ReturnType<typeof puerto>["log"]) {
  assert.equal(log.updates.length, 0, "no se escribe");
  assert.equal(log.audits.length, 0, "no se audita");
}

test("cambia el rol y el nombre (recortado) y audita antes/después sólo de lo tocado", async () => {
  const { p, log } = puerto();
  const r = await editar(p, { userId: "recep", rol: "OWNER", nombre: "  Rocío  ", activo: true });
  assert.equal(r.ok, true);
  assert.deepEqual(log.updates, [{ userId: "recep", data: { name: "Rocío", role: "OWNER" } }]);
  assert.equal(log.bloqueos, 1, "toma el candado de usuarios del negocio");
  assert.equal(log.audits.length, 1);
  const a = log.audits[0];
  assert.equal(a.action, "update");
  assert.equal(a.entity, "User");
  assert.equal(a.entityId, "recep");
  assert.equal(a.actor, "operator:tomas");
  assert.deepEqual(a.changes, {
    antes: { name: "Recep", role: "RECEPTION" },
    despues: { name: "Rocío", role: "OWNER" },
    origen: "consola",
  });
});

test("nunca toca contraseña ni email", async () => {
  const { p, log, filas } = puerto();
  await editar(p, { userId: "prof", rol: "RECEPTION", nombre: "Lau", activo: false, fichaId: null });
  for (const u of log.updates) {
    assert.ok(!("passwordHash" in u.data) && !("email" in u.data));
  }
  const prof = filas.find((f) => f.id === "prof")!;
  assert.equal(prof.passwordHash, "H3");
  assert.equal(prof.email, "l@x.com");
});

test("sin cambios reales: «nada que cambiar», sin escribir ni auditar", async () => {
  const { p, log } = puerto();
  const r = await editar(p, { userId: "recep", rol: "RECEPTION", nombre: " Recep ", activo: true, fichaId: null });
  assert.deepEqual(r.ok ? null : r.codigo, "nada-que-cambiar");
  sinTocar(log);
  const r2 = await editar(p, { userId: "recep" });
  assert.equal(r2.ok ? null : r2.codigo, "nada-que-cambiar");
});

test("sólo personas de ESTE negocio y no borradas", async () => {
  for (const userId of ["ajena", "borrada", "no-existe", ""]) {
    const { p, log } = puerto();
    const r = await editar(p, { userId, nombre: "X" });
    assert.equal(r.ok ? null : r.codigo, "no-encontrado", userId);
    sinTocar(log);
  }
});

test("rol fuera de la lista y nombre vacío se rechazan antes de leer", async () => {
  const { p, log } = puerto();
  for (const rol of ["ADMIN", "owner", "REPARTIDOR", ""]) {
    const r = await editar(p, { userId: "recep", rol });
    assert.equal(r.ok ? null : r.codigo, "rol-invalido", rol);
  }
  const r = await editar(p, { userId: "recep", nombre: "   " });
  assert.equal(r.ok ? null : r.codigo, "nombre-vacio");
  assert.equal(log.bloqueos, 0);
  sinTocar(log);
});

test("último dueño activo: no se le baja el rol ni se lo da de baja", async () => {
  {
    const { p, log } = puerto();
    const r = await editar(p, { userId: "duenia", rol: "RECEPTION" });
    assert.equal(r.ok ? null : r.codigo, "ultimo-owner");
    sinTocar(log);
  }
  {
    const { p, log } = puerto();
    const r = await editar(p, { userId: "duenia", activo: false });
    assert.equal(r.ok ? null : r.codigo, "ultimo-owner");
    sinTocar(log);
  }
  {
    // Cambiarle sólo el nombre al último dueño, sí.
    const { p } = puerto();
    assert.equal((await editar(p, { userId: "duenia", nombre: "Carolina" })).ok, true);
  }
});

test("con otro dueño activo, sí se puede bajar a uno; y nunca se llega a 0", async () => {
  const { p, filas } = puerto();
  assert.equal((await editar(p, { userId: "recep", rol: "OWNER" })).ok, true);
  assert.equal((await editar(p, { userId: "duenia", activo: false })).ok, true);
  // Ahora el único dueño activo es «recep»: no se lo puede bajar.
  const r = await editar(p, { userId: "recep", rol: "PROFESSIONAL" });
  assert.equal(r.ok ? null : r.codigo, "ultimo-owner");
  assert.equal(filas.filter((f) => f.tenantId === T && f.role === "OWNER" && f.active && !f.deletedAt).length, 1);
});

test("un dueño dado de baja no cuenta: tocarlo no choca con la regla", async () => {
  const { p, filas } = puerto();
  filas.push({ id: "ex", tenantId: T, name: "Ex", email: "e@x.com", passwordHash: "H", role: "OWNER", active: false, professionalId: null, deletedAt: null });
  assert.equal((await editar(p, { userId: "ex", rol: "RECEPTION" })).ok, true);
});

test("ficha: vincula una libre a una Profesional; desvincula con null", async () => {
  const { p, log } = puerto();
  assert.equal((await editar(p, { userId: "prof", fichaId: "f-libre" })).ok, true);
  assert.deepEqual(log.updates.at(-1), { userId: "prof", data: { professionalId: "f-libre" } });
  assert.equal((await editar(p, { userId: "prof", fichaId: null })).ok, true);
  assert.deepEqual(log.updates.at(-1), { userId: "prof", data: { professionalId: null } });
});

test("ficha: la de otra persona, una inexistente o un rol que no es Profesional se rechazan", async () => {
  {
    const { p, log } = puerto();
    const r = await editar(p, { userId: "prof", fichaId: "f-carla" });
    assert.equal(r.ok ? null : r.codigo, "ficha-ocupada");
    sinTocar(log);
  }
  {
    const { p, log } = puerto();
    const r = await editar(p, { userId: "prof", fichaId: "f-de-otro-negocio" });
    assert.equal(r.ok ? null : r.codigo, "ficha-no-encontrada");
    sinTocar(log);
  }
  {
    const { p, log } = puerto();
    const r = await editar(p, { userId: "recep", fichaId: "f-libre" });
    assert.equal(r.ok ? null : r.codigo, "vinculo-rol");
    sinTocar(log);
  }
  {
    // El rol con que QUEDA es el que cuenta: pasar a Profesional y vincular en el mismo cambio, sí.
    const { p } = puerto();
    assert.equal((await editar(p, { userId: "recep", rol: "PROFESSIONAL", fichaId: "f-libre" })).ok, true);
  }
});

test("ficha: si la base rechaza por unicidad (P2002, carrera), «ficha-ocupada» y sin auditoría", async () => {
  const { p, log } = puerto({
    actualizar: async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    },
  });
  const r = await editar(p, { userId: "prof", fichaId: "f-libre" });
  assert.equal(r.ok ? null : r.codigo, "ficha-ocupada");
  assert.equal(log.audits.length, 0);
});

test("otro error de la base sube (la transacción del negocio se deshace)", async () => {
  const { p } = puerto({
    actualizar: async () => {
      throw Object.assign(new Error("connection lost"), { code: "P1001" });
    },
  });
  await assert.rejects(editar(p, { userId: "prof", nombre: "Otra" }), /connection lost/);
});

test("reactivar respeta el tope del plan; dar de baja no lo consulta", async () => {
  let consultas = 0;
  {
    const { p, log } = puerto({
      decidirTope: async () => {
        consultas++;
        return { ok: false, motivo: "el plan admite 3 usuarios" };
      },
    });
    const r = await editar(p, { userId: "baja", activo: true });
    assert.equal(r.ok ? null : r.codigo, "sin-lugar-en-plan");
    assert.match(r.ok ? "" : r.error, /3 usuarios/);
    sinTocar(log);
  }
  {
    const { p } = puerto({
      decidirTope: async () => {
        consultas++;
        return { ok: true };
      },
    });
    assert.equal((await editar(p, { userId: "baja", activo: true })).ok, true);
    assert.equal((await editar(p, { userId: "recep", activo: false })).ok, true);
  }
  assert.equal(consultas, 2, "sólo se consulta al reactivar");
});

test("ficha: si el rol con que queda no es Profesional, la ficha se desvincula en la misma escritura y se audita", async () => {
  {
    // Profesional → Recepción sin tocar la ficha: se la desvincula.
    const { p, log, filas } = puerto();
    const r = await editar(p, { userId: "carla", rol: "RECEPTION" });
    assert.equal(r.ok, true);
    assert.deepEqual(log.updates, [{ userId: "carla", data: { role: "RECEPTION", professionalId: null } }]);
    assert.equal(filas.find((f) => f.id === "carla")?.professionalId, null);
    assert.deepEqual(log.audits[0].changes, {
      antes: { role: "PROFESSIONAL", professionalId: "f-carla" },
      despues: { role: "RECEPTION", professionalId: null },
      origen: "consola",
      fichaDesvinculadaPorRol: true,
    });
  }
  {
    // Sigue siendo Profesional: la ficha queda y la auditoría no dice nada de ella.
    const { p, log } = puerto();
    assert.equal((await editar(p, { userId: "carla", nombre: "Carla G." })).ok, true);
    assert.deepEqual(log.updates, [{ userId: "carla", data: { name: "Carla G." } }]);
    assert.equal("fichaDesvinculadaPorRol" in (log.audits[0].changes as object), false);
  }
  {
    // Pedir a la vez otro rol y una ficha sigue siendo un error: no se desvincula «para que entre».
    const { p, log } = puerto();
    const r = await editar(p, { userId: "carla", rol: "OWNER", fichaId: "f-libre" });
    assert.equal(r.ok ? null : r.codigo, "vinculo-rol");
    sinTocar(log);
  }
});
