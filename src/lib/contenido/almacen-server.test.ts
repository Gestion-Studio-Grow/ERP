// El almacén de la base: otra falla que no sea «falta la tabla» sigue su curso, y sin tenantId no se consulta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { faltaLaTabla, listarPublicaciones, validarEntrada, type DbContenido } from "./almacen.server";

const roto = (code?: string): DbContenido => {
  const tira = async () => {
    throw Object.assign(new Error("x"), { code });
  };
  return { publicacionAgendada: { findMany: tira, create: tira, updateMany: tira, deleteMany: tira } };
};

test("faltaLaTabla reconoce P2021 y P2022 por forma", () => {
  assert.equal(faltaLaTabla({ code: "P2021" }), true);
  assert.equal(faltaLaTabla({ code: "P2022" }), true);
  assert.equal(faltaLaTabla({ code: "P1001" }), false);
  assert.equal(faltaLaTabla(null), false);
});

test("sin tabla → sin-tabla; otra falla → se tira", async () => {
  assert.deepEqual(await listarPublicaciones(roto("P2021"), "t1"), { estado: "sin-tabla" });
  await assert.rejects(() => listarPublicaciones(roto("P1001"), "t1"));
});

test("sin tenantId no se consulta", () => {
  assert.throws(() => listarPublicaciones(roto("P2021"), ""));
});

test("validarEntrada recorta textos largos e ignora campos de más", () => {
  const v = validarEntrada({
    id: "", fecha: "2026-11-05", hora: "09:30", canal: "whatsapp", estado: "borrador", tipo: "novedad",
    plantilla: "n", formato: "historia", titulo: "x".repeat(500), texto: "t", tenantId: "otro",
    campos: { rotulo: "", titulo: "", bajada: "", cta: "" }, caption: { instagram: "", whatsapp: "" },
  });
  assert.ok(v.ok);
  assert.equal(v.id, null);
  assert.equal(v.datos.titulo.length, 160);
  assert.equal("tenantId" in v.datos, false);
});
