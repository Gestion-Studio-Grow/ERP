// ============================================================================
// PEDIDOS DE ALTA A ESCALA — el borde que marcó el refutador (26/09), contra Postgres
// ============================================================================
//
// La bandeja de Soporte traía los 500 pedidos MÁS VIEJOS de la plataforma (abiertos y cerrados) y
// recién después filtraba; el estudio, sus 200 más viejos. Del pedido 501 (o 201) en adelante nada
// aparecía, ni los pedidos nuevos ni sus descartes con motivo, sin ningún aviso. Con el código viejo
// este mismo escenario da las tres listas vacías (.qa/contador-2609/vuelta3-refutador/pedidos-borde-ANTES.txt).
//
// Se prueba: el pedido 501 aparece en la bandeja y en el panel del estudio, con su descarte; la
// bandeja pagina por clave (sin saltos ni repetidos, aunque un pedido se cierre entre páginas) y
// cuenta el total; el panel muestra hasta ALTAS_A_LA_VISTA y dice cuántos hay; aislamiento: el
// estudio B no ve nada de A, tampoco pidiendo A con la sesión de B (RLS sobre el SQL crudo).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const DIA = 24 * 60 * 60 * 1000;
const pedido = (nombre: string, cuit: string) => ({ nombre, cuit, email: "cliente@ejemplo.test", puntoVenta: 3, condicionIva: "MONOTRIBUTO", tamanio: "chico" });
const MOTIVO = "Ese CUIT es de otro estudio.";

test("pedidos de alta: pasado cualquier tope, nada desaparece en silencio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const reglas = await import("@/lib/cartera-alta-reglas");
  const conf = await import("@/app/operador/(console)/solicitudes/configurador.server");
  const panel = await import("@/app/contador/altas-en-curso.server");
  base.alBorrar(() => operatorPrisma.$disconnect());

  const ahora = Date.now();
  const fila = (id: string, action: string, createdAt: number, changes: object, entityId = id, tenantId = base.a.id) => ({
    id, tenantId, actor: "qa", action, entity: reglas.ENTIDAD_SOLICITUD, entityId, changes, createdAt: new Date(createdAt),
  });
  const cerrar = (id: string, tenantId = base.a.id) =>
    fila(`cierre-${id}`, reglas.ACCION_SOLICITUD_CONFIGURADA, ahora - DIA / 2, {}, id, tenantId);

  // 500 pedidos viejos de A, todos ya configurados; después, el 501 abierto y el 502 descartado.
  const viejos = Array.from({ length: 500 }, (_, i) =>
    fila(`viejo-${String(i).padStart(3, "0")}`, reglas.ACCION_SOLICITUD_ALTA, ahora - 20 * DIA + i * 1000, pedido(`Viejo ${i}`, "20111111112")),
  );
  await operatorPrisma.auditLog.createMany({ data: [...viejos, ...viejos.map((v) => cerrar(v.id))] });
  await operatorPrisma.auditLog.createMany({
    data: [
      fila("abierto-501", reglas.ACCION_SOLICITUD_ALTA, ahora - DIA, pedido("Kiosco 501", "20222222223")),
      fila("descartado-502", reglas.ACCION_SOLICITUD_ALTA, ahora - DIA + 1000, pedido("Ferretería 502", "20333333334")),
      fila("descarte-502", reglas.ACCION_SOLICITUD_DESCARTADA, ahora - 60 * 60 * 1000, { motivo: MOTIVO }, "descartado-502"),
    ],
  });

  await t.test("el pedido 501 está en la bandeja y en el panel del estudio, y el 502 con su motivo", async () => {
    const bandeja = await conf.listarSolicitudesPendientes(operatorPrisma);
    assert.deepEqual({ ids: bandeja.pedidos.map((s) => s.id), total: bandeja.total, siguiente: bandeja.siguiente }, { ids: ["abierto-501"], total: 1, siguiente: null });
    const deA = await panel.pedidosDeAltaDelEstudio(base.a.id);
    assert.deepEqual(deA.enCurso.map((a) => a.id), ["abierto-501"]);
    assert.equal(deA.enCursoTotal, 1);
    assert.deepEqual(deA.descartadas.map((d) => [d.id, d.motivo]), [["descartado-502", MOTIVO]]);
    assert.equal(deA.descartadasTotal, 1);
  });

  // 120 pedidos abiertos más, de A y de B intercalados.
  const nuevos = Array.from({ length: 120 }, (_, i) =>
    fila(`nuevo-${String(i).padStart(3, "0")}`, reglas.ACCION_SOLICITUD_ALTA, ahora - DIA / 4 + i * 1000, pedido(`Nuevo ${i}`, "20444444445"), undefined, i % 2 ? base.b.id : base.a.id),
  );
  await operatorPrisma.auditLog.createMany({ data: nuevos });
  const esperados = ["abierto-501", ...nuevos.map((n) => n.id)];
  const deA = (id: string) => id === "abierto-501" || nuevos.find((n) => n.id === id)?.tenantId === base.a.id;

  await t.test("el panel del estudio muestra los 50 más viejos y cuenta todos; B sólo ve lo suyo", async () => {
    const deEstudioA = await panel.pedidosDeAltaDelEstudio(base.a.id);
    assert.equal(deEstudioA.enCursoTotal, 61);
    assert.deepEqual(deEstudioA.enCurso.map((a) => a.id), esperados.filter(deA).slice(0, panel.ALTAS_A_LA_VISTA), "los más viejos primero, hasta el tope");
    const deEstudioB = await panel.pedidosDeAltaDelEstudio(base.b.id);
    assert.equal(deEstudioB.enCursoTotal, 60);
    assert.ok(deEstudioB.enCurso.every((a) => !deA(a.id)), "ni un pedido de A");
    assert.deepEqual([deEstudioB.descartadas, deEstudioB.descartadasTotal], [[], 0]);
    // RLS: pedir los de A con la sesión de B no trae nada (ni el SQL crudo de los abiertos).
    const cruzado = await tenantTransaction((tx) => panel.leerPedidosDeAltaDelEstudio(tx, base.a.id, new Date()), { tenantId: base.b.id });
    assert.deepEqual(cruzado, { enCurso: [], enCursoTotal: 0, descartadas: [], descartadasTotal: 0 });
  });

  await t.test("la bandeja pagina de a 50 por clave: sin saltos ni repetidos aunque un pedido se cierre entre páginas", async () => {
    const p1 = await conf.listarSolicitudesPendientes(operatorPrisma);
    assert.equal(p1.total, 121);
    assert.deepEqual(p1.pedidos.map((s) => s.id), esperados.slice(0, 50));
    // Soporte configura el primero ya visto: la página 2 no se corre.
    await operatorPrisma.auditLog.create({ data: cerrar("abierto-501") });
    const p2 = await conf.listarSolicitudesPendientes(operatorPrisma, { desde: p1.siguiente });
    assert.equal(p2.total, 120);
    assert.deepEqual(p2.pedidos.map((s) => s.id), esperados.slice(50, 100));
    const p3 = await conf.listarSolicitudesPendientes(operatorPrisma, { desde: p2.siguiente });
    assert.deepEqual(p3.pedidos.map((s) => s.id), esperados.slice(100));
    assert.equal(p3.siguiente, null, "no hay página 4");
  });

  await t.test("un descarte deja de verse si el estudio vuelve a pedir ese CUIT (el pedido nuevo manda)", async () => {
    await operatorPrisma.auditLog.create({ data: fila("otra-vez-503", reglas.ACCION_SOLICITUD_ALTA, ahora, pedido("Ferretería 502", "20333333334")) });
    const deEstudioA = await panel.pedidosDeAltaDelEstudio(base.a.id);
    assert.deepEqual([deEstudioA.descartadas, deEstudioA.descartadasTotal], [[], 0]);
    assert.equal(deEstudioA.enCursoTotal, 61, "el 501 se cerró y entró el 503");
  });
});
