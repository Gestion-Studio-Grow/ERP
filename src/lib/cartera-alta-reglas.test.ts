// Reglas puras del pedido de alta: qué cierra un pedido y cuándo queda uno abierto (hallazgo C1).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCION_SOLICITUD_CONFIGURADA,
  ACCION_SOLICITUD_DESCARTADA,
  ACCIONES_QUE_CIERRAN_LA_SOLICITUD,
  altasEnCurso,
  hayPedidoAbierto,
} from "./cartera-alta-reglas";
import { ACCION_SOLICITUD_DESCARTADA as DESCARTADA_DEL_CONFIGURADOR } from "@/app/operador/(console)/solicitudes/configurador-reglas";

test("un pedido descartado cuenta como cerrado, igual que uno configurado", () => {
  assert.deepEqual([...ACCIONES_QUE_CIERRAN_LA_SOLICITUD].sort(), [ACCION_SOLICITUD_CONFIGURADA, ACCION_SOLICITUD_DESCARTADA].sort());
  assert.equal(DESCARTADA_DEL_CONFIGURADOR, ACCION_SOLICITUD_DESCARTADA, "el configurador escribe la misma acción que se lee");
});

test("sin pedidos previos no hay ninguno abierto", () => {
  assert.equal(hayPedidoAbierto([], []), false);
});

test("un pedido sin cierre está abierto", () => {
  assert.equal(hayPedidoAbierto(["p1"], []), true);
});

test("todos los pedidos cerrados (descartados o configurados): se puede volver a pedir", () => {
  assert.equal(hayPedidoAbierto(["p1", "p2"], ["p1", "p2"]), false);
});

test("uno cerrado y otro sin cerrar: sigue habiendo uno abierto", () => {
  assert.equal(hayPedidoAbierto(["p1", "p2"], ["p1"]), true);
});

test("un cierre de otro pedido o sin id no cierra el del CUIT", () => {
  assert.equal(hayPedidoAbierto(["p1"], ["otro", null]), true);
});

test("pedidos de alta en curso: sólo los que nadie configuró ni descartó, del más viejo al más nuevo", () => {
  const datos = (nombre: string, cuit: string) => ({ nombre, cuit, email: "a@ejemplo.test" });
  const pedidos = [
    { id: "p3", createdAt: new Date("2026-09-20T12:00:00Z"), changes: datos("Tercero", "20111111112") },
    { id: "p1", createdAt: new Date("2026-09-01T12:00:00Z"), changes: datos("Primero", "20222222223") },
    { id: "p2", createdAt: new Date("2026-09-10T12:00:00Z"), changes: datos("Descartado", "20333333334") },
    { id: "p4", createdAt: new Date("2026-09-21T12:00:00Z"), changes: { basura: true } },
  ];
  const r = altasEnCurso(pedidos, ["p2", null]);
  assert.deepEqual(r.map((a) => a.id), ["p1", "p3"]);
  assert.equal(r[0]!.nombre, "Primero");
  assert.deepEqual(altasEnCurso(pedidos, ["p1", "p2", "p3"]), [], "todos cerrados (o ilegibles): no queda nada en curso");
});

// ── Pedido descartado: la contadora ve el motivo (QA 26/09) ──
import { altasDescartadas, faltantesDelAlta } from "@/lib/cartera-alta-reglas";

test("un pedido descartado se muestra con su motivo; si se volvió a pedir ese CUIT, ya no", () => {
  const ahora = new Date("2026-09-26T15:00:00Z");
  const pedido = (id: string, cuit: string, cuando: string) => ({
    id, createdAt: new Date(cuando), changes: { nombre: `Cliente ${id}`, cuit, email: `${id}@x.test` },
  });
  const pedidos = [pedido("p1", "20111111112", "2026-09-20T10:00:00Z"), pedido("p2", "20222222223", "2026-09-21T10:00:00Z"), pedido("p3", "20222222223", "2026-09-25T10:00:00Z"), pedido("p4", "20333333334", "2026-07-01T10:00:00Z")];
  const descartes = [
    { entityId: "p1", createdAt: new Date("2026-09-22T10:00:00Z"), changes: { motivo: "Ya está en tu cartera.", operador: "soporte" } },
    { entityId: "p2", createdAt: new Date("2026-09-22T11:00:00Z"), changes: { motivo: "Faltaba el punto de venta" } },
    { entityId: "p4", createdAt: new Date("2026-07-02T10:00:00Z"), changes: { motivo: "Viejo" } },
  ];
  const r = altasDescartadas(pedidos, descartes, ahora);
  assert.deepEqual(r.map((x) => [x.id, x.motivo]), [["p1", "Ya está en tu cartera."]], "p2 se volvió a pedir (p3) y p4 tiene más de 30 días");
  assert.equal(r[0]!.cuit, "20111111112");
  assert.ok(!JSON.stringify(r).includes("soporte"), "no muestra quién de Soporte lo descartó");
});

test("los campos vacíos del alta tienen su mensaje propio (no sólo el globo del navegador)", () => {
  assert.deepEqual(faltantesDelAlta({ nombre: "", cuit: " ", email: "", puntoVenta: "" }), {
    nombre: "Falta el nombre del negocio.",
    cuit: "Falta el CUIT: está en la constancia de inscripción de ARCA.",
    email: "Falta el email del cliente.",
    puntoVenta: "Falta el punto de venta: sin él el cliente no puede facturar.",
  });
  assert.deepEqual(faltantesDelAlta({ nombre: "Kiosco", cuit: "20111111112", email: "a@b.test", puntoVenta: "3" }), {});
  assert.equal(faltantesDelAlta({ nombre: "Kiosco", cuit: "1", email: "no-es-mail", puntoVenta: "3" }).email, "El email no es válido: revisalo.");
});
