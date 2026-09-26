// Pedir a Soporte GSG (pedido-soporte.ts): qué se acepta y qué queda abierto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { textoLimiteDelPlan } from "@/lib/cartera-core";
import { ACCION_PEDIDO_RESUELTO, ACCION_PEDIDO_SOPORTE, pedidosAbiertos, validarPedido } from "./pedido-soporte";

test("corregir el CUIT exige un CUIT válido (dígito verificador) y lo guarda sin guiones", () => {
  assert.deepEqual(validarPedido({ tipo: "corregir_cuit", cuit: "20-11111111-2" }), {
    ok: true,
    pedido: { tipo: "corregir_cuit", cuit: "20111111112", nota: null },
  });
  const malo = validarPedido({ tipo: "corregir_cuit", cuit: "20-11111111-3" });
  assert.equal(malo.ok, false);
  assert.match(!malo.ok ? malo.error : "", /dígito verificador/);
  assert.equal(validarPedido({ tipo: "corregir_cuit", cuit: "" }).ok, false);
});

test("un tipo de pedido desconocido o una nota larguísima no pasan", () => {
  assert.equal(validarPedido({ tipo: "borrar_todo" }).ok, false);
  assert.equal(validarPedido({ tipo: "direccion_propia", nota: "x".repeat(301) }).ok, false);
  assert.deepEqual(validarPedido({ tipo: "direccion_propia", nota: "  tiene   local en Canning " }), {
    ok: true,
    pedido: { tipo: "direccion_propia", cuit: null, nota: "tiene local en Canning" },
  });
});

test("un pedido resuelto por Soporte deja de estar abierto; una fila con forma rara se ignora", () => {
  const el = new Date("2026-09-20T12:00:00Z");
  const abiertos = pedidosAbiertos([
    { id: "p1", action: ACCION_PEDIDO_SOPORTE, entityId: "cli-1", changes: { tipo: "corregir_cuit", cuit: "20111111112" }, createdAt: el },
    { id: "p2", action: ACCION_PEDIDO_SOPORTE, entityId: "cli-2", changes: { tipo: "direccion_propia" }, createdAt: el },
    { id: "p3", action: ACCION_PEDIDO_SOPORTE, entityId: "cli-3", changes: { tipo: "otra-cosa" }, createdAt: el },
    { id: "p4", action: ACCION_PEDIDO_SOPORTE, entityId: "cli-4", changes: "texto", createdAt: el },
    { id: "r1", action: ACCION_PEDIDO_RESUELTO, entityId: "cli-2", changes: { pedidoId: "p2" }, createdAt: el },
  ]);
  assert.deepEqual(abiertos.map((a) => [a.id, a.tipo, a.cuit]), [["p1", "corregir_cuit", "20111111112"]]);
});

test("el límite de facturas automáticas se dice con el plan del cliente, no con un número fijo", () => {
  assert.equal(textoLimiteDelPlan(300, { planId: "micro", planNombre: "Micro comerciante", origen: "plan", delPlan: 300 }), "Plan Micro comerciante: hasta 300 por mes.");
  assert.equal(
    textoLimiteDelPlan(1000, { planId: "micro", planNombre: "Micro comerciante", origen: "excepcion", delPlan: 300 }),
    "Plan Micro comerciante (trae 300 por mes); GSG le dejó 1.000 por mes.",
  );
  assert.match(textoLimiteDelPlan(159, { planId: null, planNombre: null, origen: "sin-plan", delPlan: null }), /^Sin plan asignado: rige el límite de siempre, 159 por mes/);
  assert.match(textoLimiteDelPlan(159, undefined), /Sin plan asignado/);
});

test("la ficha ofrece sólo los pedidos que aplican, lo urgente primero y lo ya pedido con su fecha", async () => {
  const { pedidosDeLaFicha } = await import("./pedido-soporte");
  const completo = pedidosDeLaFicha({ clienteTenantId: "c1", tieneDireccion: true, sinPlan: false, cuitIncompleto: false, abiertos: [] });
  assert.deepEqual(completo.map((p) => [p.tipo, p.urgente]), [["corregir_cuit", false]]);

  const abiertos = [
    { id: "p1", clienteTenantId: "c2", tipo: "corregir_cuit" as const, cuit: "20111111112", pedidoEl: "2026-09-20T12:00:00.000Z" },
    { id: "p2", clienteTenantId: "c1", tipo: "direccion_propia" as const, cuit: null, pedidoEl: "2026-09-21T12:00:00.000Z" },
  ];
  const todo = pedidosDeLaFicha({ clienteTenantId: "c2", tieneDireccion: false, sinPlan: true, cuitIncompleto: true, abiertos });
  assert.deepEqual(todo.map((p) => p.tipo), ["direccion_propia", "corregir_cuit", "asignar_plan"]);
  // El pedido abierto de OTRO cliente no marca a éste; el suyo, sí.
  assert.equal(todo.find((p) => p.tipo === "direccion_propia")!.pedidoEl, null);
  assert.equal(todo.find((p) => p.tipo === "corregir_cuit")!.pedidoEl, "2026-09-20T12:00:00.000Z");
  assert.match(todo.find((p) => p.tipo === "corregir_cuit")!.motivo, /sin él no puede facturar/);
});

// ── GSG-22 (refutador): el pedido tiene otra punta, Soporte GSG, que lo cierra con una respuesta ──

test("Soporte cierra un pedido: «no corresponde» exige un motivo DE LA LISTA; «hecho» no lleva ninguno", async () => {
  const { validarResolucion } = await import("./pedido-soporte");
  assert.equal(validarResolucion({ resultado: "no_corresponde", motivo: "  " }).ok, false);
  assert.equal(validarResolucion({ resultado: "cualquiera" }).ok, false);
  // Texto libre en vez de un código: rechazado (antes se guardaba y la contadora lo leía tal cual).
  assert.equal(validarResolucion({ resultado: "no_corresponde", motivo: "QA Kiosco Lab ya tiene ese CUIT" }).ok, false);
  assert.equal(validarResolucion({ resultado: "no_corresponde", motivo: "toString" }).ok, false, "ni una propiedad heredada");
  assert.deepEqual(validarResolucion({ resultado: "hecho", motivo: "ya-estaba" }), { ok: true, resolucion: { resultado: "hecho", motivo: null } });
  assert.deepEqual(validarResolucion({ resultado: "no_corresponde", motivo: "ya-estaba" }), {
    ok: true,
    resolucion: { resultado: "no_corresponde", motivo: "ya-estaba" },
  });
});

test("refutador 26/09 · ningún texto libre de Soporte llega a la ficha de la contadora (ni de filas viejas ni forjadas)", async () => {
  const { respuestasDeSoporte, pedidosDeLaFicha, MOTIVOS_NO_CORRESPONDE, MOTIVO_NO_CORRESPONDE_POR_DEFECTO } = await import("./pedido-soporte");
  const AJENO = "QA Kiosco Lab";
  const el = new Date("2026-09-20T12:00:00Z");
  const filas = [
    { id: "p1", action: ACCION_PEDIDO_SOPORTE, entityId: "cli", changes: { tipo: "corregir_cuit" }, createdAt: el },
    { id: "p2", action: ACCION_PEDIDO_SOPORTE, entityId: "cli", changes: { tipo: "asignar_plan" }, createdAt: el },
    { id: "p3", action: ACCION_PEDIDO_SOPORTE, entityId: "cli", changes: { tipo: "direccion_propia" }, createdAt: el },
    // Fila vieja: Soporte escribió a mano el nombre de otro negocio.
    { id: "r1", action: ACCION_PEDIDO_RESUELTO, entityId: "cli", changes: { pedidoId: "p1", resultado: "no_corresponde", respuesta: `El CUIT es de ${AJENO}` }, createdAt: el },
    // Fila forjada: el texto ajeno en el lugar del código.
    { id: "r2", action: ACCION_PEDIDO_RESUELTO, entityId: "cli", changes: { pedidoId: "p2", resultado: "no_corresponde", motivo: AJENO }, createdAt: el },
    // «Hecho» con texto: no se muestra ningún texto.
    { id: "r3", action: ACCION_PEDIDO_RESUELTO, entityId: "cli", changes: { pedidoId: "p3", resultado: "hecho", respuesta: AJENO, motivo: "ya-estaba" }, createdAt: el },
  ];
  const respuestas = respuestasDeSoporte(filas);
  const porPedido = Object.fromEntries(respuestas.map((r) => [r.pedidoId, r.respuesta]));
  assert.deepEqual(porPedido, {
    p1: MOTIVOS_NO_CORRESPONDE[MOTIVO_NO_CORRESPONDE_POR_DEFECTO],
    p2: MOTIVOS_NO_CORRESPONDE[MOTIVO_NO_CORRESPONDE_POR_DEFECTO],
    p3: null,
  });
  const permitidos = new Set<string | null>([...Object.values(MOTIVOS_NO_CORRESPONDE), null]);
  for (const r of respuestas) assert.ok(permitidos.has(r.respuesta), `sólo textos de la lista: ${String(r.respuesta)}`);
  const ficha = pedidosDeLaFicha({ clienteTenantId: "cli", tieneDireccion: false, sinPlan: true, cuitIncompleto: false, abiertos: [], respuestas, ahora: el });
  assert.equal(ficha.length, 3);
  assert.ok(!JSON.stringify(ficha).includes(AJENO), "lo que pinta la ficha no trae el texto ajeno");
});

test("la respuesta de Soporte cierra el pedido, se muestra en la ficha 60 días y deja pedirlo de nuevo; una respuesta suelta no inventa nada", async () => {
  const { pedidosAbiertos, respuestasDeSoporte, pedidosDeLaFicha } = await import("./pedido-soporte");
  const filas = [
    { id: "p1", action: ACCION_PEDIDO_SOPORTE, entityId: "cli", changes: { tipo: "direccion_propia" }, createdAt: new Date("2026-09-01T12:00:00Z") },
    { id: "r1", action: ACCION_PEDIDO_RESUELTO, entityId: "cli", changes: { pedidoId: "p1", resultado: "hecho", respuesta: null }, createdAt: new Date("2026-09-02T12:00:00Z") },
    { id: "r2", action: ACCION_PEDIDO_RESUELTO, entityId: "otro", changes: { pedidoId: "no-existe", resultado: "hecho" }, createdAt: new Date("2026-09-02T12:00:00Z") },
  ];
  assert.deepEqual(pedidosAbiertos(filas), []);
  const respuestas = respuestasDeSoporte(filas);
  assert.deepEqual(respuestas.map((r) => [r.pedidoId, r.clienteTenantId, r.tipo, r.resultado]), [["p1", "cli", "direccion_propia", "hecho"]]);
  const ficha = (ahora: Date) =>
    pedidosDeLaFicha({ clienteTenantId: "cli", tieneDireccion: false, sinPlan: false, cuitIncompleto: false, abiertos: [], respuestas, ahora });
  const hoy = ficha(new Date("2026-09-26T12:00:00Z"))[0];
  assert.equal(hoy.tipo, "direccion_propia");
  assert.equal(hoy.pedidoEl, null, "ya no está pedido: se puede pedir de nuevo");
  assert.equal(hoy.respuesta?.resultado, "hecho");
  assert.equal(ficha(new Date("2026-12-26T12:00:00Z"))[0].respuesta, null, "a los 60 días deja de mostrarse");
});

test("lo que contesta el botón dice dónde queda el pedido (la bandeja de Soporte GSG)", async () => {
  const { respuestaDelPedido } = await import("./pedido-soporte");
  assert.match(respuestaDelPedido("direccion_propia", false), /^Listo: quedó en la bandeja de pedidos de Soporte GSG/);
  assert.match(respuestaDelPedido("direccion_propia", true), /está en la bandeja de pedidos de Soporte GSG/);
  // «CUIT» es sigla: la respuesta no la baja a minúsculas (QA 26/09: «(corregir el cuit del emisor)»).
  assert.match(respuestaDelPedido("corregir_cuit", false), /\(corregir el CUIT del emisor\)/);
  assert.doesNotMatch(respuestaDelPedido("corregir_cuit", true), /cuit/);
});
