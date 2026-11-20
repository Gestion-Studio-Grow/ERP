// GSG-MIA-266 · PROD-DISENO A (dueño, 20/11 ~20:50Z). Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales.
//  1. Producción no le manda al cliente la versión de una pieza de diseño (`enviarVersion`): la sube y queda en borrador.
//     Contraprueba: Diseño y Dirección sí la mandan.
//  2. Producción no edita «Presentación» ni «Condiciones» de la cotización (`guardarTextos`): son textos que lee el cliente.
//     Contraprueba: Comercial y Dirección sí. En los dos casos el rechazo no escribe nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const DIA = 86_400_000;

test("MIA-266 · Producción no manda el diseño al cliente ni edita los textos que lee el cliente", async (t) => {
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

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const como = async <T>(quien: "duenia" | "recepcion", fn: () => Promise<T>) =>
    ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn).catch((e: unknown) => ({ tipo: "error" as const, mensaje: (e as Error).message }));

  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 26601, clientId: a.clientes[0], nombre: "Proyecto MIA-266", servicio: "EVENTOS", etapa: "COTIZANDO", fechaEvento: new Date(Date.now() + 90 * DIA) }, select: { id: true } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción MIA-266", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id } });
  const conRol = (rol: string) => duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol } });

  // 1 · la pieza de diseño: tres borradores, uno por cada envío que se prueba.
  const e = await duenio.proyectoEntregable.create({ data: { tenantId: a.id, proyectoId: p.id, nombre: "Logo MIA-266", especificacion: "Vectorial" }, select: { id: true } });
  const borrador = (numero: number) => duenio.proyectoEntregableVersion.create({ data: { tenantId: a.id, entregableId: e.id, numero, url: "https://example.com/logo.png" }, select: { id: true } });
  const fotoDiseno = async (id: string) => ({
    version: await duenio.proyectoEntregableVersion.findUniqueOrThrow({ where: { id }, select: { estado: true, enviadaEl: true, especificacion: true } }),
    link: (await duenio.proyecto.findUniqueOrThrow({ where: { id: p.id }, select: { tokenEntregables: true } })).tokenEntregables,
    auditoria: await duenio.auditLog.count({ where: { tenantId: a.id, action: "proyecto.entregable.enviar", entityId: id } }),
  });

  const v1 = await borrador(1);
  await conRol("PRODUCCION");
  const antes = await fotoDiseno(v1.id);
  const r1 = await como("recepcion", () => acciones.enviarVersion(form({ id: v1.id })));
  assert.equal(r1.tipo, "error", `Producción · enviar la pieza: no pasa (${JSON.stringify(r1)})`);
  assert.match((r1 as { mensaje: string }).mensaje, /cliente/, "Producción · enviar la pieza: el rechazo dice por qué");
  assert.deepEqual(await fotoDiseno(v1.id), antes, "Producción · enviar la pieza: no cambia nada (versión, link ni auditoría)");

  await conRol("DISENO");
  assert.equal((await como("recepcion", () => acciones.enviarVersion(form({ id: v1.id })))).tipo, "respuesta", "Diseño · enviar la pieza");
  assert.equal((await fotoDiseno(v1.id)).version.estado, "ENVIADA", "Diseño · la versión sale");
  const v2 = await borrador(2);
  assert.equal((await como("duenia", () => acciones.enviarVersion(form({ id: v2.id })))).tipo, "respuesta", "Dirección · enviar la pieza");
  assert.equal((await fotoDiseno(v2.id)).version.estado, "ENVIADA", "Dirección · la versión sale");

  // 2 · los textos de la cotización.
  const pr = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-mia266-${p.id}-xxxxxxxxxx`, ivaPct: 21, presentacion: "Hola", condiciones: "50% de seña" }, select: { id: true } });
  const fotoTextos = () => duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: pr.id }, select: { presentacion: true, condiciones: true, ivaPct: true } });
  const textos = (presentacion: string, condiciones: string) => form({ id: pr.id, ivaPct: "21", presentacion, condiciones });
  type R = { ok: boolean; error?: string };
  const respuesta = (r: Awaited<ReturnType<typeof como>>) => {
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };

  await conRol("PRODUCCION");
  for (const [que, fd] of [["la presentación", textos("Otra presentación", "50% de seña")], ["las condiciones", textos("Hola", "Todo al contado")]] as const) {
    const antesTextos = await fotoTextos();
    const r = respuesta(await como("recepcion", () => ficha.guardarTextos(fd)));
    assert.equal(r.ok, false, `Producción · editar ${que}: no pasa (${JSON.stringify(r)})`);
    assert.match(r.error ?? "", /cliente/, `Producción · editar ${que}: el rechazo dice por qué`);
    assert.deepEqual(await fotoTextos(), antesTextos, `Producción · editar ${que}: no cambia nada`);
  }

  await conRol("COMERCIAL");
  assert.equal(respuesta(await como("recepcion", () => ficha.guardarTextos(textos("Comercial", "30 días")))).ok, true, "Comercial · editar los textos");
  assert.deepEqual(await fotoTextos(), { presentacion: "Comercial", condiciones: "30 días", ivaPct: 21 });
  assert.equal(respuesta(await como("duenia", () => ficha.guardarTextos(textos("Dirección", "Contado")))).ok, true, "Dirección · editar los textos");
  assert.deepEqual(await fotoTextos(), { presentacion: "Dirección", condiciones: "Contado", ivaPct: 21 });
});
