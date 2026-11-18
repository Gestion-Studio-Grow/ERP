// ============================================================================
// GSG-MIA-083 · anexo 1 · G4 y G4p: nadie toca lo propio en Liquidaciones, ni en borrador. Contra Postgres de verdad
// (base efímera migrada, rol app_rls sin BYPASSRLS, Server Actions con sesión).
//
// Regla que ya regía para pagar (`pagarLiquidacion`, «Nadie se paga lo propio»), extendida por orden de ORQ-007 a las
// cinco puertas: editar extras, generar, publicar, borrar y el sueldo base propio en Equipo. «Lo propio» se reconoce de
// las dos formas de pagar: por la ficha del actor (su persona) y por la cuenta vinculada a la persona de la liquidación.
//
// Personas del negocio A (montos inventados, los de la UAT): Rocío (Administración, base 2.900.000), Otra
// (Administración), Dir (Dirección) y la dueña (cuenta OWNER, sin ficha activa: su persona está inactiva pero vinculada
// a su cuenta; la reconoce sólo la cuenta).
// G4n: lo ajeno sigue como siempre (editar, publicar y pagar la liquidación de otra persona).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();
const PROPIA = /tuya/i;

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const empresa = await import("./acciones-empresa");
  const gestion = await import("./acciones-gestion");

  // Una sola vez por base: las personas y sus cuentas.
  let rocio = await duenio.proyectoPersona.findFirst({ where: { tenantId: a.id, nombre: "Rocío" }, select: { id: true, userId: true } });
  if (!rocio) {
    const cuenta = (nombre: string) => duenio.user.create({ data: { tenantId: a.id, name: nombre, email: `${nombre.toLowerCase()}@mia083.test`, passwordHash: "x", role: "RECEPTION" }, select: { id: true } });
    const [uRocio, uOtra, uDir] = [await cuenta("Rocio"), await cuenta("Otra"), await cuenta("Dir")];
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: uRocio.id, nombre: "Rocío", email: "rocio@mia083.test", rol: "ADMINISTRACION", sueldoBase: 2_900_000 } });
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: uOtra.id, nombre: "Otra", email: "otra@mia083.test", rol: "ADMINISTRACION", sueldoBase: 1_500_000 } });
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: uDir.id, nombre: "Dir", email: "dir@mia083.test", rol: "DIRECCION", sueldoBase: 5_000_000 } });
    const mailDuenia = (await duenio.user.findUniqueOrThrow({ where: { id: a.duenia.id }, select: { email: true } })).email;
    await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.duenia.id, nombre: "Dueña", email: mailDuenia, rol: "DIRECCION", sueldoBase: 4_000_000, activa: false } });
    rocio = await duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Rocío" }, select: { id: true, userId: true } });
  }
  const persona = (nombre: string) => duenio.proyectoPersona.findFirstOrThrow({ where: { tenantId: a.id, nombre }, select: { id: true, userId: true, nombre: true, email: true, rol: true, puesto: true, facturaA: true, sueldoBase: true } });
  const quien = { rocio: await persona("Rocío"), otra: await persona("Otra"), dir: await persona("Dir"), duenia: await persona("Dueña") };
  const usuario = { rocio: quien.rocio.userId!, otra: quien.otra.userId!, dir: quien.dir.userId!, duenia: a.duenia.id };

  const form = (c: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(c)) fd.set(k, v);
    return fd;
  };
  const como = async <R>(userId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: userId } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  /** Un borrador por persona en `periodo`, con su sueldo como base y total. */
  const borradores = async (periodo: string, ...personas: { id: string; sueldoBase: number }[]) => {
    const ids: Record<string, string> = {};
    for (const p of personas) {
      const l = await duenio.proyectoLiquidacion.create({ data: { tenantId: a.id, personaId: p.id, periodo, base: p.sueldoBase, total: p.sueldoBase }, select: { id: true } });
      ids[p.id] = l.id;
    }
    return ids;
  };
  const fila = (id: string) => duenio.proyectoLiquidacion.findUnique({ where: { id }, select: { base: true, extras: true, total: true, estado: true } });
  const historia = () => duenio.proyectoCambio.count({ where: { tenantId: a.id } });
  return { duenio, a, empresa, gestion, quien, usuario, form, como, borradores, fila, historia };
}

test("G4 · editar extras de la liquidación propia en borrador: se rechaza para Administración, Dirección y por la cuenta vinculada; base, extras, total e historia iguales", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario } = p;
  const ids = await p.borradores("2026-08", quien.rocio, quien.dir, quien.duenia);
  for (const [que, userId, personaId] of [
    ["Administración (Rocío, por su ficha)", usuario.rocio, quien.rocio.id],
    ["Dirección (Dir, por su ficha)", usuario.dir, quien.dir.id],
    ["la dueña (sin ficha activa, por la cuenta vinculada)", usuario.duenia, quien.duenia.id],
  ] as const) {
    const antes = await p.fila(ids[personaId]);
    const cambios = await p.historia();
    // La UAT: 2.900.000 → 10.900.000 subiendo la base a 9.900.000 y sumando un extra de 1.000.000.
    const r: { ok: boolean; error?: string } = await p.como(userId, () => p.empresa.editarExtrasLiquidacion({ id: ids[personaId], base: "9900000", manuales: [{ nombre: "Bono", monto: "1000000" }] }));
    assert.equal(r.ok, false, `${que}: ${JSON.stringify(r)}`);
    assert.match(String((r as { error?: string }).error), PROPIA, `${que}: el rechazo dice que es suya`);
    assert.deepEqual(await p.fila(ids[personaId]), antes, `${que}: base, extras y total iguales`);
    assert.equal(await p.historia(), cambios, `${que}: ningún cambio en la historia`);
  }
});

test("G4p · generar saltea la liquidación propia y lo dice; la de los demás se genera", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario, duenio, a } = p;
  const periodo = "2026-07";
  const r = await p.como(usuario.rocio, () => p.empresa.generarLiquidaciones(p.form({ periodo })));
  assert.equal(r.ok, true, JSON.stringify(r));
  const de = async (personaId: string) => duenio.proyectoLiquidacion.findFirst({ where: { tenantId: a.id, personaId, periodo }, select: { id: true, base: true, total: true } });
  assert.equal(await de(quien.rocio.id), null, "la de Rocío no se generó");
  assert.equal((await de(quien.otra.id))?.total, 1_500_000, "la de Otra sí");
  assert.equal((r as { salteada?: string | null }).salteada, "Rocío", "el resultado dice que salteó la suya");
  // Con su borrador ya armado por otra persona y el sueldo cambiado después, generar tampoco lo recalcula.
  assert.equal((await p.como(usuario.otra, () => p.empresa.generarLiquidaciones(p.form({ periodo })))).ok, true);
  const hecha = await de(quien.rocio.id);
  assert.equal(hecha?.total, 2_900_000, "Otra genera la de Rocío");
  await duenio.proyectoPersona.update({ where: { id: quien.rocio.id }, data: { sueldoBase: 9_900_000 } });
  try {
    assert.equal((await p.como(usuario.rocio, () => p.empresa.generarLiquidaciones(p.form({ periodo })))).ok, true);
    assert.equal((await de(quien.rocio.id))?.total, 2_900_000, "Rocío generando no recalcula la suya");
  } finally {
    await duenio.proyectoPersona.update({ where: { id: quien.rocio.id }, data: { sueldoBase: 2_900_000 } });
  }
});

test("G4p · publicar deja la propia en borrador y publica las demás; si sólo queda la propia, lo dice", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario } = p;
  const ids = await p.borradores("2026-06", quien.rocio, quien.otra);
  const r = await p.como(usuario.rocio, () => p.empresa.publicarBorradores(p.form({ periodo: "2026-06" })));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await p.fila(ids[quien.rocio.id]))?.estado, "BORRADOR", "la de Rocío sigue en borrador");
  assert.equal((await p.fila(ids[quien.otra.id]))?.estado, "PUBLICADA", "la de Otra se publicó");
  assert.equal((r as { salteada?: string | null }).salteada, "Rocío");
  const sola = await p.como(usuario.rocio, () => p.empresa.publicarBorradores(p.form({ periodo: "2026-06" })));
  assert.equal(sola.ok, false, JSON.stringify(sola));
  assert.match(String((sola as { error?: string }).error), PROPIA);
  assert.equal((await p.fila(ids[quien.rocio.id]))?.estado, "BORRADOR");
});

test("G4p · borrar la liquidación propia en borrador se rechaza; la fila sigue", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario } = p;
  const ids = await p.borradores("2026-05", quien.rocio);
  const r = await p.como(usuario.rocio, () => p.empresa.borrarLiquidacion(p.form({ id: ids[quien.rocio.id] })));
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(String((r as { error?: string }).error), PROPIA);
  assert.ok(await p.fila(ids[quien.rocio.id]), "la fila sigue");
});

test("G4p · el sueldo base propio no se cambia desde Equipo (Dirección por su ficha, la dueña por su cuenta); el resto de su ficha sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario, duenio } = p;
  // `vincular`: guardar la ficha sin él desvincula la cuenta (guardarPersona); con el mail de la cuenta, la deja como está.
  const datos = (x: typeof quien.dir, sueldoBase: number, puesto = x.puesto ?? "") => p.form({ id: x.id, nombre: x.nombre, email: x.email ?? "", rol: x.rol, puesto, facturaA: x.facturaA ?? "", sueldoBase: String(sueldoBase), vincular: "on" });
  for (const [que, userId, x] of [
    ["Dirección (Dir, por su ficha)", usuario.dir, quien.dir],
    ["la dueña (por la cuenta vinculada)", usuario.duenia, quien.duenia],
  ] as const) {
    const r: { ok: boolean; error?: string } = await p.como(userId, () => p.gestion.guardarPersona(datos(x, 9_900_000)));
    assert.equal(r.ok, false, `${que}: ${JSON.stringify(r)}`);
    assert.match(String((r as { error?: string }).error), PROPIA);
    assert.equal((await duenio.proyectoPersona.findUniqueOrThrow({ where: { id: x.id }, select: { sueldoBase: true } })).sueldoBase, x.sueldoBase, `${que}: el sueldo sigue`);
  }
  // Su ficha con el mismo sueldo (otro puesto) se guarda: el freno es el monto, no la ficha.
  const r = await p.como(usuario.dir, () => p.gestion.guardarPersona(datos(quien.dir, quien.dir.sueldoBase, "Socia")));
  assert.equal(r.ok, true, JSON.stringify(r));
  // El de otra persona, sí.
  const otra = await p.como(usuario.dir, () => p.gestion.guardarPersona(datos(quien.otra, 1_600_000)));
  assert.equal(otra.ok, true, JSON.stringify(otra));
  await duenio.proyectoPersona.update({ where: { id: quien.otra.id }, data: { sueldoBase: 1_500_000 } });
});

test("G4n · lo ajeno sigue igual: Otra edita, publica y paga la de Rocío; Rocío edita la de Otra; pagar la propia sigue frenado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { quien, usuario } = p;
  const ids = await p.borradores("2026-04", quien.rocio, quien.otra);
  const deRocio = ids[quien.rocio.id];
  assert.equal((await p.como(usuario.otra, () => p.empresa.editarExtrasLiquidacion({ id: deRocio, manuales: [{ nombre: "Plus", monto: "100000" }] }))).ok, true);
  assert.equal((await p.fila(deRocio))?.total, 3_000_000, "a mano: 2.900.000 + 100.000");
  assert.equal((await p.como(usuario.rocio, () => p.empresa.editarExtrasLiquidacion({ id: ids[quien.otra.id], manuales: [{ nombre: "Plus", monto: "50000" }] }))).ok, true);
  assert.equal((await p.fila(ids[quien.otra.id]))?.total, 1_550_000);
  assert.equal((await p.como(usuario.otra, () => p.empresa.publicarBorradores(p.form({ periodo: "2026-04" })))).ok, true);
  assert.equal((await p.fila(deRocio))?.estado, "PUBLICADA");
  const propia = await p.como(usuario.rocio, () => p.empresa.pagarLiquidacion(p.form({ id: deRocio, medio: "TRANSFERENCIA" })));
  assert.equal(propia.ok, false);
  assert.match(String((propia as { error?: string }).error), /Nadie se paga lo propio/);
  assert.deepEqual(await p.como(usuario.otra, () => p.empresa.pagarLiquidacion(p.form({ id: deRocio, medio: "TRANSFERENCIA" }))), { ok: true });
  assert.equal((await p.fila(deRocio))?.estado, "PAGADA");
});
