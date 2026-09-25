import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarSemanaTipo,
  armarTira,
  diaDeLaSemana,
  diasDelPeriodo,
  porcentajeLegible,
  proporcion,
  unidadPara,
} from "./tira-core";

const HOY = "2026-09-24"; // jueves

test("el 24/09/2026 es jueves y el período cuenta hoy", () => {
  assert.equal(diaDeLaSemana(HOY), 3);
  const p = diasDelPeriodo(HOY, 90);
  assert.equal(p.length, 90);
  assert.equal(p[0], "2026-06-27");
  assert.equal(p[89], HOY);
});

test("30 días van por día, 90 y 180 por semana, un año por mes", () => {
  assert.equal(unidadPara(30), "dia");
  assert.equal(unidadPara(90), "semana");
  assert.equal(unidadPara(180), "semana");
  assert.equal(unidadPara(365), "mes");
});

test("la suma de los tramos es el total del reporte y los días sin ventas suman cero", () => {
  const porDia = [
    { dia: "2026-09-24", total: 144_064, cantidad: 4 },
    { dia: "2026-09-19", total: 592_793, cantidad: 10 },
    { dia: "2026-06-28", total: 100_000, cantidad: 2 },
  ];
  const t = armarTira(porDia, HOY, 90);
  assert.equal(t.unidad, "semana");
  // sáb 27/06 y dom 28/06 + 12 semanas enteras + lun 21/09 a jue 24/09
  assert.equal(t.tramos.length, 14);
  assert.equal(t.tramos.reduce((s, x) => s + x.total, 0), 836_857);
  assert.equal(t.tramos.reduce((s, x) => s + x.cantidad, 0), 16);
  assert.equal(t.tramos[1].total, 0);
});

test("la semana de arranque y la de hoy quedan marcadas como parciales", () => {
  const t = armarTira([], HOY, 90);
  assert.equal(t.tramos[0].parcial, true);
  assert.equal(t.tramos[0].enCurso, false);
  assert.equal(t.tramos[1].parcial, false);
  const ultima = t.tramos[t.tramos.length - 1];
  assert.equal(ultima.parcial, true);
  assert.equal(ultima.enCurso, true);
  assert.equal(ultima.etiqueta, "semana del 21/09 al 24/09");
  assert.equal(ultima.corta, "21/09");
});

test("el mejor tramo es uno completo aunque uno parcial venda más", () => {
  const porDia = [
    { dia: "2026-06-27", total: 900_000, cantidad: 9 }, // semana de arranque, parcial
    { dia: "2026-09-16", total: 500_000, cantidad: 5 }, // semana del 14/09, completa
    { dia: "2026-09-24", total: 800_000, cantidad: 8 }, // hoy, en curso
  ];
  const t = armarTira(porDia, HOY, 90);
  assert.equal(t.mejor?.desde, "2026-09-14");
  assert.equal(t.mejor?.total, 500_000);
  assert.equal(t.tramos[0].alto, 1);
});

test("30 días van palo por día y el de hoy está en curso", () => {
  const t = armarTira([{ dia: HOY, total: 10, cantidad: 1 }], HOY, 30);
  assert.equal(t.tramos.length, 30);
  const hoy = t.tramos[29];
  assert.equal(hoy.enCurso, true);
  assert.equal(hoy.etiqueta, "jue 24/09");
  assert.equal(t.tramos[0].parcial, false);
  // el único día con ventas es hoy, que no es comparable: no hay «mejor día» que mostrar como completo
  assert.equal(t.mejor?.desde, HOY);
});

test("un año va por mes y los meses de las puntas dicen desde y hasta qué día", () => {
  const t = armarTira([], HOY, 365);
  assert.equal(t.unidad, "mes");
  assert.equal(t.tramos.length, 13);
  assert.equal(t.tramos[0].etiqueta, "septiembre 2025 (del 25/09 al 30/09)");
  assert.equal(t.tramos[1].etiqueta, "octubre 2025");
  assert.equal(t.tramos[1].parcial, false);
  assert.equal(t.tramos[12].etiqueta, "septiembre 2026 (del 01/09 al 24/09)");
  assert.equal(t.tramos[12].corta, "sep");
});

test("sin ventas no hay tramo mejor ni día que destacar", () => {
  const t = armarTira([], HOY, 30);
  assert.equal(t.mejor, null);
  assert.ok(t.tramos.every((x) => x.alto === 0));
  const s = armarSemanaTipo([], HOY, 30);
  assert.equal(s.mejor, null);
  assert.equal(s.desde, null);
  assert.ok(s.dias.every((d) => d.promedio === 0 && d.proporcion === 0));
});

test("la semana tipo promedia cada día desde la primera venta y sin contar hoy", () => {
  const porDia = [
    { dia: HOY, total: 999_999, cantidad: 99 }, // hoy no cuenta: todavía no terminó
    { dia: "2026-09-19", total: 300, cantidad: 3 }, // sábado
    { dia: "2026-09-14", total: 50, cantidad: 1 }, // lunes
    { dia: "2026-09-12", total: 100, cantidad: 1 }, // sábado, primera venta
  ];
  const s = armarSemanaTipo(porDia, HOY, 30);
  assert.equal(s.desde, "2026-09-12");
  const [lunes, , , jueves, , sabado] = s.dias;
  assert.equal(sabado.nombre, "Sábado");
  assert.equal(sabado.ocurrencias, 2);
  assert.equal(sabado.promedio, 200);
  assert.equal(sabado.ventasPromedio, 2);
  assert.equal(lunes.ocurrencias, 2);
  assert.equal(lunes.promedio, 25);
  assert.equal(lunes.proporcion, 0.125);
  assert.equal(jueves.ocurrencias, 1);
  assert.equal(jueves.promedio, 0);
  assert.equal(s.mejor, 5);
});

test("el porcentaje no muestra 0 % cuando hubo algo", () => {
  assert.equal(porcentajeLegible(62, 100), "62 %");
  assert.equal(porcentajeLegible(0.2, 100), "<1 %");
  assert.equal(porcentajeLegible(0, 100), "0 %");
  assert.equal(porcentajeLegible(5, 0), "0 %");
});

test("la raya nunca pasa del largo total ni es negativa", () => {
  assert.equal(proporcion(50, 200), 0.25);
  assert.equal(proporcion(300, 200), 1);
  assert.equal(proporcion(-5, 200), 0);
  assert.equal(proporcion(5, 0), 0);
});
