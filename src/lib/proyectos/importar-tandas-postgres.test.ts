// ============================================================================
// Importador de la planilla de status contra Postgres (base efímera, app como `app_rls`), observaciones de la
// certificación del PR #41:
//   · MEDIA: mientras corre un import grande, el alta manual del mismo negocio no espera al import entero (graba en
//     tandas cortas y numera con el mismo candado corto que el alta): cada alta tarda menos de ~1 s;
//   · un import cortado a mitad deja grabadas las tandas confirmadas y el reintento no duplica;
//   · BAJA: sin la fórmula por capas vigente no hay importador ni se escribe la fecha «a confirmar» (migration.sql:4);
//   · BAJA: importar exige el permiso de costos (asigna productor y comercial), igual que guardar la venta.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("importador: tandas cortas sin frenar el alta, reintento sin duplicar, fórmula vigente y permiso de costos", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  const { a, b } = base;
  const { guardarFormulaPrecio } = await import("./acciones-precio");
  const { previsualizarImportacion, confirmarImportacion } = await import("./acciones-importar");
  const { crearLead, guardarDatos } = await import("./acciones-ficha");

  const enA = { negocio: a, usuario: { id: a.duenia.id } };
  const enB = { negocio: b, usuario: { id: b.duenia.id } };
  const comercialA = { negocio: a, usuario: { id: a.recepcion.id } };
  const form = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const correr = async <R>(pedido: typeof enA, fn: () => Promise<R>): Promise<R> => {
    const r = await ejecutarAccion(pedido, fn);
    assert.equal(r.tipo, "respuesta", JSON.stringify(r));
    return (r as { valor: R }).valor;
  };
  // El interruptor de la Etapa 2 (apagado por defecto) prendido en los dos: lo que se prueba acá es la fórmula y el permiso.
  await duenio.tenant.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { modules: { push: "proyectos-precio-capas" } } });
  const planilla = (prefijo: string, n: number) =>
    ["Cliente;Proyecto;Productor;Comercial;Status;Fecha del evento", ...Array.from({ length: n }, (_, i) => `Cli ${i % 40};${prefijo} ${i + 1};;;Cotizando;a confirmar`)].join("\n");
  const previsualizar = async (pedido: typeof enA, csv: string) => correr(pedido, () => previsualizarImportacion(form({ csv })));
  const confirmar = (pedido: typeof enA, csv: string, huella: string) => correr(pedido, () => confirmarImportacion(form({ csv, huella, confirmo: "si" })));

  // ── Sin fórmula vigente: ni importador ni fecha «a confirmar» ──
  const sinFormula = /fórmula de precio por capas/;
  assert.match(JSON.stringify(await previsualizar(enA, planilla("X", 2))), sinFormula, "A todavía no prendió la fórmula");
  const pb = await duenio.proyecto.create({ data: { tenantId: b.id, numero: 1, clientId: b.clientes[0], nombre: "PB", servicio: "ARQUITECTURA" }, select: { id: true } });
  assert.deepEqual(await correr(enB, () => guardarDatos(form({ id: pb.id, nombre: "PB", moneda: "ARS", fechaEvento: "", fechaEventoTexto: "a confirmar" }))), { ok: true });
  assert.equal(await duenio.proyectoVenta.count({ where: { tenantId: b.id } }), 0, "B sin fórmula: no se escribe ProyectoVenta");
  const mia = { rentabilidadBp: "30", comisionProductorBp: "10", comisionComercialBp: "10", margenErrorBp: "5", impuestosBp: "7", topeRedondeoBp: "5", ahorroEmpresaBp: "75" };
  assert.deepEqual(await correr(enA, () => guardarFormulaPrecio(form({ ...mia, activa: "on" }))), { ok: true });
  // Con la fórmula guardada pero apagada, tampoco.
  assert.deepEqual(await correr(enB, () => guardarFormulaPrecio(form({ ...mia }))), { ok: true });
  assert.match(JSON.stringify(await previsualizar(enB, planilla("X", 2))), sinFormula);
  const csvB = planilla("X", 2);
  assert.match(JSON.stringify(await confirmar(enB, csvB, createHash("sha256").update(csvB, "utf8").digest("hex"))), sinFormula, "con la huella correcta, igual no");

  // ── Permiso de costos: Comercial edita leads pero no costos → no importa ──
  await duenio.proyectoPersona.create({ data: { tenantId: a.id, userId: a.recepcion.id, nombre: "Comercial A", rol: "COMERCIAL" } });
  const sinCostos = /permiso para editar costos/;
  assert.match(JSON.stringify(await previsualizar(comercialA, planilla("X", 2))), sinCostos);
  const previaDuenia = await previsualizar(enA, planilla("X", 2));
  assert.equal(previaDuenia.ok, true);
  assert.match(JSON.stringify(await confirmar(comercialA, planilla("X", 2), (previaDuenia as { huella: string }).huella)), sinCostos);
  assert.equal(await duenio.proyecto.count({ where: { tenantId: a.id } }), 0);

  // ── Import grande y altas manuales a la vez: cada alta espera, como mucho, una tanda ──
  const N = 600;
  const grande = planilla("Proy", N);
  const previa = await previsualizar(enA, grande);
  assert.equal(previa.ok, true, JSON.stringify(previa).slice(0, 200));
  let termino = false;
  const imp = confirmar(enA, grande, (previa as { huella: string }).huella).finally(() => {
    termino = true;
  });
  while ((await duenio.proyecto.count({ where: { tenantId: a.id } })) === 0) await new Promise((r) => setTimeout(r, 10));
  const demoras: number[] = [];
  let durante = 0;
  for (let i = 0; i < 3; i++) {
    const enCurso = !termino;
    const s = Date.now();
    const r = await correr(enA, () => crearLead(form({ nombre: `Lead ${i}`, clienteNuevo: "Cliente lead", tipoEvento: "Congreso", moneda: "ARS" })));
    demoras.push(Date.now() - s);
    assert.equal(r.ok, true, JSON.stringify(r));
    if (enCurso && !termino) durante++;
  }
  assert.deepEqual(await imp, { ok: true, creados: N, salteados: 0 });
  t.diagnostic(`altas durante el import: ${demoras.join(", ")} ms (${durante} con el import en curso)`);
  assert.ok(durante >= 1, `al menos un alta corrió con el import en curso (demoras ${demoras.join(", ")} ms)`);
  assert.ok(Math.max(...demoras) < 1000, `el alta no espera al import: ${demoras.join(", ")} ms`);
  const numeros = (await duenio.proyecto.findMany({ where: { tenantId: a.id }, select: { numero: true }, orderBy: { numero: "asc" } })).map((p) => p.numero);
  assert.deepEqual(numeros, Array.from({ length: N + 3 }, (_, i) => i + 1), "correlativos, sin saltos ni choques");
  assert.equal(await duenio.proyectoVenta.count({ where: { tenantId: a.id } }), N);
  assert.equal(await duenio.proyectoPresupuesto.count({ where: { tenantId: a.id, nota: "Versión inicial (importada)" } }), N);
  assert.deepEqual(await confirmar(enA, grande, (previa as { huella: string }).huella), { ok: true, creados: 0, salteados: N }, "confirmar de nuevo no duplica");

  // ── Corte a mitad: las tandas confirmadas quedan; el reintento completa sin duplicar ──
  const M = 120;
  const cortada = planilla("Corte", M);
  const previaCorte = await previsualizar(enA, cortada);
  assert.equal(previaCorte.ok, true);
  await duenio.$executeRawUnsafe(`CREATE FUNCTION corte_adv() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.nombre = 'Corte 70' THEN RAISE EXCEPTION 'corte simulado'; END IF; RETURN NEW; END $$`);
  await duenio.$executeRawUnsafe(`CREATE TRIGGER corte_adv BEFORE INSERT ON "Proyecto" FOR EACH ROW EXECUTE FUNCTION corte_adv()`);
  const r1 = await ejecutarAccion(enA, () => confirmarImportacion(form({ csv: cortada, huella: (previaCorte as { huella: string }).huella, confirmo: "si" }))).catch((e: unknown) => ({ tipo: "excepcion", e }));
  assert.ok(r1.tipo === "excepcion" || (r1 as { valor?: { ok: boolean } }).valor?.ok === false, "la tanda con la fila 70 se cae");
  const contar = () => duenio.proyecto.count({ where: { tenantId: a.id, nombre: { startsWith: "Corte " } } });
  assert.equal(await contar(), 50, "quedó grabada la primera tanda entera, nada de la segunda");
  await duenio.$executeRawUnsafe(`DROP TRIGGER corte_adv ON "Proyecto"`);
  assert.deepEqual(await confirmar(enA, cortada, (previaCorte as { huella: string }).huella), { ok: true, creados: M - 50, salteados: 50 });
  assert.equal(await contar(), M, "el reintento completa sin duplicar");
  const nombres = (await duenio.proyecto.findMany({ where: { tenantId: a.id, nombre: { startsWith: "Corte " } }, select: { nombre: true } })).map((p) => p.nombre);
  assert.equal(new Set(nombres).size, M);
  assert.equal(await duenio.proyecto.count({ where: { tenantId: b.id } }), 1, "B no recibió nada");
});
