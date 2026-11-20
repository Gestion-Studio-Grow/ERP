// ============================================================================
// GSG-MIA-257 · los lotes que escriben datos del negocio van juntos o no van (Postgres de verdad: base efímera migrada, rol
// app_rls sin BYPASSRLS, RLS prendido).
//
// Hallazgo (informe MIA-254, punto 3): `prisma.$transaction([...])` con el cliente global. Con RLS, cada operación del lote se
// re-despacha en SU PROPIA transacción (src/lib/rls.ts:136), así que el lote deja de ser atómico: si la segunda escritura
// falla, la primera queda. Acá la segunda se hace fallar con un disparador de la base efímera:
//   · registrarRespuestaExterna: el mensaje «respondió por …» queda aunque la consulta no se actualice (sigue «sin atender»).
//   · eliminarImagenDelProyecto: la imagen se borra aunque la ficha de la idea la siga apuntando.
// (analizarConsulta, acciones-consultas.ts:64, tiene el mismo lote de mensaje + consulta; se corrige igual. No se prueba
// acá porque pasa por la IA.)
//
// Sin Postgres local se saltea y lo dice; en CI, falla.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("MIA-257 · si falla la segunda escritura del lote, la primera no queda (respuesta externa e imagen del proyecto)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a } = base;
  const t0 = await duenio.tenant.findUniqueOrThrow({ where: { id: a.id }, select: { modules: true } });
  await duenio.tenant.update({ where: { id: a.id }, data: { modules: [...new Set([...t0.modules, "proyectos"])] } });
  type Tx = Parameters<Parameters<typeof duenio.$transaction>[0]>[0];
  const enA = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> =>
    duenio.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${a.id}, true)`;
      return fn(tx);
    });
  const comoDuenia = (fn: () => Promise<unknown>) => ejecutarAccion({ negocio: a, usuario: { id: a.duenia.id } }, fn).then((r) => (r.tipo === "respuesta" ? (r as { valor: unknown }).valor : r)).catch((e: unknown) => ({ tipo: "lanzó", error: String(e) }));
  const fallaAlActualizar = async (tabla: string, prender: boolean) => {
    await duenio.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION mia257_falla() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'mia257: falla la segunda escritura'; END $$`);
    await duenio.$executeRawUnsafe(prender ? `CREATE TRIGGER mia257_falla BEFORE UPDATE ON "${tabla}" FOR EACH ROW EXECUTE FUNCTION mia257_falla()` : `DROP TRIGGER mia257_falla ON "${tabla}"`);
  };

  // ── registrarRespuestaExterna (acciones-consultas.ts:158): mensaje + consulta ──
  const { registrarRespuestaExterna } = await import("./acciones-consultas");
  const consulta = await enA((tx) => tx.consulta.create({ data: { tenantId: a.id, canal: "WEB", nombre: "Cliente MIA-257" }, select: { id: true, estado: true } }));
  const mensajes = () => enA((tx) => tx.consultaMensaje.count({ where: { consultaId: consulta.id } }));
  await fallaAlActualizar("Consulta", true);
  const r1 = await comoDuenia(() => registrarRespuestaExterna({ id: consulta.id, via: "WHATSAPP" }));
  assert.notDeepEqual(r1, { ok: true }, "con la consulta sin actualizar, no puede responder que salió");
  assert.equal(await mensajes(), 0, "falló la consulta: el mensaje «respondió por WhatsApp» no queda suelto");
  await fallaAlActualizar("Consulta", false);
  assert.deepEqual(await comoDuenia(() => registrarRespuestaExterna({ id: consulta.id, via: "WHATSAPP" })), { ok: true });
  assert.equal(await mensajes(), 1);
  assert.equal((await enA((tx) => tx.consulta.findUniqueOrThrow({ where: { id: consulta.id }, select: { estado: true } }))).estado, "EN_CALIFICACION");

  // ── eliminarImagenDelProyecto (acciones-diseno.ts:311): archivo + ficha de la idea ──
  const { eliminarImagenDelProyecto } = await import("./acciones-diseno");
  const p = await duenio.proyecto.create({ data: { tenantId: a.id, numero: 25701, clientId: a.clientes[0], nombre: "MIA-257", servicio: "EVENTOS", etapa: "PRESUPUESTO" }, select: { id: true } });
  const f = await enA((tx) => tx.proyectoArchivo.create({ data: { tenantId: a.id, proyectoId: p.id, nombre: "render.png", datos: "data:image/png;base64,AAAA" }, select: { id: true } }));
  const ref = `archivo:${f.id}`;
  await enA((tx) => tx.proyectoIdea.create({ data: { tenantId: a.id, proyectoId: p.id, imagenes: [ref] } }));
  const archivo = () => enA((tx) => tx.proyectoArchivo.count({ where: { id: f.id } }));
  await fallaAlActualizar("ProyectoIdea", true);
  const r2 = await comoDuenia(() => eliminarImagenDelProyecto({ proyectoId: p.id, ref }));
  assert.notDeepEqual(r2, { ok: true, quitadaDeLaFicha: true });
  assert.equal(await archivo(), 1, "falló la ficha: la imagen no se borra (la ficha no queda apuntando a nada)");
  await fallaAlActualizar("ProyectoIdea", false);
  assert.deepEqual(await comoDuenia(() => eliminarImagenDelProyecto({ proyectoId: p.id, ref })), { ok: true, quitadaDeLaFicha: true });
  assert.equal(await archivo(), 0);
  assert.deepEqual((await enA((tx) => tx.proyectoIdea.findUniqueOrThrow({ where: { proyectoId: p.id }, select: { imagenes: true } }))).imagenes, []);
});
