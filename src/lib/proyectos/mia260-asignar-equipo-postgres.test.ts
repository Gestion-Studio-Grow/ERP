// GSG-MIA-260 · «Asignar» en «Equipo del evento» (ficha del proyecto, acciones-ficha.ts:467). Postgres real, la app como
// `app_rls` (sin BYPASSRLS), Server Actions reales.
//  1. Dirección suma a la usuaria Comercial al proyecto #4 → la fila queda en la base, con su función.
//  2. Puestos sin permiso de editar proyectos (Administración y Productor de campo: «pipeline» en Ver) → rechazados, sin escribir.
//  3. El negocio B no asigna en un proyecto del A (ni con una persona suya ni con una del A).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type NegocioDePrueba } from "@/test/base-efimera";

const DIA = 86_400_000;

test("MIA-260 · «Asignar» del equipo: Dirección escribe; Administración, Productor de campo y otro negocio no", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  for (const n of [a, b]) {
    const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: n.id }, select: { modules: true } });
    await duenio.tenant.update({ where: { id: n.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  }
  const ficha = await import("./acciones-ficha");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  const como = async (negocio: NegocioDePrueba, quien: "duenia" | "recepcion", fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio, usuario: { id: negocio[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };

  const p4 = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 4, clientId: a.clientes[0], nombre: "Proyecto #4 MIA-260", servicio: "EVENTOS", etapa: "COTIZANDO", fechaEvento: new Date(Date.now() + 60 * DIA) }, select: { id: true } });
  // La usuaria Comercial: la recepcionista del negocio A con ficha de Productor comercial (como Lucía Paz en el seed de MIA).
  const comercial = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Comercial MIA-260", rol: "COMERCIAL" }, select: { id: true } });
  const operario = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Operario MIA-260", rol: "PRODUCCION_CAMPO" }, select: { id: true } });
  const deB = await duenio.proyectoPersona.create({ data: { tenantId: b.id, userId: b.duenia.id, nombre: "Persona de B", rol: "DIRECCION" }, select: { id: true } });
  const equipo = () => duenio.proyectoEquipo.findMany({ where: { proyectoId: p4.id }, select: { personaId: true, funcion: true, plus: true, tenantId: true }, orderBy: { personaId: "asc" } });

  // 1 · Dirección (la dueña, sin ficha) asigna a la Comercial al #4: queda en la base.
  const ok = await como(a, "duenia", () => ficha.asignarEquipo(form({ proyectoId: p4.id, personaId: comercial.id, funcion: "" })));
  assert.deepEqual(ok, { ok: true }, "Dirección asigna");
  assert.deepEqual(await equipo(), [{ personaId: comercial.id, funcion: "", plus: 0, tenantId: a.id }], "la fila quedó en la base del negocio A");

  // 2 · Sin permiso de editar proyectos: rechazado y el equipo igual. La recepcionista pasa por cada puesto.
  for (const rol of ["ADMINISTRACION", "PRODUCCION_CAMPO", "DISENO"]) {
    await duenio.proyectoPersona.update({ where: { id: comercial.id }, data: { rol } });
    const antes = await equipo();
    const r = await como(a, "recepcion", () => ficha.asignarEquipo(form({ proyectoId: p4.id, personaId: operario.id, funcion: "", plus: "999" })));
    assert.equal(r.ok, false, `${rol} no asigna (${JSON.stringify(r)})`);
    assert.ok(r.error, `${rol}: el rechazo dice por qué`);
    assert.deepEqual(await equipo(), antes, `${rol}: no escribe nada`);
  }

  // 3 · El negocio B no toca el proyecto del A: ni con su persona ni con la del A.
  for (const personaId of [deB.id, operario.id]) {
    const antes = await equipo();
    const r = await como(b, "duenia", () => ficha.asignarEquipo(form({ proyectoId: p4.id, personaId, funcion: "" })));
    assert.equal(r.ok, false, `B no asigna en el #4 del A (${JSON.stringify(r)})`);
    assert.deepEqual(await equipo(), antes, "B no escribe en el equipo del A");
  }
});
