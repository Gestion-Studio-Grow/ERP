// GSG-MIA-256 · decisión del dueño (20/11 17:36Z). Postgres real, la app como `app_rls` (sin BYPASSRLS), Server Actions reales.
//  1. Producción no manda la versión al cliente, no registra su respuesta y no cambia el IVA (cotización y adicional): lo
//     hacen quienes ven la venta. Rechazo con «venta» y la fila igual. Contraprueba: Comercial (y Dirección) sí.
//  3. El plus de cada integrante del equipo: Comercial no lo ve (ficha ni historial) ni lo escribe; Dirección y
//     Administración sí lo ven.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { RUBROS } from "./gestion-core";

const DIA = 86_400_000;

test("MIA-256 · Producción sin acciones de venta y el plus del equipo sólo para Dirección y Administración", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  const ficha = await import("./acciones-ficha");
  const pres = await import("./acciones-presupuesto");
  const { actorActual } = await import("./gestion.server");
  const { cabeceraFicha, datosHistorial, vistaDe } = await import("./ficha.server");

  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  type R = { ok: boolean; error?: string };
  const como = async <T = R>(quien: "duenia" | "recepcion", fn: () => Promise<T>): Promise<T> => {
    const r = await ejecutarAccion({ negocio: a, usuario: { id: a[quien].id } }, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: T }).valor;
  };

  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 25601, clientId: a.clientes[0], nombre: "Proyecto MIA-256", servicio: "EVENTOS", etapa: "COTIZANDO", fechaEvento: new Date(Date.now() + 90 * DIA) }, select: { id: true } });
  const pr = await duenio.proyectoPresupuesto.create({ data: { tenantId: a.id, proyectoId: p.id, version: 1, estado: "BORRADOR", token: `tok-mia256-${p.id}-xxxxxxxxxx`, ivaPct: 21 }, select: { id: true } });
  await duenio.proyectoItem.create({ data: { tenantId: a.id, presupuestoId: pr.id, rubro: RUBROS[0], descripcion: "Pantalla", cantidad: 1, costo: 100, precio: 200, posicion: 0 } });
  const persona = await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Recepción MIA-256", rol: "PRODUCCION" }, select: { id: true } });
  await duenio.proyectoEquipo.create({ data: { tenantId: a.id, proyectoId: p.id, personaId: persona.id } });
  const conRol = (rol: string) => duenio.proyectoPersona.update({ where: { id: persona.id }, data: { rol } });
  const version = () => duenio.proyectoPresupuesto.findUniqueOrThrow({ where: { id: pr.id }, select: { estado: true, ivaPct: true, respondidoPor: true } });
  const aprobarPorDentro = () => duenio.proyectoPresupuesto.update({ where: { id: pr.id }, data: { aprobadoInternoEl: new Date(), aprobadoInternoPor: "Dirección" } });
  const rechaza = async (que: string, fn: () => Promise<R>, foto: () => Promise<unknown>) => {
    const antes = await foto();
    const r = await como("recepcion", fn);
    assert.equal(r.ok, false, `Producción · ${que}: no pasa (${JSON.stringify(r)})`);
    assert.match(r.error ?? "", /venta/, `Producción · ${que}: el rechazo dice por qué`);
    assert.deepEqual(await foto(), antes, `Producción · ${que}: no cambia nada`);
  };
  const pasa = async (que: string, fn: () => Promise<R>) => assert.equal((await como("recepcion", fn)).ok, true, `Comercial · ${que}`);

  // 1 · la versión: IVA, envío y respuesta del cliente.
  await aprobarPorDentro();
  await conRol("PRODUCCION");
  await rechaza("cambiar el IVA", () => ficha.guardarTextos(form({ id: pr.id, ivaPct: "10.5" })), version);
  await rechaza("enviar la versión", () => ficha.enviarCotizacion(form({ id: pr.id })), version);
  await conRol("COMERCIAL");
  await pasa("cambiar el IVA", () => ficha.guardarTextos(form({ id: pr.id, ivaPct: "10.5" })));
  assert.equal((await version()).ivaPct, 10.5);
  await aprobarPorDentro();
  await pasa("enviar la versión", () => ficha.enviarCotizacion(form({ id: pr.id })));
  await conRol("PRODUCCION");
  await rechaza("registrar la respuesta", () => ficha.registrarRespuesta(form({ id: pr.id, respuesta: "APROBADO", nombre: "Cliente" })), version);
  await conRol("COMERCIAL");
  await pasa("registrar la respuesta", () => ficha.registrarRespuesta(form({ id: pr.id, respuesta: "APROBADO", nombre: "Cliente" })));
  assert.equal((await version()).estado, "APROBADO");

  // 1 · el adicional: envío y respuesta.
  assert.equal((await como("duenia", () => pres.crearAdicional(form({ proyectoId: p.id, nombre: "Pantalla extra" })))).ok, true);
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const ad = await enA((tx) => tx.proyectoAdicional.findFirstOrThrow({ where: { tenantId: a.id, proyectoId: p.id }, select: { id: true } }));
  assert.equal((await como("duenia", () => pres.agregarLineaAdicional(form({ adicionalId: ad.id, sector: "Producción", categoria: RUBROS[0], cantidad: "1", detalle: "LED", precio: "500" })))).ok, true);
  assert.equal((await como("duenia", () => pres.aprobarAdicionalInterno(form({ adicionalId: ad.id })))).ok, true);
  const adicional = () => enA((tx) => tx.proyectoAdicional.findUniqueOrThrow({ where: { id: ad.id }, select: { estado: true } }));
  await conRol("PRODUCCION");
  await rechaza("enviar el adicional", () => pres.enviarAdicional(form({ adicionalId: ad.id })), adicional);
  await conRol("COMERCIAL");
  await pasa("enviar el adicional", () => pres.enviarAdicional(form({ adicionalId: ad.id })));
  await conRol("PRODUCCION");
  await rechaza("responder el adicional", () => pres.responderAdicional(form({ adicionalId: ad.id, respuesta: "APROBADO", nombre: "Cliente" })), adicional);
  await conRol("COMERCIAL");
  await pasa("responder el adicional", () => pres.responderAdicional(form({ adicionalId: ad.id, respuesta: "APROBADO", nombre: "Cliente" })));

  // 3 · el plus: Dirección lo carga; Comercial no lo ve ni lo pisa; Administración y Dirección sí lo ven.
  const operario = await duenio.proyectoPersona.create({ data: { tenantId: a.id, nombre: "Operario MIA-256", rol: "PRODUCCION_CAMPO" }, select: { id: true } });
  assert.equal((await como("duenia", () => ficha.asignarEquipo(form({ proyectoId: p.id, personaId: operario.id, plus: "5000" })))).ok, true);
  const plusQueVe = (quien: "duenia" | "recepcion") =>
    como(quien, async () => {
      const ac = await actorActual();
      const cab = await cabeceraFicha(ac, p.id);
      const hist = await datosHistorial(ac, p.id, vistaDe(ac));
      return { plus: cab?.proyecto.equipo.find((e) => e.personaId === operario.id)?.plus, historial: hist.filter((c) => c.campo.startsWith("Plus")).length };
    });
  await conRol("COMERCIAL");
  assert.deepEqual(await plusQueVe("recepcion"), { plus: 0, historial: 0 }, "Comercial no ve el plus (ficha ni historial)");
  await como("recepcion", () => ficha.asignarEquipo(form({ proyectoId: p.id, personaId: operario.id, plus: "1" })));
  assert.equal((await duenio.proyectoEquipo.findFirstOrThrow({ where: { proyectoId: p.id, personaId: operario.id }, select: { plus: true } })).plus, 5000, "Comercial no pisa el plus");
  await conRol("ADMINISTRACION");
  assert.deepEqual(await plusQueVe("recepcion"), { plus: 5000, historial: 1 }, "Administración ve el plus");
  assert.deepEqual(await plusQueVe("duenia"), { plus: 5000, historial: 1 }, "Dirección ve el plus");
});
