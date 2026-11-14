// IMPORTADOR DE PLANILLAS (Etapa 2 · T3) — las Server Actions REALES contra una base migrada (Postgres efímero en :5433).
//
// Confirmar dos veces da los mismos conteos; tres confirmaciones a la vez cargan una sola vez; el negocio B no ve lo
// de A (RLS con app_rls) y el mismo archivo en B crea lo suyo; con el interruptor apagado o sin Dirección no se carga.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, ROL_APP, type NegocioDePrueba } from "@/test/base-efimera";

const TITULOS = ["Cliente", "Proyecto", "Mes", "Año", "Etapa", "Status", "Fecha", "Drive", "Comentario #1", "Fecha #1"];

function libro(pestanas: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(pestanas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([TITULOS, ...filas]), nombre);
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], "planilla.xlsx");
}

const PLANILLA = {
  General: [
    ["ACME S.A.", "Lanzamiento", "Marzo", 2026, "En curso", "Cotizando", "15/03/2026", "https://drive.google.com/a", "Pidió render", "02/03/2026"],
    ["Beta", "Gala", 4, 2026, "Cancelado", "", "a definir", "", "Canceló", "10/04/2026"],
  ],
  Julieta: [
    ["Acme", "Lanzamiento", "Marzo", 2026, "En curso", "Cotizando", "15/03/2026", "https://drive.google.com/a", "Pidió render", "02/03/2026"],
    ["Gamma", "Feria", "Diciembre", 2026, "Aprobado", "", "4 al 6 de diciembre", "", "", ""],
  ],
};

test("importador: idempotente, una sola carga con confirmaciones a la vez, aislado por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { previsualizarImportacion, confirmarImportacion } = await import("./acciones-importador");

  const form = (f: File) => {
    const fd = new FormData();
    fd.set("archivo", f);
    return fd;
  };
  const como = async <R>(n: NegocioDePrueba, usuarioId: string, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion({ negocio: n, usuario: { id: usuarioId } }, fn);
    assert.equal(r.tipo, "respuesta");
    return (r as { valor: R }).valor;
  };
  const previa = async (n: NegocioDePrueba, f: File) => {
    const r = await como(n, n.duenia.id, () => previsualizarImportacion(form(f)));
    assert.ok(r.ok, r.ok ? "" : r.error);
    return r.ok ? r.vista : (null as never);
  };
  const confirmar = (n: NegocioDePrueba, f: File, huella: string) => como(n, n.duenia.id, () => confirmarImportacion(form(f), huella));
  const conteos = async (tenantId: string) => ({
    proyectos: await duenio.proyecto.count({ where: { tenantId } }),
    clientes: await duenio.client.count({ where: { tenantId } }),
    mensajes: await duenio.proyectoMensaje.count({ where: { tenantId } }),
    marcas: await duenio.proyectoCambio.count({ where: { tenantId, entidad: "Importacion" } }),
    presupuestos: await duenio.proyectoPresupuesto.count({ where: { tenantId } }),
  });

  const archivo = libro(PLANILLA);

  // Con el interruptor apagado no se lee nada.
  const apagado = await como(a, a.duenia.id, () => previsualizarImportacion(form(archivo)));
  assert.equal(apagado.ok, false);
  await duenio.tenant.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { modules: { push: "proyectos-importador" } } });

  // Sin Dirección tampoco (Recepción sin ficha).
  const sinDireccion = await como(a, a.recepcion.id, () => previsualizarImportacion(form(archivo)));
  assert.deepEqual(sinDireccion, { ok: false, error: "Sólo Dirección puede importar planillas." });

  const antes = await conteos(a.id);
  const vista = await previa(a, archivo);
  assert.deepEqual(vista.conteo, { seCargan: 3, revisar: 1, repetidas: 1, yaEnBase: 0, noSeCargan: 0, clientesNuevos: 3 });
  assert.deepEqual(await conteos(a.id), antes, "la vista previa no escribe");

  // Confirmar dos veces da los mismos conteos.
  assert.deepEqual(await confirmar(a, archivo, vista.huella), { ok: true, cargados: 3, clientesNuevos: 3, yaEstaban: 0 });
  const tras1 = await conteos(a.id);
  assert.deepEqual(tras1, { proyectos: antes.proyectos + 3, clientes: antes.clientes + 3, mensajes: antes.mensajes + 5, marcas: 3, presupuestos: antes.presupuestos + 3 });
  const segunda = await confirmar(a, archivo, vista.huella);
  assert.equal(segunda.ok, true);
  assert.equal(segunda.ok && segunda.cargados, 0);
  assert.deepEqual(await conteos(a.id), tras1, "confirmar de nuevo no duplica nada");
  assert.equal((await previa(a, archivo)).conteo.yaEnBase, 3, "la fila de General que también está en Julieta sigue como repetida");

  // A1/A2 (vuelta 3): la misma planilla con Lanzamiento también en septiembre, y el de marzo renombrado en el ERP:
  // marzo no se duplica (lo protege su marca, sin mes) y septiembre no se carga: se muestra para cargarlo a mano.
  await duenio.proyecto.updateMany({ where: { tenantId: a.id, nombre: "Lanzamiento" }, data: { nombre: "Lanzamiento (marzo)" } });
  const conSeptiembre = libro({ ...PLANILLA, Julieta: [...PLANILLA.Julieta, ["Acme", "Lanzamiento", "Septiembre", 2026, "En curso", "Cotizando", "", "", "", ""]] });
  assert.deepEqual((await previa(a, conSeptiembre)).conteo, { seCargan: 0, revisar: 0, repetidas: 1, yaEnBase: 3, noSeCargan: 1, clientesNuevos: 0 });
  await duenio.proyecto.updateMany({ where: { tenantId: a.id, nombre: "Lanzamiento (marzo)" }, data: { nombre: "Lanzamiento" } });

  // Lo cargado: etapa, fechas, perdido, Drive, mensajes del importador.
  const lanz = await duenio.proyecto.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Lanzamiento" }, include: { mensajes: { orderBy: { createdAt: "asc" } } } });
  assert.equal(lanz.etapa, "PRESUPUESTO");
  assert.equal(lanz.carpetaUrl, "https://drive.google.com/a");
  assert.equal(lanz.fechaEvento?.toISOString(), "2026-03-15T15:00:00.000Z");
  assert.equal(lanz.createdAt.toISOString(), "2026-03-01T15:00:00.000Z");
  assert.equal(lanz.mensajes.length, 2);
  assert.match(lanz.mensajes[0].texto, /pestaña «Julieta»/);
  assert.equal(lanz.mensajes[1].texto, "Pidió render");
  const gala = await duenio.proyecto.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Gala" } });
  assert.equal(gala.motivoPerdida, "El cliente canceló el evento — importado");
  assert.equal(gala.perdidoEl?.toISOString(), "2026-04-10T15:00:00.000Z");
  const feria = await duenio.proyecto.findFirstOrThrow({ where: { tenantId: a.id, nombre: "Feria" } });
  assert.deepEqual([feria.etapa, feria.fechaFin?.toISOString()], ["APROBADO", "2026-12-06T15:00:00.000Z"]);
  assert.equal(await duenio.proyectoChecklist.count({ where: { proyectoId: { in: [lanz.id, gala.id, feria.id] } } }), 0);
  assert.equal(await duenio.proyectoCuota.count({ where: { proyectoId: { in: [lanz.id, gala.id, feria.id] } } }), 0);

  // Carrera: tres confirmaciones a la vez de un archivo nuevo cargan una sola vez.
  const otro = libro({ Pedro: [["Delta", "Congreso", "Mayo", 2026, "En curso", "Presentado", "", "", "", ""], ["Épsilon", "Expo", "Junio", 2026, "Finalizado", "", "", "", "", ""]] });
  const vistaOtro = await previa(a, otro);
  assert.equal(vistaOtro.conteo.seCargan, 2);
  const carrera = await Promise.all([1, 2, 3].map(() => confirmar(a, otro, vistaOtro.huella)));
  assert.ok(carrera.every((r) => r.ok), JSON.stringify(carrera));
  assert.deepEqual(carrera.map((r) => (r.ok ? r.cargados : -1)).sort(), [0, 0, 2]);
  const tras2 = await conteos(a.id);
  assert.equal(tras2.proyectos, tras1.proyectos + 2);
  assert.equal(tras2.marcas, 5);
  const numeros = (await duenio.proyecto.findMany({ where: { tenantId: a.id }, select: { numero: true } })).map((p) => p.numero);
  assert.equal(new Set(numeros).size, numeros.length);

  // Otro negocio: el mismo archivo crea lo suyo, y nada de A se ve desde B.
  const antesB = await conteos(b.id);
  const vistaB = await previa(b, archivo);
  assert.equal(vistaB.conteo.seCargan, 3, "las claves de A no cuentan en B");
  assert.equal((await confirmar(b, archivo, vistaB.huella)).ok, true);
  assert.equal((await conteos(b.id)).proyectos, antesB.proyectos + 3);
  assert.equal((await conteos(a.id)).proyectos, tras2.proyectos);

  // RLS con el rol de la app: cada negocio ve sólo lo suyo.
  const pg = (await import("pg")).default;
  const verComo = async (tenantId: string, tabla: string, donde = "") => {
    const c = new pg.Client({ connectionString: base.urlApp });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${ROL_APP}`);
      await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const r = await c.query<{ n: string; ajenos: string }>(`SELECT count(*) AS n, count(*) FILTER (WHERE "tenantId" <> $1) AS ajenos FROM "${tabla}" ${donde}`, [tenantId]);
      await c.query("ROLLBACK");
      return { n: Number(r.rows[0].n), ajenos: Number(r.rows[0].ajenos) };
    } finally {
      await c.end();
    }
  };
  assert.deepEqual(await verComo(a.id, "Proyecto"), { n: tras2.proyectos, ajenos: 0 });
  assert.deepEqual(await verComo(b.id, "Proyecto"), { n: antesB.proyectos + 3, ajenos: 0 });
  assert.deepEqual(await verComo(b.id, "ProyectoCambio", `WHERE entidad = 'Importacion'`), { n: 3, ajenos: 0 });
  assert.deepEqual(await verComo(b.id, "ProyectoMensaje"), { n: antesB.mensajes + 5, ajenos: 0 });
});
