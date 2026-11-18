// ============================================================================
// E7 (MIA-093, hallazgo del certificador de G4p; decisión del dueño 18/11): nadie vincula una ficha a su propia cuenta.
// Antes, la cuenta OWNER sin ficha cargaba una ficha SIN vincular con el sueldo que quería (no era «lo propio») y después
// la vinculaba a su cuenta sin tocar el sueldo: quedaba «lo propio» con un sueldo que se había fijado ella misma.
// Ahora vincular una ficha a la propia cuenta lo hace otra persona de Dirección, igual que desvincularla (G4p).
//
// Contra Postgres de verdad (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión), con la cuenta
// OWNER del negocio A sin ficha. Incluye la carrera: el alta vinculada y la vinculación de una ficha existente, a la vez.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const SUELDO = 9_900_000;

test("E7 · la cuenta OWNER no vincula una ficha a su propia cuenta (alta, edición ni a la vez); otra persona de Dirección sí", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const owner = await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { id: true, email: true, role: true } });
  assert.equal(owner.role, "OWNER", "la sonda es con la cuenta OWNER");
  assert.equal(await duenio.proyectoPersona.count({ where: { tenantId: a.id, userId: owner.id } }), 0, "la cuenta OWNER arranca sin ficha");
  const cuentaDir = await duenio.user.create({ data: { tenantId: a.id, name: "Dir", email: "dir@mia093.test", passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: cuentaDir.id, nombre: "Dir", email: "dir@mia093.test", rol: "DIRECCION", sueldoBase: 5_000_000 } });

  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  const como = async (userId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: userId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  const gestion = await import("./acciones-gestion");
  const ficha = (extra: Record<string, string>) => form({ nombre: "Dueña", email: owner.email, rol: "DIRECCION", puesto: "", facturaA: "", sueldoBase: String(SUELDO), ...extra });
  const vinculadasAlOwner = () => duenio.proyectoPersona.count({ where: { tenantId: a.id, userId: owner.id } });
  const dice = (r: R, que: string) => {
    assert.equal(r.ok, false, `${que}: ${JSON.stringify(r)}`);
    assert.match(String(r.error), /tu propia cuenta/, "el rechazo dice por qué");
    assert.match(String(r.error), /otra persona de Dirección/, "y quién lo hace");
    assert.match(String(r.error), /única/, "y qué pasa si no hay otra persona de Dirección");
  };

  // 1. Alta nueva vinculada a la propia cuenta, aun con sueldo 0: rechazada.
  dice(await como(owner.id, () => gestion.guardarPersona(ficha({ sueldoBase: "0", vincular: "on" }))), "alta vinculada a sí misma");
  assert.equal(await vinculadasAlOwner(), 0);

  // 2. La ficha SIN vincular, con su sueldo, se carga (no es de nadie todavía)…
  const alta = await como(owner.id, () => gestion.guardarPersona(ficha({})));
  assert.equal(alta.ok, true, `alta sin vincular: ${JSON.stringify(alta)}`);
  const creada = await duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Dueña" }, select: { id: true, userId: true, sueldoBase: true } });
  assert.deepEqual({ userId: creada.userId, sueldoBase: creada.sueldoBase }, { userId: null, sueldoBase: SUELDO });

  // 3. …pero vincularla después a la propia cuenta, sin tocar el sueldo, no: era el camino del hallazgo.
  dice(await como(owner.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on" }))), "vincularse la ficha cargada");
  assert.equal(await vinculadasAlOwner(), 0, "la ficha sigue sin cuenta");

  // 4. La carrera: el alta vinculada y la vinculación de la ficha existente, varias a la vez. Ninguna pasa.
  const aLaVez = await Promise.all([
    como(owner.id, () => gestion.guardarPersona(ficha({ nombre: "Dueña 2", sueldoBase: "0", vincular: "on" }))),
    como(owner.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on" }))),
    como(owner.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on" }))),
    como(owner.id, () => gestion.guardarPersona(ficha({ nombre: "Dueña 3", sueldoBase: "0", vincular: "on" }))),
  ]);
  aLaVez.forEach((r, i) => dice(r, `envío ${i + 1} de la carrera`));
  assert.equal(await vinculadasAlOwner(), 0, "después de la carrera, ninguna ficha quedó con la cuenta OWNER");

  // Control: otra persona de Dirección sí la vincula; desde ahí es «lo propio» de la cuenta OWNER.
  const otraDir = await como(cuentaDir.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on" })));
  assert.equal(otraDir.ok, true, `otra persona de Dirección: ${JSON.stringify(otraDir)}`);
  assert.equal(await vinculadasAlOwner(), 1);
  // Ya vinculada, la cuenta OWNER guarda su ficha con su cuenta (mismo sueldo), pero no se cambia el sueldo (G4).
  const guarda = await como(owner.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on" })));
  assert.equal(guarda.ok, true, `la ficha propia con su cuenta se guarda: ${JSON.stringify(guarda)}`);
  const sueldo = await como(owner.id, () => gestion.guardarPersona(ficha({ id: creada.id, vincular: "on", sueldoBase: "12000000" })));
  assert.equal(sueldo.ok, false, `sueldo propio: ${JSON.stringify(sueldo)}`);
  assert.equal((await duenio.proyectoPersona.findUniqueOrThrow({ where: { id: creada.id }, select: { sueldoBase: true } })).sueldoBase, SUELDO);
});
