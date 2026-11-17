// CONSOLA DE LA CUADRILLA · aviso firmado en la URL y vuelta con filtros y ancla (GSG-MIA-062, QA ronda 1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeLaUrl, firmaDelAviso, volverA } from "./formulario";

const CLAVE = "clave-de-prueba-avisos";

function fd(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
}

test("un aviso armado a mano en la URL no se muestra; el firmado por el servidor sí", () => {
  assert.deepEqual(avisoDeLaUrl({ error: "Tu cuenta se suspende: escribí al 11-5555-5555" }, CLAVE), {});
  assert.deepEqual(avisoDeLaUrl({ error: "Tu cuenta se suspende", f: "x".repeat(32) }, CLAVE), {});
  const f = firmaDelAviso("Aprobadas: 2.", "", CLAVE);
  assert.deepEqual(avisoDeLaUrl({ ok: "Aprobadas: 2.", f }, CLAVE), { ok: "Aprobadas: 2.", error: undefined });
  // La firma de un texto no sirve para otro.
  assert.deepEqual(avisoDeLaUrl({ ok: "Aprobadas: 200.", f }, CLAVE), {});
  // Sin secreto en el servidor no se muestra ningún aviso.
  assert.deepEqual(avisoDeLaUrl({ ok: "Aprobadas: 2.", f }, ""), {});
});

test("volverA conserva los filtros (también la vista de pedidos), firma el resultado y baja al ancla conocida", () => {
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = CLAVE;
  try {
    const url = volverA("/admin/cuadrilla", fd({ f_agente: "ag1", f_pedidos: "negados", ancla: "pedidos" }), { ok: "Pedido negado." });
    const [ruta, hash] = url.split("#");
    const q = new URL(ruta, "http://x").searchParams;
    assert.equal(q.get("agente"), "ag1");
    assert.equal(q.get("pedidos"), "negados");
    assert.equal(q.get("ok"), "Pedido negado.");
    assert.equal(q.get("f"), firmaDelAviso("Pedido negado.", "", CLAVE));
    assert.equal(hash, "pedidos");
    // Un ancla que no es de la consola no se copia a la URL.
    assert.ok(!volverA("/admin/cuadrilla", fd({ ancla: "javascript:alert(1)" }), {}).includes("#"));
    // Un resultado vacío no deja rastro.
    assert.equal(volverA("/admin/cuadrilla", fd({}), { ok: undefined }), "/admin/cuadrilla");
  } finally {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  }
});
