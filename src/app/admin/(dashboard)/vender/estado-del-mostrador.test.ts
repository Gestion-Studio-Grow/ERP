import { test } from "node:test";
import assert from "node:assert/strict";
import { datosDelMostrador } from "./estado-del-mostrador";
import { REGLAS_A_LA_VISTA } from "@/lib/caja/reglas-a-la-vista";

const textos = (d: ReturnType<typeof datosDelMostrador>) => d.map((x) => (x.tipo === "enlace" ? `[${x.texto}]` : `${x.fuerte ?? ""}${x.texto ?? ""}`));

test("caja cerrada (turno): no muestra la regla del DÍA cerrado, que la contradecía", () => {
  const d = datosDelMostrador({ caja: { valor: "Cerrada" }, diaCerrado: false, vendido: "3 ventas", mostrador: true });
  assert.ok(!textos(d).includes(REGLAS_A_LA_VISTA.vender));
  assert.deepEqual(textos(d), ["Caja cerrada: el efectivo que cobres va al libro del día, sin turno.", "[Abrir la caja]", "3 ventas"]);
});

test("día cerrado: la regla sale, en un mostrador", () => {
  const d = datosDelMostrador({ caja: { valor: "Cerrada" }, diaCerrado: true, vendido: null, mostrador: true });
  assert.deepEqual(textos(d), ["Hoy ya está cerrado: no se abre la caja.", "[Ver el cierre]", REGLAS_A_LA_VISTA.vender]);
});

test("día cerrado fuera de un mostrador (CH): sin regla", () => {
  const d = datosDelMostrador({ caja: { valor: "Cerrada" }, diaCerrado: true, vendido: null, mostrador: false });
  assert.equal(d.length, 2);
});

test("ningún dato termina ni empieza con un «·» suelto; el enlace es un dato propio", () => {
  for (const diaCerrado of [true, false]) {
    for (const t of textos(datosDelMostrador({ caja: { valor: "Cerrada" }, diaCerrado, vendido: "x", mostrador: true }))) {
      assert.ok(!/^\s*·|·\s*$/.test(t), t);
    }
  }
});

test("caja abierta: el valor y el detalle, sin regla ni enlace", () => {
  const d = datosDelMostrador({ caja: { valor: "Abierta", detalle: "desde las 9:10" }, diaCerrado: true, vendido: null, mostrador: true });
  assert.deepEqual(textos(d), ["Caja abierta desde las 9:10"]);
});

test("sin KPI de caja: sólo lo vendido", () => {
  assert.deepEqual(textos(datosDelMostrador({ caja: null, diaCerrado: false, vendido: "2 ventas", mostrador: true })), ["2 ventas"]);
});

test("con el atajo «Abrí la caja» en pantalla, el enlace no se repite", () => {
  const d = datosDelMostrador({ caja: { valor: "Cerrada" }, diaCerrado: false, vendido: null, mostrador: true, abrirAca: true });
  assert.ok(d.every((x) => x.tipo !== "enlace"));
  assert.equal(d.length, 1);
});
