import { test } from "node:test";
import assert from "node:assert/strict";
import { actorDelMotor, claveValida, decidirRevision, faltaLaMigracion, leerRendicion, motivoNoRinde, muestraRevision, veLaRendicion } from "./rendiciones-core";

const base = { descripcion: "Taxi al predio", rubro: "", monto: "12.500,50", medio: "PROPIO", anticipoId: "", fecha: "2026-11-04" };
const fila = { id: "r1", gastoId: "g1", personaId: "p-prod", medio: "PROPIO", anticipoId: null, montoCentavos: 1250050, estado: "enviada", eventos: [] };
const ctx = (rol: Parameters<typeof decidirRevision>[2]["rol"], actorId: string, comentario?: string) => ({ rol, actorId, fecha: "2026-11-04T12:00:00Z", comentario });

test("leer el formulario: monto en centavos > 0, medio válido, anticipo si corresponde", () => {
  const r = leerRendicion(base);
  assert.ok(r.ok);
  assert.equal(r.ok && r.datos.montoCentavos, 1250050);
  assert.equal(r.ok && r.datos.rubro, "Rendición");
  assert.equal(leerRendicion({ ...base, monto: "0" }).ok, false);
  assert.equal(leerRendicion({ ...base, monto: "-50" }).ok, false);
  assert.equal(leerRendicion({ ...base, monto: "abc" }).ok, false);
  assert.equal(leerRendicion({ ...base, descripcion: "  " }).ok, false);
  assert.equal(leerRendicion({ ...base, medio: "CAJA" }).ok, false);
  assert.equal(leerRendicion({ ...base, medio: "ANTICIPO" }).ok, false, "con anticipo, hay que elegir cuál");
  const conAnticipo = leerRendicion({ ...base, medio: "ANTICIPO", anticipoId: "ant1" });
  assert.equal(conAnticipo.ok && conAnticipo.datos.anticipoId, "ant1");
  const propioConId = leerRendicion({ ...base, anticipoId: "ant1" });
  assert.equal(propioConId.ok && propioConId.datos.anticipoId, null, "de su bolsillo no arrastra un anticipo");
});

test("quién rinde: Producción y Comercial en el equipo; Diseño no; nadie fuera del equipo ni sin ficha", () => {
  assert.equal(motivoNoRinde("PRODUCCION", "p1", true), null);
  assert.equal(motivoNoRinde("COMERCIAL", "p1", true), null);
  assert.match(motivoNoRinde("PRODUCCION", "p1", false) ?? "", /equipo/);
  assert.match(motivoNoRinde("DISENO", "p1", true) ?? "", /rol/);
  assert.match(motivoNoRinde("DIRECCION", null, true) ?? "", /vinculado/);
});

test("revisión: nadie aprueba lo propio; Comercial/Producción no aprueban; devolver y rechazar piden comentario", () => {
  const propia = decidirRevision(fila, "aprobar", ctx("ADMINISTRACION", "p-prod"));
  assert.equal(propia.ok, false);
  assert.match(!propia.ok ? propia.error : "", /lo propio/);
  assert.equal(decidirRevision(fila, "aprobar", ctx("PRODUCCION", "p-otro")).ok, false);
  assert.equal(decidirRevision(fila, "aprobar", ctx("COMERCIAL", "p-otro")).ok, false);
  const ok = decidirRevision(fila, "aprobar", ctx("ADMINISTRACION", "p-admin"));
  assert.ok(ok.ok && ok.desde === "enviada" && ok.hacia === "aprobada" && ok.eventos.length === 1);
  assert.equal(decidirRevision({ ...fila, estado: "aprobada" }, "aprobar", ctx("DIRECCION", "user:duenia")).ok, false, "aprobar dos veces se rechaza");
  assert.equal(decidirRevision(fila, "devolver", ctx("DIRECCION", "user:duenia")).ok, false);
  assert.equal(decidirRevision(fila, "rechazar", ctx("DIRECCION", "user:duenia", "  ")).ok, false);
  const rech = decidirRevision(fila, "rechazar", ctx("DIRECCION", "user:duenia", "No es del evento"));
  assert.ok(rech.ok && rech.hacia === "rechazada" && rech.eventos[0].comentario === "No es del evento");
});

test("vista: botones sólo a quien puede y en lo enviado; lo ajeno sólo lo ve quien revisa", () => {
  assert.equal(muestraRevision("ADMINISTRACION", "p-admin", "p-prod", "enviada"), true);
  assert.equal(muestraRevision("ADMINISTRACION", "p-prod", "p-prod", "enviada"), false);
  assert.equal(muestraRevision("ADMINISTRACION", "p-admin", "p-prod", "aprobada"), false);
  assert.equal(muestraRevision("PRODUCCION", "p-otro", "p-prod", "enviada"), false);
  assert.equal(veLaRendicion("COMERCIAL", "p-com", "p-prod"), false);
  assert.equal(veLaRendicion("COMERCIAL", "p-prod", "p-prod"), true);
  assert.equal(veLaRendicion("DIRECCION", null, "p-prod"), true);
});

test("piezas sueltas: actor, clave del envío, migración ausente", () => {
  assert.equal(actorDelMotor({ personaId: null, userId: "u1" }), "user:u1");
  assert.equal(actorDelMotor({ personaId: "p1", userId: "u1" }), "p1");
  assert.equal(claveValida("3f2c1a9e-6b7d-4c1e-9a0b-1234567890ab"), true);
  assert.equal(claveValida("corta"), false);
  assert.equal(claveValida("x'; DROP TABLE--aaaaaaaaaaaa"), false);
  assert.equal(faltaLaMigracion({ code: "P2021" }), true);
  assert.equal(faltaLaMigracion({ code: "P2002" }), false);
  assert.equal(faltaLaMigracion(null), false);
});
