// GSG-MIA-267 · cierra PROD-DISENO A (omisiones de MIA-266). Postgres real, la app como `app_rls`, Server Actions reales.
//  1. Producción no escribe la «Nota para el cliente» del borrador de una pieza (`subirVersion`): la sube sin nota, y si
//     reemplaza un borrador conserva la nota que dejó Diseño. Con nota, el rechazo no escribe nada.
//     Contraprueba: Diseño sí la escribe.
//  2. `guardarTextos` sin los campos «presentacion» y «condiciones» conserva los que había (no los deja en "").

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const DIA = 86_400_000;
type R = { ok: boolean; error?: string };

test("MIA-267 · Producción no escribe la nota para el cliente y un guardado sin textos los conserva", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const acciones = await import("./acciones");
  const ficha = await import("./acciones-ficha");

  const como = async <T>(fn: () => Promise<T>) => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a.recepcion.id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };

  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 26701, clientId: a.clientes[0], nombre: "Proyecto MIA-267", servicio: "EVENTOS", etapa: "COTIZANDO", fechaEvento: new Date(Date.now() + 90 * DIA) }, select: { id: true } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción MIA-267", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id } });
  const conRol = (rol: string) => duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol } });

  // 1 · la nota del borrador.
  const e = await duenio.proyectoEntregable.create({ data: { tenantId: a.id, proyectoId: p.id, nombre: "Logo MIA-267" }, select: { id: true } });
  const versiones = () => duenio.proyectoEntregableVersion.findMany({ where: { entregableId: e.id }, select: { numero: true, estado: true, url: true, nota: true }, orderBy: { numero: "asc" } });
  const subir = (url: string, nota?: string) => como(() => acciones.subirVersion({ entregableId: e.id, url, ...(nota !== undefined && { nota }) }));

  await conRol("PRODUCCION");
  const r1 = await subir("https://example.com/a.png", "Le cambié el color");
  assert.equal(r1.ok, false, `Producción · subir con nota: no pasa (${JSON.stringify(r1)})`);
  assert.match(r1.error ?? "", /cliente/, "Producción · subir con nota: el rechazo dice por qué");
  assert.deepEqual(await versiones(), [], "Producción · subir con nota: no escribe nada");

  assert.equal((await subir("https://example.com/a.png")).ok, true, "Producción · subir sin nota");
  assert.deepEqual(await versiones(), [{ numero: 1, estado: "BORRADOR", url: "https://example.com/a.png", nota: "" }]);

  await conRol("DISENO");
  assert.equal((await subir("https://example.com/b.png", "Versión con el logo nuevo")).ok, true, "Diseño · escribe la nota");
  assert.deepEqual(await versiones(), [{ numero: 1, estado: "BORRADOR", url: "https://example.com/b.png", nota: "Versión con el logo nuevo" }]);

  await conRol("PRODUCCION");
  const r2 = await subir("https://example.com/c.png", "Otra nota");
  assert.equal(r2.ok, false, "Producción · cambiar la nota de Diseño: no pasa");
  assert.deepEqual(await versiones(), [{ numero: 1, estado: "BORRADOR", url: "https://example.com/b.png", nota: "Versión con el logo nuevo" }], "Producción · el rechazo no escribe nada");
  assert.equal((await subir("https://example.com/c.png", "  ")).ok, true, "Producción · reemplazar el borrador sin nota");
  assert.deepEqual(await versiones(), [{ numero: 1, estado: "BORRADOR", url: "https://example.com/c.png", nota: "Versión con el logo nuevo" }], "Producción · la nota de Diseño queda");

  // 2 · guardarTextos sin los campos de texto.
  const pr = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-mia267-${p.id}-xxxxxxxxxx`, ivaPct: 21, presentacion: "Hola", condiciones: "50% de seña" }, select: { id: true } });
  const fotoTextos = () => duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: pr.id }, select: { presentacion: true, condiciones: true, ivaPct: true } });
  const sinTextos = () => {
    const fd = new FormData();
    fd.set("id", pr.id);
    fd.set("ivaPct", "21");
    return fd;
  };
  for (const rol of ["COMERCIAL", "PRODUCCION"]) {
    await conRol(rol);
    const r = await como(() => ficha.guardarTextos(sinTextos()));
    assert.equal(r.ok, true, `${rol} · guardar sin los textos (${JSON.stringify(r)})`);
    assert.deepEqual(await fotoTextos(), { presentacion: "Hola", condiciones: "50% de seña", ivaPct: 21 }, `${rol} · los textos quedan`);
  }
});
